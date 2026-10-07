import { fromRegistry, normalizeRef } from '@/engines/container/container';
import { routeFor, type Route } from '@/engines/http/http';
import { isReady } from './kubelet';
import type { ClusterState, EventRecord, Ingress, Pod, Service } from './types';
import { key } from './types';

/**
 * 入口（Ingress）の模型。純粋な関数（docs/lessons/k8s.md k8s.i.04）。
 *
 * - 入口の係（ingress-nginx）は、受け持つ種類（IngressClass）の Ingress を読んで振り分けを組み、外の住所を Ingress に書く
 * - 頼みは、名前（Host）の合う規則の中から、道の合う物を選ぶ（Exact が先、次に一番長い道）。名前の合う規則が無ければ、名前を書かない規則
 * - 合う規則が無ければ 404。宛先の Service が無い・ポートが合わない・Ready の Pod が無ければ 503。Pod が、そのポートで待ち受けていなければ 502
 * - 届いた Pod は、イメージの作り（serves）のとおりに答える。道は書き換えずに渡す（/api の頼みは、Pod にも /api で届く）
 */

/** 入口の係（ingress-nginx）が返す、既定の中身 */
const nginxPage = (status: number, reason: string): string =>
  `<html>\r\n<head><title>${String(status)} ${reason}</title></head>\r\n<body>\r\n<center><h1>${String(status)} ${reason}</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n`;

const NOT_FOUND: Route = { status: 404, body: nginxPage(404, 'Not Found') };
const UNAVAILABLE: Route = { status: 503, reason: 'Service Temporarily Unavailable', body: nginxPage(503, 'Service Temporarily Unavailable') };
const BAD_GATEWAY: Route = { status: 502, body: nginxPage(502, 'Bad Gateway') };

/** その Ingress を、入口の係が受け持つか（種類を書かなければ、既定の種類として受け持つ） */
export function servedBy(state: ClusterState, ing: Ingress): boolean {
  const c = state.ingressController;
  return c !== undefined && (ing.spec.className === '' || ing.spec.className === c.className);
}

/** 受け持つ Ingress に外の住所を書く（係が初めて読んだ時に、Sync の知らせを出す） */
export function syncIngresses(state: ClusterState): { ingresses: Map<string, Ingress>; events: EventRecord[] } {
  const ingresses = new Map(state.ingresses);
  const events: EventRecord[] = [];
  const address = state.ingressController?.address;
  for (const [id, ing] of state.ingresses) {
    if (address === undefined || !servedBy(state, ing) || ing.status.address === address) continue;
    ingresses.set(id, { ...ing, status: { address } });
    events.push({ tick: state.tick, type: 'Normal', reason: 'Sync', object: `ingress/${ing.metadata.name}`, message: 'Scheduled for sync' });
  }
  return { ingresses, events };
}

/** 道が規則に合うか（Prefix は / で区切った頭が合う。/api は /api・/api/rooms に合い、/apix には合わない） */
function pathMatches(rule: Ingress['spec']['rules'][number], path: string): boolean {
  if (rule.pathType === 'Exact') return path === rule.path;
  if (rule.pathType === 'Prefix') {
    const base = rule.path.replace(/\/+$/, '');
    return base === '' || path === base || path.startsWith(`${base}/`);
  }
  return path.startsWith(rule.path);
}

/** 名前が規則の名前に合うか（*.city.example は 1 段だけの名前に合う） */
function hostMatches(ruleHost: string, host: string): boolean {
  if (ruleHost.startsWith('*.')) {
    const rest = host.slice(host.indexOf('.') + 1);
    return host.includes('.') && rest === ruleHost.slice(2) && !host.slice(0, host.indexOf('.')).includes('.');
  }
  return ruleHost === host;
}

export interface IngressHit {
  ingress: Ingress;
  rule: Ingress['spec']['rules'][number];
}

/** 名前と道に合う規則（無ければ null） */
export function pickRule(state: ClusterState, host: string, rawPath: string): IngressHit | null {
  const path = rawPath.split('?')[0] ?? '/';
  const all = [...state.ingresses.values()].filter((i) => servedBy(state, i)).flatMap((ingress) => ingress.spec.rules.map((rule) => ({ ingress, rule })));
  // 名前の合う規則があれば、その中だけで選ぶ（名前のある server に入ったら、名前を書かない規則には戻らない）
  const named = all.filter((h) => h.rule.host !== '' && hostMatches(h.rule.host, host));
  const pool = named.length > 0 ? named : all.filter((h) => h.rule.host === '');
  const fit = pool.filter((h) => pathMatches(h.rule, path));
  const exact = fit.find((h) => h.rule.pathType === 'Exact');
  return exact ?? fit.sort((a, b) => b.rule.path.length - a.rule.path.length)[0] ?? null;
}

/** 宛先の Service の、規則のポートに合うポート */
function portOf(svc: Service, rule: Ingress['spec']['rules'][number]): Service['spec']['ports'][number] | undefined {
  return rule.portName === undefined ? svc.spec.ports.find((p) => p.port === rule.servicePort) : undefined;
}

/** 宛先の Service の、Ready の Pod（名前の順） */
export function backendPods(state: ClusterState, ns: string, svc: Service): Pod[] {
  return [...state.pods.values()]
    .filter((p) => p.metadata.namespace === ns && isReady(p) && Object.entries(svc.spec.selector).length > 0 && Object.entries(svc.spec.selector).every(([k, v]) => p.metadata.labels[k] === v))
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
}

/** Pod のコンテナが、そのポートで答える中身 */
function podAnswer(state: ClusterState, pod: Pod, port: number, method: string, path: string): Route {
  for (const c of pod.spec.containers) {
    const serves = state.images === undefined ? undefined : fromRegistry(normalizeRef(c.image))?.serves;
    if (serves?.port !== port) continue;
    const only = path.split('?')[0] ?? '/';
    if (serves.routes) {
      const r = routeFor(serves.routes, method, path);
      if (r.status !== 404 || serves.notFound !== 'express') return r;
      return { status: 404, body: `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ${method} ${only}</pre>\n</body>\n</html>\n` };
    }
    return only === '/' || only === '/index.html' ? { status: 200, body: serves.body } : NOT_FOUND;
  }
  // そのポートで待ち受けていない（Service の targetPort の誤り）
  return BAD_GATEWAY;
}

/** 入口に届いた頼みの答え（名前は Host の見出しの名前） */
export function ingressAnswer(state: ClusterState, host: string, method: string, path: string): Route {
  const hit = pickRule(state, host, path);
  if (hit === null) return NOT_FOUND;
  const ns = hit.ingress.metadata.namespace;
  const svc = state.services.get(key(ns, hit.rule.serviceName));
  const port = svc === undefined ? undefined : portOf(svc, hit.rule);
  if (svc === undefined || port === undefined) return UNAVAILABLE;
  const pod = backendPods(state, ns, svc)[0];
  if (pod === undefined) return UNAVAILABLE;
  return podAnswer(state, pod, port.targetPort, method, path);
}

/** 規則を、書いた形（名前ごとの paths）に戻す。続いて並ぶ同じ名前の道は 1 つの規則にまとめる */
export function rulesByHost(ing: Ingress): { host: string; paths: Ingress['spec']['rules'] }[] {
  const out: { host: string; paths: Ingress['spec']['rules'] }[] = [];
  for (const r of ing.spec.rules) {
    const last = out[out.length - 1];
    if (last?.host === r.host) last.paths.push(r);
    else out.push({ host: r.host, paths: [r] });
  }
  return out;
}

/** 書いた Ingress の誤り（本物の API サーバの断り方。無ければ null） */
export function ingressError(ing: Ingress): string | null {
  const head = `The Ingress "${ing.metadata.name}" is invalid: `;
  for (const [i, rule] of rulesByHost(ing).entries()) {
    for (const [j, p] of rule.paths.entries()) {
      const at = `spec.rules[${String(i)}].http.paths[${String(j)}]`;
      if (p.pathType === '') return `${head}${at}.pathType: Required value: pathType must be specified`;
      if (!['Exact', 'Prefix', 'ImplementationSpecific'].includes(p.pathType)) {
        return `${head}${at}.pathType: Unsupported value: "${p.pathType}": supported values: "Exact", "ImplementationSpecific", "Prefix"`;
      }
      if (!p.path.startsWith('/')) return `${head}${at}.path: Invalid value: "${p.path}": must be an absolute path`;
      if (p.serviceName === '') return `${head}${at}.backend.service.name: Required value`;
      if (p.servicePort === 0 && p.portName === undefined) return `${head}${at}.backend.service.port.name: Required value: port name or number is required`;
    }
  }
  return null;
}

/** describe ingress の宛先の欄（Service の名前:ポート と、届く Pod の住所:ポート。無ければ本物の誤りの書き方） */
export function backendText(state: ClusterState, ing: Ingress, rule: Ingress['spec']['rules'][number]): string {
  const name = `${rule.serviceName}:${rule.portName ?? String(rule.servicePort)}`;
  const svc = state.services.get(key(ing.metadata.namespace, rule.serviceName));
  if (svc === undefined) return `${name} (<error: services "${rule.serviceName}" not found>)`;
  const port = portOf(svc, rule);
  if (port === undefined) return `${name} (<error: endpoints "${rule.serviceName}" not found>)`;
  const pods = backendPods(state, ing.metadata.namespace, svc);
  return `${name} (${pods.map((p) => `${p.status.podIP ?? ''}:${String(port.targetPort)}`).join(',')})`;
}

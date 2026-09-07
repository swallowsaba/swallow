import { matches } from './controllers';
import type { ClusterState, NetworkPolicy, Pod, PolicyRule, Role } from './types';
import { key } from './types';

/* ---- RBAC ---- */

export interface AccessRequest {
  verb: string;
  resource: string;
  namespace: string;
  subject: { kind: 'ServiceAccount' | 'User'; name: string; namespace: string };
}

export interface AccessDecision {
  allowed: boolean;
  /** 許可したときは、その根拠になった Role の名前 */
  via: string | null;
  reason: string;
}

function ruleCovers(rule: PolicyRule, verb: string, resource: string): boolean {
  const verbOk = rule.verbs.includes('*') || rule.verbs.includes(verb);
  const resourceOk = rule.resources.includes('*') || rule.resources.includes(resource);
  return verbOk && resourceOk;
}

/**
 * `kubectl auth can-i` の判定。
 *
 * 許可だけを足していく（deny は無い）。
 * 主体に紐づく RoleBinding を辿り、その先の Role の rules に当たれば通す。
 * 当たらなければ理由を返す。「なぜ通らないか」が分かることがこの機能の値打ち。
 */
export function canI(state: ClusterState, request: AccessRequest): AccessDecision {
  const bindings = [...state.roleBindings.values()].filter((binding) => {
    if (binding.kind === 'RoleBinding' && binding.metadata.namespace !== request.namespace) return false;
    return binding.subjects.some(
      (s) =>
        s.kind === request.subject.kind &&
        s.name === request.subject.name &&
        (binding.kind === 'ClusterRoleBinding' || s.namespace === request.subject.namespace),
    );
  });

  if (bindings.length === 0) {
    return {
      allowed: false,
      via: null,
      reason: `${request.subject.kind} "${request.subject.name}" に結び付いた RoleBinding がありません`,
    };
  }

  for (const binding of bindings) {
    const id = binding.roleRef.kind === 'ClusterRole'
      ? key('', binding.roleRef.name)
      : key(request.namespace, binding.roleRef.name);
    const role: Role | undefined = state.roles.get(id);
    if (role === undefined) continue;
    if (role.rules.some((rule) => ruleCovers(rule, request.verb, request.resource))) {
      return { allowed: true, via: role.metadata.name, reason: '' };
    }
  }

  const names = bindings.map((b) => b.roleRef.name).join(', ');
  return {
    allowed: false,
    via: null,
    reason: `結び付いている Role (${names}) に ${request.verb} ${request.resource} の許可がありません`,
  };
}

/* ---- NetworkPolicy ---- */

export interface TrafficDecision {
  allowed: boolean;
  /** 落とした場合の理由 */
  reason: string | null;
  /** 判断の根拠になったポリシー */
  policy: string | null;
}

function selects(policy: NetworkPolicy, pod: Pod): boolean {
  if (policy.metadata.namespace !== pod.metadata.namespace) return false;
  // 空の podSelector は名前空間内の全 Pod を指す（本物と同じ）
  if (Object.keys(policy.spec.podSelector).length === 0) return true;
  return matches(pod.metadata.labels, policy.spec.podSelector);
}

/**
 * from から to への通信が通るか。
 *
 * 本物と同じ「1つでもポリシーが掛かったら、既定は拒否」。
 * 掛かっていなければ素通し。掛かっていれば、許可の条件に当たったものだけ通す。
 */
export function allowsTraffic(
  state: ClusterState,
  from: Pod,
  to: Pod,
  port: number,
): TrafficDecision {
  const applied = [...state.networkPolicies.values()].filter(
    (p) => selects(p, to) && p.spec.policyTypes.includes('Ingress'),
  );
  if (applied.length === 0) return { allowed: true, reason: null, policy: null };

  for (const policy of applied) {
    for (const peer of policy.spec.ingressFrom) {
      const selectorOk =
        Object.keys(peer.podSelector).length === 0 || matches(from.metadata.labels, peer.podSelector);
      const portOk = peer.ports.length === 0 || peer.ports.includes(port);
      if (selectorOk && portOk) {
        return { allowed: true, reason: null, policy: policy.metadata.name };
      }
    }
  }

  const names = applied.map((p) => p.metadata.name).join(', ');
  return {
    allowed: false,
    reason: `NetworkPolicy (${names}) が掛かっており、この送信元とポートは許可されていません`,
    policy: applied[0]?.metadata.name ?? null,
  };
}

/* ---- Ingress ---- */

export interface RouteResult {
  serviceName: string | null;
  endpoints: string[];
  reason: string | null;
}

/** Ingress のルールに従って、ホストとパスから転送先を決める */
export function routeIngress(
  state: ClusterState,
  namespace: string,
  host: string,
  path: string,
): RouteResult {
  const ingresses = [...state.ingresses.values()].filter((i) => i.metadata.namespace === namespace);
  const rules = ingresses.flatMap((i) => i.spec.rules);
  // 長いパスを優先する（本物と同じ最長一致）
  const hit = rules
    .filter((r) => r.host === host && path.startsWith(r.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (hit === undefined) {
    return { serviceName: null, endpoints: [], reason: `${host}${path} に一致する Ingress ルールがありません` };
  }
  const svc = state.services.get(key(namespace, hit.serviceName));
  if (svc === undefined) {
    return { serviceName: hit.serviceName, endpoints: [], reason: `service "${hit.serviceName}" not found` };
  }
  if (svc.status.endpoints.length === 0) {
    return {
      serviceName: hit.serviceName,
      endpoints: [],
      reason: `service "${hit.serviceName}" に Ready な Endpoints がありません`,
    };
  }
  return { serviceName: hit.serviceName, endpoints: svc.status.endpoints, reason: null };
}

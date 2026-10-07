import { describe, expect, it } from 'vitest';
import { dump } from 'js-yaml';
import { container, deployment, pod, quantity, service } from './factory';
import { isParseError, parseManifest } from './manifest';
import { toManifest } from './toManifest';

/** 本物の形で書き出し、それを読み戻す */
function roundTrip(resource: Parameters<typeof toManifest>[0]) {
  const parsed = parseManifest(dump(toManifest(resource)));
  if (isParseError(parsed)) throw new Error(parsed.error);
  return parsed;
}

describe('本物の -o yaml と同じ形にする', () => {
  it('Deployment は selector.matchLabels と template.spec.containers の入れ子になる', () => {
    const shown = toManifest(deployment('web', 2, [container('web', 'nginx')])) as {
      apiVersion: string;
      spec: { selector: { matchLabels: Record<string, string> }; template: { spec: { containers: { image: string }[] } } };
    };
    expect(shown.apiVersion).toBe('apps/v1');
    expect(shown.spec.selector.matchLabels).toEqual({ app: 'web' });
    expect(shown.spec.template.spec.containers[0]?.image).toBe('nginx');
  });

  it('requests・limits は本物の書き方で出て、書いていない量は出さない', () => {
    const shown = JSON.stringify(toManifest(deployment('web', 1, [container('web', 'nginx', { requests: quantity(250, 128), limits: quantity(1000, 0) })])));
    expect(shown).toContain('"resources":{"limits":{"cpu":"1"},"requests":{"cpu":"250m","memory":"128Mi"}}');
    expect(JSON.stringify(toManifest(deployment('web', 1, [container('web', 'nginx')])))).not.toContain('resources');
  });

  it('YAML の数量を本物と同じく読む（0.5 は 500m、1Gi は 1024Mi。要求を書かず上限だけなら、上限と同じ量を要求する）', () => {
    const parsed = parseManifest([
      'apiVersion: v1', 'kind: Pod', 'metadata:', '  name: p', 'spec:', '  containers:', '  - name: c', '    image: nginx', '    resources:',
      '      limits:', '        cpu: 0.5', '        memory: 1Gi', '      requests:', '        memory: 512M', '',
    ].join('\n'));
    if (isParseError(parsed)) throw new Error(parsed.error);
    const c = parsed.kind === 'Pod' ? parsed.spec.containers[0] : undefined;
    expect(c?.limits).toEqual({ cpu: 500, memory: 1024 });
    expect(c?.requests.cpu).toBe(500);
    expect(c?.requests.memory).toBeCloseTo(488.28, 2);
  });

  it('練習場の内側だけの欄（createdAt など）は出さない', () => {
    const shown = JSON.stringify(toManifest(deployment('web', 1, [container('web', 'nginx')])));
    expect(shown).not.toContain('createdAt');
    expect(shown).not.toContain('crashing');
  });
});

describe('出力を保存して apply に渡すと同じものになる', () => {
  it('Deployment', () => {
    const original = deployment('web', 3, [container('web', 'nginx:1.27', { env: { MODE: 'prod' } })]);
    const back = roundTrip(original);
    expect(back.kind).toBe('Deployment');
    if (back.kind !== 'Deployment') return;
    expect(back.spec.replicas).toBe(3);
    expect(back.spec.selector).toEqual(original.spec.selector);
    expect(back.spec.template.containers[0]?.image).toBe('nginx:1.27');
    expect(back.spec.template.containers[0]?.env).toEqual({ MODE: 'prod' });
    expect(back.spec.template.containers[0]?.requests).toEqual(original.spec.template.containers[0]?.requests);
  });

  it('Pod', () => {
    const back = roundTrip(pod('web', [container('web', 'nginx')], { labels: { run: 'web' } }));
    expect(back.kind).toBe('Pod');
    expect(back.metadata.labels).toEqual({ run: 'web' });
  });

  it('Service', () => {
    const back = roundTrip(service('web', { app: 'web' }, { port: 80, targetPort: 8080, type: 'NodePort' }));
    expect(back.kind).toBe('Service');
    if (back.kind !== 'Service') return;
    expect(back.spec.selector).toEqual({ app: 'web' });
    expect(back.spec.type).toBe('NodePort');
    expect(back.spec.ports[0]?.targetPort).toBe(8080);
  });
});

import { describe, expect, it } from 'vitest';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, deployment, emptyCluster, node } from '@/engines/k8s/factory';
import { nodeCondition } from '@/engines/k8s/bootstrap';
import { isReady } from '@/engines/k8s/kubelet';

function down() {
  const n = node('node-1', 2000, 4096);
  return {
    ...emptyCluster([{ ...n, status: { ...n.status, kubeletHealthy: false } }]),
    deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx:1.25')], { labels: { app: 'web' } })]]),
  };
}
function bad() {
  return {
    ...emptyCluster([node('node-1', 2000, 4096)]),
    deployments: new Map([['default/web', deployment('web', 1, [container('web', 'does-not-exist:1.0')], { labels: { app: 'web' } })]]),
  };
}

describe('probe boss', () => {
  it('node down', () => {
    const s = createSession({ cluster: down(), files: { '/home/learner': null } });
    let st = s.state;
    const run = (l: string) => { const r = execute(st, l, s.registry, s.clock); st = r.state; return r; };
    run('kubectl wait 12');
    console.log('ready?', nodeCondition(st.cluster!, st.cluster!.nodes.get('node-1')!).ready);
    console.log('pods', [...st.cluster!.pods.values()].map(p => [p.metadata.name, p.status.phase, p.status.nodeName]));
    run('kubectl node-up node-1');
    run('kubectl wait 20');
    console.log('after up pods', [...st.cluster!.pods.values()].map(p => [p.metadata.name, p.status.phase, isReady(p)]));
    const d = run('kubectl describe node node-1');
    console.log('describe', d.chunks.map(c=>c.text).join('').slice(0,300));
  });

  it('bad image', () => {
    const s = createSession({ cluster: bad(), files: { '/home/learner': null } });
    let st = s.state;
    const run = (l: string) => { const r = execute(st, l, s.registry, s.clock); st = r.state; return r; };
    run('kubectl wait 12');
    console.log('bad pods', [...st.cluster!.pods.values()].map(p => [p.metadata.name, p.status.phase, p.status.containerStatuses.map(c=>c.waitingReason)]));
    const r = run('kubectl set image deployment web web=nginx:1.25');
    console.log('set image', r.exitCode, r.chunks.map(c=>c.text).join('').slice(0,200));
    run('kubectl wait 30');
    console.log('after fix', [...st.cluster!.pods.values()].map(p => [p.metadata.name, p.status.phase, isReady(p)]));
    expect(1).toBe(1);
  });
});

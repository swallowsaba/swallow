import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { cutsOf } from './cuts';
import { layoutCity } from './model';

/** 端末 2 台をルータでつないだ街。行を順に打った後の配置を返す */
function wiredAfter(lines: readonly string[]) {
  resetMac();
  const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)]);
  const gw = router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]);
  const web = host('web', [iface('eth0', '10.0.0.20', 24)]);
  let session: Session = createSession({
    net: topology([pc1, gw, web], [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')]),
    vars: { NET_SELF: 'pc1' },
    files: { '/home/learner': null },
  });
  for (const line of lines) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  return layoutCity(buildCity({ net: session.state.net, unlocked: DISTRICT_IDS }));
}

describe('塞がれた道に柵を立てる', () => {
  it('どの道も通れる間は、柵を立てない', () => {
    expect(cutsOf(wiredAfter([]))).toEqual([]);
  });

  it('口を 1 つ落とすと、その道に柵が 1 つ立つ', () => {
    expect(cutsOf(wiredAfter(['ip link set eth0 down']))).toHaveLength(1);
  });

  it('柵は、両端の建物の足元の外に立つ（建物に隠れない）', () => {
    const layout = wiredAfter(['ip link set eth0 down']);
    const [cut] = cutsOf(layout);
    if (cut === undefined) throw new Error('柵が無い');
    for (const building of layout.buildings) {
      const half = Math.max(building.params.footprint.w, building.params.footprint.d) / 2;
      const gap = Math.hypot(cut.at.x - building.at.x, cut.at.z - building.at.z);
      const tooClose = gap < Math.min(building.params.footprint.w, building.params.footprint.d) / 2;
      expect(tooClose, `${building.id} の中に柵がある（${String(gap)} < ${String(half)}）`).toBe(false);
    }
  });

  it('口を上げ直すと、柵が消える', () => {
    expect(cutsOf(wiredAfter(['ip link set eth0 down', 'ip link set eth0 up']))).toEqual([]);
  });
});

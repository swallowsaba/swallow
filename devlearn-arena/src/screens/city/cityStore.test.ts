import { describe, expect, it } from 'vitest';
import type { Facility } from '@/city/types';
import { directHost, type HostMessage, type SimHost } from '@/sim/host';
import type { StateMessage } from '@/sim/runner';
import { createCityStore, NOTICE_MS } from './cityStore';

const academy: Facility = { id: 'f1', type: 'academy', domain: 'found', origin: { x: 45, y: 44 }, rotation: 0, level: 1, state: 'active', builtDay: 0 };

function storeWithAcademy() {
  const store = createCityStore(1);
  const c = store.getState().city;
  store.getState().setCity({ ...c, facilities: [academy] });
  return store;
}

describe('学習から都市へ戻る（docs/game-design.md 7 章・docs/ui-design.md 2.1 章）', () => {
  it('戻ると、上げられるようになった施設へカメラを寄せて選び、変化 → 資金 → 次のおすすめの順に知らせる', () => {
    const store = storeWithAcademy();
    store.getState().leave({ found: 0 });
    const changes = store.getState().welcomeBack({ found: 37 }, ['学習で開発資金が +110 増えた', '次は「端末とシェル」がおすすめ'], 1000);
    expect(changes.map((c) => c.kind)).toEqual(['upgradable']);
    const s = store.getState();
    expect(s.selected).toEqual({ kind: 'facility', id: 'f1' });
    expect(s.focus).toMatchObject({ at: { x: 46.5, y: 45.5 }, seq: 1 });
    expect(s.away).toBeNull();
    expect(s.notice?.text).toBe('市立 IT 学院を Lv2 に上げられるようになった（IT 基礎 初級）');
    expect(s.queue).toEqual(['学習で開発資金が +110 増えた', '次は「端末とシェル」がおすすめ']);
    // 知らせは 3 秒ごとに順に出て、最後に消える
    s.expireNotice(1000 + NOTICE_MS);
    expect(store.getState().notice?.text).toBe('学習で開発資金が +110 増えた');
    store.getState().expireNotice(1000 + NOTICE_MS * 2);
    expect(store.getState().notice?.text).toBe('次は「端末とシェル」がおすすめ');
    store.getState().expireNotice(1000 + NOTICE_MS * 3);
    expect(store.getState().notice).toBeNull();
  });

  it('学習に出ていなければ、何もしない。2 度目の leave は初めの状態を保つ', () => {
    const store = storeWithAcademy();
    expect(store.getState().welcomeBack({ found: 50 }, ['x'], 0)).toEqual([]);
    expect(store.getState().notice).toBeNull();
    store.getState().leave({ found: 0 });
    store.getState().leave({ found: 37 });
    expect(store.getState().away?.skills).toEqual({ found: 0 });
  });

  it('場所のある変化が無ければ、カメラは動かさず、知らせだけを出す', () => {
    const store = createCityStore(1);
    store.getState().leave({ linux: 0 });
    store.getState().welcomeBack({ linux: 35 }, [], 0);
    expect(store.getState().focus).toBeNull();
    expect(store.getState().notice?.text).toContain('サーバ施設）を建てると');
  });
});

describe('施設を上げる（docs/game-design.md 2・5 章: スキルの段階と資金で買う）', () => {
  it('条件を満たせば、アップグレードの申請を出して費用を取り分け、その場所を光の輪で示して知らせる。完成すると Lv が上がる（docs/game-design.md 15 章）', () => {
    const store = storeWithAcademy();
    const funds = store.getState().city.funds;
    expect(store.getState().upgrade('f1', { found: 37 }, 500)).toBe(true);
    const s = store.getState();
    expect(s.world.applications.at(-1)).toMatchObject({ kind: 'upgrade', stage: 'objection', target: { facilityId: 'f1', toLevel: 2 } });
    // 申請の間は今の Lv のまま
    expect(s.city.facilities[0]?.level).toBe(1);
    // 市立 IT 学院の建てた費用 600 × 2 ÷ 2
    expect(s.city.funds).toBe(funds - 600);
    expect(s.focus).toMatchObject({ at: { x: 46.5, y: 45.5 }, size: { x: 3, y: 3 }, seq: 1 });
    // 反対の受付 14 日 → 次の議会 → 工事 21 日
    expect(s.notice?.text).toBe('市立 IT 学院の Lv2 へのアップグレードを申請した（完成まで約 49 日。図書館棟が加わる）');
    // 時間を進めると完成する（1 倍で 1 日 2 秒）
    for (let i = 0; i < 60; i += 1) store.getState().tick(2);
    expect(store.getState().city.facilities[0]?.level).toBe(2);
    expect(store.getState().world.applications.at(-1)?.stage).toBe('done');
  });

  it('戻った時の知らせが並んでいても、上げた知らせはすぐ出す（自分の操作の結果を待たせない）', () => {
    const store = storeWithAcademy();
    store.getState().leave({ found: 0 });
    store.getState().welcomeBack({ found: 37 }, ['学習で開発資金が +110 増えた', '次は「端末とシェル」がおすすめ'], 1000);
    store.getState().upgrade('f1', { found: 37 }, 1500);
    expect(store.getState().notice).toEqual({ text: '市立 IT 学院の Lv2 へのアップグレードを申請した（完成まで約 49 日。図書館棟が加わる）', until: 1500 + NOTICE_MS });
    expect(store.getState().queue).toEqual(['学習で開発資金が +110 増えた', '次は「端末とシェル」がおすすめ']);
  });

  it('スキルの段階が足りなければ、上げず、資金も減らさない', () => {
    const store = storeWithAcademy();
    const before = store.getState().city;
    expect(store.getState().upgrade('f1', { found: 20 }, 0)).toBe(false);
    expect(store.getState().city).toBe(before);
    expect(store.getState().notice).toBeNull();
  });
});

describe('都市の時間（docs/game-design.md 13.1）', () => {
  it('1 倍で 1 日 2 秒。3 倍なら 3 倍の速さで進む。週の終わりに模擬が 1 週分を計算する', () => {
    const store = createCityStore(1);
    const start = store.getState().world.city.day;
    store.getState().tick(2);
    expect(store.getState().world.city.day).toBe(start + 1);
    store.getState().setSpeed(3);
    store.getState().tick(4);
    expect(store.getState().world.city.day).toBe(start + 7);
    expect(store.getState().world.sim.week).toBe(1);
  });

  it('利用者が止めた間・都市画面が前に出ていない間・窓が隠れている間は進まない', () => {
    const store = createCityStore(1);
    const day = (): number => store.getState().city.day;
    const d0 = day();
    store.getState().togglePause();
    store.getState().tick(10);
    expect(day()).toBe(d0);
    store.getState().togglePause();
    store.getState().hold('screen', true);
    store.getState().tick(10);
    expect(day()).toBe(d0);
    store.getState().hold('hidden', true);
    store.getState().hold('screen', false);
    store.getState().tick(10);
    expect(day()).toBe(d0);
    store.getState().hold('hidden', false);
    store.getState().tick(1);
    expect(day()).toBeCloseTo(d0 + 0.5, 9);
  });

  it('速さを選ぶと、止めていても動き出す', () => {
    const store = createCityStore(1);
    store.getState().togglePause();
    store.getState().setSpeed(2);
    expect(store.getState().paused).toBe(false);
    expect(store.getState().speed).toBe(2);
  });
});

describe('操作は日付付きの命令として模擬へ送る（docs/architecture.md 9.1）', () => {
  /** 返事を手で配る模擬の口（Worker のように、後から返事が来る） */
  function lateHost() {
    const inner = directHost();
    const sent: HostMessage[] = [];
    const out: StateMessage[] = [];
    let listener: ((m: StateMessage) => void) | null = null;
    inner.listen((m) => out.push(m));
    const host: SimHost = {
      inWorker: true,
      post: (m) => {
        sent.push(m);
        inner.post(m);
      },
      listen: (fn) => {
        listener = fn;
        return () => undefined;
      },
      stop: () => undefined,
    };
    const deliver = (): void => {
      for (const m of out.splice(0)) listener?.(m);
    };
    return { host, sent, deliver };
  }

  it('置いた物は返事を待たずに見え、返事が来ても消えない。命令には出した日が付く', () => {
    const { host, sent, deliver } = lateHost();
    const store = createCityStore(1, undefined, { host });
    deliver();
    store.getState().tick(4);
    store.getState().dispatch({ kind: 'zone', zone: 'residential', a: { x: 40, y: 48 }, b: { x: 44, y: 48 } });
    expect(store.getState().city.zones).toHaveLength(1);
    const cmd = sent.find((m) => m.type === 'cmd');
    expect(cmd).toMatchObject({ type: 'cmd', cmd: { seq: 1, day: 2, op: { kind: 'zone' } } });
    // 返事の前に次の日の知らせが来ても（命令の前に進めた日）、置いた物は残る
    deliver();
    expect(store.getState().city.zones).toHaveLength(1);
    expect(store.getState().world.city.funds).toBe(1500 - 5 * 5);
  });

  it('模擬が 2 日より遅れたら、追いつくまで時計を待たせる', () => {
    const { host, sent } = lateHost();
    const store = createCityStore(1, undefined, { host });
    store.getState().tick(2);
    store.getState().tick(2);
    store.getState().tick(2);
    store.getState().tick(2);
    const advances = sent.filter((m) => m.type === 'advance').map((m) => (m as { day: number }).day);
    expect(advances).toEqual([1, 2]);
    expect(store.getState().city.day).toBeLessThan(3);
  });
});

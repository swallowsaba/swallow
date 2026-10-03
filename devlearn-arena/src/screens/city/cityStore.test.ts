import { describe, expect, it } from 'vitest';
import type { Facility } from '@/city/types';
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
  it('条件を満たせば、Lv が上がって資金が減り、その場所を光の輪で示して知らせる', () => {
    const store = storeWithAcademy();
    const funds = store.getState().city.funds;
    expect(store.getState().upgrade('f1', { found: 37 }, 500)).toBe(true);
    const s = store.getState();
    expect(s.city.facilities[0]?.level).toBe(2);
    // 市立 IT 学院の建てた費用 600 × 2 ÷ 2
    expect(s.city.funds).toBe(funds - 600);
    expect(s.focus).toMatchObject({ at: { x: 46.5, y: 45.5 }, size: { x: 3, y: 3 }, seq: 1 });
    expect(s.notice?.text).toBe('市立 IT 学院を Lv2 に上げた。図書館棟が加わった');
  });

  it('戻った時の知らせが並んでいても、上げた知らせはすぐ出す（自分の操作の結果を待たせない）', () => {
    const store = storeWithAcademy();
    store.getState().leave({ found: 0 });
    store.getState().welcomeBack({ found: 37 }, ['学習で開発資金が +110 増えた', '次は「端末とシェル」がおすすめ'], 1000);
    store.getState().upgrade('f1', { found: 37 }, 1500);
    expect(store.getState().notice).toEqual({ text: '市立 IT 学院を Lv2 に上げた。図書館棟が加わった', until: 1500 + NOTICE_MS });
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

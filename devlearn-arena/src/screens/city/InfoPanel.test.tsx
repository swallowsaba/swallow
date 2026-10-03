import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FACILITY_DEFS, FACILITY_TYPES } from '@/city/facilities';
import { advance } from '@/city/growth';
import { newCity } from '@/city/newCity';
import { checkFacility, checkRoad, checkZone, placeFacility, placeRoad, placeZone } from '@/city/place';
import { generateTerrain } from '@/city/terrain';
import type { City } from '@/city/types';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords } from '@/game/records';
import { skillsOf, type SkillDetail } from '@/game/skill';
import { InfoPanel } from './InfoPanel';
import { panelModel, type FacilityPanelModel, type PanelModel } from './infoPanelModel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 学習で開発資金を得た後の都市（全ての施設を買える）
const base: City = { ...newCity(), funds: 100000 };
const terrain = generateTerrain(base.seed);

/** 道路を 1 本足して、全ての施設の類を道路に面して並べた都市 */
function cityWithEverything(): City {
  let city = placeRoad(base, checkRoad(base, terrain, { kind: 'street', shape: 'straight', from: { x: 37, y: 53 }, to: { x: 58, y: 53 } }));
  city = placeZone(city, 'residential', checkZone(city, terrain, 'residential', { x: 38, y: 46 }, { x: 46, y: 46 }));
  // 初めの道路（y=47）の南に向けて北側、y=53 の道路の北と南に並べる
  const rows = [
    { y: 48, x: 38, rotation: 180 as const },
    { y: 54, x: 38, rotation: 180 as const },
    { y: 50, x: 38, rotation: 0 as const },
  ];
  let row = 0;
  let x = rows[0]?.x ?? 38;
  for (const type of FACILITY_TYPES) {
    const def = FACILITY_DEFS[type];
    if (def.group === 'reward' || def.minStage > base.stage) continue;
    for (;;) {
      const r = rows[row];
      if (!r) throw new Error(`置く所が無い: ${type}`);
      const y = r.rotation === 0 ? 53 - def.d : r.y;
      const check = checkFacility(city, terrain, type, { x, y }, r.rotation);
      if (check.ok && x + def.w <= 58) {
        city = placeFacility(city, type, { x, y }, r.rotation, check);
        x += def.w;
        break;
      }
      x += 1;
      if (x + def.w > 58) {
        row += 1;
        x = rows[row]?.x ?? 38;
      }
    }
  }
  return advance(city, 20);
}

const city = cityWithEverything();

function facilityPanel(type: string): FacilityPanelModel {
  const f = city.facilities.find((x) => x.type === type);
  if (!f) throw new Error(`施設が無い: ${type}`);
  const m = panelModel(city, { kind: 'facility', id: f.id });
  if (m?.kind !== 'facility') throw new Error('施設の情報ではない');
  return m;
}

describe('情報パネルの中身（docs/ui-design.md 5 章）', () => {
  it('全ての施設を選ぶと、名前・レベル・状態・分野・ここで学ぶ（3 つまで）・アップグレードが出る', () => {
    const types = FACILITY_TYPES.filter((t) => FACILITY_DEFS[t].group === 'facility');
    expect(types).toHaveLength(15);
    for (const type of types) {
      const m = facilityPanel(type);
      expect(m.name, type).toBe(FACILITY_DEFS[type].name);
      expect(m.level).toBe(1);
      expect(m.condition).toEqual({ text: '稼働中', tone: 'ok' });
      expect(m.domains.length, type).toBeGreaterThan(0);
      expect(m.lessons.length, type).toBeGreaterThan(0);
      expect(m.lessons.length, type).toBeLessThanOrEqual(3);
      expect(m.upgrade?.title).toBe('Lv2');
      expect(m.levelNote).toContain('Lv2 へ');
    }
  });

  it('コンテナ施設は、コンテナと Docker の 2 分野。レッスンはコンテナの概念から', () => {
    const m = facilityPanel('container');
    expect(m.domains.map((d) => d.id)).toEqual(['ctr', 'docker']);
    expect(m.lessons[0]?.title).toContain('コンテナとは');
  });

  it('学習の記録が無ければスキルは 0 で「未修得」。記録があれば値と段階が出る', () => {
    expect(facilityPanel('server').domains[0]).toMatchObject({ value: 0, stageName: '未修得' });
    const f = city.facilities.find((x) => x.type === 'server');
    // Linux の初級 1 本を、クイズ 4 問の初回正解・実戦ヒント無しで修了した記録
    const { progress } = applyRecords(emptyProgress(), [{
      kind: 'lesson', lessonId: 'linux.b.01', at: '2026-10-02T19:00:00+09:00',
      quiz: [1, 2, 3, 4].map((n) => ({ quizId: `q${String(n)}`, correct: true })), practice: [{ success: true }], complete: true,
    }], LESSONS);
    const skills = skillsOf(['linux'], progress, LESSONS, '2026-10-02');
    const m = panelModel(city, { kind: 'facility', id: f?.id ?? '' }, skills);
    // 修了 1/37（重み）× 40 = 1.08 + クイズ 25 + 実戦 25 + 定着 10 = 61.08 → 61
    expect(m?.kind === 'facility' ? m.domains[0] : null).toMatchObject({ value: 61, stageName: '中級' });
    expect(m?.kind === 'facility' ? m.domains[0]?.because : '').toBe('修了 1 / 21 本・クイズ初回正解 4 / 4 問・実戦の成功 1 / 1 回・復習 1 / 1 枚が予定どおり');
  });

  it('公園の類は、学習の欄を持たず、周りの区画への効き目を出す', () => {
    const m = facilityPanel('park');
    expect(m.lessons).toEqual([]);
    expect(m.effect).toMatch(/区画の育ちを良くする/);
  });

  it('区画の建物を選ぶと、建物の名前・段・住む人の数が出る', () => {
    const b = city.buildings.find((x) => city.zones.find((z) => z.id === x.zoneId)?.kind === 'residential');
    if (!b) throw new Error('建物が無い');
    const m = panelModel(city, { kind: 'building', id: b.id });
    expect(m?.kind).toBe('building');
    if (m?.kind !== 'building') return;
    expect(m.typeLabel).toBe('住宅の区画の建物');
    expect(m.people).toMatch(/^住む人 \d+ 人$/);
  });

  it('無くなった物を選んでいれば、パネルを出さない', () => {
    expect(panelModel(city, { kind: 'facility', id: 'f999' })).toBeNull();
  });
});

function render(model: PanelModel | null, onClose = () => {}): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(<InfoPanel model={model} onClose={onClose} />);
  });
  return host;
}

describe('情報パネルの部品', () => {
  it('上から 名前 → 状態 → 対応する分野 → ここで学ぶ → ミッション → アップグレード の順に並ぶ', () => {
    const host = render(facilityPanel('server'));
    const text = host.textContent ?? '';
    const order = ['サーバ施設', '稼働中', '対応する分野', 'ここで学ぶ', 'ミッション', 'アップグレード'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(host.querySelectorAll('[data-testid="info-lessons"] li')).toHaveLength(3);
  });

  it('閉じるを押すと閉じる操作を呼ぶ', () => {
    const onClose = vi.fn();
    const host = render(facilityPanel('web'), onClose);
    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]')?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('分野が 2 つで、どちらも記録が無い時は、理由を 1 度だけ書く', () => {
    const host = render(facilityPanel('container'));
    const text = host.textContent ?? '';
    expect(text.split('まだ学習の記録が無い').length - 1).toBe(1);
  });

  it('何も選んでいなければ何も出さない', () => {
    const host = render(null);
    expect(host.querySelector('[data-testid="info-panel"]')).toBeNull();
  });
});

describe('情報パネルから学ぶ（docs/ui-design.md 5 章: どのレッスンもここから始められる）', () => {
  it('「ここで学ぶ」のレッスンを押すとそのレッスンを始め、「学習ライブラリで全部見る」は施設の分野で絞って開く', () => {
    const onLesson = vi.fn();
    const onLibrary = vi.fn();
    const model = facilityPanel('container');
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      createRoot(host).render(<InfoPanel model={model} onClose={() => {}} onLesson={onLesson} onLibrary={onLibrary} />);
    });
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="info-lessons"] button')];
    expect(buttons).toHaveLength(model.lessons.length);
    for (const [i, b] of buttons.entries()) {
      act(() => b.click());
      expect(onLesson).toHaveBeenLastCalledWith(model.lessons[i]?.id);
    }
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="info-library"]')?.click());
    expect(onLibrary).toHaveBeenCalledWith('ctr');
  });

  it('修了したレッスンは後ろへ回り、修了の印が付く（推奨順・未修了優先）', () => {
    const f = city.facilities.find((x) => x.type === 'server');
    const first = facilityPanel('server').lessons[0]?.id ?? '';
    const { progress } = applyRecords(emptyProgress(), [{
      kind: 'lesson', lessonId: first, at: '2026-10-02T19:00:00+09:00',
      quiz: [1, 2, 3].map((n) => ({ quizId: `q${String(n)}`, correct: true })), practice: [{ success: true }], complete: true,
    }], LESSONS);
    const m = panelModel(city, { kind: 'facility', id: f?.id ?? '' }, undefined, progress);
    if (m?.kind !== 'facility') throw new Error('施設の情報ではない');
    expect(m.lessons.map((l) => l.id)).not.toContain(first);
    expect(m.lessons.every((l) => l.status === 'not-started')).toBe(true);
  });
});

describe('情報パネルのアップグレード（docs/game-design.md 5 章・docs/decisions.md D-12）', () => {
  const skill = (value: number): SkillDetail => ({
    domain: 'found', value, stage: 0, breakdown: { completion: 0, quizFirstTry: 0, practiceSuccess: 0, retention: 0 },
    counts: { completedLessons: 1, totalLessons: 20, quizFirstTries: 0, quizFirstCorrect: 0, practices: 0, practiceClean: 0, practiceHinted: 0, cards: 0, cardsOnTime: 0 },
  });

  it('スキルの段階が足りなければ、上げるボタンを出さず、何が足りないかを書く', () => {
    const host = render(facilityPanel('server'));
    expect(host.querySelector('[data-testid="info-upgrade"]')).toBeNull();
    expect(host.querySelector('[data-testid="info-upgrade-blocked"]')?.textContent).toContain('Linux / CLIのスキルが「初級」以上になると上げられる（今は「未修得」）');
  });

  it('条件を満たせば「Lv2 に上げる」が出て、押すとその施設を上げる操作を呼ぶ', () => {
    const f = city.facilities.find((x) => x.type === 'server');
    const m = panelModel(city, { kind: 'facility', id: f?.id ?? '' }, { linux: skill(35) });
    expect(m?.kind === 'facility' ? m.upgrade : null).toMatchObject({ ok: true, level: 2, cost: 400, blocked: [] });
    const onUpgrade = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      createRoot(host).render(<InfoPanel model={m} onClose={() => {}} onUpgrade={onUpgrade} />);
    });
    const button = host.querySelector<HTMLButtonElement>('[data-testid="info-upgrade"]');
    expect(button?.textContent).toContain('Lv2 に上げる');
    act(() => button?.click());
    expect(onUpgrade).toHaveBeenCalledWith(f?.id);
  });

  it('大型施設の Lv3 は、都市が地方都市になるまで上げられないと書く', () => {
    const f = city.facilities.find((x) => x.type === 'academy');
    if (!f) throw new Error('施設が無い');
    const lv2 = { ...city, facilities: city.facilities.map((x) => (x.id === f.id ? { ...x, level: 2 as const } : x)) };
    const m = panelModel(lv2, { kind: 'facility', id: f.id }, { found: skill(60) });
    if (m?.kind !== 'facility') throw new Error('施設の情報ではない');
    expect(m.upgrade?.ok).toBe(false);
    expect(m.upgrade?.needs).toBe('IT 基礎のスキルが「中級」以上（今は「中級」）・都市が「地方都市」以上と、開発資金');
    expect(m.upgrade?.blocked).toEqual(['大型施設の Lv3 は、都市が「地方都市」になると上げられる']);
  });
});

describe('情報パネルのミッション（docs/game-design.md 5 章・docs/decisions.md D-14）', () => {
  const withLevel = (type: string, level: 1 | 2 | 3 | 4 | 5): City => ({
    ...city,
    facilities: city.facilities.map((f) => (f.type === type ? { ...f, level } : f)),
  });
  const missionsOf = (c: City, type: string, progress = emptyProgress()): FacilityPanelModel => {
    const f = c.facilities.find((x) => x.type === type);
    const m = f ? panelModel(c, { kind: 'facility', id: f.id }, {}, progress) : null;
    if (m?.kind !== 'facility') throw new Error(type);
    return m;
  };

  it('施設の分野を含むミッションが、施設の Lv の数まで並ぶ。Lv が上がると増える', () => {
    expect(missionsOf(city, 'web').missions.map((m) => m.title)).toEqual(['Web サーバを構築せよ']);
    expect(missionsOf(city, 'web').missionTotal).toBe(3);
    expect(missionsOf(withLevel('web', 3), 'web').missions).toHaveLength(3);
    expect(missionsOf(withLevel('web', 5), 'web').missions).toHaveLength(3);
  });

  it('関係するミッションの無い施設には欄を出さない。押すとミッション一覧でそのミッションを開く', () => {
    const onMission = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<InfoPanel model={missionsOf(withLevel('web', 2), 'web')} onClose={vi.fn()} onMission={onMission} />));
    const items = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="info-missions"] button')];
    // Web 施設の分野（web）を先頭に持つミッションは無いので、ミッション一覧の並び（報酬の XP の小さい順）のまま
    expect(items.map((b) => b.dataset.mission)).toEqual(['web-server', 'https']);
    expect(host.textContent).toContain('Lv が上がると増える（2 / 3）');
    act(() => items[0]?.click());
    expect(onMission).toHaveBeenCalledWith(items[0]?.dataset.mission);
    act(() => root.render(<InfoPanel model={missionsOf(city, 'datacenter')} onClose={vi.fn()} />));
    expect(host.querySelector('[data-testid="info-missions"]')).toBeNull();
    act(() => root.unmount());
  });
});

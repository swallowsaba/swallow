import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FACILITY_DEFS, FACILITY_TYPES } from '@/city/facilities';
import { advance } from '@/city/growth';
import { newCity } from '@/city/newCity';
import { checkFacility, checkRoad, checkZone, placeFacility, placeRoad, placeZone } from '@/city/place';
import { generateTerrain } from '@/city/terrain';
import type { City } from '@/city/types';
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
    const m = panelModel(city, { kind: 'facility', id: f?.id ?? '' }, { linux: 55 });
    expect(m?.kind === 'facility' ? m.domains[0] : null).toMatchObject({ value: 55, stageName: '中級' });
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

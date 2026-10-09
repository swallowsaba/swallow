import { describe, expect, it } from 'vitest';
import { createRandom } from './random';
import { layoutLabels, overlaps, rectHitsPolygon, type LabelRequest, type ScreenRect } from './labels';

const area = { width: 1920, height: 1080, top: 48, bottom: 100 };
const rectOf = (p: { x: number; y: number; width: number; height: number }): ScreenRect => ({ x0: p.x, y0: p.y, x1: p.x + p.width, y1: p.y + p.height });

function crowd(n: number, spread: number, seed: number): LabelRequest[] {
  const rand = createRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `f${String(i)}`,
    ax: 960 + (rand() - 0.5) * spread,
    ay: 560 + (rand() - 0.5) * spread * 0.5,
    width: 120 + Math.round(rand() * 60),
    height: 26,
    priority: Math.round(rand() * 3),
  }));
}

describe('名札の配置', () => {
  it('30 個を密集させても、置いた名札どうしは重ならない', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const placed = layoutLabels(crowd(30, 160, seed), [], area);
      expect(placed.length).toBeGreaterThan(5);
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          expect(overlaps(rectOf(placed[i] as never), rectOf(placed[j] as never))).toBe(false);
        }
      }
    }
  });

  it('建物（障害物）に重ねない', () => {
    const buildings: ScreenRect[] = [{ x0: 900, y0: 400, x1: 1020, y1: 600 }, { x0: 700, y0: 450, x1: 860, y1: 640 }];
    const placed = layoutLabels(crowd(30, 400, 9), buildings, area);
    for (const p of placed) for (const b of buildings) expect(overlaps(rectOf(p), b)).toBe(false);
  });

  it('建物の輪郭（菱形の立体）に重ねない。輪郭の外の角には置ける', () => {
    const diamond = [{ x: 500, y: 300 }, { x: 600, y: 350 }, { x: 500, y: 400 }, { x: 400, y: 350 }];
    expect(rectHitsPolygon({ x0: 480, y0: 340, x1: 520, y1: 360 }, diamond)).toBe(true);
    expect(rectHitsPolygon({ x0: 400, y0: 300, x1: 440, y1: 315 }, diamond)).toBe(false);
    const placed = layoutLabels([{ id: 'a', ax: 500, ay: 420, width: 100, height: 26, priority: 0 }], [diamond], area);
    for (const p of placed) expect(rectHitsPolygon(rectOf(p), diamond)).toBe(false);
  });

  it('場所が足りない時は、小さくせずに間引く', () => {
    const placed = layoutLabels(crowd(30, 10, 7), [], { width: 400, height: 300, top: 0, bottom: 0 });
    expect(placed.length).toBeLessThan(30);
    for (const p of placed) expect(p.width).toBeGreaterThanOrEqual(120);
  });

  it('離れていれば指す点の真上に置き、ずらした時は引き出し線で結ぶ', () => {
    const placed = layoutLabels([
      { id: 'a', ax: 300, ay: 400, width: 100, height: 26, priority: 0 },
      { id: 'b', ax: 1300, ay: 400, width: 100, height: 26, priority: 0 },
      { id: 'c', ax: 305, ay: 402, width: 100, height: 26, priority: 0 },
    ], [], area);
    const a = placed.find((p) => p.id === 'a');
    const c = placed.find((p) => p.id === 'c');
    expect(a?.leader).toBe(false);
    expect(a?.x).toBe(250);
    expect(c?.leader).toBe(true);
  });

  it('優先の高い名札（選んでいる施設）が先に場所を取る', () => {
    const placed = layoutLabels([
      { id: 'low', ax: 300, ay: 400, width: 100, height: 26, priority: 0 },
      { id: 'high', ax: 300, ay: 400, width: 100, height: 26, priority: 9 },
    ], [], area);
    expect(placed.find((p) => p.id === 'high')?.leader).toBe(false);
    expect(placed.find((p) => p.id === 'low')?.leader).toBe(true);
  });

  it('上の帯と建設メニューの所には置かない', () => {
    const placed = layoutLabels([{ id: 'edge', ax: 500, ay: 60, width: 100, height: 26, priority: 0 }], [], area);
    for (const p of placed) expect(p.y).toBeGreaterThanOrEqual(48);
  });

  it('同じ入力からは同じ配置', () => {
    expect(layoutLabels(crowd(30, 300, 3), [], area)).toEqual(layoutLabels(crowd(30, 300, 3), [], area));
  });

  it('矩形と輪郭の重なりは、分離軸の素直な判定と一致する（境で接するだけは重ならない）', () => {
    // 素直な判定: 輪郭の各辺の法線に、輪郭と矩形の 4 隅を射影して、離れている軸があれば重ならない
    const plain = (r: ScreenRect, poly: { x: number; y: number }[]): boolean => {
      const box = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
      return poly.every((a, i) => {
        const b = poly[(i + 1) % poly.length] as { x: number; y: number };
        const span = (pts: { x: number; y: number }[]): number[] => pts.map((p) => p.x * (b.y - a.y) + p.y * (a.x - b.x));
        const p = span(poly);
        const q = span(box);
        return !(Math.max(...p) <= Math.min(...q) || Math.max(...q) <= Math.min(...p));
      }) && !(Math.max(...poly.map((p) => p.x)) <= r.x0 || Math.min(...poly.map((p) => p.x)) >= r.x1
        || Math.max(...poly.map((p) => p.y)) <= r.y0 || Math.min(...poly.map((p) => p.y)) >= r.y1);
    };
    let hit = 0;
    for (let k = 0; k < 200; k += 1) {
      const cx = 300 + (k % 40) * 7;
      const cy = 200 + ((k * 13) % 50);
      const poly = [{ x: cx, y: cy - 40 }, { x: cx + 80, y: cy }, { x: cx, y: cy + 40 }, { x: cx - 80, y: cy }];
      const r = { x0: 330 + (k % 5) * 9, y0: 150 + (k % 7) * 11, x1: 390 + (k % 5) * 9, y1: 174 + (k % 7) * 11 };
      expect(rectHitsPolygon(r, poly), `k=${String(k)}`).toBe(plain(r, poly));
      if (plain(r, poly)) hit += 1;
    }
    // 重なる場合と重ならない場合の両方を調べている
    expect(hit).toBeGreaterThan(20);
    expect(hit).toBeLessThan(180);
  });
});

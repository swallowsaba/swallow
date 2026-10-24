// 表示切替を確かめる台本（docs/development-plan.md G2）。
//
//   SHOOT_SCRIPT=tools/scenarios/view-g2.mjs npm run shoot -- g2-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/view-g2.mjs npm run shoot -- g2-end-720
//
// 一般道（y = 47）の南に住宅 8 棟、北の西の端に店と事務所の見本の通りを置き、2 週進める。
// 道路の向かいに工業区画（工場 6 棟）を足して 5 週進め、表示切替の窓を開いて、
// 説明の文・説明を押した時の騒音のヒートマップ・家賃のヒートマップと値の小窓・グラフを撮る。
import { at, days } from './town.mjs';

async function uiShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"]')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 開いた窓（小さな窓・情報パネル）を足した時に、都市が見えている割合 */
async function cityVisible(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"], [data-testid="view-window"], [data-testid="info-panel"]')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((1 - covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

async function fps(page) {
  return page.evaluate(async () => {
    window.__city.setContinuous(true);
    const t0 = performance.now();
    let n = 0;
    await new Promise((resolve) => {
      const step = () => {
        n += 1;
        if (performance.now() - t0 < 2000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    window.__city.setContinuous(false);
    return Math.round((n / ((performance.now() - t0) / 1000)) * 10) / 10;
  });
}

/** 表示切替の窓の一覧から選ぶ（もう重ねていれば押さない。押すと外れるため） */
async function choose(page, kind) {
  const on = await page.locator(`[data-testid="overlay-${kind}"][aria-pressed="true"]`).count();
  if (!on) await page.click(`[data-testid="overlay-${kind}"]`);
}

export default async function viewG2(page, shot) {
  // 見本の通り（区画と建物を都市に置く。撮影と確かめの道具 setCity）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const c = s.city;
    const homes = [38, 39, 40, 41, 42, 43, 44, 45].map((x) => ({ id: `h${x}`, zoneId: 'z-home', cell: { x, y: 48 }, variant: `residential:${x}`, level: 2, builtDay: -10 }));
    const work = [
      { id: 'o1', zoneId: 'z-off', cell: { x: 38, y: 46 }, variant: 'office:1', level: 3, builtDay: -10 },
      { id: 's1', zoneId: 'z-shop', cell: { x: 39, y: 46 }, variant: 'commercial:1', level: 3, builtDay: -10 },
    ];
    s.setCity({
      ...c,
      stage: 3,
      zones: [
        { id: 'z-home', kind: 'residential', cells: homes.map((h) => h.cell) },
        { id: 'z-off', kind: 'office', cells: [{ x: 38, y: 46 }] },
        { id: 'z-shop', kind: 'commercial', cells: [{ x: 39, y: 46 }] },
      ],
      buildings: [...homes, ...work],
    });
  });
  await page.keyboard.press('3');
  await days(page, 14);
  // 道路の向かいに工業区画（工場 6 棟）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const c = s.world.city;
    const fac = [40, 41, 42, 43, 44, 45].map((x) => ({ id: `f${x}`, zoneId: 'z-fac', cell: { x, y: 46 }, variant: `industrial:${x}`, level: 3, builtDay: -10 }));
    s.setCity({ ...c, zones: [...c.zones, { id: 'z-fac', kind: 'industrial', cells: fac.map((b) => b.cell) }], buildings: [...c.buildings, ...fac] });
  });
  await days(page, 28);
  await page.keyboard.press(' ');
  // 通りへ寄せる
  for (let i = 0; i < 3; i += 1) await page.evaluate(() => window.__city.zoomBy(1));
  const c = await at(page, 42, 47);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - 200 - x, window.innerHeight / 2 - y), [c.sx, c.sy]);
  await page.waitForTimeout(300);
  const size = await page.evaluate(() => `${String(window.innerWidth)}`);
  const tag = size === '1920' ? '' : `-${size}`;
  console.log('常時の UI', await uiShare(page), '%');
  console.log('知らせ', await page.evaluate(() => window.__cityStore.getState().notice?.text ?? null));
  console.log('上の帯の支持率', await page.evaluate(() => document.querySelector('[data-testid="topbar-approval"]')?.getAttribute('title')));
  await shot(`g2-city${tag}`);
  // 上の帯の支持率を押すと、表示切替の窓が開く
  await page.click('[data-testid="topbar-approval"]');
  await page.waitForTimeout(300);
  console.log('説明', await page.evaluate(() => document.querySelector('[data-testid="view-explain"]')?.textContent));
  console.log('窓を開いた時に都市が見える割合', await cityVisible(page), '%');
  await shot(`g2-window${tag}`);
  // 説明を押すと、原因の場所へ寄り、騒音のヒートマップになる
  await page.click('[data-testid="view-explain"]');
  await page.waitForTimeout(1200);
  console.log('説明を押した後', await page.evaluate(() => JSON.stringify({ overlay: window.__cityStore.getState().overlay, focus: window.__cityStore.getState().focus?.at })));
  console.log('凡例', await page.evaluate(() => document.querySelector('[data-testid="overlay-legend"]')?.textContent));
  console.log('fps（騒音のヒートマップを重ねて）', await fps(page));
  await shot(`g2-noise${tag}`);
  // 家賃のヒートマップと、マスを指した時の値
  await choose(page, 'rent');
  await page.waitForTimeout(300);
  const h = await at(page, 42, 48);
  await page.mouse.move(h.sx, h.sy);
  await page.waitForTimeout(300);
  console.log('値の小窓', await page.evaluate(() => document.querySelector('[data-testid="heat-tip"]')?.textContent ?? null), JSON.stringify(await page.evaluate(([x, y]) => {
    const s = window.__cityStore.getState();
    const cell = window.__city.cellAt(x, y);
    return { cell, overlay: s.overlay, v: s.heat?.cells.rent[cell.y * 96 + cell.x], el: document.elementFromPoint(x, y)?.className };
  }, [h.sx, h.sy])));
  await shot(`g2-rent${tag}`);
  // 雇用のグラフ
  await page.click('[data-testid="graph-jobs"]');
  await choose(page, 'jobs');
  await page.mouse.move(h.sx, h.sy + 2);
  await page.waitForTimeout(300);
  console.log('雇用の小窓', await page.evaluate(() => document.querySelector('[data-testid="heat-tip"]')?.textContent ?? null));
  await shot(`g2-jobs${tag}`);
  // V で閉じる
  await page.mouse.move(10, 300);
  await page.keyboard.press('v');
  await page.waitForTimeout(200);
  console.log('V で閉じた', await page.evaluate(() => window.__cityStore.getState().windows.length === 0));
}

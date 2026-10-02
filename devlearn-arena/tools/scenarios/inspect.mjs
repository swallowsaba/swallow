// 建物の選択・情報パネル・名札・表示切替を確かめる台本（docs/development-plan.md Phase 3）。
//
//   SHOOT_SCRIPT=tools/scenarios/inspect.mjs npm run shoot -- p3-end
import { at, buildTown, days, drag, facility, pick } from './town.mjs';

/** 名札どうし・名札と建物の重なりを数える（描画器が最後に置いた名札で） */
async function labelReport(page) {
  return page.evaluate(() => {
    const r = window.__city;
    const labels = r.lastLabels;
    let overlaps = 0;
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i];
        const b = labels[j];
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps += 1;
      }
    }
    return { placed: r.stats.labels, wanted: r.stats.labelsWanted, overlaps };
  });
}

/** 都市の上に重ねた UI の面積の割合（重なりは数えない。2 画素の格子で数える） */
async function uiShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="info-panel"], .city-notice')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 地図の点を画面の中央に持ってくる */
async function centerOn(page, x, y) {
  const p = await at(page, x, y);
  await page.evaluate(([sx, sy]) => window.__city.panBy(window.innerWidth / 2 - sx, window.innerHeight / 2 - sy), [p.sx, p.sy]);
  await page.waitForTimeout(200);
}

/** 施設を置き、置けなかったら理由を出す */
async function place(page, type, cell, turns = 0) {
  const before = await page.evaluate(() => window.__cityStore.getState().city.facilities.length);
  await facility(page, type, cell, turns);
  const after = await page.evaluate(() => window.__cityStore.getState().city.facilities.length);
  if (after === before) console.log('置けない', type, await page.evaluate(() => JSON.stringify(window.__cityStore.getState().hint)));
}

export default async function inspect(page, shot) {
  await buildTown(page);
  await page.evaluate(() => window.__city.zoomBy(1));
  const c = await at(page, 50, 48);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [c.sx, c.sy]);
  await page.waitForTimeout(300);
  console.log('名札', JSON.stringify(await labelReport(page)));
  console.log('UI の割合（常時）', await uiShare(page), '%');
  await shot('p3-labels');

  // 施設を左クリックで選ぶ（サーバ施設の建物の上）
  const server = await page.evaluate(() => window.__city.screenOf(53, 46, 0.35));
  await page.mouse.click(server.sx, server.sy);
  await page.waitForTimeout(300);
  console.log('選んだ', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().selected)));
  console.log('名札', JSON.stringify(await labelReport(page)));
  console.log('UI の割合（情報パネルを開いて）', await uiShare(page), '%');
  await shot('p3-select');

  // Tab で施設を順に選ぶ
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  console.log('Tab の後', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().selected)));
  await shot('p3-tab');

  // 全ての施設を Tab でたどり、情報パネルが出るか
  const all = await page.evaluate(async () => {
    const s = window.__cityStore;
    const out = [];
    for (let i = 0; i < s.getState().city.facilities.length; i += 1) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      await new Promise((r) => setTimeout(r, 60));
      const panel = document.querySelector('[data-testid="info-panel"]');
      out.push({ id: s.getState().selected?.id, panel: panel ? panel.getAttribute('aria-label') : null });
    }
    return out;
  });
  console.log('全ての施設', JSON.stringify(all));

  // 区画の建物を選ぶ（手前に何も無い 2 段目の建物の上を押す）
  await page.keyboard.press('Escape');
  const house = await page.evaluate(() => {
    const r = window.__city;
    const c = window.__cityStore.getState().city;
    for (const b of [...c.buildings].sort((x, y) => y.level - x.level)) {
      const p = r.screenOf(b.cell.x + 0.5, b.cell.y + 0.5, 0.3);
      if (p.sx < 100 || p.sx > 1500 || p.sy < 100 || p.sy > 950) continue;
      if (r.objectAt(p.sx, p.sy)?.id === b.id) return { ...p, id: b.id };
    }
    return null;
  });
  if (house) await page.mouse.click(house.sx, house.sy);
  await page.waitForTimeout(300);
  console.log('区画の建物', house?.id, await page.evaluate(() => JSON.stringify(window.__cityStore.getState().selected)));
  await shot('p3-building');
  await page.keyboard.press('Escape');

  // 表示切替
  for (const kind of ['learning', 'population', 'traffic', 'stage']) {
    await page.click(`[data-testid="overlay-${kind}"]`);
    await page.waitForTimeout(300);
    await shot(`p3-overlay-${kind}`);
  }
  await page.click('[data-testid="overlay-stage"]');

  // 引いて、名札が間引かれても重ならないか
  await page.evaluate(() => window.__city.zoomBy(-3));
  await page.waitForTimeout(300);
  console.log('引いた名札', JSON.stringify(await labelReport(page)));
  await shot('p3-far');

  // 残りの 9 施設を置き、全 15 施設を Tab で選んで情報パネルが出るか
  await page.evaluate(() => window.__city.zoomBy(2));
  await centerOn(page, 45, 62);
  await pick(page, 'road', 'build-road-street');
  await drag(page, [34, 63], [56, 63]);
  console.log('道路', await page.evaluate(() => window.__cityStore.getState().city.roads.length));
  await place(page, 'research', [35, 61]);
  await place(page, 'datacenter', [39, 61]);
  await place(page, 'deploy', [43, 61]);
  await place(page, 'container', [47, 61]);
  await place(page, 'cluster', [51, 61]);
  await place(page, 'cloud', [55, 61]);
  await place(page, 'devops', [35, 64], 2);
  await place(page, 'monitor', [38, 64], 2);
  await place(page, 'incident', [41, 64], 2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__cityStore.getState().togglePause());
  await days(page, 3);
  await page.evaluate(() => window.__cityStore.getState().togglePause());
  const every = await page.evaluate(async () => {
    const s = window.__cityStore;
    const types = new Map();
    const n = s.getState().city.facilities.length;
    for (let i = 0; i < n; i += 1) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      await new Promise((r) => setTimeout(r, 60));
      const sel = s.getState().selected;
      const f = s.getState().city.facilities.find((x) => x.id === sel?.id);
      const panel = document.querySelector('[data-testid="info-panel"]');
      const lessons = document.querySelectorAll('[data-testid="info-lessons"] li').length;
      if (f) types.set(f.type, { panel: panel?.getAttribute('aria-label') ?? null, lessons });
    }
    return Object.fromEntries(types);
  });
  const learnable = Object.entries(every).filter(([, v]) => v.lessons > 0);
  console.log('全施設', Object.keys(every).length, '種', '情報パネル', Object.values(every).filter((v) => v.panel).length, '学べる施設', learnable.length);
  console.log(JSON.stringify(every));
  console.log('名札', JSON.stringify(await labelReport(page)));
  await shot('p3-all');
  // コンテナ施設を選んで（分野が 2 つ）撮る
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const f = s.city.facilities.find((x) => x.type === 'container');
    if (f) s.select({ kind: 'facility', id: f.id });
  });
  await page.waitForTimeout(300);
  console.log('名札', JSON.stringify(await labelReport(page)));
  console.log('UI の割合（2 分野の情報パネル）', await uiShare(page), '%');
  await shot('p3-container');
}

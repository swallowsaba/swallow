// 都市の模擬の土台を確かめる台本（docs/development-plan.md G1）。
//
//   SHOOT_SCRIPT=tools/scenarios/sim-g1.mjs npm run shoot -- g1-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/sim-g1.mjs npm run shoot -- g1-end-720
//
// 画面の操作で町を作り、住宅の隣に工業区画を塗り、時間を進める。
// 上の帯の日付と速さ・支持率、工業区画の建物、常時の UI の割合を撮って確かめる。
import { at, buildTown, days, drag, pick } from './town.mjs';

/** 都市の上に重ねた UI の面積の割合（重なりは数えない。2 画素の格子で数える。inspect.mjs と同じ数え方） */
async function uiShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="info-panel"], [data-testid="minimap"], .city-notice')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 上の帯がはみ出していないか（右端の入口が画面の中にあるか） */
async function topbarFits(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="topbar"]');
    const last = [...document.querySelectorAll('.topbar-entry')].at(-1);
    const r = last?.getBoundingClientRect();
    return { barWidth: bar?.scrollWidth, viewport: window.innerWidth, lastRight: r ? Math.round(r.right) : null };
  });
}

async function summary(page) {
  return page.evaluate(() => {
    const s = window.__cityStore.getState();
    const w = s.world;
    const industrial = w.city.zones.filter((z) => z.kind === 'industrial').map((z) => z.id);
    return {
      day: w.city.day,
      week: w.sim.week,
      population: w.city.population,
      approval: Math.round(w.sim.lastWeek.approval * 10) / 10,
      jobs: w.sim.lastWeek.jobs,
      unemployment: Math.round(w.sim.lastWeek.unemployment * 1000) / 10,
      rentFactor: w.sim.rentFactor,
      treasury: w.budget.treasury,
      households: Object.keys(w.sim.households).length,
      businesses: Object.keys(w.sim.businesses).length,
      factories: w.city.buildings.filter((b) => industrial.includes(b.zoneId)).map((b) => b.level),
      topCauses: (w.history.breakdown.at(-1)?.causes ?? []).slice(0, 4).map((c) => `${c.factor}:${c.source.kind}:${c.source.id}:${Math.round(c.points * 100) / 100}`),
      date: document.querySelector('[data-testid="topbar-date"]')?.textContent,
      topApproval: document.querySelector('[data-testid="topbar-approval"] .topbar-stat-value')?.textContent,
      inWorker: Boolean(document.querySelector('[data-testid="city-screen"]')),
    };
  });
}

export default async function simG1(page, shot) {
  await buildTown(page);
  // 住宅（y = 51・53）の隣に工業区画を塗る（細い道 y = 52 に面する）
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [52, 51], [56, 51]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 3 倍の速さにして、時間を進める（8 週）
  await page.keyboard.press('3');
  for (let i = 0; i < 8; i += 1) await days(page, 7);
  console.log('模擬', JSON.stringify(await summary(page)));
  console.log('UI の割合（常時）', await uiShare(page), '%');
  console.log('上の帯', JSON.stringify(await topbarFits(page)));
  const size = await page.evaluate(() => `${String(window.innerWidth)}`);
  const tag = size === '1920' ? '' : `-${size}`;
  await shot(`g1-city${tag}`);
  // 工業区画のそばへ寄せて撮る
  for (let i = 0; i < 4; i += 1) await page.evaluate(() => window.__city.zoomBy(1));
  const c = await at(page, 54, 51);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [c.sx, c.sy]);
  await page.waitForTimeout(400);
  await shot(`g1-industrial${tag}`);
  // さらに寄せて、工業区画の建物の細部を撮る
  for (let i = 0; i < 3; i += 1) await page.evaluate(() => window.__city.zoomBy(1));
  const c2 = await at(page, 54, 51);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [c2.sx, c2.sy]);
  await page.waitForTimeout(400);
  await shot(`g1-industrial-near${tag}`);
  for (let i = 0; i < 3; i += 1) await page.evaluate(() => window.__city.zoomBy(-1));
  // 止めると、上の帯の止めるボタンが金になる
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  for (let i = 0; i < 4; i += 1) await page.evaluate(() => window.__city.zoomBy(-1));
  await page.waitForTimeout(300);
}

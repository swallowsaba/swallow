// 最も重い都市で、都市画面の fps を測る台本（docs/development-plan.md G12・docs/testing-strategy.md 10.6・docs/acceptance-criteria.md S28）。
//
//   SHOOT_SCRIPT=tools/scenarios/heavy-g12.mjs npm run shoot -- g12-heavy
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/heavy-g12.mjs npm run shoot -- g12-heavy-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 都市は tools/bench-sim.mjs と同じ見本の都市（src/sim/__fixtures__/cities.ts の gridCity(true)。発展段階 5・建物 1,804・人口 50 万）。
// 見本は TypeScript なので、vite-node で JSON に書き出してから（shots/heavy-world.json）ページに読み込ませる。
// 次の 4 つの形で、毎フレーム描き直させて 3 秒の間のフレームの数を数える（6 章の撮影と同じ数え方）。
//   止めた都市 → 3 倍の速さ → 3 倍の速さ ＋ ヒートマップ（地価）→ 3 倍の速さ ＋ ヒートマップ ＋ 表示切替の窓
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const FILE = 'shots/heavy-world.json';

/** 3 秒の間のフレームの数（都市を毎フレーム描き直させる） */
async function fps(page) {
  return page.evaluate(async () => {
    const city = window.__city;
    city.setContinuous(true);
    const start = city.stats.frames;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const frames = city.stats.frames - start;
    city.setContinuous(false);
    return { fps: Math.round(((frames * 1000) / (performance.now() - t0)) * 10) / 10, drawn: city.stats.drawnObjects };
  });
}

export default async function heavyG12(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  if (!existsSync(FILE)) execFileSync('npx', ['vite-node', 'tools/heavy-world.mts', FILE], { stdio: 'inherit', shell: true });
  const world = JSON.parse(readFileSync(FILE, 'utf8'));

  if (await page.$('[data-testid="election-window"]')) await page.click('[data-testid="election-window"] .election-close');
  await page.evaluate((w) => {
    const s = window.__cityStore.getState();
    // 公約は選んだことにする（公約を選ぶ窓が開くと時間が止まる）
    s.load({ ...w, politics: { ...w.politics, term: { ...w.politics.term, pledges: [{ pledgeId: 'it-two', startValue: 0 }, { pledgeId: 'treasury-up', startValue: 0 }] } } });
    if (!s.paused) s.togglePause();
    window.__city.focusOn(48, 48);
  }, world);
  await page.waitForTimeout(1500);
  console.log('都市', await page.evaluate(() => {
    const c = window.__cityStore.getState().world.city;
    return `段階 ${String(c.stage)}・建物 ${String(c.buildings.length)}・施設 ${String(c.facilities.length)}・人口 ${String(c.population)}`;
  }));
  const out = {};
  out['止めた都市'] = await fps(page);
  await shot(`g12-heavy${tag}`);

  await page.evaluate(() => window.__cityStore.getState().setSpeed(3));
  out['3 倍'] = await fps(page);

  await page.keyboard.press('v');
  await page.click('[data-testid="overlay-land"]');
  await page.waitForTimeout(300);
  out['3 倍 ＋ ヒートマップと表示切替の窓'] = await fps(page);
  await shot(`g12-heavy-heat${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  out['3 倍 ＋ ヒートマップ'] = await fps(page);
  console.log('日付', await page.evaluate(() => window.__cityStore.getState().world.city.day));
  for (const [k, v] of Object.entries(out)) console.log(`fps ${k}: ${String(v.fps)}（描いた物 ${String(v.drawn)}）`);
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    if (!s.paused) s.togglePause();
  });
}

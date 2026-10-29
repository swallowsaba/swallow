// 褒賞と始め方を確かめる台本（docs/development-plan.md G11）。
//
//   SHOOT_SCRIPT=tools/scenarios/awards-g11.mjs npm run shoot -- g11-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/awards-g11.mjs npm run shoot -- g11-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 1 期目の公約の窓を閉じる → 新しい市庁舎の節目に届いた都市（市政の引き出しの数の印）
// → 褒賞の一覧（5 つの節目と今の値）→「建てる」で公共の引き出しの褒賞の棚 → 置いて申請（財政 1,000）
// → 褒賞の建物 5 つを完成した物として町の北に置いて近くで（描き方）→ 市庁舎の情報パネル（政治資本の上限 35）
import { at, days, drag, pick } from './town.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const HUD = '[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"]';

/** 画面の中の要素の面積の割合 */
async function share(page, selectors, invert = false) {
  return page.evaluate(([sel, inv]) => {
    const rects = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    const v = covered / ((W / 2) * (H / 2));
    return Math.round((inv ? 1 - v : v) * 1000) / 10;
  }, [selectors, invert]);
}

async function weekEnd(page) {
  const day = await page.evaluate(() => Math.floor(window.__cityStore.getState().world.city.day));
  await days(page, 7 - (day % 7));
}

export default async function awardsG11(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;

  await page.waitForSelector('[data-testid="election-window"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('常時の UI', await share(page, HUD), '%');

  // 新しい市庁舎の節目に届いた都市（人口は週の終わりに世帯から数え直すので、届いた日を直に置く。判定は src/sim/rewards.test.ts）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const day = Math.floor(s.world.city.day);
    s.load({ ...s.world, budget: { ...s.world.budget, treasury: 3000 }, rewards: { ...s.world.rewards, unlocked: { 'city-hall': day } } });
  });
  await weekEnd(page);
  console.log('届いた', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().world.rewards.unlocked)));
  console.log('知らせ', await text(page, '[data-testid="city-notice"]'));
  console.log('市政の数の印', await text(page, '[data-testid="topbar-civic-badge"]'));

  // 褒賞の一覧
  await page.click('[data-testid="topbar-civic"]');
  await page.click('[data-testid="civic-rewards"]');
  await page.waitForSelector('[data-testid="rewards-window"]');
  await page.waitForTimeout(300);
  console.log('褒賞の一覧', await text(page, '[data-testid="reward-rows"]'));
  console.log('褒賞の一覧を開いて都市が見える割合', await share(page, `${HUD}, .small-window, [data-testid="info-panel"]`, true), '%');
  await shot(`g11-rewards${tag}`);

  // 「建てる」で公共の引き出しの褒賞の棚、置く場所の札（財政 1,000）
  await page.click('[data-testid="reward-build"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__city.focusOn(46, 44));
  const spot = await at(page, 44, 44);
  await page.mouse.move(spot.sx, spot.sy, { steps: 3 });
  await page.waitForTimeout(400);
  console.log('褒賞の棚', await text(page, '[data-testid="build-drawer"]'));
  await shot(`g11-award-shelf${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 褒賞の建物 5 つを、完成した物として町の北に置く（描き方を近くで見る）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const f = (id, type, x, y) => ({ id, type, origin: { x, y }, rotation: 0, level: 1, state: 'active', builtDay: 0 });
    const roads = [{ id: 'r-g11', kind: 'street', path: [{ x: 33.5, y: 41.5 }, { x: 60.5, y: 41.5 }] }];
    const awards = [f('a-hall', 'city-hall', 34, 39), f('a-memorial', 'memorial', 37, 39), f('a-stadium', 'stadium', 40, 38), f('a-civic', 'civic-hall', 44, 39), f('a-park', 'central-park', 47, 37)];
    s.load({ ...s.world, city: { ...s.world.city, roads: [...s.world.city.roads, ...roads], facilities: [...s.world.city.facilities, ...awards] } });
  });
  await weekEnd(page);
  await page.evaluate(() => {
    window.__city.focusOn(42, 39);
    window.__city.zoomBy(2);
  });
  await page.waitForTimeout(600);
  await shot(`g11-buildings${tag}`);

  // 競技場の照明は試合の日だけ灯る（docs/city-design.md 9.5）。時間を止め、完成した日を動かして試合の日とほかの日を撮る
  const stadiumDay = (offset) => page.evaluate((o) => {
    const s = window.__cityStore.getState();
    if (!s.paused) s.togglePause();
    const day = Math.floor(s.world.city.day);
    s.load({ ...s.world, city: { ...s.world.city, facilities: s.world.city.facilities.map((x) => (x.id === 'a-stadium' ? { ...x, completeDay: day - o } : x)) } });
  }, offset);
  await page.evaluate(() => {
    window.__city.focusOn(41.5, 39.5);
    window.__city.zoomBy(1);
  });
  await stadiumDay(14);
  await page.waitForTimeout(800);
  await shot(`g11-stadium-match${tag}`);
  await stadiumDay(13);
  await page.waitForTimeout(800);
  await shot(`g11-stadium-off${tag}`);
  await page.evaluate(() => window.__city.zoomBy(-3));

  // ヒートマップ「催し」（競技場から 15 マス以内の住宅。docs/decisions.md U-14）。通りの南に住宅の区画を引き、家が建つまで進める
  await page.evaluate(() => window.__city.focusOn(44, 44));
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [34, 42], [58, 42]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 42);
  console.log('人口', await page.evaluate(() => window.__cityStore.getState().world.city.population));
  await stadiumDay(13);
  await weekEnd(page);
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    if (!s.paused) s.togglePause();
    window.__city.focusOn(44, 44);
  });
  await page.keyboard.press('v');
  await page.click('[data-testid="overlay-event"]');
  await page.waitForTimeout(500);
  console.log('凡例（催し）', await text(page, '[data-testid="overlay-legend"]'));
  console.log('催しの点', await page.evaluate(() => {
    const b = window.__cityStore.getState().world.history.breakdown.at(-1);
    return b ? b.factors[12].reduce((a, v) => a + v, 0).toFixed(3) : null;
  }));
  await shot(`g11-event-heat${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.waitForTimeout(200);

  // 新しい市庁舎の情報パネル（学習の入口ではない。効きを示す）と、上の帯の政治資本の上限
  const hall = await at(page, 35, 40);
  await page.mouse.click(hall.sx, hall.sy);
  await page.waitForTimeout(400);
  console.log('情報パネル（新しい市庁舎）', await text(page, '[data-testid="info-panel"]'));
  console.log('政治資本の上限', await page.evaluate(() => document.querySelector('[data-testid="topbar-capital"]')?.getAttribute('title')));
  await shot(`g11-hall-info${tag}`);
}

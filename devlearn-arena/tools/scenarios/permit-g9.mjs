// 請願・予算・税率・市内新聞を確かめる台本（docs/development-plan.md G9）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g9.mjs npm run shoot -- g9-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g9.mjs npm run shoot -- g9-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 1 期目の公約の窓を閉じる → 学んで資金を得て町を作る → 上の帯の財政 → 家賃が上がる（需給の倍率）→ 請願が届く（知らせ）
// → 受信箱（I）→ 受理 → 予算（F）: 収支と請願の支出・税率のつまみを 15% に動かした見込み → 決める → 2 週進める
// → 市内新聞（N）→ 財政が赤字の上の帯 → 予算の窓の赤字
import { learn, mockRecords } from './learning.mjs';
import { days, drag, pick } from './town.mjs';

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
const HUD = '[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"]';
const WINDOWS = '.small-window, [data-testid="info-panel"]';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

/** 上の帯の項目が切れたり重なったり、2 行に折れたりしていないか */
async function topbarFits(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="topbar"]').getBoundingClientRect();
    const items = [...document.querySelectorAll('.topbar-city, .topbar-stat, .topbar-entry')].map((el) => el.getBoundingClientRect());
    const inside = items.every((r) => r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5 && r.height > 0 && r.bottom <= bar.bottom + 0.5);
    const sorted = [...items].sort((a, b) => a.left - b.left);
    const overlap = sorted.some((r, i) => i > 0 && r.left < sorted[i - 1].right - 0.5);
    const clipped = [...document.querySelectorAll('.topbar-stat-value')].some((el) => el.scrollWidth > el.clientWidth + 1);
    const wrapped = [...document.querySelectorAll('.topbar-city-name, .topbar-entry span, .topbar-stat-value')].some((el) => el.getBoundingClientRect().height > 30);
    return { inside, overlap, clipped, wrapped, right: Math.round(Math.max(...items.map((r) => r.right))), width: Math.round(bar.width) };
  });
}

async function weekEnd(page) {
  const day = await page.evaluate(() => Math.floor(window.__cityStore.getState().world.city.day));
  await days(page, 7 - (day % 7));
}

export default async function permitG9(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;

  // 1 期目の公約の窓は閉じる（G8 で確かめた。後で上の帯から選べる）
  await page.waitForSelector('[data-testid="election-window"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 学んで資金を得て、町を作る
  const recs = mockRecords({ days: 10, perDay: 6 });
  for (let i = 0; i < recs.length; i += 20) {
    await learn(page, recs.slice(i, i + 20));
    if ((await page.evaluate(() => window.__cityStore.getState().city.funds)) >= 4000) break;
  }
  await page.evaluate(() => window.__city.focusOn(46, 46));
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [51, 46], [55, 46]);
  await pick(page, 'zone', 'build-zone-office');
  await drag(page, [51, 48], [55, 48]);
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [38, 48], [50, 48]);
  await drag(page, [38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 70);
  console.log('人口', await page.evaluate(() => window.__cityStore.getState().world.city.population));
  console.log('上の帯', await text(page, '[data-testid="topbar"] .topbar-stats'));
  console.log('上の帯の収まり', JSON.stringify(await topbarFits(page)));
  console.log('常時の UI', await share(page, HUD), '%');

  // 家賃が上がる（空き室が無い時の需給の倍率）→ 請願が届く
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.load({ ...s.world, sim: { ...s.world.sim, rentFactor: 1.6 } });
  });
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__cityStore.getState().world.petitions.inbox.length)) < 2; i += 1) await weekEnd(page);
  console.log('受信箱', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().world.petitions.inbox)));
  await page.waitForSelector('[data-testid="city-notice"]');
  await shot(`g9-notice${tag}`);

  await page.keyboard.press('i');
  await page.waitForSelector('[data-testid="inbox-window"]');
  await page.waitForTimeout(300);
  console.log('受信箱の窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g9-inbox${tag}`);
  // 1 通目を受理（家賃の補助）
  await page.click('[data-testid="inbox-window"] [data-testid="petition-accept"]:not([disabled])');
  await page.waitForTimeout(300);
  await weekEnd(page);

  // 予算: 収支（請願の支出）・財政のグラフ・税率を 15% に動かした見込み
  await page.keyboard.press('i');
  await page.keyboard.press('f');
  await page.waitForSelector('[data-testid="budget-window"]');
  await page.$eval('[data-testid="tax-slider"]', (el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '15');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  console.log('予算', await text(page, '[data-testid="budget-window"]'));
  console.log('予算の窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g9-budget${tag}`);
  await page.click('[data-testid="tax-apply"]');
  await page.evaluate(() => document.querySelector('[data-testid="budget-window"] .small-window-body')?.scrollTo(0, 10000));
  await page.waitForTimeout(200);
  await shot(`g9-budget-capital${tag}`);
  await weekEnd(page);
  await weekEnd(page);

  // 市内新聞
  await page.keyboard.press('f');
  await page.keyboard.press('n');
  await page.waitForSelector('[data-testid="news-window"]');
  await page.waitForTimeout(300);
  console.log('新聞', await text(page, '[data-testid="news-issues"]'));
  console.log('新聞の窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g9-news${tag}`);
  // 3 つの窓を重ねる（小さな窓は 3 つまで。都市が後ろに見える）
  await page.keyboard.press('i');
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  console.log('3 つの窓で都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g9-three${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 財政が赤字の上の帯と予算の窓
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.load({ ...s.world, budget: { ...s.world.budget, treasury: -420, deficitWeeks: 3 } });
  });
  await page.waitForTimeout(300);
  console.log('上の帯（赤字）', await text(page, '[data-testid="topbar-treasury"]'));
  console.log('上の帯の収まり（赤字）', JSON.stringify(await topbarFits(page)));
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  await shot(`g9-deficit${tag}`);
  console.log('fps（予算の窓を開いたまま 3 倍）', await (async () => {
    await page.evaluate(() => window.__cityStore.getState().setSpeed(3));
    return fps(page);
  })());
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

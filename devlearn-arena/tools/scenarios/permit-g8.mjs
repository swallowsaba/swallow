// 選挙・任期・公約・政治資本を確かめる台本（docs/development-plan.md G8）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g8.mjs npm run shoot -- g8-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g8.mjs npm run shoot -- g8-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 1 期目の公約を選ぶ窓 → 2 つ選ぶ → 学んで資金を得て町を作る → 上の帯の政治資本と任期の残り
// → 4 年を実際に進める（1 週の計算は数十ミリ秒なので、208 週は数秒）。8 週前の知らせ → 選挙の見込み（4×3 の表）
// → 税率を 35% に上げる（市長の決定。G9 の予算の窓の代わりに保存データを書き換える）→ 選挙の日に落選 → 敗因（税）と 2 つの道
// → 同じ都市で再び立つ → 任期の一覧と 2 期目の公約 → 税率を 0% に下げて 4 年 → 当選 → 任期の一覧と 3 期目の公約
import { learn, mockRecords } from './learning.mjs';
import { days, drag, pick } from './town.mjs';

const TERM_DAYS = 208 * 7;
const WARN_DAYS = 8 * 7;

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
const WINDOWS = '.small-window, [data-testid="info-panel"], .election';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

/** 上の帯の項目が切れたり重なったりしていないか（右端が帯の中・隣と重ならない） */
async function topbarFits(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="topbar"]').getBoundingClientRect();
    const items = [...document.querySelectorAll('.topbar-city, .topbar-stat, .topbar-entry')].map((el) => el.getBoundingClientRect());
    const inside = items.every((r) => r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5 && r.height > 0);
    const sorted = [...items].sort((a, b) => a.left - b.left);
    const overlap = sorted.some((r, i) => i > 0 && r.left < sorted[i - 1].right - 0.5);
    const clipped = [...document.querySelectorAll('.topbar-stat-value')].some((el) => el.scrollWidth > el.clientWidth + 1);
    return { inside, overlap, clipped, right: Math.round(Math.max(...items.map((r) => r.right))), width: Math.round(bar.width) };
  });
}

/** 選挙の日（または 8 週前の知らせの日）まで、都市の時間を実際に進める */
async function until(page, when) {
  const left = await page.evaluate(([w, term, warn]) => {
    const s = window.__cityStore.getState().world;
    return s.politics.term.startDay + term - 1 - (w === 'warn' ? warn : 0) - Math.floor(s.city.day);
  }, [when, TERM_DAYS, WARN_DAYS]);
  const t0 = Date.now();
  await days(page, left);
  console.log(`${when === 'warn' ? '8 週前' : '選挙の日'}まで ${String(left)} 日を ${String(Date.now() - t0)}ms で進めた`);
}

/** 税率を変える（市長の決定。予算の窓は G9） */
async function taxRate(page, rate) {
  await page.evaluate((r) => {
    const s = window.__cityStore.getState();
    s.load({ ...s.world, budget: { ...s.world.budget, taxRate: r } });
  }, rate);
}

async function choose(page, a, b) {
  await page.waitForSelector('[data-testid="pledge-picker"]');
  await page.click(`[data-pledge="${a}"]`);
  await page.click(`[data-pledge="${b}"]`);
}

export default async function permitG8(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;

  // 1 期目の公約を選ぶ窓（初回の操作説明の後に出る）
  await page.waitForSelector('[data-testid="election-window"]');
  await page.waitForTimeout(400);
  console.log('押せない公約', await page.evaluate(() => [...document.querySelectorAll('[data-pledge]:disabled')].map((b) => b.getAttribute('data-pledge'))));
  await choose(page, 'it-two', 'treasury-up');
  console.log('公約の窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g8-pledges${tag}`);
  await page.click('[data-testid="pledge-confirm"]');
  await page.waitForTimeout(300);
  console.log('知らせ', await text(page, '[data-testid="city-notice"]'));

  // 学んで資金を得て、町を作る（人が住むと選挙の表が埋まる）
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
  await shot(`g8-topbar${tag}`);

  // 8 週前の知らせ → 押すと選挙の見込み
  await until(page, 'warn');
  console.log('8 週前の知らせ', await text(page, '[data-testid="city-notice"]'));
  await page.click('[data-testid="city-notice"]');
  await page.waitForSelector('[data-testid="election-window"][data-mode="preview"]');
  await page.waitForTimeout(400);
  console.log('見込みの窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g8-preview${tag}`);
  await page.keyboard.press('Escape');

  // 税率を 35% に上げて、選挙の日まで。税の満足が下がり、落選する
  await taxRate(page, 35);
  await until(page, 'election');
  await page.waitForSelector('[data-testid="election-window"][data-mode="result"]');
  await page.waitForTimeout(400);
  console.log('結果', await text(page, '[data-testid="election-verdict"]'), await text(page, '[data-testid="election-share"]'));
  console.log('敗因', await text(page, '[data-testid="election-causes"]'));
  await shot(`g8-defeat${tag}`);
  // 敗因の窓の下側（1280×720 では窓の中で送る）
  await page.evaluate(() => document.querySelector('.election-body')?.scrollTo(0, 10000));
  await page.waitForTimeout(200);
  await shot(`g8-defeat-causes${tag}`);
  const progressBefore = await page.evaluate(() => JSON.stringify(window.__game.progress()));

  // 同じ都市で再び立つ → 任期の一覧と 2 期目の公約
  await page.click('[data-testid="election-rerun"]');
  await page.waitForSelector('[data-testid="election-summary"]');
  await page.waitForTimeout(300);
  console.log('一覧', await text(page, '[data-testid="election-summary"]'));
  console.log('学習の記録は同じ', progressBefore === (await page.evaluate(() => JSON.stringify(window.__game.progress()))));
  await shot(`g8-rerun${tag}`);
  await choose(page, 'jobs-grow', 'missions-two');
  await page.click('[data-testid="pledge-confirm"]');

  // 2 期目: 税率を 0% に下げて選挙の日まで。税の満足が上がり、当選する → 任期の一覧と 3 期目の公約
  await taxRate(page, 0);
  await until(page, 'election');
  await page.waitForSelector('[data-testid="election-window"][data-mode="result"]');
  await page.waitForTimeout(400);
  console.log('結果', await text(page, '[data-testid="election-verdict"]'), await text(page, '[data-testid="election-share"]'));
  console.log('政治資本', await page.evaluate(() => window.__cityStore.getState().world.politics.capital));
  await shot(`g8-won${tag}`);
  await page.click('[data-testid="election-term"]');
  await page.waitForSelector('[data-testid="election-summary"]');
  await page.waitForTimeout(300);
  await shot(`g8-term${tag}`);

  // fps: 選挙の窓を開いたまま・閉じて 3 倍の速さ（毎フレーム描き直させて 2 秒）
  console.log('fps（選挙の窓）', await fps(page));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__cityStore.getState().setSpeed(3));
  console.log('fps（窓を閉じて 3 倍）', await fps(page));
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

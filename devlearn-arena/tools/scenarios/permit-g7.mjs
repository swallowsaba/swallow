// 学習との接続を確かめる台本（docs/development-plan.md G7）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g7.mjs npm run shoot -- g7-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g7.mjs npm run shoot -- g7-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// G6 の台本と同じ町を作る。資金はデータベースとクラウド以外の分野を学んで得る（データベースはスキル 0）。
// 住宅のそばにデータセンター → 公聴会の窓で「雇用が少ない」を選ぶ（説明は無く、伏せた候補と技術の代案と「この論点を学ぶ」）
// → おすすめの欄の審議中の論点 → 「この論点を学ぶ」→ 入口の札 → 7 段（データベースとは）→ 都市へ戻る
// → 同じ公聴会の窓と、段階が上がった知らせ → 新しい説明の候補 → 出した後の 1 行
import { readFileSync } from 'node:fs';
import { runLesson } from './domain.mjs';
import { learn, mockRecords } from './learning.mjs';
import { at, closePledges, days, drag, facility, pick } from './town.mjs';

const LESSONS = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;

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
const WINDOWS = '.small-window, [data-testid="info-panel"], [data-testid="hearing-window"]';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const stageOf = (page) => page.evaluate(() => window.__cityStore.getState().world.applications.at(-1)?.stage ?? null);
const cityDay = (page) => page.evaluate(() => Math.floor(window.__cityStore.getState().world.city.day));
const completed = (page) => page.evaluate(() => {
  const p = window.__game.progress();
  return Object.values(p.lessons).filter((l) => l.completions > 0).length;
});

async function escape(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

async function hearingFps(page) {
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

export default async function permitG7(page, shot) {
  // 1 期目の公約を選ぶ窓（G8）は選ばずに閉じる（窓が都市を覆っていると、建設メニューの操作が届かない)
  await closePledges(page);
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  const others = LESSONS.filter((l) => l.domain !== 'db' && l.domain !== 'cloud').map((l) => l.id);
  const recs = mockRecords({ days: 30, perDay: 8, order: others });
  for (let i = 0; i < recs.length; i += 20) {
    await learn(page, recs.slice(i, i + 20));
    if ((await page.evaluate(() => window.__cityStore.getState().city.funds)) >= 9000) break;
  }
  console.log('資金', await page.evaluate(() => window.__cityStore.getState().city.funds));

  await page.evaluate(() => window.__city.focusOn(46, 46));
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [51, 46], [55, 46]);
  await pick(page, 'zone', 'build-zone-office');
  await drag(page, [51, 48], [55, 48]);
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [38, 48], [50, 48]);
  await drag(page, [38, 46], [44, 46]);
  await pick(page, 'road', 'build-road-lane');
  await drag(page, [48, 46], [48, 36]);
  await escape(page);
  await days(page, 56);

  // 住宅のそばのデータセンター → 公聴会の段
  await facility(page, 'datacenter', [46, 45], 0);
  await escape(page);
  for (let i = 0; i < 30 && (await stageOf(page)) !== 'hearing'; i += 1) await days(page, 1);
  console.log('申請', await stageOf(page));
  const c = await at(page, 46, 45);
  await page.evaluate(([sx, sy]) => window.__city.panBy(window.innerWidth / 2 - sx, window.innerHeight / 2 - sy), [c.sx, c.sy]);

  // おすすめの欄に、審議中の論点のレッスン
  await page.waitForTimeout(400);
  console.log('おすすめの欄', await page.evaluate(() => [...document.querySelectorAll('.recommend-item')].map((b) => `${b.querySelector('.recommend-mark')?.textContent}|${b.textContent}`)));
  await shot(`g7-recommend${tag}`);

  // 公聴会の窓: 雇用が少ない（スキル 0）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.openHearing(s.world.applications.at(-1).id);
  });
  await page.waitForSelector('[data-testid="hearing-window"]');
  await page.click('[data-testid="hearing-window"] .hearing-issue[data-reason="dc-jobs"]');
  await page.waitForTimeout(300);
  console.log('伏せた候補', await text(page, '[data-testid="hearing-hidden"]'));
  console.log('この論点を学ぶ', await text(page, '[data-testid="hearing-learn"]'));
  console.log('窓を開いた時に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%', '常時の UI', await share(page, HUD), '%');
  console.log('fps（公聴会の窓）', await hearingFps(page));
  await shot(`g7-hearing${tag}`);
  const day0 = await cityDay(page);

  // この論点を学ぶ → 入口の札
  await page.click('[data-testid="hearing-learn"] [data-lesson="db.b.01"]');
  await page.waitForSelector('[data-testid="entry-card"]');
  await page.waitForTimeout(500);
  console.log('入口の札', (await text(page, '[data-testid="entry-card"]'))?.slice(0, 120));
  await shot(`g7-card${tag}`);
  await page.click('[data-testid="entry-start"]');
  await page.waitForSelector('[data-testid="lesson-screen"]');
  const out = await runLesson(page, 'db.b.01', { shot: async (name) => { if (name.endsWith('-explain') || name.endsWith('-done')) await shot(name); }, tag: `g7-lesson${tag}` });
  console.log('レッスン', out.result, out.xp, '修了した数', await completed(page));
  await shot(`g7-done${tag}`);

  // 都市へ戻る → 同じ公聴会の窓
  await page.click('[data-testid="lesson-to-city"]');
  await page.waitForSelector('[data-testid="hearing-window"]');
  await page.waitForTimeout(800);
  console.log('戻った日付', day0, '→', await cityDay(page));
  console.log('知らせ', await text(page, '.city-notice'));
  await shot(`g7-back${tag}`);
  await page.click('[data-testid="hearing-window"] .hearing-issue[data-reason="dc-jobs"]');
  await page.waitForTimeout(300);
  console.log('新しい説明', await page.evaluate(() => [...document.querySelectorAll('[data-testid="hearing-window"] [data-explanation]')].map((e) => e.getAttribute('data-explanation'))));
  console.log('伏せた候補（後）', await text(page, '[data-testid="hearing-hidden"]'));
  await shot(`g7-new${tag}`);
  const e = page.locator('[data-testid="hearing-window"] [data-explanation="dc-jobs-around"]');
  if (await e.count()) {
    await e.click();
    await page.waitForTimeout(400);
    console.log('出した後', await text(page, '[data-testid="hearing-reaction"]'));
    await shot(`g7-explained${tag}`);
  }
  // 誤った説明の後の学べるレッスン（電力の逼迫の、予備の電源の説明は一部）
  await page.click('[data-testid="hearing-window"] .hearing-issue[data-reason="dc-power"]');
  await page.waitForTimeout(200);
  const p = page.locator('[data-testid="hearing-window"] [data-explanation="dc-power-backup"]');
  if (await p.count()) {
    await p.click();
    await page.waitForTimeout(400);
    console.log('一部の説明の後', await text(page, '[data-testid="hearing-reaction"]'));
    await shot(`g7-partial${tag}`);
  }
}

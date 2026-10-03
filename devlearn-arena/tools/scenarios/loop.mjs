// 学習から都市へ戻る 1 周を撮る台本（docs/development-plan.md Phase 8: 学習前と後の都市の撮影を並べる）。
//
//   SHOOT_SCRIPT=tools/scenarios/loop.mjs npm run shoot -- p8-end
//
// 小さな村（道路・住宅・市立 IT 学院・サーバ施設）を画面の操作で作る → 学習前の都市を撮る →
// 市立 IT 学院を選んで found.b.04 へ（前半は記録を進め、実戦からは画面の操作）→ 都市へ戻る →
// 変化の場所へカメラが寄り、光の輪と知らせが出た所を撮る → 情報パネルから施設を上げた所を撮る。
import { days, drag, facility, pick } from './town.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const next = (page) => page.click('[data-testid="lesson-next"]');
const wait = (page, ms = 300) => page.waitForTimeout(ms);

export default async function loop(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));

  // 小さな村（初めの資金 1,500 の範囲で）
  await pick(page, 'zone', 'build-zone-residential');
  // 1 本学んだ資金で市立 IT 学院（600）を上げられるよう、区画は道路の北側 1 列だけにする
  await drag(page, [47, 46], [57, 46]);
  await facility(page, 'academy', [41, 45]);
  await facility(page, 'server', [44, 45]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 4);
  console.log('村', await page.evaluate(() => { const c = window.__cityStore.getState().city; return JSON.stringify({ funds: c.funds, facilities: c.facilities.map((f) => `${f.type}:Lv${f.level}`), buildings: c.buildings.length }); }));
  await page.evaluate(() => window.__city.focusOn(48, 47));
  await wait(page, 400);
  await shot(`p8-before${tag}`);

  // 市立 IT 学院を選び、情報パネルからレッスンへ（found.b.04 は「ここで学ぶ」の 3 つに入っていないので直リンク）
  await page.keyboard.press('Tab');
  await wait(page);
  console.log('選んだ', await text(page, '[data-testid="info-panel"] .info-name'));
  await page.evaluate(() => {
    const store = window.__game.store;
    const at = new Date().toISOString().slice(0, 19) + 'Z';
    store.getState().start('found.b.04', at);
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach('found.b.04', st);
    window.location.hash = '#/lesson/found.b.04';
  });
  await page.waitForSelector('.term-host .xterm');
  await wait(page, 500);
  await page.click('.term-host');
  await page.keyboard.type('cd /srv/ap', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('cd /srv/app', { delay: 10 });
  await page.keyboard.press('Enter');
  await wait(page);
  await next(page);
  await page.waitForSelector('[data-testid="stage-result"]');
  await next(page);
  await page.waitForSelector('[data-testid="stage-summary"]');
  await next(page);
  await page.waitForSelector('[data-testid="stage-done"]');
  console.log('XP / スキル', await text(page, '[data-testid="stage-done"]'));

  await page.click('[data-testid="lesson-to-city"]');
  await wait(page, 900);
  console.log('戻った', await page.evaluate(() => window.location.hash), await text(page, '.city-notice'), await page.evaluate(() => JSON.stringify(window.__cityStore.getState().selected)));
  await shot(`p8-after${tag}`);
  await wait(page, 3100);
  console.log('次の知らせ', await text(page, '.city-notice'));
  await shot(`p8-after-notice${tag}`);
  await wait(page, 3100);
  console.log('次の知らせ', await text(page, '.city-notice'));
  console.log('おすすめ', await text(page, '[data-testid="recommend"]'));
  console.log('アップグレード', await text(page, '[data-testid="info-panel"] [aria-label="アップグレード"]'));
  await shot(`p8-panel${tag}`);

  // 学習で得た資金で、選ばれた施設を上げる（資金が足りなければ、何が足りないかが出ている）
  if (await page.locator('[data-testid="info-upgrade"]').count()) {
    await page.click('[data-testid="info-upgrade"]');
    await wait(page, 600);
    console.log('上げた', await text(page, '.city-notice'), await page.evaluate(() => JSON.stringify(window.__cityStore.getState().city.facilities.map((f) => `${f.type}:Lv${f.level}`))));
    await shot(`p8-upgraded${tag}`);
  }
}

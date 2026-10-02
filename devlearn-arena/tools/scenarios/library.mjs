// 学習の入口を確かめる台本（docs/development-plan.md Phase 5）。
//
//   SHOOT_SCRIPT=tools/scenarios/library.mjs npm run shoot -- p5-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/library.mjs npm run shoot -- p5-end-1280
//
// L で学習ライブラリ → 検索 → 入口の札（推奨前提の案内）→ 先に前提を見る → このまま始める（レッスン画面）→ 戻る → G で知識グラフ →
// 学んだ後の知識グラフ → 施設の情報パネルから学ぶ・学習ライブラリで全部見る → 用語集 → 直リンク。
import { learn, mockRecords } from './learning.mjs';
import { buildTown } from './town.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
/** 都市の上の窓が画面のどれだけを占めるか（%） */
const share = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return r ? Math.round((r.width * r.height * 1000) / (window.innerWidth * window.innerHeight)) / 10 : null;
}, sel);

export default async function library(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;

  // L で学習ライブラリ
  await page.keyboard.press('l');
  await page.waitForSelector('[data-testid="learn-screen"]');
  await page.waitForTimeout(300);
  console.log('ハッシュ', await page.evaluate(() => window.location.hash), '本数', await text(page, '[data-testid="lib-count"]'), '窓', await share(page, '.window'), '%');
  await shot(`p5-library${tag}`);

  // 全てのレッスンの「始める」が押せる（禁止のボタンが無い）
  console.log('一覧の行', await page.locator('.lib-row').count());

  // 検索して、推奨前提を学んでいない中級のレッスンを選ぶ
  await page.fill('[data-testid="lib-search"]', 'systemd');
  await page.waitForTimeout(200);
  console.log('検索 systemd', await text(page, '[data-testid="lib-count"]'));
  await page.click('[data-lesson="linux.i.01"]');
  await page.waitForTimeout(300);
  console.log('札', await text(page, '[data-testid="entry-card"]'));
  await shot(`p5-entry${tag}`);

  // 先に前提を見る → 札が前提のレッスンに移る。戻って、このまま始める
  await page.click('[data-testid="entry-first"]');
  await page.waitForTimeout(200);
  console.log('先に見る', await text(page, '.entry-title'), await page.evaluate(() => window.location.hash));
  await page.click('.entry-links >> text=サービスと systemd');
  await page.waitForTimeout(200);
  await page.click('[data-testid="entry-start"]');
  await page.waitForSelector('[data-testid="lesson-screen"]');
  console.log('始めた後', await page.evaluate(() => window.location.hash));
  // ブラウザの「戻る」で学習ライブラリへ（札は学習中）
  await page.goBack();
  await page.waitForSelector('[data-testid="entry-status"]');
  await page.waitForTimeout(300);
  console.log('戻った後', await text(page, '[data-testid="entry-status"]'), await page.evaluate(() => window.location.hash));
  await shot(`p5-started${tag}`);

  // G で知識グラフ（検索欄から焦点を外してから）
  await page.locator('[data-testid="entry-start"]').focus();
  await page.keyboard.press('g');
  await page.waitForSelector('[data-testid="knowledge-graph"]');
  await page.waitForTimeout(300);
  await shot(`p5-graph${tag}`);

  // 2 週間ぶん学んだ後の知識グラフ（修了した所が光る）。レッスンの点を指すと前提の矢印
  await learn(page, mockRecords({ days: 14, perDay: 3 }));
  await page.waitForTimeout(300);
  const dot = page.locator('[data-lesson="linux.b.04"]');
  await dot.hover();
  await page.waitForTimeout(200);
  await shot(`p5-graph-progress${tag}`);
  await dot.click();
  await page.waitForTimeout(200);
  console.log('グラフで押した札', await text(page, '.entry-title'));
  await page.click('[data-domain="k8s"]');
  await page.waitForTimeout(200);
  await shot(`p5-graph-domain${tag}`);

  // Esc で都市へ。町を作り、施設を選んで、情報パネルから学ぶ
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('Esc の後', await page.evaluate(() => window.location.hash));
  await buildTown(page);
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const f = s.city.facilities.find((x) => x.type === 'server');
    if (f) s.select({ kind: 'facility', id: f.id });
  });
  await page.waitForTimeout(400);
  console.log('ここで学ぶ', await text(page, '[data-testid="info-lessons"]'));
  await shot(`p5-panel${tag}`);
  await page.click('[data-testid="info-library"]');
  await page.waitForSelector('[data-testid="learn-screen"]');
  await page.waitForTimeout(300);
  console.log('全部見る', await page.evaluate(() => window.location.hash), await text(page, '[data-testid="lib-count"]'));
  await shot(`p5-library-domain${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('[data-testid="info-lessons"] li:first-child button');
  await page.waitForSelector('[data-testid="lesson-screen"]');
  console.log('パネルから始めた', await page.evaluate(() => window.location.hash), await text(page, '.lesson-where'));
  await page.keyboard.press('Escape');

  // 用語集
  await page.click('.topbar-entry >> text=用語');
  await page.waitForSelector('[data-testid="glossary-screen"]');
  await page.click('.glossary-item[data-term="path"]');
  await page.waitForTimeout(200);
  console.log('用語', await text(page, '[data-testid="glossary-term"]'));
  await shot(`p5-glossary${tag}`);
  await page.click('[data-testid="glossary-term"] .entry-link');
  await page.waitForSelector('[data-testid="entry-card"]');
  console.log('用語からレッスン', await page.evaluate(() => window.location.hash), await text(page, '.entry-title'));

  // 直リンク
  await page.evaluate(() => {
    window.location.hash = '#/graph/found.b.04';
  });
  await page.waitForTimeout(400);
  console.log('直リンク #/graph/found.b.04', await text(page, '.entry-title'), !!(await page.$('[data-testid="knowledge-graph"]')));
  await page.keyboard.press('Escape');
}

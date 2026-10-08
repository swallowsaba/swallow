// 保存・データ管理（docs/development-plan.md Phase 11）。設定の保存の欄を撮り、次を確かめる。違えば誤りにする。
//
//   SHOOT_SCRIPT=tools/scenarios/saves.mjs SHOOT_SIZE=1280x720 npm run shoot -- saves
//
// 1. 書き出す → 最初からやり直す（新しい都市になる）→ 書き出したファイルを読み込む（元に戻る）
// 2. 別のブラウザ（保存の無い新しい状態）で、書き出したファイルを読み込む（同じになる）
// 3. ブラウザの再起動（同じ利用者の保存場所で、ブラウザを閉じて開き直す。元に戻る）
// 4. 壊れたファイルを選ぶ（読み込まず、何が起きたか・どうすればよいかが出る。記録は残る）
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { mockRecords } from './learning.mjs';

/** 比べる状態: 学習の記録と、時間で変わらない都市の所 */
const stateOf = (page) =>
  page.evaluate(() => {
    const c = window.__cityStore.getState().city;
    // 鍵の並びは比べない（保存データを確かめる時に並びが変わる）
    const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
    return JSON.stringify(sorted({ progress: window.__game.progress(), city: { name: c.name, seed: c.seed, funds: c.funds, roads: c.roads, zones: c.zones, facilities: c.facilities } }));
  });
const summary = (s) => {
  const { progress, city } = JSON.parse(s);
  return { xp: progress.xp, lessons: Object.keys(progress.lessons).length, funds: city.funds, roads: city.roads.length };
};
const ready = async (page) => {
  await page.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
};
const openSettings = async (page) => {
  await page.getByTestId('topbar').getByRole('button', { name: '設定' }).click();
  await page.getByTestId('settings-screen').waitFor();
  // 窓が開く動き（0.2 秒）を待つ
  await sleep(400);
};
const same = (label, a, b) => {
  console.log(`${label}: ${JSON.stringify(summary(a))} → ${JSON.stringify(summary(b))}`);
  if (a !== b) throw new Error(`${label}: 元に戻らなかった`);
};

export default async function saves(page, shot) {
  const work = mkdtempSync(join(tmpdir(), 'devlearn-saves-'));
  try {
    await page.evaluate((records) => window.__game.learn(records), mockRecords({ days: 6, perDay: 3 }));
    await sleep(2600);
    const played = await stateOf(page);

    // 1. 書き出す
    await openSettings(page);
    await shot('saves-settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す', exact: true }).click()]);
    const file = join(work, download.suggestedFilename());
    await download.saveAs(file);
    console.log(`書き出したファイル: ${download.suggestedFilename()}`);
    if (!/^devlearn-save-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())) throw new Error('ファイルの名前が違う');

    // 最初からやり直す
    await page.getByRole('button', { name: '最初からやり直す' }).click();
    await shot('saves-reset-confirm');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'やり直す', exact: true }).click()]);
    await ready(page);
    await sleep(300);
    await shot('saves-after-reset');
    const reset = summary(await stateOf(page));
    console.log(`やり直した後: ${JSON.stringify(reset)}`);
    if (reset.lessons !== 0 || reset.xp !== 0) throw new Error('やり直しても記録が残っている');

    // 書き出したファイルを読み込む
    await openSettings(page);
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByTestId('import-preview').waitFor();
    await shot('saves-import-preview');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '置き換える' }).click()]);
    await ready(page);
    await sleep(300);
    await shot('saves-after-import');
    same('読み込み', played, await stateOf(page));

    // 4. 壊れたファイル
    const broken = join(work, 'broken.json');
    writeFileSync(broken, readFileSync(file, 'utf8').slice(0, 400));
    await openSettings(page);
    await page.locator('input[type="file"]').setInputFiles(broken);
    await page.getByTestId('import-error').waitFor();
    await shot('saves-import-error');
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'networkidle' });
    await ready(page);
    same('壊れたファイルの後', played, await stateOf(page));

    // 2. 別のブラウザで読み込む
    const browser = page.context().browser();
    const other = await browser.newContext({ viewport: page.viewportSize() });
    const page2 = await other.newPage();
    await page2.goto(page.url(), { waitUntil: 'networkidle' });
    await ready(page2);
    await openSettings(page2);
    await page2.locator('input[type="file"]').setInputFiles(file);
    await page2.getByTestId('import-preview').waitFor();
    await Promise.all([page2.waitForEvent('load'), page2.getByRole('button', { name: '置き換える' }).click()]);
    await ready(page2);
    same('別のブラウザ', played, await stateOf(page2));
    await other.close();

    // 3. ブラウザの再起動（同じ利用者の保存場所で開き直す）
    const profile = join(work, 'profile');
    const url = page.url().replace(/#.*$/, '#/city');
    let ctx = await chromium.launchPersistentContext(profile, { viewport: page.viewportSize() });
    let p3 = await ctx.newPage();
    await p3.goto(url, { waitUntil: 'networkidle' });
    await ready(p3);
    await p3.evaluate((records) => window.__game.learn(records), mockRecords({ days: 3, perDay: 2 }));
    await sleep(2600);
    const beforeRestart = await stateOf(p3);
    await ctx.close();
    ctx = await chromium.launchPersistentContext(profile, { viewport: page.viewportSize() });
    p3 = await ctx.newPage();
    await p3.goto(url, { waitUntil: 'networkidle' });
    await ready(p3);
    same('ブラウザの再起動', beforeRestart, await stateOf(p3));
    await ctx.close();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// 設定の項目（docs/development-plan.md Phase 12: 文字の大きさ・ふりがな・動きを減らす・表示品質・音・コマンドの候補）。
//
//   SHOOT_SCRIPT=tools/scenarios/prefs.mjs SHOOT_SIZE=1280x720 npm run shoot -- prefs
//
// 設定を開いて撮り、文字を特大・ふりがなを付ける・表示品質を低にして、都市・学習ライブラリ・レッスン画面を撮る。
// 最後に設定を元に戻す（同じ保存場所で次に撮る物に残さない）。
import { setTimeout as sleep } from 'node:timers/promises';

const openSettings = async (page) => {
  await page.getByTestId('topbar').getByRole('button', { name: '設定' }).click();
  await page.getByTestId('settings-screen').waitFor();
  await sleep(400);
};
const choose = (page, key, label) => page.locator(`[data-setting="${key}"]`).getByRole('button', { name: label, exact: true }).click();
const go = async (page, hash) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await sleep(1200);
};

export default async function prefs(page, shot) {
  await openSettings(page);
  await shot('prefs-settings');
  await choose(page, 'fontScale', '特大');
  await choose(page, 'furigana', '付ける');
  await choose(page, 'quality', '低');
  await sleep(300);
  await shot('prefs-settings-large');
  const root = await page.evaluate(() => ({ fs14: getComputedStyle(document.documentElement).getPropertyValue('--fs-14'), quality: document.documentElement.dataset.quality }));
  console.log(`文字 14 → ${root.fs14}・表示品質 ${root.quality}`);
  if (root.fs14.trim() !== '18px') throw new Error('文字の大きさが変わっていない');
  await page.keyboard.press('Escape');
  await sleep(600);
  await shot('prefs-city-large');
  await go(page, '#/learn');
  await shot('prefs-library-large');
  await go(page, '#/lesson/ctr.b.02');
  await shot('prefs-lesson-large');
  const ruby = await page.locator('.rich-term ruby').count();
  console.log(`ふりがなの付いた用語: ${String(ruby)}`);
  await go(page, '#/city');
  await openSettings(page);
  await choose(page, 'fontScale', '標準');
  await choose(page, 'furigana', '付けない');
  await choose(page, 'quality', '標準');
  await sleep(2600);
}

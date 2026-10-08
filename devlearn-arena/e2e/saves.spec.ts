import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * セーブの E2E（docs/testing-strategy.md 8 章・docs/development-plan.md Phase 11）。
 *
 * - 自動保存の後にリロードして同じ状態
 * - 書き出したファイルを別のブラウザの状態で読み込んで同じ状態
 * - 壊れたファイルで既存のデータが消えない
 *
 * 学習の記録は、撮影の道具と同じ window.__game.learn で与える（レッスンを 1 本ずつ画面で通すのは loop.spec.ts）。
 */

type GameWindow = Window & {
  __game: { learn: (records: unknown[]) => unknown; progress: () => unknown };
  __cityStore: { getState: () => { city: { name: string; seed: number; funds: number; roads: unknown[]; zones: unknown[]; facilities: unknown[] } } };
};

const RECORDS = ['linux.b.01', 'net.b.01', 'git.b.01'].map((lessonId, i) => ({
  kind: 'lesson', lessonId, at: `2026-10-0${String(i + 1)}T19:00:00+09:00`,
  quiz: [{ quizId: 'q1', correct: true }, { quizId: 'q2', correct: i !== 1 }],
  practice: [{ success: true, hintsUsed: i }],
  complete: true,
}));

/** 比べる状態: 学習の記録と、時間で変わらない都市の所（鍵の並びは比べない） */
const stateOf = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as GameWindow;
    const c = w.__cityStore.getState().city;
    const sorted = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
    return JSON.stringify(sorted({ progress: w.__game.progress(), city: { name: c.name, seed: c.seed, funds: c.funds, roads: c.roads, zones: c.zones, facilities: c.facilities } }));
  });

async function open(page: Page): Promise<void> {
  await page.goto('#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  // 初回の操作説明は飛ばす（飛ばしたことも保存の対象）
  const intro = page.getByTestId('intro');
  if (await intro.count()) await page.keyboard.press('Escape');
}

async function played(page: Page): Promise<string> {
  await open(page);
  await page.evaluate((records) => (window as unknown as GameWindow).__game.learn(records), RECORDS);
  // 操作の 2 秒後に保存される
  await page.waitForTimeout(2600);
  return stateOf(page);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('topbar').getByRole('button', { name: '設定' }).click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

test('自動保存の後にリロードすると、同じ状態に戻る', async ({ page }) => {
  const before = await played(page);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  expect(await stateOf(page)).toBe(before);
  expect(JSON.parse(before)).toMatchObject({ progress: { lessons: { 'linux.b.01': { status: 'completed' } } } });
});

test('書き出したファイルを別のブラウザで読み込むと同じ状態になり、壊れたファイルでは今の記録が消えない', async ({ page, browser }) => {
  const before = await played(page);
  await openSettings(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^devlearn-save-\d{4}-\d{2}-\d{2}\.json$/);
  const dir = mkdtempSync(join(tmpdir(), 'devlearn-e2e-'));
  const file = join(dir, download.suggestedFilename());
  await download.saveAs(file);

  // 別のブラウザ（保存の無い状態）
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await open(page2);
  await openSettings(page2);
  await page2.locator('input[type="file"]').setInputFiles(file);
  await expect(page2.getByTestId('import-preview')).toContainText('修了');
  await Promise.all([page2.waitForEvent('load'), page2.getByRole('button', { name: '置き換える' }).click()]);
  await page2.waitForFunction(() => document.body.dataset.cityReady === '1');
  expect(await stateOf(page2)).toBe(before);
  await expect(page2.getByText('保存データを読み込んだ')).toBeVisible();

  // 壊れたファイル: 読み込まず、何が起きたかが出る。開き直しても今の記録が残っている
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, readFileSync(file, 'utf8').slice(0, 300));
  await openSettings(page2);
  await page2.locator('input[type="file"]').setInputFiles(broken);
  await expect(page2.getByTestId('import-error')).toContainText('JSON');
  await page2.reload();
  await page2.waitForFunction(() => document.body.dataset.cityReady === '1');
  expect(await stateOf(page2)).toBe(before);
  await other.close();
});

test('最初からやり直すと、確かめた後に新しい都市で始まる', async ({ page }) => {
  await played(page);
  await openSettings(page);
  await page.getByRole('button', { name: '最初からやり直す' }).click();
  await expect(page.getByTestId('reset-confirm')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'やり直す', exact: true }).click()]);
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  const after = JSON.parse(await stateOf(page)) as { progress: { xp: number; lessons: object } };
  expect(after.progress.xp).toBe(0);
  expect(after.progress.lessons).toEqual({});
  await expect(page).toHaveURL(/#\/city$/);
});

import { expect, test, type Page } from '@playwright/test';

/**
 * 学習フローの残り（docs/testing-strategy.md 7・9 章、docs/acceptance-criteria.md G4・L1）。
 * - 前提を学ばずに、中級・上級のレッスンの入口の札を開き、始められる（ロックが無い）
 * - 7 段の途中で中断し、リロードしてから開き直すと、進んだ段から再開する
 * - 直リンク（#/learn/<ID>・#/lesson/<ID>）とリロードで、同じ画面が出る（サブディレクトリ配信）
 */

/** 開いて、読み込み中の演出が消える（画面が見える）まで待つ。レッスンの画面が覆っている間は都市を描かないので、都市の用意は待たない */
async function openApp(page: Page, hash: string): Promise<void> {
  await page.goto(`./${hash}`);
  await expect(page.locator('#boot')).toHaveCount(0);
}

test('前提を学ばずに、中級・上級のレッスンを入口の札から始められる', async ({ page }) => {
  // 中級（推奨前提がある）: 先に見るとよい物を示すが、そのまま始められる
  await openApp(page, '#/learn/k8s.i.08');
  const card = page.getByTestId('entry-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('entry-advice')).toContainText('このまま始めてもよい');
  await expect(page.getByTestId('entry-start')).toBeEnabled();
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('stage-explain')).toBeVisible();

  // 上級（初回公開の範囲の外で、中身は準備中）: 札は開け、始めると準備中の案内とほかのレッスンへの道が出る
  await page.evaluate(() => { window.location.hash = '#/learn/linux.a.01'; });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('entry-start')).toBeEnabled();
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('lesson-preparing')).toBeVisible();
  await expect(page.locator('.lesson-link').first()).toBeVisible();
  // ロックを示す物はどこにも無い
  await expect(page.getByText(/ロック|解放|学べません/)).toHaveCount(0);
});

test('7 段の途中で中断し、リロードしてから開き直すと、進んだ段から再開する', async ({ page }) => {
  await openApp(page, '#/lesson/found.b.04');
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  for (let i = 0; i < 5; i += 1) await page.getByTestId('lesson-next').click();
  await expect(page.getByTestId('stage-understand')).toBeVisible();
  // 中断して都市へ（Esc）
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  // 段が進んだ時はすぐ保存する。リロードして、同じレッスンを開き直す
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = '#/lesson/found.b.04'; });
  await expect(page.getByTestId('stage-understand')).toBeVisible();
  // 進んだ所までの段には戻れる
  await expect(page.locator('.lesson-stage button[data-stage="explain"]')).toBeEnabled();
  await expect(page.locator('.lesson-stage button[data-stage="result"]')).toBeDisabled();
});

test('直リンクとリロードで、同じ画面が出る（サブディレクトリ配信）', async ({ page }) => {
  await openApp(page, '#/learn/linux.i.01');
  expect(new URL(page.url()).pathname).toMatch(/\/devlearn-arena\/$/);
  await expect(page.getByTestId('entry-card')).toContainText('サービスと systemd');
  await page.reload();
  await expect(page.getByTestId('entry-card')).toContainText('サービスと systemd');

  await page.evaluate(() => { window.location.hash = '#/lesson/linux.i.01'; });
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  await page.reload();
  // 読み込み中の演出が残って、レッスンを隠さない
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByTestId('lesson-title')).toHaveText('サービスと systemd');
  await expect(page.getByTestId('stage-explain')).toBeVisible();

  // ほかの画面も、直リンクで開いてリロードすると同じ画面
  for (const [hash, id] of [['#/glossary/path', 'glossary-term'], ['#/growth', 'growth-rank'], ['#/missions', 'mission-title'], ['#/settings', 'autosave-state']] as const) {
    await page.goto(`./${hash}`);
    await page.reload();
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

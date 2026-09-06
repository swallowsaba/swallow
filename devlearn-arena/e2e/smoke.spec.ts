import { expect, test } from '@playwright/test';

test('園内が1枚で開き、コマンドで景色が変わる', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await page.goto('./');
  await expect(page.getByText('DEVLEARN', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'ファイルシステムの園内図' })).toBeVisible();

  const world = page.getByRole('img', { name: 'ファイルシステムの園内図' });
  await expect(world).not.toContainText('reports');

  await page.getByLabel('コマンドを入力').fill('mkdir reports');
  await page.getByLabel('コマンドを入力').press('Enter');
  await expect(world).toContainText('reports');

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('実行の記録に「何が起きたか」が残る', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('コマンドを入力').fill('mkdir reports');
  await page.getByLabel('コマンドを入力').press('Enter');
  await expect(page.getByText('ディレクトリ ~/reports を作りました')).toBeVisible();
});

test('全体図と設定へ行ける', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: '全体図' }).click();
  await expect(page.getByRole('heading', { name: '冒険の地図', level: 1 })).toBeVisible();

  await page.goto('./settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  expect((await download).suggestedFilename()).toBe('devlearn-arena-progress.json');
});

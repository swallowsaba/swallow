import { expect, test } from '@playwright/test';

async function type(page: import('@playwright/test').Page, line: string): Promise<void> {
  await page.locator('.xterm-screen').click();
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test('1枚の画面が開き、コマンドで景色が変わる', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await page.goto('./');
  await expect(page.getByText('DEVLEARN', { exact: true })).toBeVisible();

  const world = page.getByRole('img', { name: 'ファイルシステムの園内図' });
  await expect(world).toBeVisible();
  await expect(world).not.toContainText('reports');

  await type(page, 'mkdir reports');
  await expect(world).toContainText('reports');

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('条件を満たすと手順が進む', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('未達成', { exact: false })).toBeVisible();
  await type(page, 'mkdir reports');
  await expect(page.getByText('やること 2')).toBeVisible();
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

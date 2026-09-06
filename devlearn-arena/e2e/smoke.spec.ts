import { expect, test } from '@playwright/test';

test('トップから任務に入れる', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'シェルに慣れる', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: '任務に出る' }).click();
  await expect(page.getByLabel('コマンドを入力')).toBeVisible();

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('地図から世界とクエストを辿れる', async ({ page }) => {
  await page.goto('./map');
  await expect(page.getByRole('heading', { name: '冒険の地図', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ディスク逼迫' })).toBeVisible();

  await page.getByRole('link', { name: 'クラスタの解剖' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kubernetes');

  await page.getByRole('link', { name: /コンテナだけでは足りない理由/ }).click();
  await expect(page.getByRole('region', { name: 'ライブ図解' })).toBeVisible();

  const deep = page.url();
  await page.goto(deep);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('進捗の書き出しができる', async ({ page }) => {
  await page.goto('./settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  expect((await download).suggestedFilename()).toBe('devlearn-arena-progress.json');
});

test('コマンドで手順が進み、失敗すると HP が減る', async ({ page }) => {
  await page.goto('./quest/shell-warmup');
  const tree = page.getByRole('region', { name: 'ファイルツリー' });
  await expect(tree).not.toContainText('reports');

  await page.getByLabel('コマンドを入力').fill('mkdir reports');
  await page.getByLabel('コマンドを入力').press('Enter');
  await expect(tree).toContainText('reports');

  // 失敗するコマンドで HP が 5 から 4 に減る
  await expect(page.getByRole('img', { name: '残り HP 5' })).toBeVisible();
  await page.getByLabel('コマンドを入力').fill('cat /nope');
  await page.getByLabel('コマンドを入力').press('Enter');
  await expect(page.getByRole('img', { name: '残り HP 4' })).toBeVisible();
});

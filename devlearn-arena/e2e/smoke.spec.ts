import { expect, test } from '@playwright/test';

test('トップに次の一手が出て、訓練場へ入れる', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'シェルに慣れる', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '訓練場ではじめる' }).click();
  await expect(page.getByRole('heading', { name: '訓練場', level: 1 })).toBeVisible();

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('地図からトラック、レッスンまで辿れる', async ({ page }) => {
  await page.goto('./map');
  await expect(page.getByRole('heading', { name: '冒険の地図', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Kubernetes', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kubernetes');

  await page.getByRole('link', { name: /コンテナだけでは足りない理由/ }).click();
  await expect(page.getByRole('region', { name: 'ライブ図解' })).toBeVisible();

  // 直リンク（404.html フォールバック）でも同じ画面が出る
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

test('訓練場でコマンドを実行するとファイルツリーが変わり、手順が進む', async ({ page }) => {
  await page.goto('./sandbox');
  await expect(page.getByRole('heading', { name: '訓練場', level: 1 })).toBeVisible();

  const tree = page.getByRole('region', { name: 'ファイルツリー' });
  await expect(tree).not.toContainText('reports');

  await page.getByLabel('コマンドを入力').fill('mkdir reports');
  await page.getByLabel('コマンドを入力').press('Enter');

  await expect(tree).toContainText('reports');
  await expect(page.getByText('2 / 3')).toBeVisible();
});

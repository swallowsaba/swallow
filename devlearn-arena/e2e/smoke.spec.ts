import { expect, test } from '@playwright/test';

test('サブディレクトリ配信でマップが表示され、直リンクでも 404 にならない', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'ワールドマップ', level: 1 })).toBeVisible();

  // トラック → レッスンまで遷移できる
  await page.getByRole('link', { name: 'このトラックを開く' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kubernetes');
  await page.getByRole('link', { name: /コンテナだけでは足りない理由/ }).click();
  await expect(page.getByRole('region', { name: 'ライブ図解' })).toBeVisible();

  // 深い URL への直リンク（404.html フォールバック）
  const deep = page.url();
  await page.goto(deep);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('進捗の書き出しができる', async ({ page }) => {
  await page.goto('./settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  expect((await download).suggestedFilename()).toBe('devlearn-arena-progress.json');
});

test('サンドボックスでコマンドを実行するとファイルツリーが変わる', async ({ page }) => {
  await page.goto('./sandbox');
  await expect(page.getByRole('heading', { name: 'サンドボックス', level: 1 })).toBeVisible();

  const tree = page.getByRole('region', { name: 'ファイルツリー' });
  await expect(tree).not.toContainText('reports');

  await page.getByLabel('コマンドを入力').fill('mkdir reports');
  await page.getByLabel('コマンドを入力').press('Enter');

  await expect(tree).toContainText('reports');
  // 状態アサーションで手順が進む
  await expect(page.getByText('2 / 3')).toBeVisible();
});

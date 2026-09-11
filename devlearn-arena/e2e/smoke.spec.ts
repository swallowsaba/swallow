import { expect, test, type Page } from '@playwright/test';

async function type(page: Page, line: string): Promise<void> {
  await page.locator('.xterm-screen').click();
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

/** 初回だけ出る案内を閉じる */
async function dismissOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'ようこそ' });
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'はじめる' }).click();
    await expect(dialog).toBeHidden();
  }
}

/** 任務を開いたときに出る「学ぶ」画面を閉じる */
async function dismissIntro(page: Page): Promise<void> {
  const intro = page.getByRole('dialog').filter({ hasText: 'この任務で学ぶこと' });
  if (await intro.isVisible()) {
    await intro.getByRole('button', { name: 'はじめる' }).click();
    await expect(intro).toBeHidden();
  }
}

async function open(page: Page, path = './'): Promise<void> {
  await page.goto(path);
  await dismissOnboarding(page);
  await dismissIntro(page);
}

test('初回だけ案内が出て、閉じたら二度と出ない', async ({ page }) => {
  await page.goto('./');
  const welcome = page.getByRole('dialog', { name: 'ようこそ' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'はじめる' }).click();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'ようこそ' })).toBeHidden();
});

test('1枚の画面が開き、コマンドで景色が変わる', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await open(page);
  await expect(page.getByText('DEVLEARN', { exact: true })).toBeVisible();

  const world = page.getByRole('img', { name: 'ファイルシステムの階層図' });
  await expect(world).toBeVisible();
  await expect(world).not.toContainText('reports');

  await type(page, 'mkdir reports');
  await expect(world).toContainText('reports');

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('条件を満たすと手順が進む', async ({ page }) => {
  await open(page);
  await expect(page.getByText('未達成', { exact: false })).toBeVisible();
  await type(page, 'mkdir reports');
  await expect(page.getByText('やること 2')).toBeVisible();
});

test('全体図と設定へ行ける', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: '全体図' }).click();
  await expect(page.getByRole('heading', { name: '冒険の地図', level: 1 })).toBeVisible();

  await open(page, './settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  expect((await download).suggestedFilename()).toBe('devlearn-arena-progress.json');
});

test('訓練場では任務の縛り無しに全部のエンジンを触れる', async ({ page }) => {
  await open(page, './sandbox');
  await expect(page.getByRole('heading', { name: '訓練場', level: 1 })).toBeVisible();

  await type(page, 'kubectl get pods');
  await page.getByRole('tab', { name: 'クラスタ' }).click();
  await expect(page.getByRole('tab', { name: 'クラスタ' })).toHaveAttribute('aria-selected', 'true');

  await type(page, 'git init');
  await page.getByRole('tab', { name: 'Git' }).click();
  await expect(page.getByRole('tab', { name: 'Git' })).toHaveAttribute('aria-selected', 'true');
});

test('記録に実績と連続日数が出る', async ({ page }) => {
  await open(page, './dashboard');
  await expect(page.getByRole('heading', { name: '記録', level: 1 })).toBeVisible();
  await expect(page.getByText('取り組んだ日')).toBeVisible();
  await expect(page.getByText('実績 0 /', { exact: false })).toBeVisible();
});

test('目次から遊べるレッスンへ入れる', async ({ page }) => {
  await open(page, './track/git');
  const playable = page.getByRole('link', { name: /遊べる/ }).first();
  await expect(playable).toBeVisible();
  await playable.click();
  await dismissIntro(page);
  await expect(page.locator('.xterm-screen')).toBeVisible();
});

test('任務は絞り込んで選べる', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: /任務を選ぶ/ }).click();
  const picker = page.getByRole('dialog', { name: '全ての任務' });
  await expect(picker).toBeVisible();

  await page.getByRole('searchbox').fill('kubeadm');
  const first = picker.getByRole('button').nth(1);
  await expect(first).toBeVisible();
  await first.click();
  await expect(picker).toBeHidden();
});

test('任務を開くとまず説明が出て、読んだ任務では次から出ない', async ({ page }) => {
  await page.goto('./');
  await dismissOnboarding(page);
  const intro = page.getByRole('dialog').filter({ hasText: 'この任務で学ぶこと' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'はじめる' }).click();
  await expect(intro).toBeHidden();

  await page.reload();
  await expect(intro).toBeHidden();
  await page.getByRole('button', { name: '説明を読む' }).click();
  await expect(intro).toBeVisible();
});

test('目次では本編と反復演習が分かれている', async ({ page }) => {
  await open(page, './#/track/kernel');
  await expect(page.getByRole('heading', { name: 'Linux とシェル' })).toBeVisible();
  await expect(page.getByRole('button', { name: '演習を開く' }).first()).toBeVisible();
});

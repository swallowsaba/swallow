import { expect, test, type Page } from '@playwright/test';

async function type(page: Page, line: string): Promise<void> {
  // 端末は親の大きさに合わせて伸び縮みするので、クリックせず入力欄に直接フォーカスする
  await page.locator('.xterm-helper-textarea').focus();
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

/** 任務を開いたときに出る「依頼」画面を閉じる */
async function dismissIntro(page: Page): Promise<void> {
  const intro = page.getByTestId('briefing');
  if (await intro.isVisible()) {
    await intro.getByRole('button', { name: '説明をとばして作業をはじめる' }).click();
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

  // 既定はゲームの世界（ファイルの街）
  const world = page.getByRole('img', { name: 'ファイルの街' });
  await expect(world).toBeVisible();
  await expect(world).not.toContainText('reports');

  await type(page, 'mkdir reports');
  await expect(world).toContainText('reports');

  // 図に切り替えても、同じ状態が見える
  await page.getByRole('button', { name: '図', exact: true }).click();
  const diagram = page.getByRole('img', { name: 'ファイルシステムの階層図' });
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('reports');

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
  await page.getByRole('tab', { name: 'Git', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Git', exact: true })).toHaveAttribute('aria-selected', 'true');
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

test('任務を開くとまず依頼の話が出て、聞いた任務では次から出ない', async ({ page }) => {
  await page.goto('./');
  await dismissOnboarding(page);
  const intro = page.getByTestId('briefing');
  await expect(intro).toBeVisible();
  // コマンドの前に、施設（概念）をまだ学んでいなければ街へ案内される
  await expect(intro.getByTestId('facility-note')).toHaveAttribute('data-built', 'false');
  await intro.getByRole('button', { name: '説明をとばして作業をはじめる' }).click();
  await expect(intro).toBeHidden();

  await page.reload();
  await expect(intro).toBeHidden();
  await page.getByRole('button', { name: '依頼を聞き直す' }).click();
  await expect(intro).toBeVisible();
});

test('初回の案内から街へ行き、仕組みを学んで判断問題に合格すると施設が建つ', async ({ page }) => {
  await page.goto('./');
  const welcome = page.getByRole('dialog', { name: 'ようこそ' });
  await welcome.getByRole('button', { name: 'シェルの街から始める' }).click();
  await expect(page.getByTestId('city-page')).toHaveAttribute('data-track', 'kernel');

  const first = page.locator('[data-facility="kernel/00"]');
  await expect(first).toHaveAttribute('data-state', 'available');
  await page.getByTestId('learn-facility').click();

  const lesson = page.getByTestId('facility-lesson');
  await expect(lesson).toBeVisible();
  // 困りごと → 何なのか → なぜ → 仕組み → 落とし穴 を読み進めて、審査へ
  // 「次へ」は審査の段で消える。消えるまで押し進める
  const next = lesson.getByTestId('lesson-next');
  while (await next.isVisible()) {
    await next.click();
  }
  await expect(lesson.getByTestId('exam')).toBeVisible();
  for (;;) {
    await lesson.locator('[data-correct="true"]').click();
    const examNext = lesson.getByTestId('exam-next');
    const isLast = (await examNext.textContent())?.includes('施設を建てる') ?? false;
    await examNext.click();
    if (isLast) break;
  }
  await expect(lesson.getByTestId('facility-built')).toBeVisible();
  await lesson.getByRole('button', { name: '街に戻る' }).click();
  await expect(first).toHaveAttribute('data-state', 'built');
  await expect(page.locator('[data-facility="kernel/01"]')).toHaveAttribute('data-state', 'available');

  // 建てた施設は保存され、読み込み直しても残る
  await page.reload();
  await expect(page.locator('[data-facility="kernel/00"]')).toHaveAttribute('data-state', 'built');
});

test('目次では本編と反復演習が分かれている', async ({ page }) => {
  await open(page, './track/kernel');
  await expect(page.getByRole('heading', { name: 'Linux とシェル' })).toBeVisible();
  await expect(page.getByRole('button', { name: '演習を開く' }).first()).toBeVisible();
});

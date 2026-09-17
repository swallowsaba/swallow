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
    await dialog.getByRole('button', { name: 'このまま はじめる' }).click();
    await expect(dialog).toBeHidden();
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissOnboarding(page);
}

/**
 * カテゴリの作業画面で、街の紹介 → 施設を学んで建てる → 依頼を聞く まで進め、コマンドを打てる状態にする。
 * 説明を飛ばす道は無い（はじめての施設・依頼は必ず聞く）。
 */
async function learnAndStart(page: Page): Promise<void> {
  const panel = page.getByTestId('learning-panel');
  await expect(panel).toBeVisible();
  if ((await panel.getAttribute('data-stage')) === 'welcome') {
    await page.getByTestId('welcome-start').click();
  }
  if ((await panel.getAttribute('data-stage')) === 'facility') {
    const next = page.getByTestId('lesson-next');
    while (await next.isVisible()) await next.click();
    await expect(page.getByTestId('exam')).toBeVisible();
    for (;;) {
      await page.locator('[data-testid="exam"] [data-correct="true"]').click();
      const examNext = page.getByTestId('exam-next');
      const isLast = (await examNext.textContent())?.includes('施設を建てる') ?? false;
      await examNext.click();
      if (isLast) break;
    }
    await page.getByTestId('facility-continue').click();
  }
  await expect(panel).toHaveAttribute('data-stage', 'briefing');
  const talk = page.getByTestId('talk-next');
  while (await talk.isVisible()) await talk.click();
  while (await page.getByTestId('quiz').isVisible()) {
    await page.locator('[data-testid="quiz"] [data-correct="true"]').click();
    await page.getByTestId('quiz-next').click();
  }
  await page.getByTestId('try-next').click();
  await page.getByRole('button', { name: '▶ 作業をはじめる' }).click();
  await expect(panel).toHaveAttribute('data-stage', 'work');
  await expect(page.locator('.xterm-screen')).toBeVisible();
}

test('初回だけ案内が出て、閉じたら二度と出ない。入口は全体図', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/map$/);
  const welcome = page.getByRole('dialog', { name: 'ようこそ' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'このまま はじめる' }).click();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'ようこそ' })).toBeHidden();
});

test('全体図で世界を選ぶと、説明・コマンド・街の画面に入り、説明を聞くまでコマンドは打てない', async ({ page }) => {
  await open(page, './map');
  await page.getByRole('link', { name: /^Git \d/ }).first().click();
  await expect(page).toHaveURL(/\/world\/git/);
  await expect(page.getByTestId('learning-panel')).toHaveAttribute('data-stage', 'welcome');
  await expect(page.getByTestId('terminal-lock')).toBeVisible();
  await expect(page.locator('.xterm-screen')).toHaveCount(0);
  await expect(page.getByTestId('iso-city')).toBeVisible();
});

test('施設を学んで建て、依頼を聞いてからコマンドを打つと景色が変わり、街に施設が建つ', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${String(res.status())} ${res.url()}`);
  });

  await open(page, './world/kernel');
  await learnAndStart(page);

  // 既定は「いまの状態」のゲームの世界（ファイルの街）
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

  // 街には、学んで建てた施設が建っている。読み込み直しても残る
  await page.locator('[data-view="city"]').click();
  await expect(page.locator('[data-district="kernel/00"]')).toHaveAttribute('data-state', /built|operating|complete/);
  await page.reload();
  await page.locator('[data-view="city"]').click();
  await expect(page.locator('[data-district="kernel/00"]')).toHaveAttribute('data-state', /built|operating|complete/);

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([]);
});

test('条件を満たすと手順が進み、ヒントはターミナルに打たれず左上に出る', async ({ page }) => {
  await open(page, './world/kernel');
  await learnAndStart(page);
  await expect(page.getByText('未達成', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'ヒント', exact: true }).click();
  const panel = page.getByTestId('learning-panel');
  await expect(panel.locator('li .font-mono').first()).toBeVisible();
  await expect(page.locator('.xterm-screen')).not.toContainText('hint');

  await type(page, 'mkdir reports');
  await expect(page.getByText('やること 2')).toBeVisible();
});

test('一度聞いた依頼は次から出ず、聞き直せる', async ({ page }) => {
  await open(page, './world/kernel');
  await learnAndStart(page);
  await page.reload();
  const panel = page.getByTestId('learning-panel');
  await expect(panel).toHaveAttribute('data-stage', 'work');
  await page.getByRole('button', { name: '依頼を聞き直す' }).click();
  await expect(panel).toHaveAttribute('data-stage', 'briefing');
  await page.getByRole('button', { name: '説明をとばして作業をはじめる' }).click();
  await expect(panel).toHaveAttribute('data-stage', 'work');
});

test('作業画面から全体図と設定へ行ける', async ({ page }) => {
  await open(page, './world/kernel');
  await page.getByRole('link', { name: '全体図' }).click();
  await expect(page.getByRole('heading', { name: '全体図', level: 1 })).toBeVisible();

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

test('目次から取り組めるレッスンへ入ると、そのカテゴリの作業画面で説明から始まる', async ({ page }) => {
  await open(page, './track/git');
  const playable = page.getByRole('link', { name: /取り組める/ }).first();
  await expect(playable).toBeVisible();
  await playable.click();
  await expect(page).toHaveURL(/\/world\/git\?mission=/);
  await expect(page.getByTestId('learning-panel')).not.toHaveAttribute('data-stage', 'work');
});

test('任務は絞り込んで選べる', async ({ page }) => {
  await open(page, './world/kernel');

  await page.getByRole('button', { name: /任務を選ぶ/ }).click();
  const picker = page.getByRole('dialog', { name: '全ての任務' });
  await expect(picker).toBeVisible();

  await page.getByRole('searchbox').fill('kubeadm');
  const first = picker.getByRole('button').nth(1);
  await expect(first).toBeVisible();
  await first.click();
  await expect(picker).toBeHidden();
});

test('目次では本編と反復演習が分かれている', async ({ page }) => {
  await open(page, './track/kernel');
  await expect(page.getByRole('heading', { name: 'Linux とシェル' })).toBeVisible();
  await expect(page.getByRole('button', { name: '演習を開く' }).first()).toBeVisible();
});

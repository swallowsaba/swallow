import { expect, test, type Page } from '@playwright/test';

/**
 * キーボードだけでの操作（docs/ui-design.md 4 章・docs/acceptance-criteria.md U5・docs/testing-strategy.md 5 章）。
 * 都市に施設を 1 つ置いた状態（準備だけは模型に直接置く）から、マウスを使わずに
 * 操作説明 → 移動・拡大・回転 → 施設を選ぶ → 情報パネル → レッスン → 段を進める・戻る → 都市へ → 学習ライブラリ → 知識グラフ → 一時停止 → 建設メニュー、と進める。
 */

type CityWindow = Window & {
  __cityStore: { getState: () => { city: { facilities: unknown[] }; setCity: (c: unknown) => void; paused: boolean } };
  __city: { screenOf: (x: number, y: number) => { sx: number; sy: number } };
};

const focused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return { tag: el?.tagName ?? '', text: el?.textContent?.trim() ?? '', inPanel: Boolean(el?.closest('[data-testid="info-panel"]')), inDrawer: Boolean(el?.closest('[data-testid="build-drawer"]')) };
});

test('マウスを使わずに、都市の操作から学習まで進められる', async ({ page }) => {
  await page.goto('./#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');

  // 初回の操作説明は Enter で読み進める
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);

  // 施設が無い時の Tab は、画面の部品をたどる（施設の選択に奪われない）
  await page.keyboard.press('Tab');
  expect((await focused(page)).tag).toBe('A');

  // 準備: 初めの道路の南にサーバ施設を置く（置く所はマウスで選ぶ決まりなので、ここだけ模型に直接置く）
  await page.evaluate(() => {
    const s = (window as unknown as CityWindow).__cityStore.getState();
    const city = s.city as { facilities: unknown[] };
    s.setCity({ ...city, facilities: [...city.facilities, { id: 'f-key', type: 'server', domain: 'linux', origin: { x: 46, y: 48 }, rotation: 180, level: 1, state: 'active', builtDay: 0 }] });
  });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // 移動・拡大・回転
  const at = () => page.evaluate(() => (window as unknown as CityWindow).__city.screenOf(48.5, 47.5));
  for (const key of ['d', '+', 'q']) {
    const before = await at();
    await page.keyboard.down(key);
    await page.waitForTimeout(200);
    await page.keyboard.up(key);
    expect(await at(), key).not.toEqual(before);
  }

  // Tab で施設を選ぶ → Enter で情報パネルの中（ここで学ぶ）へ → Enter でレッスン
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('info-panel')).toBeVisible();
  await page.keyboard.press('Enter');
  const f = await focused(page);
  expect(f.inPanel).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  expect(page.url()).toContain('#/lesson/');

  // Enter で次へ、Backspace で戻る（解説の中の段）
  const sub = () => page.locator('.stage-page.is-current').textContent();
  const first = await sub();
  await page.keyboard.press('Enter');
  expect(await sub()).not.toBe(first);
  await page.keyboard.press('Backspace');
  expect(await sub()).toBe(first);

  // Esc で都市へ（どの画面からも 1 回で）
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  await expect(page.getByTestId('stage-explain')).toHaveCount(0);

  // L で学習ライブラリ、G で知識グラフ、Esc で都市へ
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('l');
  await expect(page.getByTestId('learn-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  await expect(page.getByTestId('learn-screen')).toHaveCount(0);
  await page.keyboard.press('g');
  await expect(page).toHaveURL(/#\/graph/);
  await expect(page.locator('#learn-screen-title')).toHaveText('知識グラフ');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  await expect(page.getByTestId('learn-screen')).toHaveCount(0);

  // Space で一時停止、B で建設メニュー（引き出しの最初の項目に焦点）
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(' ');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.keyboard.press(' ');
  await page.keyboard.press('b');
  await expect(page.getByTestId('build-drawer')).toBeVisible();
  await expect.poll(async () => (await focused(page)).inDrawer).toBe(true);
});

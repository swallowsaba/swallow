import { expect, test } from '@playwright/test';

/**
 * 読み込み中の演出（docs/ui-design.md 9 章）。本体が届く前から出て、都市が描けたら消える。
 * 本体の読み込みを遅らせて確かめる（build したものを、サブディレクトリで配信して）。
 */
test('本体が届く前から都市の輪郭を描き、都市が描けたら消える', async ({ page }) => {
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('./#/city', { waitUntil: 'commit' });
  const boot = page.locator('#boot');
  await expect(boot).toBeVisible();
  await expect(boot).toHaveAttribute('aria-label', '都市を読み込んでいる');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await expect(boot).toHaveCount(0);
  await expect(page.getByTestId('topbar')).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';

/**
 * 性能（docs/development-plan.md Phase 12）: レッスンの画面が都市を覆っている間は、見えない都市を描かない。
 * 都市に戻ると、すぐ今の姿を描き直す。
 */
type CityWindow = Window & { __city: { stats: { draws: number; frames: number } } };
const stats = (page: Page) => page.evaluate(() => ({ ...(window as unknown as CityWindow).__city.stats }));

test('レッスンの間は都市を描かず、戻るとすぐ描き直す', async ({ page }) => {
  await page.goto('./#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');

  await page.evaluate(() => { window.location.hash = '#/lesson/linux.b.01'; });
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  const a = await stats(page);
  await page.waitForTimeout(600);
  const b = await stats(page);
  // 時間（フレーム）は進むが、描き直さない
  expect(b.frames).toBeGreaterThan(a.frames + 10);
  expect(b.draws).toBe(a.draws);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(b.draws);
});

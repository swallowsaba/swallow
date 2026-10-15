import { expect, test, type Page } from '@playwright/test';

/**
 * ミニマップ（docs/ui-design.md 3 章、docs/decisions.md D-18、docs/acceptance-criteria.md U7）。
 * 左下に出て、押すとその場所へカメラが動く。設定の「ミニマップ」で消せ、リロードしても消えたまま。
 */
type CityWindow = Window & { __city: { camera: { focus: { x: number; y: number }; rotation: number } } };
const camera = (page: Page) => page.evaluate(() => (window as unknown as CityWindow).__city.camera);

async function openCity(page: Page): Promise<void> {
  await page.goto('./#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
}

test('左下のミニマップを押すと、押した所へカメラが動く。回すとミニマップも回る', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openCity(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  const map = page.getByTestId('minimap');
  await expect(map).toBeVisible();
  const box = await map.locator('canvas').boundingBox();
  if (!box) throw new Error('ミニマップが無い');
  // 画面の高さが 900 未満では 100×100。左下に置く
  expect(Math.round(box.width)).toBe(100);
  expect(box.x).toBeLessThan(40);
  expect(box.y + box.height).toBeGreaterThan(720 - 40);

  const before = await camera(page);
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  const left = await camera(page);
  expect(Math.hypot(left.focus.x - before.focus.x, left.focus.y - before.focus.y)).toBeGreaterThan(5);
  // 同じ所を、都市を回してから押すと、別の地点へ動く（ミニマップが都市と一緒に回っている）
  await page.keyboard.press('e');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  const turned = await camera(page);
  expect(turned.rotation).toBe((left.rotation + 1) % 4);
  expect(Math.hypot(turned.focus.x - left.focus.x, turned.focus.y - left.focus.y)).toBeGreaterThan(5);
});

test('設定で「出さない」にすると消え、リロードしても消えたまま', async ({ page }) => {
  await openCity(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('minimap')).toBeVisible();
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.getByRole('group', { name: 'ミニマップ' }).getByRole('button', { name: '出さない' }).click();
  await page.evaluate(() => { window.location.hash = '#/city'; });
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  // 自動保存（操作の 2 秒後）を待ってから開き直す
  await page.waitForTimeout(2600);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await expect(page.getByTestId('minimap')).toHaveCount(0);
});

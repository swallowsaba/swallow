import { expect, test } from '@playwright/test';

test('app loads and shows the editor shell', async ({ page }) => {
  await page.goto('/');
  // Toolbar brand is always present.
  await expect(page.getByText('RAW Studio')).toBeVisible();
  // The empty-state drop target is shown before any image is loaded.
  await expect(page.getByText(/Drop photos here/i)).toBeVisible();
});

test('right panel exposes the Presets and Basic tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Presets' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Basic' })).toBeVisible();
});

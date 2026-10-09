import { expect, test, type Page } from '@playwright/test';

/**
 * オフライン（docs/product-spec.md 5 章・docs/architecture.md 4 章）。
 * 一度開いた後は、回線が無くても都市と、一度読んだレッスンが開ける。読んでいないレッスンは、
 * 何が起きたか・どうすればよいかを出し、回線が戻れば「もう一度読む」（ページを開き直す）で開ける。
 */

async function city(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  if (await page.getByTestId('intro').count()) await page.keyboard.press('Escape');
  await expect(page.getByTestId('intro')).toHaveCount(0);
}

async function lesson(page: Page, id: string): Promise<void> {
  await page.evaluate((to) => { window.location.hash = `#/lesson/${to}`; }, id);
}

test('一度開いた後は、回線が無くても都市と読んだレッスンが開ける', async ({ page, context }) => {
  await page.goto('./#/city');
  await city(page);
  // Service Worker がこのページを受け持ち、受け持つ前に読んだ本体を保持し終えるまで待つ
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForFunction(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
    for (const name of await caches.keys()) if (await (await caches.open(name)).match(entry)) return true;
    return false;
  });
  // 回線があるうちにレッスンを 1 本開く
  await lesson(page, 'linux.b.01');
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/city$/);
  // 操作説明を閉じたことの保存（操作の 2 秒後）を待つ
  await page.waitForTimeout(2600);

  await context.setOffline(true);
  await page.reload();
  await city(page);
  await expect(page.getByTestId('topbar')).toBeVisible();

  await lesson(page, 'linux.b.01');
  await expect(page.getByTestId('stage-explain')).toBeVisible();

  await lesson(page, 'net.b.01');
  await expect(page.getByTestId('lesson-load-error')).toBeVisible();

  // 回線が戻ったら「もう一度読む」（ページを開き直し、同じレッスンが開く）
  await context.setOffline(false);
  await page.getByTestId('lesson-load-retry').click();
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  expect(page.url()).toContain('#/lesson/net.b.01');
});

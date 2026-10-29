import type { Page } from '@playwright/test';

/**
 * 新しく始めた都市（初回）に出る、始め方の選択の窓（docs/ui-design.md 10.12）を「ふつう」で閉じる。
 * 保存データのある都市では出ないので、何もしない
 */
export async function closeStart(page: Page): Promise<void> {
  const w = page.getByTestId('start-window');
  if (await w.count()) await w.getByTestId('start-go').click();
}

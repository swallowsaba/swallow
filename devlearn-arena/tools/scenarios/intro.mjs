// 初回の操作説明（docs/ui-design.md 9 章）。3 回を Enter で読み進めて撮る。
//
//   SHOOT_INTRO=1 SHOOT_SCRIPT=tools/scenarios/intro.mjs npm run shoot -- intro-end
import { setTimeout as sleep } from 'node:timers/promises';

export default async function intro(page, shot) {
  for (const n of ['1', '2', '3']) {
    await page.locator(`[data-testid="intro"][data-step="${n}"]`).waitFor();
    await sleep(300);
    await shot(`intro-${n}`);
    await page.keyboard.press('Enter');
  }
  if ((await page.getByTestId('intro').count()) !== 0) throw new Error('3 回目の後も操作説明が残っている');
}

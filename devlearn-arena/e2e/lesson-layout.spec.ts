import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * レッスン画面の配置（docs/ui-design.md 7 章）。縦の低い横長の画面（1280×720）でも、上の帯・下の帯・2 枚の窓が画面の幅に収まる。
 * 題名の長いレッスン（sec.b.01）で、折り返さない題名の幅に引かれて画面全体が横に広がり、右端（中断して都市へ・次へ）が切れていた
 */

const root = new URL('../content/lessons/', import.meta.url);
const ids = readdirSync(root).flatMap((d) => readdirSync(new URL(`${d}/`, root)).map((f) => f.replace(/\.json$/, '')));

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(240_000);

test('どのレッスンでも、上下の帯と窓が画面の幅に収まる', async ({ page }) => {
  await page.goto('./#/city');
  const over: string[] = [];
  for (const id of ids) {
    await page.evaluate((lessonId) => {
      window.location.hash = `#/lesson/${lessonId}`;
    }, id);
    await expect(page.getByTestId('stage-explain')).toBeVisible();
    // 開く時の動き（少し大きい所から縮む）が終わってから測る
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    const out = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return ['.lesson-bar', '.lesson-body', '.lesson-foot', '.lesson-exit', '.lesson-next']
        .map((sel) => ({ sel, right: Math.round(document.querySelector(sel)?.getBoundingClientRect().right ?? 0) }))
        .filter((x) => x.right > vw)
        .map((x) => `${x.sel} の右端 ${String(x.right)}`);
    });
    over.push(...out.map((o) => `${id}: ${o}`));
    await page.evaluate(() => {
      window.location.hash = '#/city';
    });
  }
  expect(over).toEqual([]);
});

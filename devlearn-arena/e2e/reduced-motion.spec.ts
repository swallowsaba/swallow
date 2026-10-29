import { expect, test, type Page } from '@playwright/test';
import { closeStart } from './start';

/**
 * 動きを減らす設定（OS の prefers-reduced-motion）では、実戦の画面の動きを止める（VERIFY-ALL.txt【4】、REWORK-PRACTICE.txt 原則 4）。
 * ドラッグの実戦を本物のマウスで操作し、模擬の画面の中に動き（疑似要素の物も含む）が 1 つも走っていないことを確かめる。
 * 並べるの流れの線（.sim-stages の ::before）だけが、OS の設定で止まらずに走っていた
 */

interface GameWindow {
  __game: { store: { getState: () => { start: (id: string, at: string) => void; reach: (id: string, stage: string) => void } } };
}

test.use({ viewport: { width: 1920, height: 1080 }, contextOptions: { reducedMotion: 'reduce' } });

async function openPractice(page: Page, id: string): Promise<void> {
  await page.goto('./#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await closeStart(page);
  await page.locator('[data-testid="intro"] .intro-skip').click({ timeout: 5000 }).catch(() => undefined);
  await page.evaluate((lessonId) => {
    const store = (window as unknown as GameWindow).__game.store;
    store.getState().start(lessonId, new Date().toISOString());
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach(lessonId, st);
    window.location.hash = `#/lesson/${lessonId}`;
  }, id);
  await expect(page.getByTestId('sim-console')).toBeVisible();
}

async function dragTo(page: Page, from: string, to: string): Promise<void> {
  const a = await page.locator(from).first().boundingBox();
  const b = await page.locator(to).first().boundingBox();
  if (!a || !b) throw new Error(`${from} か ${to} が見えない`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 2 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

/** 模擬の画面の中で走っている動き（要素の名前と疑似要素） */
const running = (page: Page) => page.evaluate(() => document.getAnimations()
  .filter((a) => {
    const t = (a.effect as KeyframeEffect | null)?.target;
    return a.playState === 'running' && t instanceof Element && t.closest('.sim-console') !== null;
  })
  .map((a) => {
    const e = a.effect as KeyframeEffect;
    return `${e.target?.getAttribute('class') ?? ''}${e.pseudoElement ?? ''}`;
  }));

test('並べる: OS の動きを減らす設定では、並べて流れても動きが走らない（流れの線も）', async ({ page }) => {
  await openPractice(page, 'sec.b.06');
  // 順の違う並び（止まった段が赤くなる）と、正しい並び
  await dragTo(page, '.sim-pool [data-card="verify"]', '[data-drop="end"]');
  await expect(page.locator('.sim-stage.is-stop')).toBeVisible();
  expect(await running(page)).toEqual([]);
  await dragTo(page, '.sim-stages [data-card="verify"]', '.sim-pool');
  await dragTo(page, '.sim-pool [data-card="hello"]', '[data-drop="end"]');
  expect(await running(page)).toEqual([]);
});

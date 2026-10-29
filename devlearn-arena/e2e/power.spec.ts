import { expect, test, type Page } from '@playwright/test';

/**
 * 電力・公共サービス・需要（docs/development-plan.md G10・docs/game-design.md 23・24 章）。
 *
 *   住宅と工場の町に Web 施設を置く → 外からの電気を止めると、次の週に地区が止まる（窓の灯りが消え、屋根に止まった記号）
 *   → 停電した施設の情報パネルに「停電している」、そこから学べる（S2。docs/game-design.md 20 章）
 *   → 表示切替の「電力」で止まった所が分かる
 *   → 建設メニューの「公共」: 発電所を選ぶと電力のヒートマップが重なり、上の帯の下に使う量と来る量、置く場所に届く範囲の縁。離すと消える
 *   → 区画の引き出しに需要の棒 3 本。押すと内訳
 */

type Facility = { id: string; type: string; origin: { x: number; y: number }; rotation: 0; level: number; state: 'active'; builtDay: number };
type W = {
  city: { day: number; funds: number; facilities: Facility[] };
  sim: { week: number; power: { externalCapMW: number; recent?: number[][] } };
  budget: { treasury: number };
};
type Store = {
  getState: () => { speed: number; paused: boolean; overlay: string | null; togglePause: () => void; tick: (s: number) => void; city: { day: number }; world: W; load: (w: unknown) => void };
};
type Renderer = { screenOf: (x: number, y: number) => { sx: number; sy: number }; focusOn: (x: number, y: number) => void; lastPlugs: unknown[]; lastAreaEdges: number };

const state = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
  return { overlay: s.overlay, stopped: s.world.sim.power.recent?.at(-1) ?? [] };
});
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([cx, cy]) => (window as unknown as { __city: Renderer }).__city.screenOf(cx + 0.5, cy + 0.5), [x, y] as const);

async function days(page: Page, n: number): Promise<void> {
  const target = await page.evaluate((d) => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    if (s.paused) s.togglePause();
    const to = Math.floor(s.city.day + d);
    s.tick((d * 2) / s.speed);
    return to;
  }, n);
  await page.waitForFunction((t) => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day >= t, target);
}
async function weekEnd(page: Page): Promise<void> {
  const day = await page.evaluate(() => Math.floor((window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day));
  await days(page, 7 - (day % 7));
}
async function dragCells(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move(b.sx, b.sy, { steps: 8 });
  await page.mouse.up();
}

test.setTimeout(180_000);

/** 一般道の両側に住宅、東に工場を塗り、人が住むのを待つ。道路の北に Web 施設（完成した物）を置く */
async function town(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await expect(page.getByTestId('election-window')).toBeVisible();
  await page.getByTestId('election-window').getByRole('button', { name: '閉じる' }).click();
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    const web: Facility = { id: 'f-web', type: 'web', origin: { x: 45, y: 45 }, rotation: 0, level: 1, state: 'active', builtDay: 0 };
    s.load({ ...s.world, city: { ...s.world.city, funds: 5000, facilities: [...s.world.city.facilities, web] }, budget: { ...s.world.budget, treasury: 5000 } });
  });
  await page.evaluate(() => (window as unknown as { __city: Renderer }).__city.focusOn(46, 46));
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await dragCells(page, [51, 46], [55, 46]);
  await page.getByTestId('build-zone-residential').click();
  await dragCells(page, [38, 48], [50, 48]);
  await dragCells(page, [38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 28);
}

test('外からの電気が足りないと地区が止まり、停電した施設からも学べる。電力のヒートマップで止まった所が分かる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  expect((await state(page)).stopped).toEqual([]);

  // 外からの電気を 0 にすると、次の週に、使う量のある地区が止まる
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    s.load({ ...s.world, sim: { ...s.world.sim, power: { ...s.world.sim.power, externalCapMW: 0 } } });
  });
  await weekEnd(page);
  await page.waitForFunction(() => ((window as unknown as { __cityStore: Store }).__cityStore.getState().world.sim.power.recent?.at(-1)?.length ?? 0) > 0);
  // 止まった建物の屋根に止まった記号
  await page.waitForFunction(() => (window as unknown as { __city: Renderer }).__city.lastPlugs.length > 0);

  // 停電した施設の情報パネル: 状態に停電。ここで学ぶからレッスンへ（S2）
  const web = await at(page, 46, 46);
  await page.mouse.click(web.sx, web.sy);
  await expect(page.getByTestId('info-state')).toContainText('停電している');
  await page.getByTestId('info-lessons').locator('button').first().click();
  await expect(page.getByTestId('entry-card').or(page.getByTestId('lesson-screen'))).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('city-screen')).toBeVisible();
  // 学習ライブラリ・ミッションも開ける
  await page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name: '学ぶ' }).click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name: 'ミッション' }).click();
  await page.locator('[data-testid^="mission-row-"]').first().click();
  await page.getByTestId('mission-start').click();
  await expect(page.getByTestId('mission-screen')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // 表示切替の「電力」: 凡例に来ている／止まった。止まった家を指すと「停電している」
  await page.keyboard.press('v');
  await page.getByTestId('overlay-power').click();
  expect((await state(page)).overlay).toBe('power');
  await expect(page.getByTestId('overlay-legend')).toContainText('来ている／止まった');
  expect(errors).toEqual([]);
});

test('公共の引き出し: 発電所を選ぶと電力のヒートマップと電力の 1 行、置く場所に届く範囲の縁。離すと元に戻る。区画の引き出しに需要の棒', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  await weekEnd(page);

  await page.getByTestId('build-group-civic').click();
  await expect(page.getByTestId('build-facility-police')).toBeVisible();
  await expect(page.getByTestId('build-facility-school')).toBeVisible();
  // 学校を選ぶと、学校の行き届きのヒートマップ
  await page.getByTestId('build-facility-school').click();
  expect((await state(page)).overlay).toBe('school');
  await expect(page.getByTestId('power-line')).toHaveCount(0);
  // 発電所の棚 → 火力の発電所: 電力のヒートマップと、上の帯の下の電力の 1 行
  await page.getByTestId('civic-shelf-power').click();
  await page.getByTestId('build-facility-power-thermal').click();
  expect((await state(page)).overlay).toBe('power');
  await expect(page.getByTestId('power-line')).toContainText('使う');
  await expect(page.getByTestId('power-line')).toContainText('MW');
  // 道路に面した所（Web 施設の東、道路の北）を指すと、届く範囲（つながった道路網）の縁を描く
  const spot = await at(page, 47, 45);
  await page.mouse.move(spot.sx, spot.sy);
  await page.waitForFunction(() => (window as unknown as { __city: Renderer }).__city.lastAreaEdges > 0);
  // 離すと消え、重ねていた物が戻る
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('power-line')).toHaveCount(0);
  expect((await state(page)).overlay).toBeNull();

  // 区画の引き出しの需要の棒 3 本（住宅・商業（店とオフィス）・工業）。押すと内訳
  await page.getByTestId('build-group-zone').click();
  await expect(page.getByTestId('demand-bars')).toBeVisible();
  await expect(page.locator('[data-testid^="demand-value-"]')).toHaveCount(4);
  await page.getByTestId('demand-residential').click();
  await expect(page.getByTestId('demand-pop')).toContainText('住宅');
  expect(errors).toEqual([]);
});

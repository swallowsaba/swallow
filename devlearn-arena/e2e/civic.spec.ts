import { expect, test, type Page } from '@playwright/test';

/**
 * 市政のどの状態からも学べる（docs/acceptance-criteria.md S2・docs/game-design.md 20 章）と、公聴会の窓（G5）。
 *
 *   住宅を塗って人が住むのを待つ → 住宅のそばにデータセンター（申請）→ 反対の受付 → 公聴会の段
 *   → 公聴会の窓（スキル 0 でも譲歩と押し切るが並ぶ。開いている間は時間が止まる）
 *   → 公聴会の途中のまま、情報パネルの「ここで学ぶ」・上の帯の学ぶ・ミッションへ行ける → 戻ると公聴会は待っている
 */

type Store = {
  getState: () => {
    speed: number; paused: boolean; togglePause: () => void; tick: (s: number) => void;
    city: { day: number; funds: number };
    world: { city: { day: number; funds: number }; applications: { id: string; stage: string }[] };
    load: (w: unknown) => void;
  };
};

const at = (page: Page, x: number, y: number) =>
  page.evaluate(([cx, cy]) => (window as unknown as { __city: { screenOf: (x: number, y: number) => { sx: number; sy: number } } }).__city.screenOf(cx + 0.5, cy + 0.5), [x, y] as const);

/** 都市の時計を n 日進め、模擬（Worker）が追いつくのを待つ */
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

const stageOf = (page: Page) => page.evaluate(() => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.applications.at(-1)?.stage ?? null);
const typeOf = (page: Page) => page.evaluate(() => (window as unknown as { __cityStore: { getState: () => { world: { applications: { target: { type?: string } }[] } } } }).__cityStore.getState().world.applications.at(-1)?.target.type ?? null);

async function dragCells(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move(b.sx, b.sy, { steps: 8 });
  await page.mouse.up();
}

test.setTimeout(180_000);

test('公聴会の途中の申請があっても、施設・学習ライブラリ・ミッションから学べる。スキル 0 でも譲歩と押し切るが並ぶ', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);
  // 資金だけを足す（学習の記録には触れない。スキルは 0 のまま）
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    s.load({ ...s.world, city: { ...s.world.city, funds: 5000 } });
  });
  await page.evaluate(() => (window as unknown as { __city: { focusOn: (x: number, y: number) => void } }).__city.focusOn(46, 46));

  // 一般道の両側に住宅、東に工場（働く所があると人が住む）。人が住むのを待つ
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await dragCells(page, [51, 46], [55, 46]);
  await page.getByTestId('build-zone-residential').click();
  await dragCells(page, [38, 48], [50, 48]);
  await dragCells(page, [38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 56);

  // 住宅のそばにデータセンター → 公聴会の段まで進める
  await page.getByTestId('build-group-facility').click();
  await page.getByTestId('facility-shelf-base').click();
  await page.getByTestId('build-facility-datacenter').click();
  const spot = await at(page, 46, 45);
  await page.mouse.move(spot.sx, spot.sy, { steps: 2 });
  await page.mouse.click(spot.sx, spot.sy);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 置くと申請になる（まだ都市には無い）
  await expect.poll(() => typeOf(page)).toBe('datacenter');
  for (let i = 0; i < 30 && (await stageOf(page)) !== 'hearing'; i += 1) await days(page, 1);
  expect(await stageOf(page)).toBe('hearing');

  // 申請の詳細の「公聴会を開く」→ 公聴会の窓。開いている間は時間が止まる
  const site = await at(page, 46, 45);
  await page.mouse.click(site.sx, site.sy);
  await page.getByTestId('permit-open-hearing').click();
  const hearing = page.getByTestId('hearing-window');
  await expect(hearing).toBeVisible();
  const day0 = await page.evaluate(() => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day)).toBe(day0);
  // スキル 0: 説明は並ばず、譲歩と押し切るは並ぶ
  await expect(page.getByTestId('hearing-no-explain')).toHaveText('今出せる説明は無い。学ぶと増える');
  await expect(hearing.locator('[data-concession]').first()).toBeVisible();
  await expect(page.getByTestId('hearing-push')).toBeVisible();

  // 公聴会の窓を開いたまま、上の帯の「学ぶ」から学習ライブラリへ行ける
  await page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name: '学ぶ' }).click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // 窓を閉じて待たせる（公聴会の途中）。施設の情報パネルの「ここで学ぶ」からレッスンへ
  if (await hearing.count()) await hearing.locator('.hearing-close').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.click(site.sx, site.sy);
  await expect(page.getByTestId('info-state')).toContainText('公聴会');
  await page.getByTestId('info-lessons').locator('button').first().click();
  await expect(page.getByTestId('entry-card').or(page.getByTestId('lesson-screen'))).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // ミッションも始められる（一覧 → 詳細 → 始める）
  await page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name: 'ミッション' }).click();
  await page.locator('[data-testid^="mission-row-"]').first().click();
  await expect(page.getByTestId('mission-detail')).toBeVisible();
  await page.getByTestId('mission-start').click();
  await expect(page.getByTestId('mission-screen')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // 戻っても公聴会は待っている
  expect(await stageOf(page)).toBe('hearing');
  expect(errors).toEqual([]);
});

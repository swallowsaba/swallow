import { expect, test, type Page } from '@playwright/test';
import { runLesson } from '../tools/scenarios/domain.mjs';

/**
 * 市政のどの状態からも学べる（docs/acceptance-criteria.md S2・docs/game-design.md 20 章）と、公聴会の窓（G5）。
 *
 *   住宅を塗って人が住むのを待つ → 住宅のそばにデータセンター（申請）→ 反対の受付 → 公聴会の段
 *   → 公聴会の窓（スキル 0 でも譲歩と押し切るが並ぶ。開いている間は時間が止まる）
 *   → 公聴会の途中のまま、情報パネルの「ここで学ぶ」・上の帯の学ぶ・ミッションへ行ける → 戻ると公聴会は待っている
 *
 * 議会の段と異議申し立ての途中（G6）:
 *   住宅の列に続く所を工業に塗る（用途地域の変更の申請）→ 公聴会で一番大きな論点を押し切って終える → 議会の段
 *   → 採決の見込みの窓を開いたまま学習ライブラリへ → 可決して異議申し立て → 申し立ての途中のまま、レッスン・ミッションへ行ける
 *
 * 学習との接続（G7。docs/acceptance-criteria.md S1〜S3）:
 *   公聴会の「この論点を学ぶ」→ 入口の札 → 7 段 → 都市へ戻ると同じ公聴会の窓に新しい説明の候補が並ぶ（レッスンの間は時間が止まる）
 *   スキル 0 のまま、譲歩と政治資本だけで申請が可決して建つ。申請中にも学べる
 *   赤字（G9）と停電（G10）は、その仕組みを作る Phase で、同じ形の E2E を足す
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

/** 一般道の両側に住宅、東に工場（働く所があると人が住む）を塗り、人が住むのを待つ。資金だけを足す（スキルは 0 のまま） */
async function town(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);
  // 1 期目の公約を選ぶ窓（G8）。この E2E では選ばずに閉じる（上の帯の任期の残りから、後で選べる）
  await expect(page.getByTestId('election-window')).toBeVisible();
  await page.getByTestId('election-window').getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByTestId('election-window')).toHaveCount(0);
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
}

/** 住宅のそばにデータセンターを置き（申請）、公聴会の段まで進める */
async function datacenterToHearing(page: Page): Promise<void> {
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
}

/** 上の帯の入口 */
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name });

test('公聴会の途中の申請があっても、施設・学習ライブラリ・ミッションから学べる。スキル 0 でも譲歩と押し切るが並ぶ', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  await datacenterToHearing(page);

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

test('議会の段・異議申し立ての途中の申請があっても、学習ライブラリ・レッスン・ミッションへ行ける（G6）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);

  // 一般道の北の、住宅の列の東に続く 6 マスを工業に塗る → 用途地域の変更の申請（住宅に接するので公聴会を省けない）
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await dragCells(page, [45, 46], [50, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  for (let i = 0; i < 40 && (await stageOf(page)) !== 'hearing'; i += 1) await days(page, 1);
  expect(await stageOf(page)).toBe('hearing');

  // 公聴会: 一番大きな論点を押し切り、ほかには答えずに終える → 議会の段
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { world: { applications: { id: string }[] }; openHearing: (id: string) => void } } }).__cityStore.getState();
    s.openHearing(s.world.applications.at(-1)?.id ?? '');
  });
  const hearing = page.getByTestId('hearing-window');
  await expect(hearing).toBeVisible();
  await hearing.locator('.hearing-issue').first().click();
  await page.getByTestId('hearing-push').click();
  await page.getByTestId('hearing-end').click();
  await expect(hearing).toHaveCount(0);
  expect(await stageOf(page)).toBe('council');

  // 採決の見込みの窓を開いたまま、上の帯の「学ぶ」から学習ライブラリへ
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { world: { applications: { id: string }[] }; openCouncil: (id: string) => void } } }).__cityStore.getState();
    s.openCouncil(s.world.applications.at(-1)?.id ?? '');
  });
  await expect(page.getByTestId('council-window')).toBeVisible();
  await expect(page.getByTestId('council-verdict')).toContainText('このままなら');
  await nav(page, '学ぶ').click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('city-screen')).toBeVisible();
  expect(await stageOf(page)).toBe('council');
  if (await page.getByTestId('council-window').count()) await page.locator('[data-testid="council-window"] .council-close').click();

  // 議会の日に可決 → 押し切った論点があり、反対率が境以上なので申し立てが立つ
  for (let i = 0; i < 20 && (await stageOf(page)) === 'council'; i += 1) await days(page, 1);
  expect(await stageOf(page)).toBe('appeal');
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { world: { applications: { id: string }[] }; openAppeal: (id: string) => void } } }).__cityStore.getState();
    s.openAppeal(s.world.applications.at(-1)?.id ?? '');
  });
  await expect(page.getByTestId('appeal-window')).toBeVisible();

  // 申し立ての途中のまま、レッスンを始められる（前提を学んでいなくても）
  await page.goto('./#/learn/db.b.01');
  await expect(page.getByTestId('entry-card')).toBeVisible();
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('lesson-screen')).toBeVisible();
  // ミッションも始められる
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await nav(page, 'ミッション').click();
  await page.locator('[data-testid^="mission-row-"]').first().click();
  await page.getByTestId('mission-start').click();
  await expect(page.getByTestId('mission-screen')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // 戻っても申し立ては待っている（都市の画面の外では時間が止まる）
  expect(await stageOf(page)).toBe('appeal');
  expect(errors).toEqual([]);
});

test('G7: 公聴会の論点から学びに行き、7 段を修了してスキル段階が上がると、戻った同じ公聴会の窓に新しい説明の候補が並ぶ', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  await datacenterToHearing(page);
  const cityDay = () => page.evaluate(() => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day);

  // 公聴会の窓で「雇用が少ない」を選ぶ。スキル 0 なので説明は無く、伏せた候補と「この論点を学ぶ」が出る
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { world: { applications: { id: string }[] }; openHearing: (id: string) => void } } }).__cityStore.getState();
    s.openHearing(s.world.applications.at(-1)?.id ?? '');
  });
  const hearing = page.getByTestId('hearing-window');
  await hearing.locator('.hearing-issue[data-reason="dc-jobs"]').click();
  await expect(page.getByTestId('hearing-no-explain')).toBeVisible();
  await expect(page.getByTestId('hearing-hidden')).toContainText('データベース 初級で出せる説明が 1 つある');
  const learn = page.getByTestId('hearing-learn').locator('[data-lesson="db.b.01"]');
  await expect(learn).toContainText('データベースとは');
  const day0 = await cityDay();

  // この論点を学ぶ → 入口の札 → 始める → 7 段
  await learn.click();
  await expect(page.getByTestId('entry-card')).toContainText('データベースとは');
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('lesson-screen')).toBeVisible();
  const out = await runLesson(page, 'db.b.01');
  expect(out.result).toBe('success');
  await expect(page.getByTestId('stage-done')).toBeVisible();
  await page.getByTestId('lesson-to-city').click();

  // 同じ公聴会の窓に戻る。レッスンの間、都市の時間は止まっていた
  await expect(hearing).toBeVisible();
  expect(await cityDay()).toBe(day0);
  // スキル段階が上がった知らせに、新しく出せる論点を添える
  await expect(page.locator('.city-notice')).toContainText('新しい説明を出せる', { timeout: 15_000 });
  // 新しい説明の候補が並ぶ（雇用が少ない）
  await hearing.locator('.hearing-issue[data-reason="dc-jobs"]').click();
  await expect(page.getByTestId('hearing-no-explain')).toHaveCount(0);
  const explains = hearing.locator('[data-explanation]');
  expect(await explains.count()).toBeGreaterThan(0);
  // 出すと、住民と議員の受け取り方の 1 行
  await explains.first().click();
  await expect(page.getByTestId('hearing-reaction')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('G7（S3）: スキル 0 のまま、譲歩と政治資本だけで申請が可決し、建つ', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  const skills = await page.evaluate(() => {
    const g = (window as unknown as { __game: { progress: () => { lessons: Record<string, unknown> } } }).__game;
    return Object.keys(g.progress().lessons).length;
  });
  expect(skills).toBe(0);

  // 住宅の列に続く 6 マスを工業に塗る（用途地域の変更の申請）
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await dragCells(page, [45, 46], [50, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 申請中（審査・反対の受付）でも、学習ライブラリとレッスンを開ける（S2）
  expect(['filed', 'zoning', 'objection']).toContain(await stageOf(page));
  await nav(page, '学ぶ').click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.goto('./#/learn/k8s.i.08');
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('lesson-screen')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();
  for (let i = 0; i < 40 && (await stageOf(page)) !== 'hearing'; i += 1) await days(page, 1);
  expect(await stageOf(page)).toBe('hearing');

  // 公聴会: 工場の音に譲歩（軽い工業に限る）、大型のトラックは押し切る（政治資本）。説明は出せない
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { world: { applications: { id: string }[] }; openHearing: (id: string) => void } } }).__cityStore.getState();
    s.openHearing(s.world.applications.at(-1)?.id ?? '');
  });
  const hearing = page.getByTestId('hearing-window');
  await hearing.locator('.hearing-issue[data-reason="rz-ind-noise"]').click();
  await expect(page.getByTestId('hearing-no-explain')).toBeVisible();
  await hearing.locator('[data-concession]:not([disabled])').first().click();
  const capital = () => page.evaluate(() => (window as unknown as { __cityStore: { getState: () => { world: { politics: { capital: number } } } } }).__cityStore.getState().world.politics.capital);
  const capital0 = await capital();
  await hearing.locator('.hearing-issue[data-reason="rz-ind-trucks"]').click();
  await page.getByTestId('hearing-push').click();
  expect(await capital()).toBeLessThan(capital0);
  await page.getByTestId('hearing-end').click();
  expect(await stageOf(page)).toBe('council');

  // 議会の日に可決 → 着工 → 完成（申し立てが立てば、追加の譲歩か政治資本で答える）
  for (let i = 0; i < 20 && (await stageOf(page)) === 'council'; i += 1) await days(page, 1);
  const vote = await page.evaluate(() => (window as unknown as { __cityStore: { getState: () => { world: { applications: { vote?: { passed: boolean } }[] } } } }).__cityStore.getState().world.applications.at(-1)?.vote?.passed);
  expect(vote).toBe(true);
  expect(['construction', 'appeal', 'done']).toContain(await stageOf(page));
  for (let i = 0; i < 40 && (await stageOf(page)) !== 'done'; i += 1) await days(page, 1);
  expect(await stageOf(page)).toBe('done');
  expect(errors).toEqual([]);
});

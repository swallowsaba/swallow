import { expect, test, type Page } from '@playwright/test';
import { closeStart } from './start';

/**
 * 選挙・任期・公約・政治資本（docs/development-plan.md G8・docs/game-design.md 21 章・docs/acceptance-criteria.md S16・S17）。
 *
 *   初回の操作説明の後に、1 期目の公約を選ぶ窓が出る（すでに満たしている物は押せない）→ 2 つ選ぶ
 *   → 学習の記録（レッスン 3 本とミッション 1 つ）→ 任期の最後の日の手前まで進める（任期の初めを 4 年前にずらす）
 *   → 8 週前の知らせ → 選挙の日に結果の窓（得票率・4×3 の表・落選なら敗因）
 *   → 同じ都市で再び立つ: 都市はそのまま・学習の記録は同じ・2 期目の公約を選ぶ
 *   → もう一度落選 → 新しい都市で始める: 新しい島・開発資金 1,500・1 期目、学習の記録は同じ
 *
 * 4 年を実際の時間で待つと 3 倍でも 16 分かかるので、任期の初めの日だけをずらす（選挙の日の計算と、得票の式は模擬のまま）。
 * 落選させるために、最後の週の層の支持だけを低い値にする（投票率と得票率は、その支持から模擬が計算する）
 */

type Politics = {
  capital: number; defeated?: true; difficulty: 'gentle' | 'normal' | 'tough';
  term: { no: number; startDay: number; pledges: { pledgeId: string }[] };
  pastTerms: { no: number; won: boolean; voteShare: number; causes?: unknown[] }[];
};
type W = {
  city: { day: number; seed: number; funds: number; population: number; zones: unknown[]; roads: unknown[] };
  politics: Politics;
  history: { breakdown: { week: number; layers?: number[] }[] };
};
type GameWindow = {
  __cityStore: { getState: () => { world: W; city: { day: number }; speed: number; paused: boolean; togglePause: () => void; tick: (s: number) => void; load: (w: W) => void } };
  __game: { learn: (records: unknown[]) => unknown; progress: () => unknown };
};

const TERM_DAYS = 208 * 7;
const WARN_DAYS = 8 * 7;

const RECORDS = [
  ...['linux.b.01', 'net.b.01', 'git.b.01'].map((lessonId, i) => ({
    kind: 'lesson', lessonId, at: `2026-10-0${String(i + 1)}T19:00:00+09:00`,
    quiz: [{ quizId: 'q1', correct: true }], practice: [{ success: true }], complete: true,
  })),
  { kind: 'mission', missionId: 'container-run', xp: 120, at: '2026-10-05T19:00:00+09:00' },
];

const world = (page: Page) => page.evaluate(() => (window as unknown as GameWindow).__cityStore.getState().world);
/** 学習の記録（保存して開き直すと鍵の並びが変わるので、並べ直して比べる） */
const progress = (page: Page) => page.evaluate(() => {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sorted((window as unknown as GameWindow).__game.progress()));
});

/** 都市の時計を n 日進め、模擬（Worker）が追いつくのを待つ */
async function days(page: Page, n: number): Promise<void> {
  const target = await page.evaluate((d) => {
    const s = (window as unknown as GameWindow).__cityStore.getState();
    if (s.paused) s.togglePause();
    const to = Math.floor(s.city.day + d);
    s.tick((d * 2) / s.speed);
    return to;
  }, n);
  await page.waitForFunction((t) => (window as unknown as GameWindow).__cityStore.getState().world.city.day >= t, target);
}

/**
 * 任期の初めの日をずらし、選挙の日（または 8 週前の知らせの日）が数日後に来るようにする。何日後かを返す。
 * 週の終わりの日は、週の計算が層の支持を作り直すので避ける。low を渡すと、最後の週の層の支持をその値にする
 */
async function shiftTerm(page: Page, when: 'election' | 'warn', low?: number): Promise<number> {
  if ((Math.floor((await world(page)).city.day) + 1) % 7 === 0) await days(page, 1);
  return page.evaluate(([until, lo, term, warn]) => {
    const s = (window as unknown as GameWindow).__cityStore.getState();
    const w = s.world;
    const day = Math.floor(w.city.day);
    const n = 1;
    const startDay = day + n + (until === 'warn' ? warn : 0) - term + 1;
    const breakdown = lo === null ? w.history.breakdown : w.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map(() => lo) }));
    s.load({ ...w, politics: { ...w.politics, term: { ...w.politics.term, startDay } }, history: { ...w.history, breakdown } });
    return n;
  }, [when, low ?? null, TERM_DAYS, WARN_DAYS] as const);
}

/** 公約を選ぶ窓で 2 つ選んで決める */
async function pledge(page: Page, a: string, b: string): Promise<void> {
  const picker = page.getByTestId('pledge-picker');
  await expect(picker).toBeVisible();
  await picker.locator(`[data-pledge="${a}"]`).click();
  await picker.locator(`[data-pledge="${b}"]`).click();
  await page.getByTestId('pledge-confirm').click();
  await expect(page.getByTestId('election-window')).toHaveCount(0);
}

/** 住宅と働く所を塗って、人が住むのを待つ（選挙に投票する人がいる都市にする） */
async function town(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as GameWindow).__cityStore.getState();
    s.load({ ...s.world, city: { ...s.world.city, funds: 5000 } });
  });
  const cell = (x: number, y: number) => page.evaluate(([cx, cy]) => (window as unknown as { __city: { screenOf: (x: number, y: number) => { sx: number; sy: number } } }).__city.screenOf(cx + 0.5, cy + 0.5), [x, y] as const);
  const drag = async (from: [number, number], to: [number, number]): Promise<void> => {
    const a = await cell(...from);
    const b = await cell(...to);
    await page.mouse.move(a.sx, a.sy);
    await page.mouse.down();
    await page.mouse.move(b.sx, b.sy, { steps: 8 });
    await page.mouse.up();
  };
  await page.evaluate(() => (window as unknown as { __city: { focusOn: (x: number, y: number) => void } }).__city.focusOn(46, 46));
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await drag([51, 46], [55, 46]);
  await page.getByTestId('build-zone-residential').click();
  await drag([38, 48], [50, 48]);
  await drag([38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 56);
  expect((await world(page)).city.population).toBeGreaterThan(0);
}

test.setTimeout(240_000);

test('G8: 4 年が過ぎると選挙。落選すると敗因が出て、同じ都市で再び立つ・新しい都市で始めるのどちらでも学習の記録は変わらない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await closeStart(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);

  // 初回の操作説明の後に、1 期目の公約を選ぶ窓（開いている間は時間が止まる）
  await expect(page.getByTestId('election-window')).toHaveAttribute('data-mode', 'term');
  await expect(page.locator('#election-title')).toHaveText('1 期目の公約を選ぶ');
  // 人が住む前の島では「人口を 2 割増やす」はすでに満たしている（0 ≥ 0）ので押せない
  await expect(page.locator('[data-pledge="pop-grow"]')).toBeDisabled();
  await pledge(page, 'it-two', 'treasury-up');
  expect((await world(page)).politics.term.pledges.map((p) => p.pledgeId)).toEqual(['it-two', 'treasury-up']);
  // 上の帯に政治資本と任期の残り
  await expect(page.getByTestId('topbar-capital')).toContainText('10');
  await expect(page.getByTestId('topbar-term')).toContainText('208');

  await page.evaluate((r) => (window as unknown as GameWindow).__game.learn(r), RECORDS);
  // ミッションの達成で政治資本 +3（同じミッションは 1 度だけ）
  await expect.poll(async () => (await world(page)).politics.capital).toBe(13);
  const learned = await progress(page);
  await town(page);

  // 8 週前に「選挙が近い」と知らせる。押すと今の見込み（4×3 の表）
  await days(page, await shiftTerm(page, 'warn'));
  const notice = page.getByTestId('city-notice');
  // 知らせは 3 秒ずつ順に出る（前の知らせが並んでいれば、その後に出る）
  await expect(notice).toContainText('選挙まで 8 週', { timeout: 20_000 });
  await notice.click();
  await expect(page.getByTestId('election-window')).toHaveAttribute('data-mode', 'preview');
  await expect(page.getByTestId('election-table').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('election-pledges')).toContainText('IT 施設を 2 つ完成させる');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('election-window')).toHaveCount(0);

  // 選挙の日（任期の最後の日）。層の支持が低いと落選する
  await days(page, await shiftTerm(page, 'election', 25));
  const win = page.getByTestId('election-window');
  await expect(win).toHaveAttribute('data-mode', 'result');
  await expect(page.getByTestId('election-verdict')).toHaveText('落選');
  const past = (await world(page)).politics.pastTerms.at(-1);
  expect(past?.no).toBe(1);
  expect(past?.won).toBe(false);
  await expect(page.getByTestId('election-share')).toHaveText((Math.round((past?.voteShare ?? 0) * 10) / 10).toLocaleString('ja-JP'));
  // 敗因（層・要因・決定）と、学習の記録は消えないという添え書き
  await expect(page.getByTestId('election-causes').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('election-keep')).toHaveText('どちらを選んでも、学習の記録（XP・スキル・レッスンの進み・ミッション）は消えない');
  await expect(page.getByTestId('topbar-term')).toContainText('落選');

  // 落選の間も学べる（学習にロックを掛けない）。都市の日は進まない
  const dayLost = (await world(page)).city.day;
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name: '学ぶ' }).click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await page.waitForTimeout(2500);
  expect((await world(page)).city.day).toBe(dayLost);

  // 同じ都市で再び立つ: 都市はそのまま、学習の記録は同じ、政治資本は 10 に戻り、2 期目の公約を選ぶ
  const zones = (await world(page)).city.zones.length;
  await page.getByTestId('topbar-term').click();
  await page.getByTestId('election-rerun').click();
  await expect(page.getByTestId('election-window')).toHaveAttribute('data-mode', 'term');
  await expect(page.getByTestId('election-summary')).toContainText('1 期目');
  await pledge(page, 'jobs-grow', 'missions-two');
  const again = await world(page);
  expect(again.politics.term.no).toBe(2);
  expect(again.politics.capital).toBe(10);
  expect(again.city.zones.length).toBe(zones);
  expect(await progress(page)).toBe(learned);
  await days(page, 1);

  // もう一度落選して、新しい都市で始める: 新しい島で村から、開発資金 1,500・1 期目。学習の記録は同じ
  const seed = again.city.seed;
  await days(page, await shiftTerm(page, 'election', 25));
  await expect(page.getByTestId('election-verdict')).toHaveText('落選');
  // 保存が書き終わるのを待ってから置き換える（自動保存は操作の 2 秒後）
  await page.waitForTimeout(2600);
  await Promise.all([page.waitForEvent('load'), page.getByTestId('election-new-city').click()]);
  await page.waitForFunction((s) => {
    const w = (window as unknown as Partial<GameWindow>).__cityStore?.getState().world;
    return document.body.dataset.cityReady === '1' && w !== undefined && w.city.seed !== s;
  }, seed);
  const fresh = await world(page);
  expect(fresh.city.funds).toBe(1500);
  expect(fresh.city.zones).toEqual([]);
  expect(fresh.politics.term.no).toBe(1);
  expect(fresh.politics.defeated).toBeUndefined();
  expect(await progress(page)).toBe(learned);
  await expect(page.getByTestId('city-notice')).toContainText('学習の記録');
  // 新しい都市は始め方を選んでから（docs/ui-design.md 10.12）。開いている間は時間が止まり、公約の窓は後
  await expect(page.getByTestId('start-window')).toBeVisible();
  await expect(page.getByTestId('election-window')).toHaveCount(0);
  await page.getByTestId('start-mode-tough').click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('start-window')).toHaveCount(0);
  const tough = await world(page);
  expect([tough.politics.difficulty, tough.politics.capital]).toEqual(['tough', 7]);
  // 新しい都市の 1 期目の公約を選ぶ窓（操作説明は 1 度見たので出ない）
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await expect(page.locator('#election-title')).toHaveText('1 期目の公約を選ぶ');
  expect(errors).toEqual([]);
});

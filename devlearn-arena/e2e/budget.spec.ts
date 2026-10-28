import { expect, test, type Page } from '@playwright/test';

/**
 * 請願・予算・税率・市内新聞（docs/development-plan.md G9・docs/game-design.md 22 章）。
 *
 *   住宅と工場を塗って人が住むのを待つ → 家賃が上がる（需給の倍率を高くする）→ 低い収入の世帯の負担が 35% を超えた地区から請願が届く（知らせ）
 *   → 受信箱（I）: 届いた理由の値・受理の効き → 受理 → 次の週から、その地区の家賃が下がり、財政から毎週払う。新聞に載る
 *   → 予算（F）: 税率のつまみを 15% にして決める → 決めた週は 10% のまま、次の週から 15%・税収が増え、満足の「税」の点が下がる。新聞に載る（N）
 *   → 財政が赤字でも、学習ライブラリ・レッスン・ミッションへ行ける。開発資金は変わらない（docs/game-design.md 20 章・22.2）
 */

type Inbox = { id: string; petitionId: string; district?: number }[];
type W = {
  city: { day: number; funds: number; population: number };
  sim: { week: number; rentFactor: number };
  budget: { treasury: number; taxRate: number; pendingTaxRate?: number; ledger: { week: number; income: { residents: number; businesses: number }; spend: { petitions: number } }[] };
  petitions: { inbox: Inbox; handled: Record<string, { choice: string }>; effects: { petitionId: string; untilWeek: number; district?: number }[] };
  history: { news: { kind: string; headline: string }[]; breakdown: { week: number; factors: number[][] }[] };
};
type Store = {
  getState: () => { speed: number; paused: boolean; togglePause: () => void; tick: (s: number) => void; city: { day: number }; world: W; load: (w: unknown) => void };
};
const store = (page: Page) => page.evaluate(() => (window as unknown as { __cityStore: Store }).__cityStore.getState().world);

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
/** 次の週の終わりまで */
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

/** 一般道の両側に住宅、東に工場を塗り、人が住むのを待つ（公約の窓は閉じる） */
async function town(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await expect(page.getByTestId('election-window')).toBeVisible();
  await page.getByTestId('election-window').getByRole('button', { name: '閉じる' }).click();
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    s.load({ ...s.world, city: { ...s.world.city, funds: 5000 } });
  });
  await page.evaluate(() => (window as unknown as { __city: { focusOn: (x: number, y: number) => void } }).__city.focusOn(46, 46));
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

test('家賃の負担が上がった地区から請願が届き、受理すると、その地区の家賃の補助が始まり、財政から毎週払われる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  // 家賃が上がる: 空き室が無い時の需給の倍率（1.8。毎週 0.03 ずつしか動かない）にする
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    s.load({ ...s.world, sim: { ...s.world.sim, rentFactor: 1.8 }, petitions: { inbox: [], handled: {}, effects: [] } });
  });
  // 家賃の請願（低い収入・子育て・高齢のどれか。どの層が残っているかは町の育ち方で決まる）と、その中身（content/politics/petitions.json）
  const RENT: Record<string, { title: string; weekly: number; weeks: number; pct: number }> = {
    'rent-low': { title: '家賃が上がって、もう住み続けられない', weekly: 6, weeks: 12, pct: 10 },
    'rent-family': { title: '子ども部屋のある家に移れない', weekly: 5, weeks: 16, pct: 8 },
    'rent-senior': { title: '年金の暮らしに、家賃の値上げがこたえる', weekly: 4, weeks: 8, pct: 15 },
  };
  const rentEntry = (w: W) => w.petitions.inbox.find((p) => p.petitionId in RENT);
  for (let i = 0; i < 3 && !rentEntry(await store(page)); i += 1) await weekEnd(page);
  const w0 = await store(page);
  const entry = rentEntry(w0);
  expect(entry?.district).toBeDefined();
  const rent = RENT[entry?.petitionId ?? ''] ?? { title: '?', weekly: 0, weeks: 0, pct: 0 };

  // 受信箱（I）: 届いた理由の値と、受理の効き・拒否で下がる信頼を押す前に示す
  await page.keyboard.press('i');
  const inbox = page.getByTestId('inbox-window');
  await expect(inbox).toBeVisible();
  const row = page.getByTestId(`petition-${entry?.id ?? ''}`);
  await expect(row).toContainText(rent.title);
  await expect(row.getByTestId('petition-basis')).toContainText(/収入の世帯の家賃の負担が \d+(\.\d)?%/);
  await expect(row).toContainText(`家賃を ${String(rent.pct)}% 下げる（${String(rent.weeks)} 週）`);
  await expect(row).toContainText(`毎週 ${String(rent.weekly)} × ${String(rent.weeks)} 週`);
  await expect(row).toContainText('信頼 -2');
  // 上の帯の市政の入口の数の印に、届いた請願が入る
  await expect(page.getByTestId('topbar-civic-badge')).toBeVisible();
  await row.getByTestId('petition-accept').click();
  // 知らせは 3 秒ずつ順に出る（届いた知らせ・支持率の知らせの後）
  await expect(page.getByTestId('city-notice')).toContainText('受理した', { timeout: 15_000 });
  const w1 = await store(page);
  expect(w1.petitions.handled[entry?.petitionId ?? '']?.choice).toBe('accept');
  expect(w1.petitions.effects.map((e) => [e.petitionId, e.district])).toEqual([[entry?.petitionId, entry?.district]]);

  // 次の週: 請願の毎週の費用が財政から引かれる（財政 = 前の週 + 税収 − 支出）
  await weekEnd(page);
  const w2 = await store(page);
  const row2 = w2.budget.ledger.at(-1);
  expect(row2?.spend.petitions).toBe(rent.weekly);
  await page.keyboard.press('f');
  await expect(page.getByTestId('ledger-petitions')).toContainText(String(rent.weekly));
  // 新聞（N）に、請願の受理の記事
  await page.keyboard.press('n');
  await expect(page.getByTestId('news-window')).toContainText(rent.title);
  expect(errors).toEqual([]);
});

test('税率を上げると、決めた週はそのまま、次の週から税収が増え、満足の「税」の点が下がる。新聞に載る', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  await weekEnd(page);
  const taxPoints = (w: W): number => (w.history.breakdown.at(-1)?.factors[10] ?? []).reduce((a, b) => a + b, 0);
  const before = await store(page);

  // 上の帯の財政を押すと予算の窓。つまみを 15% にすると、見込みの税収と層ごとの税の点が出る
  await page.getByTestId('topbar-treasury').click();
  const budget = page.getByTestId('budget-window');
  await expect(budget).toBeVisible();
  await expect(budget).toContainText('開発資金は学習で増える。ここでは使わない');
  await page.getByTestId('tax-slider').fill('15');
  await expect(page.getByTestId('tax-layers')).toBeVisible();
  await expect(page.getByTestId('tax-income')).toContainText('+');
  await page.getByTestId('tax-apply').click();
  await expect(page.getByTestId('city-notice')).toContainText('税率を 15% に決めた', { timeout: 15_000 });
  expect((await store(page)).budget).toMatchObject({ taxRate: 10, pendingTaxRate: 15 });

  // 決めた週の終わり: 税収はまだ 10% のまま。終わりに 15% になる
  await weekEnd(page);
  const w1 = await store(page);
  expect(w1.budget.taxRate).toBe(15);
  // 次の週: 世帯ひとりあたりの住民の税が 1.5 倍になり、税の点が下がる
  await weekEnd(page);
  const w2 = await store(page);
  const perHead = (w: W): number => (w.budget.ledger.at(-1)?.income.residents ?? 0) / Math.max(1, w.city.population);
  expect(perHead(w2) / perHead(before)).toBeGreaterThan(1.3);
  expect(taxPoints(w2)).toBeLessThan(taxPoints(before));

  // 新聞（市政の引き出しから）: 「税率 10% から 15% へ引き上げ」
  await page.getByTestId('topbar-civic').click();
  await page.getByTestId('civic-news').click();
  await expect(page.getByTestId('news-window')).toContainText('税率 10% から 15% へ引き上げ');
  expect(errors).toEqual([]);
});

test('財政が赤字でも、学習ライブラリ・レッスン・ミッションへ行ける。開発資金は変わらない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await town(page);
  await page.evaluate(() => {
    const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
    s.load({ ...s.world, budget: { ...s.world.budget, treasury: -800 } });
  });
  const funds = (await store(page)).city.funds;
  await weekEnd(page);
  await expect(page.getByTestId('topbar-treasury')).toHaveClass(/is-deficit/);
  await expect(page.getByTestId('topbar-treasury')).toContainText('赤字');
  expect((await store(page)).city.funds).toBe(funds);

  // 予算の窓を開いたまま、上の帯の「学ぶ」から学習ライブラリへ → 入口の札
  await page.keyboard.press('f');
  await expect(page.getByTestId('budget-treasury')).toContainText('赤字');
  const nav = (name: string) => page.getByRole('navigation', { name: '画面への入口' }).getByRole('button', { name });
  await nav('学ぶ').click();
  await expect(page.getByTestId('learn-view-list')).toBeVisible();
  await page.locator('[data-lesson]').first().click();
  await expect(page.getByTestId('entry-card').or(page.getByTestId('lesson-screen'))).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();

  // ミッションも始められる
  await nav('ミッション').click();
  await page.locator('[data-testid^="mission-row-"]').first().click();
  await page.getByTestId('mission-start').click();
  await expect(page.getByTestId('mission-screen')).toBeVisible();
  await page.goto('./#/city');
  await expect(page.getByTestId('city-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

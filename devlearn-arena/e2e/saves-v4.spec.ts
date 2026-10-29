import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeStart } from './start';

/**
 * 版 4 の保存データの E2E（docs/testing-strategy.md 10.5・docs/acceptance-criteria.md S29・docs/data-model.md 12 章）。
 *
 * - 版 3 の保存データ（模擬と市政の項目が無い形）を設定の「読み込み」から読むと版 4 に移り、
 *   都市規模の差が 1% 以内、学習の記録と開発資金が変わらず、移した瞬間に停電しない
 * - 版 4 の書き出し・読み込みで、市政の状態（申請・政治資本・予算・模擬）が全て元に戻る
 *
 * 版 3 のファイルは、遊んだ都市を書き出し、tools/v3-save.mts で版 3 の形にして作る（src/save/saveData.test.ts の v3Save と同じ作り方）。
 */

type Store = {
  getState: () => {
    paused: boolean; speed: number; togglePause: () => void; tick: (s: number) => void;
    city: { day: number; funds: number; population: number };
    world: Record<string, unknown> & { city: { day: number; funds: number; population: number }; sim: { power: { recent?: string[][] } }; applications: { stage: string }[] };
    load: (w: unknown) => void;
  };
};
type GameWindow = Window & { __cityStore: Store; __game: { learn: (r: unknown[]) => unknown; progress: () => unknown }; __city: { screenOf: (x: number, y: number) => { sx: number; sy: number }; focusOn: (x: number, y: number) => void } };

const RECORDS = ['linux.b.01', 'net.b.01', 'db.b.01'].map((lessonId, i) => ({
  kind: 'lesson', lessonId, at: `2026-10-0${String(i + 1)}T19:00:00+09:00`,
  quiz: [{ quizId: 'q1', correct: true }, { quizId: 'q2', correct: i !== 1 }],
  practice: [{ success: true, hintsUsed: i }],
  complete: true,
}));

test.setTimeout(180_000);

const sorted = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;

async function open(page: Page): Promise<void> {
  await page.goto('#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await closeStart(page);
  if (await page.getByTestId('intro').count()) await page.keyboard.press('Escape');
  const pledges = page.getByTestId('election-window');
  if (await pledges.count()) await pledges.getByRole('button', { name: '閉じる' }).click();
}

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

async function dragCells(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const at = (x: number, y: number) => page.evaluate(([cx, cy]) => (window as unknown as GameWindow).__city.screenOf(cx + 0.5, cy + 0.5), [x, y] as const);
  const a = await at(...from);
  const b = await at(...to);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move(b.sx, b.sy, { steps: 8 });
  await page.mouse.up();
}

/** 学んで、住宅と工場を塗り、人が住むまで進めた都市。止めて、書き出したファイルを返す */
async function playedAndExported(page: Page): Promise<string> {
  await open(page);
  await page.evaluate((r) => (window as unknown as GameWindow).__game.learn(r), RECORDS);
  await page.evaluate(() => (window as unknown as GameWindow).__city.focusOn(46, 46));
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-industrial').click();
  await dragCells(page, [51, 46], [55, 46]);
  await page.getByTestId('build-zone-residential').click();
  await dragCells(page, [38, 48], [50, 48]);
  await dragCells(page, [38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 56);
  await page.evaluate(() => {
    const s = (window as unknown as GameWindow).__cityStore.getState();
    if (!s.paused) s.togglePause();
  });
  return exportTo(page);
}

async function exportTo(page: Page): Promise<string> {
  await page.getByTestId('topbar').getByRole('button', { name: '設定' }).click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す', exact: true }).click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'devlearn-e2e-')), download.suggestedFilename());
  await download.saveAs(file);
  await page.goto('#/city');
  return file;
}

/** 保存の無い別のブラウザで、ファイルを設定の「読み込み」から読んで置き換える */
async function importInto(browser: Browser, file: string, preview: string | RegExp): Promise<Page> {
  const other = await browser.newContext();
  const page = await other.newPage();
  await open(page);
  await page.getByTestId('topbar').getByRole('button', { name: '設定' }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId('import-preview')).toContainText(preview);
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '置き換える' }).click()]);
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await closeStart(page);
  return page;
}

test('S29: 版 3 の保存データを読み込むと版 4 に移り、都市規模の差が 1% 以内、学習の記録と開発資金が変わらず、移した瞬間に停電しない', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const v4file = await playedAndExported(page);
  const v4 = JSON.parse(readFileSync(v4file, 'utf8')) as Record<string, unknown> & { version: number; city: { population: number; funds: number } };
  expect(v4.version).toBe(4);
  expect(v4.city.population).toBeGreaterThan(0);

  // 版 3 の形にする（版 4 の項目を除き、都市規模は版 3 の数え方。tools/v3-save.mts）
  const v3file = v4file.replace(/\.json$/, '-v3.json');
  execFileSync('npx', ['vite-node', 'tools/v3-save.mts', v4file, v3file], { shell: true });
  const v3 = JSON.parse(readFileSync(v3file, 'utf8')) as { version: number; city: { population: number } };
  expect(v3.version).toBe(3);

  const page2 = await importInto(browser, v3file, '古い版（版 3）');
  const after = await page2.evaluate(() => {
    const w = window as unknown as GameWindow;
    const s = w.__cityStore.getState();
    return { population: s.world.city.population, funds: s.world.city.funds, off: s.world.sim.power.recent?.at(-1)?.length ?? 0, progress: JSON.stringify(w.__game.progress()) };
  });
  const before = await page.evaluate(() => JSON.stringify((window as unknown as GameWindow).__game.progress()));
  expect(Math.abs(after.population - v3.city.population) / v3.city.population).toBeLessThanOrEqual(0.01);
  expect(after.funds).toBe(v4.city.funds);
  expect(JSON.stringify(sorted(JSON.parse(after.progress)))).toBe(JSON.stringify(sorted(JSON.parse(before))));
  expect(after.off).toBe(0);
  await expect(page2.getByText('保存データを読み込んだ')).toBeVisible();
  expect(errors).toEqual([]);
});

test('S29: 版 4 の書き出し・読み込みで、申請・政治資本・予算・模擬の市政の状態が全て元に戻る', async ({ page, browser }) => {
  await playedAndExported(page);
  // 住宅のそばにデータセンターを置いて申請（反対の理由と割合が付く）
  await page.getByTestId('build-group-facility').click();
  await page.getByTestId('facility-shelf-base').click();
  await page.getByTestId('build-facility-datacenter').click();
  const spot = await page.evaluate(() => (window as unknown as GameWindow).__city.screenOf(46.5, 45.5));
  await page.mouse.move(spot.sx, spot.sy, { steps: 2 });
  await page.mouse.click(spot.sx, spot.sy);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 10);
  await page.evaluate(() => {
    const s = (window as unknown as GameWindow).__cityStore.getState();
    if (!s.paused) s.togglePause();
  });
  const civic = () => page.evaluate(() => {
    const w = (window as unknown as GameWindow).__cityStore.getState().world;
    return JSON.stringify({ applications: w.applications, politics: w.politics, budget: w.budget, petitions: w.petitions, rewards: w.rewards, sim: w.sim, history: w.history, day: w.city.day });
  });
  const mine = JSON.parse(await civic()) as { applications: { stage: string }[] };
  expect(mine.applications.length).toBeGreaterThan(0);
  const file = await exportTo(page);
  const before = JSON.stringify(sorted(JSON.parse(await civic())));

  const page2 = await importInto(browser, file, '修了');
  const got = await page2.evaluate(() => {
    const w = (window as unknown as GameWindow).__cityStore.getState().world;
    return JSON.stringify({ applications: w.applications, politics: w.politics, budget: w.budget, petitions: w.petitions, rewards: w.rewards, sim: w.sim, history: w.history, day: w.city.day });
  });
  expect(JSON.stringify(sorted(JSON.parse(got)))).toBe(before);
});

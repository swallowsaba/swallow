import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { summaryOf } from '../tools/sim-summary.mjs';
import { closeStart } from './start';

/**
 * 決定性（docs/testing-strategy.md 10.1・docs/acceptance-criteria.md S6）:
 * 画面の Web Worker で流した結果と、同じ関数を直接呼んだ結果（tools/sim-direct.mts。Worker と同じ SimRunner）が等しい。
 *
 * 見本の町（src/sim/__fixtures__/cities.ts の town）に、日付の付いた命令の列（資金・公約・住宅のそばのサーバ施設の申請・
 * 工業区画・税率）を与えて 12 週進め、要約（人口・支持率・反対率・採決・財政。tools/sim-summary.mjs）を比べる。
 * 画面では、止めた都市で命令を出してから 1 日ずつ進める（命令は日の区切りで当たる。docs/architecture.md 9.1）
 */

type Op = Record<string, unknown> & { kind: string };
type Store = {
  getState: () => {
    paused: boolean; speed: number; togglePause: () => void; tick: (s: number) => void; dispatch: (op: Op) => void; load: (w: unknown) => void;
    world: { city: { day: number } };
  };
};
type W = Window & { __cityStore: Store };

const DAYS = 84;
const COMMANDS: { day: number; op: Op }[] = [
  { day: 7, op: { kind: 'funds', amount: 5000 } },
  { day: 7, op: { kind: 'pledges', ids: ['it-two', 'treasury-up'] } },
  { day: 7, op: { kind: 'facility', type: 'server', origin: { x: 51, y: 45 }, rotation: 0 } },
  { day: 7, op: { kind: 'zone', zone: 'industrial', a: { x: 44, y: 37 }, b: { x: 47, y: 37 } } },
  { day: 21, op: { kind: 'taxRate', rate: 12 } },
];

test.setTimeout(240_000);

test('S6: 同じ町と同じ命令の列から、画面の Worker で流した結果と、同じ関数を直接呼んだ結果が等しい', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'devlearn-sim-'));
  const worldFile = join(dir, 'world.json');
  const commandsFile = join(dir, 'commands.json');
  const directFile = join(dir, 'direct.json');
  execFileSync('npx', ['vite-node', 'tools/sim-direct.mts', 'world', worldFile], { shell: true });
  writeFileSync(commandsFile, JSON.stringify(COMMANDS.map((c, i) => ({ seq: i + 1, ...c }))));
  execFileSync('npx', ['vite-node', 'tools/sim-direct.mts', 'run', worldFile, commandsFile, String(DAYS), directFile], { shell: true });
  const direct = JSON.parse(readFileSync(directFile, 'utf8')) as ReturnType<typeof summaryOf>;

  // 画面: 見本の町を読み込み、止めたまま、命令の日が来たら出してから 1 日ずつ進める
  await page.goto('#/city');
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await closeStart(page);
  if (await page.getByTestId('intro').count()) await page.keyboard.press('Escape');
  const world = JSON.parse(readFileSync(worldFile, 'utf8')) as { city: { day: number } };
  await page.evaluate((w) => {
    const s = (window as unknown as W).__cityStore.getState();
    s.load(w);
    if (!s.paused) s.togglePause();
  }, world);
  const start = world.city.day;
  for (let d = start; d <= start + DAYS; d += 1) {
    const due = COMMANDS.filter((c) => c.day === d).map((c) => c.op);
    if (due.length) await page.evaluate((ops) => { for (const op of ops) (window as unknown as W).__cityStore.getState().dispatch(op); }, due);
    // 公約を選ぶ窓が開いていれば閉じる（開いている間は時間が止まる。公約は命令で選んだ）
    const pledges = page.getByTestId('election-window');
    if (await pledges.count()) await pledges.getByRole('button', { name: '閉じる' }).click();
    if (d === start + DAYS) break;
    await page.evaluate(() => {
      const s = (window as unknown as W).__cityStore.getState();
      if (s.paused) s.togglePause();
      s.tick(2 / s.speed);
      if (!s.paused) s.togglePause();
    });
    await page.waitForFunction((t) => Math.floor((window as unknown as W).__cityStore.getState().world.city.day) >= t, d + 1);
  }
  const shown = summaryOf(await page.evaluate(() => (window as unknown as W).__cityStore.getState().world));

  // 命令が本当に効いている（申請が出て、採決まで進んだ）
  const apps = (direct as { applications: { kind: string; passed: boolean | null }[] }).applications;
  expect(apps.some((a) => a.kind === 'facility' && a.passed !== null)).toBe(true);
  expect(shown).toEqual(direct);
});

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * ゲームループの E2E（docs/acceptance-criteria.md 1 章・docs/development-plan.md Phase 8）。
 *
 *   都市を表示 → 都市を操作 → 建物を選択 → 学習コンテンツを選択 → 解説 → 理解 → クイズ
 *   → 実戦 → 結果 → まとめ → XP / スキル → 都市が発展
 *
 * 利用者の操作（クリック・ドラッグ・キー）だけで 1 周する。答えは見本のレッスン found.b.04 のデータから読む。
 */

interface Choice { id: string; correct: boolean }
interface Lesson {
  understand: ({ kind: 'figure-pick'; answer: string[] } | { kind: 'match'; pairs: [string, string][] } | { kind: 'yesno'; answer: boolean })[];
  quiz: { id: string; choices: Choice[] }[];
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as T;
const lesson = read<Lesson>('content/lessons/found/found.b.04.json');
const words = new Map(read<{ terms: { id: string; word: string }[] }>('content/glossary/found.json').terms.map((t) => [t.id, t.word]));
const plain = (rich: string): string => rich.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, id: string) => words.get(id) ?? id).replace(/`/g, '');

/** マスの中心の、画面の上の位置 */
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([cx, cy]) => (window as unknown as { __city: { screenOf: (x: number, y: number) => { sx: number; sy: number } } }).__city.screenOf(cx + 0.5, cy + 0.5), [x, y] as const);

const cityState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __cityStore: { getState: () => { city: { funds: number; facilities: { type: string; level: number }[] }; selected: unknown } } }).__cityStore.getState();
    return { funds: s.city.funds, facilities: s.city.facilities.map((f) => `${f.type}:${String(f.level)}`), selected: s.selected };
  });

/**
 * 施設がその Lv で動き出すまで、都市の時計を 7 日ずつ進める（申請 → 審議 → 工事。docs/game-design.md 15 章）。
 * 模擬は Worker で動くので、進めた日まで追いつくのを待つ
 */
async function untilBuilt(page: Page, type: string, level: number): Promise<void> {
  type Store = { getState: () => { speed: number; paused: boolean; togglePause: () => void; tick: (s: number) => void; city: { day: number }; world: { city: { day: number; facilities: { type: string; level: number; state: string }[] } } } };
  for (let i = 0; i < 30; i += 1) {
    const done = await page.evaluate(([t, lv]) => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.facilities.some((f) => f.type === t && f.level >= Number(lv) && f.state === 'active'), [type, level] as const);
    if (done) return;
    const target = await page.evaluate(() => {
      const s = (window as unknown as { __cityStore: Store }).__cityStore.getState();
      if (s.paused) s.togglePause();
      const to = Math.floor(s.city.day + 7);
      s.tick((7 * 2) / s.speed);
      return to;
    });
    await page.waitForFunction((t) => (window as unknown as { __cityStore: Store }).__cityStore.getState().world.city.day >= t, target);
  }
  throw new Error(`${type} が Lv${String(level)} で完成しない`);
}

async function dragCells(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move(b.sx, b.sy, { steps: 8 });
  await page.mouse.up();
}

test.setTimeout(120_000);

test('都市を作り、施設から学び、7 段を通して都市へ戻ると、変化の場所へカメラが寄り、施設を上げられる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // G1: 起動直後に都市画面
  await page.goto('./');
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');

  // 初回の操作説明（docs/ui-design.md 9 章）: 3 回に分けて、Enter で読み進める
  for (const n of ['1', '2', '3']) {
    await expect(page.getByTestId('intro')).toHaveAttribute('data-step', n);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('intro')).toHaveCount(0);
  // 1 期目の公約を選ぶ窓（G8）。この E2E では選ばずに閉じる（上の帯の任期の残りから、後で選べる）
  await expect(page.getByTestId('election-window')).toBeVisible();
  await page.getByTestId('election-window').getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByTestId('election-window')).toHaveCount(0);

  // G2: 移動・拡大縮小・回転（キーボード）。同じマスの画面の位置が変わる
  for (const key of ['d', '+', 'e']) {
    const before = await at(page, 48, 47);
    // 移動はキーを押している間だけ進む
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
    await expect.poll(async () => JSON.stringify(await at(page, 48, 47))).not.toBe(JSON.stringify(before));
  }
  for (const key of ['q', '-']) await page.keyboard.press(key);
  await page.evaluate(() => (window as unknown as { __city: { focusOn: (x: number, y: number) => void } }).__city.focusOn(48, 47));

  // 都市を形づくる: 住宅の区画を塗り、市立 IT 学院を初めの道路の北に置く
  await page.getByTestId('build-group-zone').click();
  await page.getByTestId('build-zone-residential').click();
  await dragCells(page, [47, 46], [55, 46]);
  await page.getByTestId('build-group-facility').click();
  await page.getByTestId('facility-shelf-base').click();
  await page.getByTestId('build-facility-academy').click();
  const spot = await at(page, 41, 45);
  await page.mouse.move(spot.sx, spot.sy, { steps: 2 });
  await page.mouse.click(spot.sx, spot.sy);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 置くと申請になる（docs/game-design.md 15 章）。まだ都市には無く、敷地に囲いと看板が立つ
  await expect.poll(async () => (await cityState(page)).facilities).toEqual([]);
  // 申請中の敷地を押すと、情報パネルに段階と「ここで学ぶ」、申請の詳細の窓が開く（申請中の施設からも学べる）
  const site = await at(page, 41, 45);
  await page.mouse.click(site.sx, site.sy);
  await expect(page.getByTestId('permit-window')).toContainText('用途地域の審査');
  await expect(page.getByTestId('info-state')).toContainText('申請中');
  await expect(page.getByTestId('info-lessons').locator('button')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 審議と工事（基礎 → 骨組み → 完成）が終わるまで、都市の時計を進める
  await untilBuilt(page, 'academy', 1);
  await expect.poll(async () => (await cityState(page)).facilities).toEqual(['academy:1']);

  // G3: 施設を選ぶと情報パネル。まだ上げられない（スキルが足りない）
  await page.keyboard.press('Tab');
  const panel = page.getByTestId('info-panel');
  await expect(panel).toContainText('市立 IT 学院');
  await expect(page.getByTestId('info-upgrade-blocked')).toContainText('「初級」以上になると上げられる');
  await expect(page.getByTestId('info-upgrade')).toHaveCount(0);

  // 学習コンテンツを選ぶ: 学習ライブラリ（施設の分野で絞る）→ 入口の札 → このまま始める
  await page.getByTestId('info-library').click();
  await page.locator('[data-lesson="found.b.04"]').click();
  await expect(page.getByTestId('entry-card')).toContainText('ファイルとディレクトリ');
  await page.getByTestId('entry-start').click();
  await expect(page.getByTestId('lesson-screen')).toBeVisible();
  await expect(page.getByTestId('lesson-facility')).toHaveText('市立 IT 学院');
  const next = page.getByTestId('lesson-next');

  // G4: 解説（5 画面）
  await expect(page.getByTestId('stage-explain')).toBeVisible();
  for (let i = 0; i < 5; i += 1) await next.click();

  // 理解
  await expect(page.getByTestId('stage-understand')).toBeVisible();
  for (const item of lesson.understand) {
    if (item.kind === 'figure-pick') {
      for (const part of item.answer) await page.locator(`[data-testid="lesson-figure"] [data-part="${part}"]`).dispatchEvent('click');
    } else if (item.kind === 'match') {
      for (const [a, b] of item.pairs) {
        await page.locator('.match-col').first().locator('.match-item', { hasText: plain(a) }).click();
        await page.locator('.match-col').last().locator('.match-item', { hasText: b }).click();
      }
      await page.locator('.stage-check').click();
    } else {
      await page.locator('.yesno-button', { hasText: item.answer ? 'はい' : 'いいえ' }).click();
    }
    await expect(page.getByTestId('feedback')).toContainText('その通り');
    await next.click();
  }

  // クイズ（全て初回で正解）
  await expect(page.getByTestId('stage-quiz')).toBeVisible();
  for (const q of lesson.quiz) {
    await expect(page.getByTestId('quiz-question')).toHaveAttribute('data-quiz', q.id);
    for (const c of q.choices.filter((x) => x.correct)) await page.locator(`.choice-button[data-choice="${c.id}"]`).click();
    await page.getByTestId('quiz-submit').click();
    await expect(page.getByTestId('feedback')).toContainText('正解 +5 XP');
    await next.click();
  }

  // 実戦: わざと誤る → エラーの案内（内容 → 原因候補）→ 打ち直して成功
  await expect(page.getByTestId('stage-practice')).toBeVisible();
  await page.locator('.term-host .xterm').waitFor();
  await page.locator('.term-host').click();
  await page.keyboard.type('cd /srv/ap');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('practice-error')).toContainText('No such file or directory');
  await page.keyboard.type('cd /srv/app');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('practice-afterward')).toContainText('/srv/app');
  await next.click();

  // 結果 → まとめ → XP / スキル
  await expect(page.getByTestId('stage-result')).toHaveAttribute('data-result', 'success');
  await next.click();
  await expect(page.getByTestId('stage-summary')).toBeVisible();
  await next.click();
  // G5: XP とスキル
  const done = page.getByTestId('stage-done');
  await expect(done).toBeVisible();
  await expect(page.getByTestId('done-xp')).toContainText('まとめまで到達');
  const fundsBefore = (await cityState(page)).funds;

  // G6: 都市へ戻ると、変化の場所（市立 IT 学院）へカメラが寄り、選ばれ、知らせが出る
  await page.getByTestId('lesson-to-city').click();
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await expect(page.locator('.city-notice')).toContainText('市立 IT 学院を Lv2 に上げられるようになった');
  await expect(panel).toContainText('市立 IT 学院');
  const centerOf = () => page.evaluate(() => {
    const w = window as unknown as {
      __city: { screenOf: (x: number, y: number) => { sx: number; sy: number } };
      __cityStore: { getState: () => { city: { facilities: { origin: { x: number; y: number } }[] } } };
    };
    const f = w.__cityStore.getState().city.facilities[0];
    // 市立 IT 学院は 3×3
    const p = w.__city.screenOf((f?.origin.x ?? 0) + 1.5, (f?.origin.y ?? 0) + 1.5);
    return Math.hypot(p.sx - window.innerWidth / 2, p.sy - window.innerHeight / 2);
  });
  await expect.poll(centerOf).toBeLessThan(80);

  // 都市が発展: 学習で得た資金で、市立 IT 学院を Lv2 に上げる
  const drawn = () => page.evaluate(() => (window as unknown as { __city: { stats: { drawnObjects: number } } }).__city.stats.drawnObjects);
  await page.waitForTimeout(500);
  const drawnBefore = await drawn();
  await page.getByTestId('info-upgrade').click();
  // アップグレードも申請になる。費用を取り分け、反対の受付 → 議会 → 工事の後に Lv が上がる
  await expect(page.locator('.city-notice')).toContainText('市立 IT 学院の Lv2 へのアップグレードを申請した');
  await expect(page.getByTestId('info-upgrade-pending')).toContainText('申請中');
  await untilBuilt(page, 'academy', 2);
  await expect(panel.locator('.info-level-value')).toHaveText('2');
  const after = await cityState(page);
  expect(after.facilities).toEqual(['academy:2']);
  expect(after.funds).toBe(fundsBefore - 600);
  // 上げた施設の絵が消えない（描いた物の数が減らない）
  await page.waitForTimeout(500);
  expect(await drawn()).toBeGreaterThanOrEqual(drawnBefore);

  expect(errors).toEqual([]);
});

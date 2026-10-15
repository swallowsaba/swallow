import { expect, test, type Page } from '@playwright/test';

/**
 * アセットのパスが全て解決する（docs/deployment.md 8 章「コンソールに 404 が無い」）。
 * サブディレクトリ配信（手元の preview と公開 URL）で、全ての画面と、分野ごとのレッスン（施設の中の景色・図・中身）を開き、
 * 失敗した読み込み（400 以上・届かなかった物）と、ページの誤り・コンソールの誤りが無いことを確かめる。
 */

/** 開く所と、開けたと分かる印 */
const SCREENS: [string, string][] = [
  ['#/city', 'body[data-city-ready="1"]'],
  ['#/learn', '[data-testid="lib-count"]'],
  ['#/graph', '[data-testid="knowledge-graph"]'],
  ['#/learn/found.b.04', '[data-testid="entry-card"]'],
  ['#/glossary/path', '[data-testid="glossary-term"]'],
  ['#/growth', '[data-testid="growth-rank"]'],
  ['#/missions', '[data-testid="mission-title"]'],
  ['#/mission/web-server', '[data-testid="mission-exit"]'],
  ['#/settings', '[data-testid="autosave-state"]'],
];

/** 分野ごとの最初のレッスン（施設の中の景色は分野の施設ごとに違う） */
const LESSONS = [
  'found.b.01', 'linux.b.01', 'net.b.01', 'web.b.01', 'sec.b.01', 'git.b.01', 'trouble.b.01', 'db.b.01',
  'cicd.b.01', 'ctr.b.01', 'docker.b.01', 'k8s.b.01', 'mon.b.01', 'cloud.b.01', 'devops.b.01',
];

/** ページで起きた読み込みの失敗と誤りを集める */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`${String(res.status())} ${res.url()}`);
  });
  page.on('requestfailed', (req) => problems.push(`失敗 ${req.failure()?.errorText ?? ''} ${req.url()}`));
  page.on('pageerror', (e) => problems.push(`ページの誤り ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`コンソール ${m.text()}`);
  });
  return problems;
}

test.setTimeout(120_000);
// Service Worker が手元に持った物を返すと、配信の失敗が見えない。ここでは毎回、配信元から読む
test.use({ serviceWorkers: 'block' });

test('全ての画面で、読み込みの失敗とページの誤りが無い', async ({ page }) => {
  const problems = watch(page);
  for (const [hash, ready] of SCREENS) {
    await page.goto(`./${hash}`, { waitUntil: 'networkidle' });
    await expect(page.locator(ready).first(), hash).toBeAttached();
  }
  expect(problems).toEqual([]);
});

test('分野ごとのレッスンで、施設の中の景色・図・中身が読み込める', async ({ page }) => {
  const problems = watch(page);
  const facilities = new Set<string>();
  for (const id of LESSONS) {
    await page.goto(`./#/lesson/${id}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('stage-explain'), id).toBeVisible();
    // 施設の中の景色の絵が、読み終わって描ける（大きさを持つ）
    const backdrop = page.getByTestId('lesson-backdrop');
    await expect.poll(() => backdrop.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { message: id }).toBe(true);
    facilities.add((await backdrop.getAttribute('data-facility')) ?? '');
  }
  // 分野ごとに違う施設の景色を読んだ（研究施設は研究（総合演習）だけの施設で、初級のレッスンが無い）
  expect(facilities.size).toBe(14);
  expect(problems).toEqual([]);
});

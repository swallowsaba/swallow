// 読み込み中の演出（docs/ui-design.md 9 章: 都市の輪郭が描かれていく。2 秒以内）。
// 本体の読み込みを 3 秒遅らせた別のページで、描いている途中・描き終えた所・都市が出た後を撮る。
//
//   SHOOT_SCRIPT=tools/scenarios/boot.mjs npm run shoot -- boot-city
import { setTimeout as sleep } from 'node:timers/promises';

export default async function boot(page) {
  const context = await page.context().browser().newContext({ viewport: page.viewportSize() });
  const p = await context.newPage();
  await p.route(/\/src\/main\.tsx/, async (route) => {
    await sleep(3000);
    await route.continue();
  });
  const t0 = Date.now();
  await p.goto(page.url(), { waitUntil: 'commit' });
  for (const [name, at] of [['boot-1', 300], ['boot-2', 900], ['boot-3', 2100]]) {
    await sleep(Math.max(0, at - (Date.now() - t0)));
    if ((await p.locator('#boot').count()) === 0) throw new Error(`${name}: 演出が出ていない`);
    await p.screenshot({ path: `shots/${name}.png` });
    console.log(`shots/${name}.png（${String(Date.now() - t0)} ms）`);
  }
  await p.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 30000 });
  await sleep(400);
  if ((await p.locator('#boot').count()) !== 0) throw new Error('都市が出た後も演出が残っている');
  await context.close();
}

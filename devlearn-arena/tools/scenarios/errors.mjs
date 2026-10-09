// 読めなかった時の画面（docs/ui-design.md 9 章: 何が起きたか・どうすればよいかを 1 行ずつ）。
// レッスンの中身の読み込みを止めて（回線が無い時と同じ）、レッスンを開いて撮る。
//
//   SHOOT_SCRIPT=tools/scenarios/errors.mjs npm run shoot -- errors
export default async function errors(page, shot) {
  const tag = page.viewportSize()?.width === 1280 ? '-1280' : '';
  await page.route(/\/content\/lessons\/net\//, (route) => route.abort('internetdisconnected'));
  await page.evaluate(() => { window.location.hash = '#/lesson/net.b.01'; });
  await page.getByTestId('lesson-load-error').waitFor();
  await page.waitForTimeout(400);
  await shot(`p12-lesson-load-error${tag}`);
  await page.unroute(/\/content\/lessons\/net\//);
  await page.evaluate(() => { window.location.hash = '#/city'; });
}

// 読めなかった時の画面（docs/ui-design.md 9 章: 何が起きたか・どうすればよいかを 1 行ずつ）。
// レッスンの中身の読み込みを止めて（回線が無い時と同じ）、レッスンを開いて撮る。
//
//   SHOOT_SCRIPT=tools/scenarios/errors.mjs npm run shoot -- errors
//
// 中身は、開発用のサーバでは content/lessons/net/*.json、build した物（公開 URL）では assets/net.*.js で届く。
// build した物は Service Worker が中身を手元に持つと止められないので、Service Worker を止めた別のページで撮る。
const LESSONS_NET = /\/content\/lessons\/net\/|\/assets\/net\.[^/]+\.js$/;

export default async function errors(page) {
  const tag = page.viewportSize()?.width === 1280 ? '-1280' : '';
  const context = await page.context().browser().newContext({ viewport: page.viewportSize(), serviceWorkers: 'block' });
  const p = await context.newPage();
  await p.route(LESSONS_NET, (route) => route.abort('internetdisconnected'));
  await p.goto(page.url().replace(/#.*$/, '#/lesson/net.b.01'));
  await p.getByTestId('lesson-load-error').waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `shots/p12-lesson-load-error${tag}.png` });
  console.log(`shots/p12-lesson-load-error${tag}.png`);
  await context.close();
}

// 建設メニューの引き出しを開いた画面（小さな画面で崩れないかの確かめ）。
//
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/menu.mjs npm run shoot -- p2-menu-1280

export default async function menu(page, shot) {
  await page.click('[data-testid="build-group-facility"]');
  await page.click('[data-testid="build-facility-academy"]');
  const p = await page.evaluate(() => window.__city.screenOf(44.5, 44.5));
  await page.mouse.move(p.sx, p.sy, { steps: 3 });
  await page.waitForTimeout(300);
  await shot(`menu-facility-${String(page.viewportSize()?.width ?? 0)}`);
  await page.click('[data-testid="build-group-road"]');
  await page.waitForTimeout(200);
  await shot(`menu-road-${String(page.viewportSize()?.width ?? 0)}`);
}

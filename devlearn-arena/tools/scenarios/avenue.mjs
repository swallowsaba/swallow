// 地方都市から作れる大通りとロータリーの見た目を確かめる台本。
// 段階だけを地方都市にして（霧も晴らし、資金も足して）、建設メニューから引く。
//
//   SHOOT_SCRIPT=tools/scenarios/avenue.mjs npm run shoot -- p2-avenue

async function at(page, x, y) {
  return page.evaluate(([cx, cy]) => window.__city.screenOf(cx + 0.5, cy + 0.5), [x, y]);
}

async function drag(page, from, to) {
  const a = await at(page, from[0], from[1]);
  const b = await at(page, to[0], to[1]);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move(b.sx, b.sy, { steps: 6 });
  await page.mouse.up();
}

export default async function avenue(page, shot) {
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.setCity({ ...s.city, stage: 3, funds: 20000, revealed: [{ x: 20, y: 20, w: 56, h: 56 }] });
  });
  await page.click('[data-testid="build-group-road"]');
  await page.click('[data-testid="build-road-avenue"]');
  await drag(page, [47, 37], [47, 58]);
  await page.click('[data-testid="build-road-roundabout"]');
  const ring = await at(page, 53, 52);
  await page.mouse.click(ring.sx, ring.sy);
  await page.click('[data-testid="build-road-street"]');
  await drag(page, [55, 52], [59, 52]);
  await drag(page, [53, 54], [53, 58]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__city.zoomBy(1));
  const c = await at(page, 50, 50);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [c.sx, c.sy]);
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await page.evaluate(() => window.__cityStore.getState().city.roads.map((r) => r.kind))));
  await shot('p2-avenue');
}

// 画面の操作だけで、村から町を作る台本（docs/development-plan.md Phase 2 の完成条件の確かめ）。
//
//   SHOOT_SCRIPT=tools/scenarios/town.mjs npm run shoot -- p2-town
//
// 建設メニューを押し、道路をドラッグで引き、区画を塗り、施設と公園を置く。
// 時間だけは都市の時計を早回しする（1 日 = 4 秒を待たずに、同じ計算で日付を進める）。

/** マスの中心の、画面の上の位置 */
async function at(page, x, y) {
  return page.evaluate(([cx, cy]) => window.__city.screenOf(cx + 0.5, cy + 0.5), [x, y]);
}

async function pick(page, group, item) {
  const drawerOpen = await page.locator(`[data-testid="build-group-${group}"][aria-pressed="true"]`).count();
  if (!drawerOpen) await page.click(`[data-testid="build-group-${group}"]`);
  if (item) await page.click(`[data-testid="${item}"]`);
}

async function drag(page, from, to) {
  const a = await at(page, from[0], from[1]);
  const b = await at(page, to[0], to[1]);
  await page.mouse.move(a.sx, a.sy);
  await page.mouse.down();
  await page.mouse.move((a.sx + b.sx) / 2, (a.sy + b.sy) / 2, { steps: 4 });
  await page.mouse.move(b.sx, b.sy, { steps: 4 });
  await page.mouse.up();
}

async function click(page, cell) {
  const p = await at(page, cell[0], cell[1]);
  await page.mouse.move(p.sx, p.sy, { steps: 2 });
  await page.mouse.click(p.sx, p.sy);
}

/** 施設を置く。向きは R を押した回数（90 度ずつ） */
const SHELF = { academy: 'base', research: 'base', server: 'base', network: 'base', datacenter: 'base', web: 'dev', security: 'dev', devoffice: 'dev', deploy: 'dev', devops: 'dev', container: 'ops', cluster: 'ops', cloud: 'ops', monitor: 'ops', incident: 'ops' };

async function facility(page, type, cell, turns = 0) {
  const shelf = SHELF[type];
  await pick(page, shelf ? 'facility' : 'park');
  if (shelf) await page.click(`[data-testid="facility-shelf-${shelf}"]`);
  await page.click(`[data-testid="build-facility-${type}"]`);
  for (let i = 0; i < turns; i += 1) await page.keyboard.press('r');
  await click(page, cell);
  for (let i = 0; i < (4 - turns) % 4; i += 1) await page.keyboard.press('r');
}

async function days(page, n) {
  await page.evaluate((d) => window.__cityStore.getState().tick(d * 4), n);
  await page.waitForTimeout(200);
}

async function state(page) {
  return page.evaluate(() => {
    const c = window.__cityStore.getState().city;
    return { stage: c.stage, population: c.population, techPower: c.techPower, roads: c.roads.length, zones: c.zones.length, buildings: c.buildings.length, facilities: c.facilities.length, bridges: c.roads.filter((r) => r.kind === 'bridge').length };
  });
}

export default async function town(page, shot) {
  // 少し引いて、初めの範囲を全部見る
  await page.evaluate(() => window.__city.zoomBy(-1));
  await page.waitForTimeout(200);

  // 道路: 一般道（縦）と、細い道 2 本、曲線の細い道
  await pick(page, 'road', 'build-road-street');
  await drag(page, [47, 37], [47, 58]);
  await pick(page, 'road', 'build-road-lane');
  await drag(page, [37, 42], [58, 42]);
  await drag(page, [37, 52], [58, 52]);
  await page.click('[data-testid="road-shape-curve"]');
  await drag(page, [49, 57], [57, 55]);
  const bend = await at(page, 55, 59);
  await page.mouse.move(bend.sx, bend.sy, { steps: 3 });
  await page.mouse.click(bend.sx, bend.sy);
  await page.click('[data-testid="road-shape-straight"]');

  // 区画: 住宅とオフィス
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [37, 41], [46, 41]);
  await drag(page, [37, 43], [46, 43]);
  await drag(page, [37, 46], [46, 46]);
  await drag(page, [37, 51], [46, 51]);
  await drag(page, [37, 53], [46, 53]);
  await drag(page, [48, 41], [58, 41]);
  await pick(page, 'zone', 'build-zone-office');
  await drag(page, [37, 48], [46, 48]);
  await drag(page, [48, 43], [58, 43]);

  // 施設と公園
  await facility(page, 'academy', [49, 45]);
  await facility(page, 'server', [52, 45]);
  await facility(page, 'network', [55, 45]);
  await facility(page, 'web', [48, 48], 2);
  await facility(page, 'security', [51, 48], 2);
  await facility(page, 'devoffice', [54, 48], 2);
  await facility(page, 'park', [48, 50]);
  await facility(page, 'treerow', [57, 48]);
  await facility(page, 'treerow', [58, 48]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  console.log('置いた後', JSON.stringify(await state(page)));
  await days(page, 1.4);
  await shot('p2-placed');

  // 町になるまで時間を進める
  for (let i = 0; i < 12; i += 1) {
    await days(page, 10);
    const s = await state(page);
    if (s.stage >= 2) break;
  }
  console.log('町', JSON.stringify(await state(page)));

  // 町で作れる物: 川を渡る道路（橋）・商業区画・広場・噴水
  await pick(page, 'road', 'build-road-street');
  await drag(page, [59, 52], [67, 52]);
  await pick(page, 'zone', 'build-zone-commercial');
  await drag(page, [48, 53], [58, 53]);
  await drag(page, [60, 51], [62, 51]);
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [60, 53], [62, 53]);
  await drag(page, [66, 51], [67, 51]);
  await facility(page, 'plaza', [56, 50]);
  await facility(page, 'fountain', [46, 49]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 1.5);
  console.log('町の後', JSON.stringify(await state(page)));
  await page.evaluate(() => window.__cityStore.getState().togglePause());
  await page.waitForTimeout(300);
  await shot('p2-town');

  // 建設中の 3 段階と橋を寄って撮る
  await page.evaluate(() => {
    const r = window.__city;
    r.zoomBy(2);
  });
  const near = await at(page, 58, 52);
  await page.evaluate(([x, y]) => {
    const r = window.__city;
    r.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y);
  }, [near.sx, near.sy]);
  await page.waitForTimeout(300);
  await shot('p2-construct');

  // 置けない理由: 霧の中に施設を置こうとする
  await page.evaluate(() => window.__city.zoomBy(-2));
  await pick(page, 'facility');
  await page.click('[data-testid="facility-shelf-ops"]');
  await page.click('[data-testid="build-facility-cluster"]');
  const far = await at(page, 68, 47);
  await page.mouse.move(far.sx, far.sy, { steps: 3 });
  await page.waitForTimeout(200);
  await shot('p2-reason');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await motion(page, shot);
}

// 動きの確認（docs/testing-strategy.md 6 章: 2 秒あけて 2 枚撮り、差があること）
export async function motion(page, shot) {
  await page.evaluate(() => {
    const store = window.__cityStore.getState();
    if (store.paused) store.togglePause();
    window.__city.zoomBy(2);
  });
  const c = await at(page, 47, 47);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [c.sx, c.sy]);
  await page.waitForTimeout(500);
  await shot('p2-motion');
  await page.waitForTimeout(2000);
  await shot('p2-motion-2');

  // fps（都市の時計が動いている間は毎フレーム描き直す）
  for (const steps of [0, -2]) {
    const fps = await page.evaluate(async (z) => {
      const r = window.__city;
      r.zoomBy(z);
      await new Promise((res) => setTimeout(res, 500));
      const start = r.stats.frames;
      const t0 = performance.now();
      await new Promise((res) => setTimeout(res, 3000));
      return { fps: ((r.stats.frames - start) * 1000) / (performance.now() - t0), objects: r.stats.drawnObjects, agents: r.stats.agents };
    }, steps);
    console.log(`fps: ${fps.fps.toFixed(1)}（描いた物 ${String(fps.objects)}・車と人 ${String(fps.agents)}）`);
  }

  // 最大に寄って、車と人を見る
  await page.evaluate(() => window.__city.zoomBy(10));
  const p = await at(page, 47, 50);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [p.sx, p.sy]);
  await page.waitForTimeout(400);
  await shot('p2-agents');

  // 90 度回して、施設の入口と車の向きが道路に合うか
  await page.evaluate(() => {
    window.__city.zoomBy(-2);
    window.__city.rotateBy(1);
  });
  const q = await at(page, 50, 48);
  await page.evaluate(([x, y]) => window.__city.panBy(window.innerWidth / 2 - x, window.innerHeight / 2 - y), [q.sx, q.sy]);
  await page.waitForTimeout(400);
  await shot('p2-rot');
}

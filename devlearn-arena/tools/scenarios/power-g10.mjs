// 電力・公共サービス・需要を確かめる台本（docs/development-plan.md G10）。
//
//   SHOOT_SCRIPT=tools/scenarios/power-g10.mjs npm run shoot -- g10-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/power-g10.mjs npm run shoot -- g10-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 1 期目の公約の窓を閉じる → 学んで資金を得て町を作る → 区画の引き出しの需要の棒（押して内訳）
// → 公共の引き出し: 学校を選ぶ（学校の行き届きと、置く場所の届く範囲の縁）→ 発電所を選ぶ（電力の 1 行と電力のヒートマップ）
// → 公共サービス 4・発電所 2 と陸揚げ所を近くで → 外の電気を止めて停電（窓の灯りが消え、屋根に止まった記号）と電力のヒートマップ
// → 表示切替の公共サービスの行き届き（平均 → 警察）で警察署を押すと届く範囲の縁 → 停電した施設の情報パネル
import { learn, mockRecords } from './learning.mjs';
import { at, days, drag, pick } from './town.mjs';

/** 画面の中の要素の面積の割合 */
async function share(page, selectors, invert = false) {
  return page.evaluate(([sel, inv]) => {
    const rects = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    const v = covered / ((W / 2) * (H / 2));
    return Math.round((inv ? 1 - v : v) * 1000) / 10;
  }, [selectors, invert]);
}
const HUD = '[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"]';
const WINDOWS = '.small-window, [data-testid="info-panel"]';
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

async function weekEnd(page) {
  const day = await page.evaluate(() => Math.floor(window.__cityStore.getState().world.city.day));
  await days(page, 7 - (day % 7));
}

/** 引き出しが建設メニューの帯からはみ出していないか・引き出しの中の物が重なっていないか */
async function drawerFits(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[data-testid="build-drawer"]')?.getBoundingClientRect();
    if (!d) return null;
    const scroll = document.querySelector('[data-testid="build-drawer"]');
    return { left: Math.round(d.left), right: Math.round(d.right), top: Math.round(d.top), scrolls: scroll.scrollWidth > scroll.clientWidth + 1 };
  });
}

async function fps(page) {
  return page.evaluate(async () => {
    window.__city.setContinuous(true);
    const t0 = performance.now();
    let n = 0;
    await new Promise((resolve) => {
      const step = () => {
        n += 1;
        if (performance.now() - t0 < 2000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    window.__city.setContinuous(false);
    return Math.round((n / ((performance.now() - t0) / 1000)) * 10) / 10;
  });
}

export default async function powerG10(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;

  await page.waitForSelector('[data-testid="election-window"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 学んで資金を得て、町を作る
  const recs = mockRecords({ days: 10, perDay: 6 });
  for (let i = 0; i < recs.length; i += 20) {
    await learn(page, recs.slice(i, i + 20));
    if ((await page.evaluate(() => window.__cityStore.getState().city.funds)) >= 4000) break;
  }
  await page.evaluate(() => window.__city.focusOn(46, 46));
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [51, 46], [55, 46]);
  await pick(page, 'zone', 'build-zone-office');
  await drag(page, [51, 48], [55, 48]);
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [38, 48], [50, 48]);
  await drag(page, [38, 46], [44, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 63);
  console.log('人口', await page.evaluate(() => window.__cityStore.getState().world.city.population));
  console.log('常時の UI', await share(page, HUD), '%');

  // 区画の引き出しの需要の棒（押すと内訳）
  await pick(page, 'zone');
  await page.waitForSelector('[data-testid="demand-bars"]');
  console.log('需要', await text(page, '[data-testid="demand-bars"]'));
  console.log('引き出し（区画）', JSON.stringify(await drawerFits(page)));
  await shot(`g10-demand${tag}`);
  await page.click('[data-testid="demand-residential"]');
  await page.waitForTimeout(200);
  console.log('需要の内訳', await text(page, '[data-testid="demand-pop"]'));
  await shot(`g10-demand-pop${tag}`);
  await page.click('[data-testid="demand-residential"]');

  // 公共の引き出し: 学校（学校の行き届きと、置く場所の届く範囲の縁）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.load({ ...s.world, budget: { ...s.world.budget, treasury: 4000 } });
  });
  await pick(page, 'civic', 'build-facility-school');
  console.log('引き出し（公共）', JSON.stringify(await drawerFits(page)));
  const spot = await at(page, 47, 45);
  await page.mouse.move(spot.sx, spot.sy, { steps: 3 });
  await page.waitForTimeout(400);
  console.log('学校: 重ねる物', await page.evaluate(() => window.__cityStore.getState().overlay), '縁', await page.evaluate(() => window.__city.lastAreaEdges));
  await shot(`g10-civic-school${tag}`);
  // 発電所: 電力の 1 行と電力のヒートマップ
  await page.click('[data-testid="civic-shelf-power"]');
  await page.click('[data-testid="build-facility-power-thermal"]');
  const spot2 = await at(page, 47, 45);
  await page.mouse.move(spot2.sx, spot2.sy, { steps: 3 });
  await page.waitForTimeout(400);
  console.log('電力の 1 行', await text(page, '[data-testid="power-line"]'));
  console.log('発電所: 縁', await page.evaluate(() => window.__city.lastAreaEdges));
  await shot(`g10-civic-power${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 公共サービス 4・発電所 2 を、完成した物として町の北に置く（建物の描き方を近くで見る）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const f = (id, type, x, y) => ({ id, type, origin: { x, y }, rotation: 0, level: 1, state: 'active', builtDay: 0 });
    const roads = [{ id: 'r-g10', kind: 'street', path: [{ x: 37.5, y: 41.5 }, { x: 56.5, y: 41.5 }] }, { id: 'r-g10b', kind: 'street', path: [{ x: 56.5, y: 41.5 }, { x: 56.5, y: 47.5 }] }];
    const civic = [f('c-police', 'police', 37, 39), f('c-fire', 'fire', 40, 39), f('c-school', 'school', 43, 39), f('c-clinic', 'clinic', 47, 39), f('c-thermal', 'power-thermal', 49, 39), f('c-solar', 'power-solar', 52, 38)];
    s.load({ ...s.world, city: { ...s.world.city, roads: [...s.world.city.roads, ...roads], facilities: [...s.world.city.facilities, ...civic] } });
  });
  await weekEnd(page);
  await page.evaluate(() => {
    window.__city.focusOn(46, 40);
    window.__city.zoomBy(2);
  });
  await page.waitForTimeout(600);
  await shot(`g10-buildings${tag}`);
  const landing = await page.evaluate(() => window.__cityStore.getState().world.sim.power.landing);
  console.log('陸揚げ所', JSON.stringify(landing));
  await page.evaluate(([x, y]) => window.__city.focusOn(x, y), [landing.x, landing.y]);
  await page.waitForTimeout(500);
  await shot(`g10-landing${tag}`);

  // 停電: 発電所を外し、外の電気を止める → 次の週に地区が止まる
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.load({
      ...s.world,
      city: { ...s.world.city, facilities: s.world.city.facilities.filter((x) => !x.type.startsWith('power-')) },
      sim: { ...s.world.sim, power: { ...s.world.sim.power, externalCapMW: 0.1 } },
    });
  });
  await weekEnd(page);
  await page.evaluate(() => window.__city.focusOn(46, 44));
  await page.waitForTimeout(600);
  console.log('止まった地区', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().world.sim.power.recent?.at(-1))));
  console.log('止まった記号', await page.evaluate(() => window.__city.lastPlugs.length));
  await shot(`g10-outage${tag}`);
  await page.keyboard.press('v');
  await page.click('[data-testid="overlay-power"]');
  await page.waitForTimeout(500);
  console.log('凡例', await text(page, '[data-testid="overlay-legend"]'));
  console.log('表示切替の窓に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%');
  await shot(`g10-outage-heat${tag}`);
  console.log('fps（電力のヒートマップを重ねて 3 倍）', await (async () => {
    await page.evaluate(() => window.__cityStore.getState().setSpeed(3));
    return fps(page);
  })());

  // 公共サービスの行き届き（平均 → 警察）で警察署を押すと届く範囲の縁
  await page.click('[data-testid="overlay-service"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="service-police"]');
  await page.evaluate(() => window.__city.focusOn(42, 42));
  await page.waitForTimeout(300);
  const police = await at(page, 38, 40);
  await page.mouse.click(police.sx, police.sy);
  await page.waitForTimeout(500);
  console.log('警察署の縁', await page.evaluate(() => window.__city.lastAreaEdges));
  console.log('情報パネル（警察署）', await text(page, '[data-testid="info-panel"]'));
  await shot(`g10-police-reach${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 停電した施設（Web 施設）の情報パネル: 停電の状態と、ここで学ぶ
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    const web = { id: 'f-web', type: 'web', origin: { x: 45, y: 45 }, rotation: 0, level: 1, state: 'active', builtDay: 0 };
    s.load({ ...s.world, city: { ...s.world.city, facilities: [...s.world.city.facilities.filter((x) => x.id !== 'f-web'), web] }, sim: { ...s.world.sim, power: { ...s.world.sim.power, externalCapMW: 0 } } });
  });
  await weekEnd(page);
  await page.evaluate(() => window.__city.focusOn(46, 45));
  await page.waitForTimeout(400);
  const web = await at(page, 46, 45);
  await page.mouse.click(web.sx, web.sy);
  await page.waitForTimeout(400);
  console.log('情報パネル（停電した Web 施設）', await text(page, '[data-testid="info-panel"]'));
  await shot(`g10-outage-info${tag}`);
}

// 反対を確かめる台本（docs/development-plan.md G4）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g4.mjs npm run shoot -- g4-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g4.mjs npm run shoot -- g4-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 一般道（y = 47）の両側に住宅を塗り、人が住むのを待つ。住宅のそばにデータセンターを置き（申請になる）、
// 反対の受付で理由が立ち、反対率が日ごとに上がる所と、囲いの前の人の影を寄って撮る。申請の詳細で内訳を開き、
// 理由を押して元の値とヒートマップを撮る。反対率が 20% 以上なので公聴会の段で待つ（公聴会の手は G5）。
// 住宅から離した所に同じデータセンターを置き、反対率が下がることを数で比べる。
// 最後に、公聴会の段で待つ申請の敷地から、ここで学ぶ → レッスンへ行けること（学習にロックが無い）を確かめる。
import { fundBy } from './learning.mjs';
import { at, days, drag, facility, pick } from './town.mjs';

/** 常時の UI の面積（docs/visual-design.md V9） */
async function uiShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"]')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 開いた窓を足した時に、都市が見えている割合 */
async function cityVisible(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"], .small-window, [data-testid="info-panel"]')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((1 - covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 人の影と看板・名札の重なり、看板どうし・看板と名札の重なり（docs/visual-design.md V10） */
async function overlaps(page) {
  return page.evaluate(() => {
    const r = window.__city;
    const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const out = [];
    for (const c of r.lastCrowds) for (const l of r.lastLabels) if (hit(c, l)) out.push(`人の影 ${c.id} × ${l.id}`);
    const boxes = r.lastLabels;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.id.startsWith('sign-') && !b.id.startsWith('sign-')) continue;
        if (hit(a, b)) out.push(`${a.id} × ${b.id}`);
      }
    }
    return { crowds: r.lastCrowds.map((c) => `${c.id}:${String(c.people)}人`), signs: r.lastSigns.length, labels: boxes.length, overlaps: out };
  });
}

const appOf = (page, id) => page.evaluate((x) => {
  const a = window.__cityStore.getState().world.applications.find((y) => y.id === x);
  return a ? { stage: a.stage, opposition: Math.round(a.opposition * 10) / 10, reasons: a.objections.map((o) => `${o.reasonId}:${(Math.round(o.share * 10) / 10).toFixed(1)}/${(Math.round(o.full * 10) / 10).toFixed(1)}`) } : null;
}, id);

async function closeUp(page, x, y, zoom = 3) {
  await page.evaluate((z) => {
    for (let i = 0; i < z; i += 1) window.__city.zoomBy(1);
  }, zoom);
  const c = await at(page, x, y);
  await page.evaluate(([sx, sy]) => window.__city.panBy(window.innerWidth / 2 - sx, window.innerHeight / 2 - sy), [c.sx, c.sy]);
  await page.waitForTimeout(400);
}

async function zoomOut(page, zoom = 3) {
  await page.evaluate((z) => {
    for (let i = 0; i < z; i += 1) window.__city.zoomBy(-1);
  }, zoom);
}

async function until(page, id, stage, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const now = await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.stage, id);
    if (now === stage) return true;
    await days(page, 1);
  }
  return false;
}

const lastId = (page) => page.evaluate(() => window.__cityStore.getState().world.applications.at(-1)?.id ?? '');

export default async function permitG4(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  await fundBy(page, 9000);
  await page.evaluate(() => window.__city.focusOn(46, 46));
  // 一般道の南と北に住宅、東に工場と事務所（働く所があると人が住む）。北へ細い道。人が住むまで 8 週待つ
  // 工業と事務所を先に塗る（まだ誰も住んでいないので、用途地域の変更の申請にならない）
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [51, 46], [55, 46]);
  await pick(page, 'zone', 'build-zone-office');
  await drag(page, [51, 48], [55, 48]);
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [38, 48], [50, 48]);
  await drag(page, [38, 46], [44, 46]);
  await pick(page, 'road', 'build-road-lane');
  await drag(page, [48, 46], [48, 36]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 56);
  console.log('人口', await page.evaluate(() => window.__cityStore.getState().world.city.population));
  console.log('常時の UI', await uiShare(page), '%');

  // 住宅のそば（北の住宅の東の隣）にデータセンター
  await facility(page, 'datacenter', [46, 45]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const near = await lastId(page);
  console.log('そばの申請', near, JSON.stringify(await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.target, near)));

  // 反対の受付: 理由が立ち、反対率が日ごとに上がる
  await until(page, near, 'objection');
  console.log('受付に入った日', JSON.stringify(await appOf(page, near)));
  await days(page, 7);
  console.log('受付の 7 日目', JSON.stringify(await appOf(page, near)));
  await closeUp(page, 46, 45);
  console.log('重なり（受付）', JSON.stringify(await overlaps(page)));
  await shot(`g4-objection${tag}`);
  // 申請の詳細: 反対率の大きな数字と内訳
  const site = await at(page, 46, 45);
  await page.mouse.click(site.sx, site.sy);
  await page.waitForTimeout(500);
  console.log('内訳', await page.evaluate(() => [...document.querySelectorAll('[data-testid="permit-reasons"] .permit-reason-top')].map((e) => e.textContent).join(' / ')));
  console.log('大きな数字', await page.evaluate(() => document.querySelector('[data-testid="permit-opposition"]')?.textContent));
  console.log('窓を開いた時に都市が見える割合', await cityVisible(page), '%');
  await shot(`g4-detail${tag}`);
  // 理由を押すと、元の値とヒートマップ（騒音）
  const noise = page.locator('[data-reason="dc-night-noise"] .permit-reason-main');
  if (await noise.count()) {
    await noise.click();
    await page.waitForTimeout(600);
    console.log('元の値', await page.evaluate(() => document.querySelector('[data-testid="permit-reason-basis"]')?.textContent));
    console.log('重ねた地図', await page.evaluate(() => window.__cityStore.getState().overlay));
    await shot(`g4-reason${tag}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__cityStore.getState().setOverlay(null));

  // 公聴会の段で待つ（反対率が 20% 以上）
  await until(page, near, 'hearing', 20);
  await days(page, 3);
  console.log('公聴会の段', JSON.stringify(await appOf(page, near)), await page.evaluate(() => window.__cityStore.getState().notice?.text ?? null));
  console.log('重なり（公聴会）', JSON.stringify(await overlaps(page)));
  await shot(`g4-hearing${tag}`);
  // 遠くでは人の影を間引き、看板だけ
  await zoomOut(page, 5);
  await page.waitForTimeout(400);
  console.log('引いた時の人の影', JSON.stringify(await overlaps(page)));
  await shot(`g4-far-zoom${tag}`);
  await page.evaluate(() => {
    for (let i = 0; i < 1; i += 1) window.__city.zoomBy(1);
  });

  // 住宅から離した所（北の細い道の奥。道の東に、入口を西に向けて）に同じデータセンター。反対率を比べる
  await page.evaluate(() => window.__city.focusOn(49, 40));
  await page.waitForTimeout(300);
  // 道の東（入口を西に向ける）を、北から順に試す
  let far = near;
  for (const [cell, turns] of [[[50, 38], 1], [[50, 39], 1], [[50, 38], 3], [[50, 39], 3], [[49, 38], 1], [[46, 38], 1], [[46, 38], 3], [[51, 38], 1]]) {
    await facility(page, 'datacenter', cell, turns);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    far = await lastId(page);
    if (far !== near) break;
  }
  if (far !== near) {
    await until(page, far, 'objection');
    await days(page, 14);
    console.log('離した所', JSON.stringify(await appOf(page, far)));
    console.log('比べる: そば', (await appOf(page, near))?.opposition, '% / 離した所', (await appOf(page, far))?.opposition, '%');
    console.log('離した所の敷地', JSON.stringify(await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.target, far)));
    await closeUp(page, 50, 38);
    await shot(`g4-away${tag}`);
    await zoomOut(page);
  } else {
    console.log('離した所に置けなかった');
  }

  // 3 倍の速さで人の影を描いている時の fps
  await page.evaluate(() => window.__city.focusOn(47, 46));
  await closeUp(page, 46, 45, 2);
  await page.keyboard.press('3');
  console.log('fps（3 倍・人の影）', await page.evaluate(async () => {
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
  }));
  await page.keyboard.press('1');
  await page.keyboard.press(' ');

  // 学習にロックが無い: 公聴会の段で待つ申請の敷地 → 情報パネル → ここで学ぶ
  const p = await at(page, 46, 45);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(400);
  console.log('情報パネル', await page.evaluate(() => document.querySelector('[data-testid="info-state"]')?.textContent), 'ここで学ぶ', await page.locator('[data-testid="info-lessons"] button').count(), '本');
  await page.locator('[data-testid="info-lessons"] button').first().click();
  await page.waitForSelector('[data-testid="lesson-screen"], [data-testid="entry-card"]', { timeout: 15000 }).catch(() => {});
  console.log('公聴会の段で待つ施設から学ぶ', await page.evaluate(() => window.location.hash));
  await shot(`g4-learn${tag}`);
}

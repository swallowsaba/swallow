// 許認可を確かめる台本（docs/development-plan.md G3）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g3.mjs npm run shoot -- g3-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g3.mjs npm run shoot -- g3-end-720
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// 画面の操作で、一般道（y = 47）の南に住宅を塗り、北にサーバ施設を置く（申請になる）。
// 時間を進めながら、申請の各段階（用途地域の審査・反対の受付・議会の採決を待つ・工事の基礎・骨組み・完成）の敷地を寄って撮る。
// 間に、申請中の敷地を押した時の情報パネルと申請の詳細、許認可の一覧、上の帯の市政の引き出しを撮る。
// 最後に 6 件を並べて看板どうし・看板と名札が重ならないことを数え、7 件目が理由付きで断られる所を撮る。
import { fundBy } from './learning.mjs';
import { at, closePledges, days, drag, facility, pick } from './town.mjs';

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

/** 開いた窓（小さな窓と情報パネル）だけの面積（docs/ui-design.md 10.0: 60% を超えない） */
async function windowShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('.small-window, [data-testid="info-panel"]')].map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 看板どうし・看板と名札の重なり（docs/visual-design.md V10） */
async function signOverlaps(page) {
  return page.evaluate(() => {
    const r = window.__city;
    const boxes = r.lastLabels;
    const out = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.id.startsWith('sign-') && !b.id.startsWith('sign-')) continue;
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) out.push(`${a.id} × ${b.id}`);
      }
    }
    return { signs: r.lastSigns.length, labels: boxes.length, overlaps: out };
  });
}

const stageOf = (page) => page.evaluate(() => window.__cityStore.getState().world.applications.map((a) => `${a.id}:${a.target.type ?? a.kind}:${a.stage}`).join(' '));

/** 敷地へ寄る（拡大して真ん中へ） */
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

/** 1 日ずつ進めて、その申請が段階 stage に入るのを待つ */
async function until(page, id, stage, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const now = await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.stage, id);
    if (now === stage) return true;
    await days(page, 1);
  }
  return false;
}

export default async function permitG3(page, shot) {
  // 1 期目の公約を選ぶ窓（G8）は選ばずに閉じる（窓が都市を覆っていると、建設メニューの操作が届かない)
  await closePledges(page);
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  await fundBy(page, 9000);
  await page.evaluate(() => window.__city.focusOn(46, 46));
  // 住宅を塗り、サーバ施設を一般道の北に置く
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [38, 48], [46, 48]);
  await facility(page, 'server', [50, 45]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const id = await page.evaluate(() => window.__cityStore.getState().world.applications.at(-1)?.id ?? '');
  console.log('置いた後の申請', await stageOf(page));
  console.log('常時の UI', await uiShare(page), '%');

  // 段階: 用途地域の審査（囲いと看板）
  await closeUp(page, 50.5, 45.5);
  await shot(`g3-zoning${tag}`);
  // 敷地を押すと、情報パネル（申請中・ここで学ぶ）と申請の詳細
  const site = await at(page, 50.5, 45.5);
  await page.mouse.click(site.sx, site.sy);
  await page.waitForTimeout(500);
  console.log('情報パネル', await page.evaluate(() => document.querySelector('[data-testid="info-state"]')?.textContent), 'ここで学ぶ', await page.locator('[data-testid="info-lessons"] button').count(), '本');
  console.log('申請の詳細', await page.evaluate(() => document.querySelector('[data-testid="permit-now"]')?.textContent));
  console.log('窓を開いた時に都市が見える割合', await cityVisible(page), '%', '窓だけの面積', await windowShare(page), '%');
  await shot(`g3-detail${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 反対の受付
  await until(page, id, 'objection');
  await page.waitForTimeout(300);
  await shot(`g3-objection${tag}`);
  // 議会の採決を待つ（看板に議会の日付）
  await until(page, id, 'council');
  await page.waitForTimeout(300);
  console.log('議会を待つ看板', await page.evaluate(() => window.__city.lastSigns.length));
  await shot(`g3-council${tag}`);
  // 着工（基礎 → 骨組み → 完成の見た目。28 日を 3 つに等分）
  await until(page, id, 'construction');
  await days(page, 2);
  await shot(`g3-foundation${tag}`);
  await days(page, 10);
  await shot(`g3-frame${tag}`);
  await until(page, id, 'done');
  await days(page, 1);
  await shot(`g3-done${tag}`);
  console.log('完成した後', await stageOf(page), JSON.stringify(await page.evaluate(() => window.__cityStore.getState().world.city.facilities.map((f) => `${f.type}:${f.state}`))));
  await zoomOut(page);

  // 6 件を並べる（一般道の北と南）。看板どうし・看板と名札が重ならない
  // 小さな画面では引いて、置く所を全部見る（下の建設メニューの引き出しに隠れないよう、少し下を真ん中に）
  if (size !== '1920') await page.evaluate(() => { window.__city.focusOn(50, 50); window.__city.zoomBy(-1); });
  else await page.evaluate(() => window.__city.focusOn(47, 46));
  await page.waitForTimeout(300);
  for (const [type, cell, turns] of [['network', [53, 45], 0], ['web', [44, 45], 0], ['security', [41, 45], 0], ['devoffice', [38, 45], 0], ['deploy', [50, 48], 2], ['monitor', [56, 48], 2]]) {
    await facility(page, type, cell, turns);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 1);
  console.log('6 件', await stageOf(page));
  if (size === '1920') await page.evaluate(() => window.__city.zoomBy(1));
  await page.waitForTimeout(400);
  console.log('看板の重なり', JSON.stringify(await signOverlaps(page)));
  await shot(`g3-six${tag}`);
  // 3 倍の速さで、看板と囲いを 6 件描いている時の fps
  await page.keyboard.press('3');
  console.log('fps（3 倍・申請 6 件）', await page.evaluate(async () => {
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
  // 7 件目: 置こうとすると「審議中の申請が多すぎる」
  await pick(page, 'facility');
  await page.click('[data-testid="facility-shelf-ops"]');
  await page.click('[data-testid="build-facility-incident"]');
  const seventh = await at(page, 56, 45);
  await page.mouse.move(seventh.sx, seventh.sy, { steps: 3 });
  await page.waitForTimeout(300);
  console.log('7 件目の理由', await page.evaluate(() => document.querySelector('[data-testid="place-reasons"]')?.textContent ?? null));
  await shot(`g3-seventh${tag}`);
  await page.mouse.click(seventh.sx, seventh.sy);
  console.log('7 件目を押した後の申請の数', await page.evaluate(() => window.__cityStore.getState().world.applications.length));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 上の帯の市政の引き出しと、許認可の一覧（P）
  await page.click('[data-testid="topbar-civic"]');
  await page.waitForTimeout(200);
  await shot(`g3-civic${tag}`);
  await page.click('[data-testid="civic-permits"]');
  await page.waitForTimeout(300);
  console.log('一覧の行', await page.locator('[data-testid="permit-rows"] > li').count());
  console.log('一覧を開いた時に都市が見える割合', await cityVisible(page), '%');
  await shot(`g3-list${tag}`);
  // 行を押すと詳細、取り下げると費用が戻る
  const before = await page.evaluate(() => window.__cityStore.getState().world.city.funds);
  await page.locator('[data-testid="permit-rows"] .permit-row-main').first().click();
  await page.waitForTimeout(300);
  await page.click('[data-testid="permit-withdraw"]');
  await page.waitForTimeout(200);
  await shot(`g3-withdraw${tag}`);
  await page.click('[data-testid="permit-withdraw-yes"]');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__cityStore.getState().world.city.funds);
  console.log('取り下げ', before, '→', after, await page.evaluate(() => window.__cityStore.getState().notice?.text ?? null));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await page.waitForTimeout(200);
  console.log('P で一覧', await page.evaluate(() => window.__cityStore.getState().windows.join(',')));
  // 1 本のレッスンへ（申請中の施設からも学べる）: 申請中の敷地 → 情報パネル → ここで学ぶ
  await page.keyboard.press('Escape');
  const pend = await page.evaluate(() => {
    const a = window.__cityStore.getState().world.applications.find((x) => ['zoning', 'objection', 'council'].includes(x.stage) && x.target.origin);
    return a ? a.target.origin : null;
  });
  if (pend) {
    await page.evaluate(([x, y]) => window.__city.focusOn(x + 1, y + 1), [pend.x, pend.y]);
    await page.waitForTimeout(400);
    const p = await at(page, pend.x + 0.5, pend.y + 0.5);
    await page.mouse.click(p.sx, p.sy);
    await page.waitForTimeout(400);
    await page.locator('[data-testid="info-lessons"] button').first().click();
    await page.waitForSelector('[data-testid="lesson-screen"], [data-testid="entry-card"]', { timeout: 15000 }).catch(() => {});
    console.log('申請中の施設から学ぶ', await page.evaluate(() => window.location.hash));
    await shot(`g3-learn${tag}`);
  }
}

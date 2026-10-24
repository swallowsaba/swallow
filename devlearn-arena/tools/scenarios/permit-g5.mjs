// 公聴会を確かめる台本（docs/development-plan.md G5）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g5.mjs npm run shoot -- g5-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g5.mjs npm run shoot -- g5-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// G4 の台本と同じ町（一般道の両側の住宅・東の工場と事務所）を作る。資金はデータベースとクラウド以外の分野を学んで得る
// （データセンターの説明の候補は、データベースとクラウドの段階で並ぶ。スキル 0 の公聴会を撮るため）。
//
// 1 件目: 住宅のそばのデータセンター（スキル 0）。反対の受付の間に、先回りの譲歩（電力）を出す。
//   公聴会を開き（時間が止まる）、スキル 0 で説明が並ばず、譲歩と押し切るは並ぶことを撮る。雇用は押し切り、残りは譲歩して終える。
//   G5 の仮の決まり（公聴会の後の反対率が 50% 未満なら可決）で採決する。
// 2 件目: 一般道の北の 2 マスを工業に塗る（向かいの住宅から 2 マスなので用途地域の変更の申請）。受付の間に「軽い工業に限る」と譲歩する。
// データベースとクラウドを学ぶ（段階が上がる）。
// 3 件目: 1 件目と同じ所にデータセンターを出し直す。公聴会で説明の候補が増えたことを撮り、誤った説明（学べるレッスン）と確かな説明を出す。
//   窓を閉じて待たせ（公聴会の途中）、敷地の情報パネルから、ここで学ぶ → レッスンへ行けること（学習にロックが無い）を確かめ、戻って終える。
// 最後に、譲歩した工業の区画が建った後の騒音（ヒートマップの値）を、譲歩の無い工業の区画と比べる。
import { readFileSync } from 'node:fs';
import { learn, mockRecords } from './learning.mjs';
import { at, days, drag, facility, pick } from './town.mjs';

const LESSONS = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;
const SIZE = 96;

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

/** 開いた窓（公聴会の窓を含む）を足した時に、都市が見えている割合 */
async function cityVisible(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="topbar"], [data-testid="build-menu"], [data-testid="overlay-toggle"], [data-testid="recommend"], [data-testid="minimap"], .small-window, [data-testid="info-panel"], [data-testid="hearing-window"]')]
      .map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((1 - covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

/** 開いた窓（小さな窓・情報パネル・公聴会の窓）の合計の面積（docs/ui-design.md 10.0: 60% を超えない） */
async function windowsShare(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('.small-window, [data-testid="info-panel"], [data-testid="hearing-window"]')].map((el) => el.getBoundingClientRect());
    const W = window.innerWidth;
    const H = window.innerHeight;
    let covered = 0;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((W / 2) * (H / 2))) * 1000) / 10;
  });
}

const appOf = (page, id) => page.evaluate((x) => {
  const a = window.__cityStore.getState().world.applications.find((y) => y.id === x);
  return a ? {
    stage: a.stage, opposition: Math.round(a.opposition * 10) / 10, mods: a.mods ?? null, pendingCost: a.pendingCost ?? 0,
    reasons: a.objections.map((o) => `${o.reasonId}:${(Math.round(o.share * 10) / 10).toFixed(1)}${o.hand ? `[${o.hand.kind}${o.hand.quality ? `:${o.hand.quality}` : ''}]` : ''}`),
  } : null;
}, id);

const skillsOf = (page) => page.evaluate(() => {
  // スキルの値は画面の側で記録から計算する。ここでは修了したレッスンの数を見る
  const ids = Object.keys(window.__game.progress().lessons);
  return { db: ids.filter((x) => x.startsWith('db.')).length, cloud: ids.filter((x) => x.startsWith('cloud.')).length };
});

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

async function until(page, id, stages, max = 80) {
  const want = Array.isArray(stages) ? stages : [stages];
  for (let i = 0; i < max; i += 1) {
    const now = await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.stage, id);
    if (want.includes(now)) return now;
    await days(page, 1);
  }
  return null;
}

const lastId = (page) => page.evaluate(() => window.__cityStore.getState().world.applications.at(-1)?.id ?? '');

/** 敷地を押して申請の詳細を開く */
async function openDetail(page, cell) {
  const p = await at(page, cell[0], cell[1]);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(500);
}

/** 公聴会の窓の、今の論点と手の並び */
const hearingState = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-testid="hearing-window"]');
  if (!w) return null;
  const q = (s) => [...w.querySelectorAll(s)];
  return {
    opposition: w.querySelector('[data-testid="hearing-opposition"]')?.textContent,
    capital: w.querySelector('[data-testid="hearing-capital"]')?.textContent,
    issues: q('.hearing-issue').map((e) => `${e.getAttribute('data-reason')}${e.classList.contains('is-current') ? '*' : ''}${e.classList.contains('is-done') ? '(済)' : ''}`),
    concessions: q('[data-concession]').map((e) => `${e.getAttribute('data-concession')}${e.disabled ? '(出せない)' : ''}`),
    explanations: q('[data-explanation]').map((e) => e.getAttribute('data-explanation')),
    noExplain: w.querySelector('[data-testid="hearing-no-explain"]')?.textContent ?? null,
    hidden: q('[data-testid="hearing-hidden"] li').map((e) => e.textContent),
    push: w.querySelector('[data-testid="hearing-push"]')?.textContent ?? null,
    reaction: w.querySelector('[data-testid="hearing-reaction"]')?.textContent ?? null,
    end: w.querySelector('[data-testid="hearing-end"]')?.textContent ?? null,
  };
});

/** 公聴会の窓で、論点を選ぶ */
async function chooseIssue(page, reasonId) {
  await page.click(`[data-testid="hearing-window"] .hearing-issue[data-reason="${reasonId}"]`);
  await page.waitForTimeout(150);
}

/** 答えていない論点に、出せる requires の無い譲歩を出す（無ければ押し切る） */
async function concedeRest(page, prefer = {}) {
  for (let k = 0; k < 8; k += 1) {
    const s = await hearingState(page);
    const next = s?.issues.find((i) => !i.endsWith('(済)'));
    if (!next) return;
    const reasonId = next.replace(/[*]$/, '');
    await chooseIssue(page, reasonId);
    const want = prefer[reasonId];
    const btn = want
      ? page.locator(`[data-testid="hearing-window"] [data-concession="${want}"]:not([disabled])`)
      : page.locator('[data-testid="hearing-window"] [data-concession]:not([disabled]):not(:has(.hearing-tech))').first();
    if (await btn.count()) await btn.first().click();
    else await page.click('[data-testid="hearing-push"]');
    await page.waitForTimeout(300);
    console.log('  手', reasonId, '→', (await hearingState(page))?.reaction);
  }
}

/** 住宅のそばにデータセンターを置く（置けた敷地を返す） */
async function placeNear(page, tries) {
  const before = await lastId(page);
  for (const [cell, turns] of tries) {
    await facility(page, 'datacenter', cell, turns);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const id = await lastId(page);
    if (id !== before) return { id, cell };
  }
  return null;
}

/** 区画の建物のマスの騒音（ヒートマップの値）の平均と、建物の段 */
const zoneNoise = (page, zoneId) => page.evaluate(([zid, size]) => {
  const s = window.__cityStore.getState();
  const z = s.world.city.zones.find((x) => x.id === zid);
  if (!z || !s.heat) return null;
  const bs = s.world.city.buildings.filter((b) => b.zoneId === zid);
  const v = bs.map((b) => s.heat.cells.noise[b.cell.y * size + b.cell.x] ?? 0);
  return { mods: z.mods ?? null, buildings: bs.length, levels: bs.map((b) => b.level).join(','), noise: v.map((x) => Math.round(x * 10) / 10).join(',') };
}, [zoneId, SIZE]);

/** 区画のまわり（4 マス以内）の住宅の建物のマスの騒音（ヒートマップの値）の平均 */
const homesNoise = (page, cells) => page.evaluate(([cs, size]) => {
  const s = window.__cityStore.getState();
  if (!s.heat) return null;
  const kind = new Map(s.world.city.zones.map((z) => [z.id, z.kind]));
  const homes = s.world.city.buildings.filter((b) => kind.get(b.zoneId) === 'residential' && cs.some((c) => Math.max(Math.abs(c.x - b.cell.x), Math.abs(c.y - b.cell.y)) <= 4));
  const v = homes.map((b) => s.heat.cells.noise[b.cell.y * size + b.cell.x] ?? 0);
  return { homes: homes.length, mean: v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 100) / 100 : 0 };
}, [cells, SIZE]);

const basisOf = (page, id, reasonId) => page.evaluate(([x, r]) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.objections.find((o) => o.reasonId === r)?.basis ?? null, [id, reasonId]);

async function hearingFps(page) {
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

export default async function permitG5(page, shot) {
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  // データベースとクラウド以外を学んで資金を得る
  const others = LESSONS.filter((l) => l.domain !== 'db' && l.domain !== 'cloud').map((l) => l.id);
  const recs = mockRecords({ days: 30, perDay: 8, order: others });
  for (let i = 0; i < recs.length; i += 20) {
    await learn(page, recs.slice(i, i + 20));
    if ((await page.evaluate(() => window.__cityStore.getState().city.funds)) >= 9000) break;
  }
  console.log('資金', await page.evaluate(() => window.__cityStore.getState().city.funds), '修了したレッスン', JSON.stringify(await skillsOf(page)));

  await page.evaluate(() => window.__city.focusOn(46, 46));
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
  console.log('人口', await page.evaluate(() => window.__cityStore.getState().world.city.population), '政治資本', await page.evaluate(() => window.__cityStore.getState().world.politics.capital));
  console.log('常時の UI', await uiShare(page), '%');

  // ---- 1 件目: 住宅のそばのデータセンター（スキル 0） ----
  const first = await placeNear(page, [[[46, 45], 0]]);
  if (!first) throw new Error('1 件目を置けなかった');
  console.log('1 件目の敷地', JSON.stringify(await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.target, first.id)));

  // ---- 2 件目: 一般道の北、細い道と工場の間の 2 マスを工業に塗る（向かいの住宅から 2 マスなので、用途地域の変更の申請になる） ----
  await pick(page, 'zone', 'build-zone-industrial');
  await drag(page, [49, 46], [50, 46]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const rz = await lastId(page);
  const rzApp = await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x), rz);
  console.log('2 件目', rzApp?.kind, JSON.stringify(rzApp?.target?.zone?.cells ?? null));
  const rzCells = rzApp?.target?.zone?.cells ?? [];
  const noiseBefore = await homesNoise(page, rzCells);
  console.log('2 件目を塗る前のまわりの住まいの騒音', JSON.stringify(noiseBefore));

  // 反対の受付: 先回りの譲歩（1 件目は電力、2 件目は工場の音）
  await until(page, first.id, 'objection');
  await days(page, 4);
  console.log('1 件目 受付の 4 日目', JSON.stringify(await appOf(page, first.id)));
  console.log('2 件目 受付の 4 日目', JSON.stringify(await appOf(page, rz)));
  await closeUp(page, ...first.cell);
  await openDetail(page, first.cell);
  console.log('先回りの譲歩の欄', await page.evaluate(() => document.querySelector('[data-testid="permit-preempt"]')?.textContent?.slice(0, 160)));
  await shot(`g5-preempt${tag}`);
  const pre = page.locator('[data-testid="permit-preempt"] [data-concession="dc-power-trim"]');
  if (await pre.count()) {
    await pre.click();
    await page.waitForTimeout(400);
    console.log('先回りの譲歩の後（1 件目）', JSON.stringify(await appOf(page, first.id)));
    await shot(`g5-preempt-done${tag}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 2 件目の先回りの譲歩は、一覧から詳細を開いて出す
  await page.evaluate((x) => window.__cityStore.getState().openPermit(x), rz);
  await page.waitForTimeout(300);
  const light = page.locator('[data-testid="permit-preempt"] [data-concession="rz-ind-light"]');
  console.log('2 件目の先回りの譲歩', await light.count(), '工場の音の元の値（譲歩の前）', JSON.stringify(await basisOf(page, rz, 'rz-ind-noise')));
  if (await light.count()) {
    await light.click();
    await page.waitForTimeout(300);
  }
  console.log('先回りの譲歩の後（2 件目）', JSON.stringify(await appOf(page, rz)), '工場の音の元の値（譲歩の後）', JSON.stringify(await basisOf(page, rz, 'rz-ind-noise')));
  await shot(`g5-preempt-rezone${tag}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---- 1 件目の公聴会。申請の詳細の「公聴会を開く」 ----
  await until(page, first.id, 'hearing', 20);
  console.log('1 件目 公聴会の段', JSON.stringify(await appOf(page, first.id)));
  console.log('2 件目 今', JSON.stringify(await appOf(page, rz)));
  await openDetail(page, first.cell);
  console.log('公聴会を開くの金のボタン', await page.locator('[data-testid="permit-open-hearing"]').count());
  await page.keyboard.press('3');
  await page.click('[data-testid="permit-open-hearing"]');
  await page.waitForSelector('[data-testid="hearing-window"]');
  // 開いている間は時間が止まる
  const d0 = await page.evaluate(() => window.__cityStore.getState().world.city.day);
  await page.waitForTimeout(3000);
  const d1 = await page.evaluate(() => window.__cityStore.getState().world.city.day);
  console.log('公聴会の窓を開いている間の日付', d0, '→', d1, d0 === d1 ? '（止まっている）' : '（動いた）');
  console.log('公聴会の窓（スキル 0）', JSON.stringify(await hearingState(page)));
  console.log('窓を開いた時に都市が見える割合', await cityVisible(page), '%', '開いた窓の合計', await windowsShare(page), '%');
  console.log('fps（公聴会の窓）', await hearingFps(page));
  await shot(`g5-hearing${tag}`);
  // 雇用が少ないは押し切る。残りは譲歩
  await chooseIssue(page, 'dc-jobs');
  await page.click('[data-testid="hearing-push"]');
  await page.waitForTimeout(300);
  console.log('  押し切る', (await hearingState(page))?.reaction, '政治資本', (await hearingState(page))?.capital);
  await shot(`g5-push${tag}`);
  await concedeRest(page);
  console.log('答えた後', JSON.stringify(await hearingState(page)));
  await shot(`g5-answered${tag}`);
  console.log('答えた後の申請', JSON.stringify(await appOf(page, first.id)));
  await page.click('[data-testid="hearing-end"]');
  await page.waitForTimeout(400);
  console.log('公聴会を終えた後', JSON.stringify(await appOf(page, first.id)), '窓', await page.locator('[data-testid="hearing-window"]').count());
  await page.keyboard.press('1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---- 2 件目（用途地域の変更）: 公聴会なら残りに譲歩して終える ----
  const rzStage = await until(page, rz, ['hearing', 'council', 'construction', 'done', 'rejected'], 20);
  console.log('2 件目 受付の後', rzStage, JSON.stringify(await appOf(page, rz)));
  if (rzStage === 'hearing') {
    await page.evaluate((x) => window.__cityStore.getState().openHearing(x), rz);
    await page.waitForSelector('[data-testid="hearing-window"]');
    await concedeRest(page);
    await page.click('[data-testid="hearing-end"]');
    await page.waitForTimeout(300);
  }
  const r1 = await until(page, first.id, ['construction', 'rejected'], 20);
  console.log('仮の決まりの結果（1 件目）', r1, JSON.stringify(await appOf(page, first.id)));
  const r2 = await until(page, rz, ['construction', 'done', 'rejected'], 20);
  console.log('仮の決まりの結果（2 件目）', r2, JSON.stringify(await appOf(page, rz)));
  await zoomOut(page);

  // ---- データベースとクラウドを学ぶ（段階が上がる） ----
  const dbc = LESSONS.filter((l) => l.domain === 'db' || l.domain === 'cloud').map((l) => l.id);
  await learn(page, mockRecords({ days: 6, perDay: 4, order: dbc, reviews: false }));
  console.log('学んだ後', JSON.stringify(await skillsOf(page)));

  // ---- 3 件目: 1 件目と同じ所に出し直す（否決なら 28 日後。可決なら隣に） ----
  await days(page, 28);
  await page.evaluate(() => window.__city.focusOn(46, 46));
  const third = await placeNear(page, [[[46, 45], 0], [[45, 44], 0], [[49, 38], 1], [[46, 38], 1]]);
  if (!third) throw new Error('3 件目を置けなかった');
  const s3 = await until(page, third.id, ['hearing', 'council'], 40);
  console.log('3 件目', s3, JSON.stringify(await appOf(page, third.id)));
  await closeUp(page, ...third.cell);
  if (s3 === 'hearing') {
    await openDetail(page, third.cell);
    await page.click('[data-testid="permit-open-hearing"]');
    await page.waitForSelector('[data-testid="hearing-window"]');
    await chooseIssue(page, 'dc-power');
    console.log('公聴会の窓（学んだ後・電力）', JSON.stringify(await hearingState(page)));
    await shot(`g5-explain${tag}`);
    // 誤った説明（なぜ誤りかと、学べるレッスン）
    const wrong = page.locator('[data-testid="hearing-window"] [data-explanation="dc-power-cloud"]');
    if (await wrong.count()) {
      await wrong.click();
      await page.waitForTimeout(300);
      console.log('誤った説明の後', JSON.stringify(await hearingState(page)), await page.evaluate(() => document.querySelector('[data-testid="hearing-reaction-lesson"]')?.textContent ?? null));
      await shot(`g5-wrong${tag}`);
    }
    // 確かな説明
    const issues = (await hearingState(page))?.issues ?? [];
    const pickSound = issues.find((i) => i.startsWith('dc-jobs')) ? ['dc-jobs', 'dc-jobs-number'] : issues.find((i) => i.startsWith('dc-cooling-water')) ? ['dc-cooling-water', 'dc-water-measure'] : null;
    if (pickSound) {
      await chooseIssue(page, pickSound[0]);
      const e = page.locator(`[data-testid="hearing-window"] [data-explanation="${pickSound[1]}"]`);
      if (await e.count()) {
        await e.click();
        await page.waitForTimeout(300);
        console.log('確かな説明の後', JSON.stringify(await hearingState(page)));
        await shot(`g5-explained${tag}`);
      }
    }
    console.log('3 件目の答えた後', JSON.stringify(await appOf(page, third.id)));
    // 窓を閉じて待たせる（公聴会の途中）。学習にロックが無いことを確かめる
    await page.locator('[data-testid="hearing-window"] .hearing-close').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const p = await at(page, ...third.cell);
    await page.mouse.click(p.sx, p.sy);
    await page.waitForTimeout(400);
    const learnBtn = page.locator('[data-testid="info-lessons"] button');
    console.log('公聴会の途中の施設の情報パネル', await page.evaluate(() => document.querySelector('[data-testid="info-state"]')?.textContent), 'ここで学ぶ', await learnBtn.count(), '本');
    if (await learnBtn.count()) {
      await learnBtn.first().click();
      await page.waitForSelector('[data-testid="lesson-screen"], [data-testid="entry-card"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      console.log('公聴会の途中の施設から学ぶ', await page.evaluate(() => window.location.hash));
      await shot(`g5-learn${tag}`);
      await page.goBack();
      await page.waitForSelector('[data-testid="topbar"]');
      await page.waitForTimeout(600);
    }
    console.log('戻った後の申請（待っている）', JSON.stringify(await appOf(page, third.id)));
    await page.evaluate((x) => window.__cityStore.getState().openHearing(x), third.id);
    await page.waitForSelector('[data-testid="hearing-window"]');
    await page.click('[data-testid="hearing-end"]');
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const r3 = await until(page, third.id, ['construction', 'rejected'], 20);
  console.log('仮の決まりの結果（3 件目）', r3, JSON.stringify(await appOf(page, third.id)));
  await zoomOut(page);

  // ---- 譲歩した区画が建つのを待ち、騒音のヒートマップで、譲歩の無い工業の区画と比べる ----
  const rzZone = await page.evaluate(() => window.__cityStore.getState().world.city.zones.find((z) => z.cells.some((c) => c.x === 49 && c.y === 46))?.id ?? null);
  const oldZone = await page.evaluate(() => window.__cityStore.getState().world.city.zones.find((z) => z.cells.some((c) => c.x === 53 && c.y === 46))?.id ?? null);
  for (let k = 0; k < 12; k += 1) {
    const n = await page.evaluate((zid) => window.__cityStore.getState().world.city.buildings.filter((b) => b.zoneId === zid).length, rzZone);
    if (n >= 2) break;
    await days(page, 7);
  }
  await days(page, 7);
  console.log('譲歩した工業の区画', rzZone, JSON.stringify(await zoneNoise(page, rzZone)));
  console.log('譲歩の無い工業の区画', oldZone, JSON.stringify(await zoneNoise(page, oldZone)));
  const noiseAfter = await homesNoise(page, rzCells);
  console.log('建った後のまわりの住まいの騒音', JSON.stringify(noiseAfter), '増え方', Math.round(((noiseAfter?.mean ?? 0) - (noiseBefore?.mean ?? 0)) * 100) / 100);
  await page.evaluate(() => window.__cityStore.getState().setOverlay('noise'));
  await page.waitForTimeout(600);
  // 一番引いてから寄せ直す（寄せの段をそろえる）
  await page.evaluate(() => {
    window.__city.zoomBy(-10);
    window.__city.focusOn(50, 47);
  });
  await closeUp(page, 50, 47, 12);
  // 譲歩した区画の向かいの住まいを指して、値を出す（色だけに頼らない）
  const home = await at(page, 49, 48);
  await page.mouse.move(home.sx, home.sy, { steps: 3 });
  await page.waitForTimeout(500);
  console.log('指したマスの値', await page.evaluate(() => document.querySelector('[data-testid="overlay-hover"], .overlay-hover, [data-testid="heat-tip"]')?.textContent ?? null));
  await shot(`g5-effect${tag}`);
  await page.evaluate(() => window.__cityStore.getState().setOverlay(null));

  // 3 倍の速さの fps
  await page.keyboard.press('3');
  console.log('fps（3 倍）', await hearingFps(page));
  await page.keyboard.press('1');
}

// 議会の採決と異議申し立てを確かめる台本（docs/development-plan.md G6）。
//
//   SHOOT_SCRIPT=tools/scenarios/permit-g6.mjs npm run shoot -- g6-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/permit-g6.mjs npm run shoot -- g6-end-1280
//   SHOOT_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ SHOOT_SCRIPT=... で公開した所を撮る
//
// G5 の台本と同じ町（一般道の両側の住宅・東の工場と事務所）を作る。資金はデータベースとクラウド以外の分野を学んで得る（スキル 0 の説明）。
//
// 1 件目: 住宅のそばのデータセンター（スキル 0）。受付の間に電力へ先回りの譲歩。公聴会では、残りの論点に requires の無い譲歩をする（押し切らない）。
//   議会の段で、申請の詳細の「議会の見込みを見る」→ 7 人の見込みと 1 行を撮る。反対の見込みのうち点が一番 0 に近い議員を説得する。
//   議会の日に採決 → 結果の画面（1 人ずつ賛否が出る途中と、出きった所）を撮る。
// 2 件目: 住宅から少し離した所に同じデータセンターを出し、一番大きな論点を押し切り、残りには答えずに公聴会を終える。説得もする。可決して申し立ての条件を満たせば、申し立ての窓を撮り、追加の譲歩か政治資本で答える。
// 最後に、動きを減らす設定で採決の結果を開き、賛否が一度に出ることを撮る。
import { readFileSync } from 'node:fs';
import { learn, mockRecords } from './learning.mjs';
import { at, closePledges, days, drag, facility, pick } from './town.mjs';

/** 2 件目の施設（環境変数で変えられる） */
const SECOND = process.env.G6_SECOND ?? 'rezone';
const LESSONS = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;

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
const WINDOWS = '.small-window, [data-testid="info-panel"], [data-testid="hearing-window"], [data-testid="council-window"]';

const appOf = (page, id) => page.evaluate((x) => {
  const a = window.__cityStore.getState().world.applications.find((y) => y.id === x);
  return a ? {
    stage: a.stage, opposition: Math.round(a.opposition * 10) / 10, persuaded: a.persuaded ?? null, appeal: a.appeal ?? null,
    reasons: a.objections.map((o) => `${o.reasonId}:${(Math.round(o.share * 10) / 10).toFixed(1)}${o.hand ? `[${o.hand.kind}]` : ''}`),
    vote: a.vote ? `${a.vote.consent ? '同意の案件' : `賛成 ${String(a.vote.members.filter((m) => m.yes).length)}`}・${a.vote.passed ? '可決' : '否決'}` : null,
  } : null;
}, id);

const lastId = (page) => page.evaluate(() => window.__cityStore.getState().world.applications.at(-1)?.id ?? '');
const state = (page) => page.evaluate(() => {
  const s = window.__cityStore.getState().world;
  return { day: Math.floor(s.city.day), capital: s.politics.capital, approval: Math.round(s.sim.lastWeek.approval), population: s.city.population };
});

async function until(page, id, stages, max = 80) {
  const want = Array.isArray(stages) ? stages : [stages];
  for (let i = 0; i < max; i += 1) {
    const now = await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.stage, id);
    if (want.includes(now)) return now;
    await days(page, 1);
  }
  return null;
}

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

async function escape(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

/** 住宅のそばにデータセンターを置く（置けた敷地を返す） */
async function placeNear(page, tries, type = 'datacenter') {
  const before = await lastId(page);
  for (const [cell, turns] of tries) {
    await facility(page, type, cell, turns);
    const why = await page.evaluate(() => document.querySelector('[data-testid="place-hint"]')?.textContent ?? null);
    await escape(page);
    const id = await lastId(page);
    if (id !== before) return { id, cell };
    console.log('  置けなかった', JSON.stringify(cell), why);
  }
  return null;
}

/** 公聴会の窓の論点のうち、答えていない物 */
const openIssues = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="hearing-window"] .hearing-issue')]
  .filter((e) => !e.classList.contains('is-done')).map((e) => e.getAttribute('data-reason')));

/** 答えていない論点に、出せる requires の無い譲歩を出す（押し切らない） */
async function concedeAll(page) {
  for (let k = 0; k < 8; k += 1) {
    const rest = await openIssues(page);
    let done = false;
    for (const r of rest) {
      await page.click(`[data-testid="hearing-window"] .hearing-issue[data-reason="${r}"]`);
      await page.waitForTimeout(150);
      const btn = page.locator('[data-testid="hearing-window"] [data-concession]:not([disabled]):not(:has(.hearing-tech))').first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(300);
        console.log('  譲歩', r, '→', await page.evaluate(() => document.querySelector('[data-testid="hearing-reaction"]')?.textContent ?? null));
        done = true;
        break;
      }
    }
    if (!done) return;
  }
}

/** 採決の画面の 7 人（向き・1 行） */
const seats = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="council-seats"] > li')].map((li) => ({
  id: li.getAttribute('data-member'),
  vote: li.querySelector('.council-vote')?.textContent,
  line: li.querySelector('.council-line')?.textContent,
})));
const verdict = (page) => page.evaluate(() => ({
  yes: document.querySelector('[data-testid="council-yes"]')?.textContent,
  verdict: document.querySelector('[data-testid="council-verdict"]')?.textContent,
}));

async function councilFps(page) {
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

/** 議会の段まで進め、見込みを開いて撮り、説得する */
async function outlookAndPersuade(page, id, cell, tag, name, doPersuade) {
  await closeUp(page, ...cell);
  await page.evaluate((x) => window.__cityStore.getState().openPermit(x), id);
  await page.waitForTimeout(500);
  const b = page.locator('[data-testid="permit-open-council"]');
  console.log('申請の詳細の議会への入口', await b.count() ? await b.textContent() : null);
  if (!(await b.count())) {
    console.log('採決の画面は出ない（同意の案件）');
    await escape(page);
    await zoomOut(page);
    return;
  }
  await b.click();
  await page.waitForSelector('[data-testid="council-window"]');
  const d0 = (await state(page)).day;
  await page.waitForTimeout(2500);
  console.log('採決の画面を開いている間の日付', d0, '→', (await state(page)).day);
  console.log('見込み', JSON.stringify(await verdict(page)));
  for (const s of await seats(page)) console.log(' ', s.id, s.vote, s.line);
  console.log('窓を開いた時に都市が見える割合', await share(page, `${HUD}, ${WINDOWS}`, true), '%', '開いた窓の合計', await share(page, WINDOWS), '%');
  await shot(`${name}-outlook${tag}`);
  // 反対の見込みの最初の議員を説得する
  const no = (await seats(page)).find((s) => s.vote === '反対の見込み');
  if (no) {
    await page.click(`[data-member="${no.id}"] .council-seat-button`);
    await page.waitForTimeout(200);
    console.log('説得する議員', no.id, await page.evaluate(() => document.querySelector('[data-testid="council-profile"]')?.textContent));
    await shot(`${name}-pick${tag}`);
    const btn = page.locator('[data-testid="council-persuade"]');
    if (doPersuade && await btn.isEnabled()) {
      await btn.click();
      await page.waitForTimeout(300);
      console.log('説得の後', JSON.stringify(await verdict(page)), '政治資本', (await state(page)).capital);
      for (const s of await seats(page)) if (s.id === no.id) console.log(' ', s.id, s.vote, s.line);
      await shot(`${name}-persuaded${tag}`);
    }
  }
  await page.click('[data-testid="council-window"] .council-close');
  await page.waitForTimeout(200);
  await escape(page);
  await zoomOut(page);
}

/** 採決の後、結果の画面を開いて 1 人ずつ出る途中と、出きった所を撮る */
async function result(page, id, tag, name) {
  await page.evaluate((x) => window.__cityStore.getState().openCouncil(x), id);
  if (!(await page.locator('[data-testid="council-window"]').count())) {
    console.log('採決の画面は出ない（同意の案件）');
    return;
  }
  await page.waitForTimeout(1300);
  console.log('採決の途中', JSON.stringify(await verdict(page)), 'shown', await page.locator('.council-seat:not(.is-wait)').count());
  await shot(`${name}-reveal${tag}`);
  await page.waitForTimeout(2200);
  console.log('採決の結果', JSON.stringify(await verdict(page)));
  for (const s of await seats(page)) console.log(' ', s.id, s.vote, s.line);
  console.log('fps（採決の窓）', await councilFps(page));
  await shot(`${name}-result${tag}`);
  await page.click('[data-testid="council-window"] .council-close');
  await page.waitForTimeout(200);
}

let shot = async () => {};

export default async function permitG6(page, shoot) {
  // 1 期目の公約を選ぶ窓（G8）は選ばずに閉じる（窓が都市を覆っていると、建設メニューの操作が届かない)
  await closePledges(page);
  shot = shoot;
  const size = await page.evaluate(() => String(window.innerWidth));
  const tag = size === '1920' ? '' : `-${size}`;
  const others = LESSONS.filter((l) => l.domain !== 'db' && l.domain !== 'cloud').map((l) => l.id);
  const recs = mockRecords({ days: 30, perDay: 8, order: others });
  for (let i = 0; i < recs.length; i += 20) {
    await learn(page, recs.slice(i, i + 20));
    if ((await page.evaluate(() => window.__cityStore.getState().city.funds)) >= 9000) break;
  }
  console.log('資金', await page.evaluate(() => window.__cityStore.getState().city.funds));

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
  await escape(page);
  await days(page, 56);
  console.log('町', JSON.stringify(await state(page)), '常時の UI', await share(page, HUD), '%');

  // ---- 1 件目: スキル 0。譲歩だけで答える ----
  const first = await placeNear(page, [[[46, 45], 0]]);
  if (!first) throw new Error('1 件目を置けなかった');
  await until(page, first.id, 'objection');
  await days(page, 4);
  await page.evaluate((x) => window.__cityStore.getState().openPermit(x), first.id);
  await page.waitForTimeout(300);
  const pre = page.locator('[data-testid="permit-preempt"] [data-concession="dc-power-trim"]');
  if (await pre.count()) await pre.click();
  await escape(page);
  await until(page, first.id, ['hearing', 'council'], 20);
  console.log('1 件目 受付の後', JSON.stringify(await appOf(page, first.id)));
  if ((await appOf(page, first.id))?.stage === 'hearing') {
    await page.evaluate((x) => window.__cityStore.getState().openHearing(x), first.id);
    await page.waitForSelector('[data-testid="hearing-window"]');
    await concedeAll(page);
    await page.click('[data-testid="hearing-end"]');
    await page.waitForTimeout(300);
  }
  console.log('1 件目 公聴会の後', JSON.stringify(await appOf(page, first.id)), JSON.stringify(await state(page)));
  await outlookAndPersuade(page, first.id, first.cell, tag, 'g6', false);
  const r1 = await until(page, first.id, ['construction', 'appeal', 'rejected'], 20);
  console.log('1 件目 採決', r1, JSON.stringify(await appOf(page, first.id)));
  console.log('知らせ', await page.evaluate(() => [...document.querySelectorAll('[data-testid="city-notice"]')].map((e) => e.textContent).slice(-3)));
  await shot(`g6-notice${tag}`);
  await result(page, first.id, tag, 'g6');

  // ---- 2 件目: 同じデータセンターを、答えずに公聴会を終える ----
  await page.evaluate(() => window.__city.focusOn(46, 46));
  // 申し立ての境を見るため、反対の組織化を「手ごわい」にする（境 25%・係数 1.25。始め方の選択の窓は G11。ここでは保存データの値を変える）
  await page.evaluate(() => {
    const s = window.__cityStore.getState();
    s.load({ ...s.world, politics: { ...s.world.politics, difficulty: 'tough' } });
  });
  let second;
  if (SECOND === 'rezone') {
    // 一般道の北、住宅の列の東の端に続く 3 マスを工業に塗る（住宅の建物に接するので用途の例外。公聴会を省けない）
    const before2 = await lastId(page);
    await pick(page, 'zone', 'build-zone-industrial');
    await drag(page, [45, 45], [47, 46]);
    await escape(page);
    second = { id: await lastId(page), cell: [46, 46] };
    if (second.id === before2) throw new Error('2 件目（用途地域の変更）が申請にならなかった');
  } else {
    second = await placeNear(page, [[[46, 45], 0], [[45, 45], 0], [[47, 45], 0]], SECOND);
  }
  console.log('2 件目の敷地', JSON.stringify(await page.evaluate((x) => window.__cityStore.getState().world.applications.find((a) => a.id === x)?.target, second?.id)));
  if (!second) throw new Error('2 件目を置けなかった');
  // 受付の間に、電力へ先回りの譲歩
  await until(page, second.id, 'objection');
  await days(page, 4);
  await page.evaluate((x) => window.__cityStore.getState().openPermit(x), second.id);
  await page.waitForTimeout(300);
  const pre2 = page.locator('[data-testid="permit-preempt"] [data-concession]:not([disabled]):not(:has(.hearing-tech))').first();
  if (SECOND !== 'rezone' && await pre2.count()) {
    console.log('  先回りの譲歩', await pre2.getAttribute('data-concession'));
    await pre2.click();
  }
  await escape(page);
  const s2 = await until(page, second.id, ['hearing', 'council'], 40);
  console.log('2 件目 受付の後', s2, JSON.stringify(await appOf(page, second.id)));
  if (s2 === 'hearing') {
    await page.evaluate((x) => window.__cityStore.getState().openHearing(x), second.id);
    await page.waitForSelector('[data-testid="hearing-window"]');
    // 一番大きな論点を押し切り、2 番目の論点に譲歩する。残りには答えない（申し立ての元になる）
    const rest = await openIssues(page);
    if (rest[0]) {
      await page.click(`[data-testid="hearing-window"] .hearing-issue[data-reason="${rest[0]}"]`);
      await page.waitForTimeout(150);
      if (await page.locator('[data-testid="hearing-push"]:not([disabled])').count()) {
        await page.click('[data-testid="hearing-push"]');
        await page.waitForTimeout(300);
        console.log('  押し切る', rest[0], await page.evaluate(() => document.querySelector('[data-testid="hearing-reaction"]')?.textContent ?? null));
      }
    }
    if (rest[1]) {
      await page.click(`[data-testid="hearing-window"] .hearing-issue[data-reason="${rest[1]}"]`);
      await page.waitForTimeout(150);
      const btn = page.locator('[data-testid="hearing-window"] [data-concession]:not([disabled]):not(:has(.hearing-tech))').first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(300);
        console.log('  譲歩', rest[1], await page.evaluate(() => document.querySelector('[data-testid="hearing-reaction"]')?.textContent ?? null));
      }
    }
    await shot(`g6-b-hearing${tag}`);
    await page.click('[data-testid="hearing-end"]');
    await page.waitForTimeout(300);
  }
  console.log('2 件目 公聴会の後', JSON.stringify(await appOf(page, second.id)), JSON.stringify(await state(page)));
  await outlookAndPersuade(page, second.id, second.cell, tag, 'g6-b', true);
  const r2 = await until(page, second.id, ['construction', 'appeal', 'rejected'], 20);
  console.log('2 件目 採決', r2, JSON.stringify(await appOf(page, second.id)));
  await result(page, second.id, tag, 'g6-b');

  // ---- 申し立て ----
  const appealed = r2 === 'appeal' ? second.id : r1 === 'appeal' ? first.id : null;
  if (appealed) {
    await page.evaluate(() => window.__cityStore.getState().openWindow('permits'));
    await page.waitForTimeout(300);
    console.log('一覧の申し立ての印', await page.locator(`[data-testid="permit-row-appeal-${appealed}"]`).count());
    await escape(page);
    await page.evaluate((x) => window.__cityStore.getState().openAppeal(x), appealed);
    await page.waitForSelector('[data-testid="appeal-window"]');
    await page.waitForTimeout(600);
    console.log('申し立ての窓', await page.evaluate(() => document.querySelector('[data-testid="appeal-window"]')?.textContent?.slice(0, 400)));
    await shot(`g6-appeal${tag}`);
    const c = page.locator('[data-testid="appeal-window"] [data-concession]:not([disabled])').first();
    if (await c.count()) {
      await c.click();
      await page.waitForTimeout(300);
      console.log('追加の譲歩の後', JSON.stringify(await appOf(page, appealed)), await page.evaluate(() => document.querySelector('[data-testid="appeal-now"]')?.textContent));
    }
    if ((await appOf(page, appealed))?.appeal?.resolved === undefined && await page.locator('[data-testid="appeal-suppress"]:not([disabled])').count()) {
      await page.click('[data-testid="appeal-suppress"]');
      await page.waitForTimeout(300);
      console.log('政治資本で抑えた後', JSON.stringify(await appOf(page, appealed)), JSON.stringify(await state(page)));
    }
    await shot(`g6-appeal-done${tag}`);
    await escape(page);
    await days(page, 2);
    console.log('申し立ての後', JSON.stringify(await appOf(page, appealed)));
  } else {
    console.log('申し立ては立たなかった');
  }

  // ---- 動きを減らす設定で、採決の結果が一度に出る ----
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForSelector('[data-setting="reduceMotion"]');
  await page.locator('[data-setting="reduceMotion"] button', { hasText: '減らす' }).filter({ hasNotText: '減らさない' }).click();
  await page.evaluate(() => { window.location.hash = '#/city'; });
  await page.waitForFunction(() => document.body.dataset.cityReady === '1');
  await page.waitForTimeout(600);
  await page.evaluate((x) => window.__cityStore.getState().openCouncil(x), first.id);
  await page.waitForSelector('[data-testid="council-window"]');
  await page.waitForTimeout(100);
  console.log('動きを減らす: 開いてすぐ出ている賛否', await page.locator('.council-seat:not(.is-wait)').count(), JSON.stringify(await verdict(page)));
  await shot(`g6-reduced${tag}`);
  await page.click('[data-testid="council-window"] .council-close');
}

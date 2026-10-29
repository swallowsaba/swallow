#!/usr/bin/env node
// ゲームループを 1 本の流れで通して確かめる（VERIFY-ALL.txt【5】・docs/acceptance-criteria.md G1〜G6）。
//
//   node tools/scenarios/loop.mjs
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/loop.mjs
//   SHOOT_SCRIPT=tools/scenarios/loop.mjs npm run shoot -- loop    撮影の道具からも動かせる（途中の画面を shots/loop-<段>.png に撮る）
//
// 新しい記録（空の保存）で、利用者の操作だけで次を通す。途中で 1 回、ページを読み直す。
//   G1 都市を表示（起動直後が都市の画面）
//   G2 都市を操作（キーで移動・拡大・回転、ホイールで拡大、右ドラッグで移動）→ 区画を塗り、市立 IT 学院を置く（申請になる）
//      → 申請中の敷地を押すと、情報パネルに「ここで学ぶ」と申請の詳細の窓 → 時間を進めて審議と工事を終える（docs/game-design.md 15 章）
//   G3 施設を押して選ぶ → 情報パネルの「ここで学ぶ」の 1 本目 → レッスンが開く
//   G4 解説 → 理解 → クイズ →（ページを読み直す: 実戦の段から続き、クイズで得た XP と記録が消えない）→ 実戦 → 結果 → まとめ
//   G5 XP とスキルが docs/game-design.md 3・4 章の式どおりに増える
//   G6 都市へ戻ると、変化の知らせが出て、その施設が選ばれ、カメラが寄る → 学習で得た資金で施設を Lv2 に上げる申請を出し、完成を待つ
// 7 段の操作は tools/scenarios/verify-lesson.mjs と同じ（正解はレッスンの中身から読む。実戦は最後のヒントに書かれた操作だけ）。
// 時間だけは都市の時計を早回しする（審議と工事が終わるのを待つ。tools/scenarios/town.mjs の days・untilBuilt）。
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { at, closePledges, drag, facility, pick, untilBuilt } from './town.mjs';
import { readLesson, siteRoot, verifyLesson } from './verify-lesson.mjs';

const wait = (page, ms = 300) => page.waitForTimeout(ms);
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);

/** docs/game-design.md 4 章の段階（スキルの値 → 0〜5） */
const stageOf = (v) => (v >= 90 ? 5 : v >= 70 ? 4 : v >= 50 ? 3 : v >= 30 ? 2 : v >= 10 ? 1 : 0);
const WEIGHT = { beginner: 1, intermediate: 2, advanced: 3 };
const LEVEL = { b: 'beginner', i: 'intermediate', a: 'advanced' };

/**
 * 空の記録から 1 本を終えた時の、式どおりの XP とスキル（docs/game-design.md 3・4 章）。
 * クイズは全て初回で正解、実戦はヒントを開いて成功（ヒントありは半分。自力の回復の加点は無い）、復習の札は予定日の前
 */
export function expectedGain(id) {
  const lesson = readLesson(id);
  const level = LEVEL[id.split('.')[1]];
  const catalog = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;
  const domain = id.split('.')[0];
  const total = catalog.filter((l) => l.domain === domain).reduce((n, l) => n + WEIGHT[l.level], 0);
  const skill = Math.round(40 * (WEIGHT[level] / total) + 25 * 1 + 25 * 0.5 + 10 * 1);
  const complete = { beginner: 30, intermediate: 50, advanced: 80 }[level];
  const practice = Math.round({ beginner: 20, intermediate: 35, advanced: 55 }[level] / 2);
  const xp = complete + 5 * lesson.quiz.length + practice + 50 * stageOf(skill);
  return { xp, skill, parts: { complete, quiz: 5 * lesson.quiz.length, practice, skillUp: 50 * stageOf(skill) } };
}

const cityOf = (page) => page.evaluate(() => {
  const s = window.__cityStore.getState();
  return { funds: s.city.funds, facilities: s.city.facilities.map((f) => ({ id: f.id, type: f.type, level: f.level, origin: f.origin })), selected: s.selected };
});

/** マスの中心の、画面の真ん中からの距離 */
const offCenter = (page, x, y) => page.evaluate(([cx, cy]) => {
  const p = window.__city.screenOf(cx, cy);
  return Math.hypot(p.sx - window.innerWidth / 2, p.sy - window.innerHeight / 2);
}, [x, y]);

/**
 * ゲームループを通す。page は都市の画面を開いた直後（新しい記録）。shot(名前) で途中の画面を撮る。
 * 返す物: { ok, checks: [{ g, ok, saw }], lesson }
 */
export async function runLoop(page, shot = async () => {}) {
  const checks = [];
  const check = (g, ok, saw) => {
    checks.push({ g, ok: Boolean(ok), saw });
    console.log(`${ok ? '○' : '×'} ${g}: ${saw}`);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  let lessonId = null;
  try {
    // G1: 起動直後に都市の画面（学習サイトのトップではない）
    await page.waitForSelector('[data-testid="city-screen"]');
    await page.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 60000 });
    const first = await page.evaluate(() => ({ hash: window.location.hash, lesson: !!document.querySelector('[data-testid="lesson-screen"]'), learn: !!document.querySelector('[data-testid="learn-screen"]') }));
    check('G1 起動直後に都市の画面', !first.lesson && !first.learn && ['', '#/', '#/city'].includes(first.hash), `場所 ${first.hash || '(なし)'}・レッスンの画面 ${first.lesson ? 'あり' : 'なし'}・学習ライブラリ ${first.learn ? 'あり' : 'なし'}`);
    // 初回は始め方の選択（docs/ui-design.md 10.12）を「ふつう」で閉じてから、操作説明を Enter で読み進める（撮影の道具から動かした時は、もう閉じている）
    await page.locator('[data-testid="start-go"]').click({ timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 3 && (await page.$('[data-testid="intro"]')); i += 1) {
      await page.keyboard.press('Enter');
      await wait(page, 200);
    }
    // 1 期目の公約を選ぶ窓（G8）は選ばずに閉じる（上の帯の任期から後で選べる）
    await closePledges(page);
    await shot('loop-g1');

    // G2: 移動・拡大縮小・回転。同じマスの画面の位置が変わる
    const moved = [];
    for (const [name, act] of [
      ['キー D で移動', async () => { await page.keyboard.down('d'); await wait(page, 250); await page.keyboard.up('d'); }],
      ['キー + で拡大', () => page.keyboard.press('+')],
      ['キー E で回転', () => page.keyboard.press('e')],
      ['ホイールで縮小', async () => { await page.mouse.move(960, 540); await page.mouse.wheel(0, 120); }],
      ['右ドラッグで移動', async () => {
        await page.mouse.move(900, 500);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(1020, 560, { steps: 6 });
        await page.mouse.up({ button: 'right' });
      }],
      ['キー Q で回転を戻す', () => page.keyboard.press('q')],
    ]) {
      const before = await at(page, 48, 47);
      await act();
      await wait(page, 350);
      const after = await at(page, 48, 47);
      if (Math.hypot(after.sx - before.sx, after.sy - before.sy) > 2) moved.push(name);
    }
    check('G2 移動・拡大縮小・回転', moved.length === 6, `動いた操作 ${moved.join('・')}（6 つ中 ${String(moved.length)}）`);
    await page.evaluate(() => window.__city.focusOn(46, 46));
    await wait(page);

    // 都市を形づくる: 住宅の区画を塗り、市立 IT 学院を初めの道路の北に置く（1 本学んだ資金で Lv2 に上げられる広さ）
    await pick(page, 'zone', 'build-zone-residential');
    await drag(page, [47, 46], [57, 46]);
    await facility(page, 'academy', [41, 45]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // 置くと申請になる。敷地を押すと、情報パネルに段階と「ここで学ぶ」、申請の詳細の窓が開く（申請中の施設からも学べる）
    const filed = await page.evaluate(() => window.__cityStore.getState().world.applications.map((a) => ({ id: a.id, stage: a.stage, type: a.target.type, origin: a.target.origin })));
    const site = filed.find((a) => a.type === 'academy');
    let pending = { panel: null, lessons: 0, window: false };
    if (site?.origin) {
      await page.evaluate(() => window.__city.focusOn(42.5, 44.5));
      await wait(page, 400);
      const p = await at(page, site.origin.x + 1, site.origin.y + 1);
      await page.mouse.click(p.sx, p.sy);
      await page.waitForSelector('[data-testid="permit-window"]', { timeout: 5000 }).catch(() => {});
      pending = {
        panel: await text(page, '[data-testid="info-state"]'),
        lessons: await page.locator('[data-testid="info-lessons"] button').count(),
        window: Boolean(await page.$('[data-testid="permit-window"]')),
      };
      await shot('loop-g2-permit');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    check('G2 施設を置くと申請になり、申請中の敷地からも学べる', site?.stage === 'zoning' && pending.lessons > 0 && pending.window,
      `申請 ${site ? `${site.type}・${site.stage}` : 'なし'}・情報パネル「${pending.panel ?? 'なし'}」・ここで学ぶ ${String(pending.lessons)} 本・申請の詳細の窓 ${pending.window ? 'あり' : 'なし'}`);
    const done = await untilBuilt(page, 'academy');
    const built = await cityOf(page);
    const academy = built.facilities.find((f) => f.type === 'academy');
    if (!academy || !done) throw new Error('市立 IT 学院の審議と工事が終わらなかった');
    await page.evaluate(() => window.__city.focusOn(46, 47));
    await wait(page, 500);
    await shot('loop-g2-town');

    // G3: 施設を押して選ぶ → 情報パネル → 「ここで学ぶ」の 1 本目
    const spot = await at(page, academy.origin.x + 1, academy.origin.y + 1);
    await page.mouse.click(spot.sx, spot.sy);
    await page.waitForSelector('[data-testid="info-panel"]', { timeout: 5000 }).catch(() => {});
    const panelName = await text(page, '[data-testid="info-panel"] .info-name');
    const lessonsShown = await page.evaluate(() => [...document.querySelectorAll('[data-testid="info-lessons"] .info-lesson-title')].map((e) => e.textContent));
    await shot('loop-g3-panel');
    const firstLesson = page.locator('[data-testid="info-lessons"] button').first();
    const title = lessonsShown[0] ?? '';
    await firstLesson.click();
    await page.waitForSelector('[data-testid="lesson-screen"]');
    lessonId = await page.evaluate(() => decodeURIComponent(window.location.hash.replace(/^#\/lesson\//, '').split('/')[0] ?? ''));
    check('G3 施設を選ぶと情報パネル、おすすめの学習から始められる', panelName?.includes('市立 IT 学院') && lessonsShown.length > 0 && Boolean(lessonId), `パネル「${panelName ?? 'なし'}」・ここで学ぶ ${lessonsShown.join(' ／ ')}・「${title}」を押して ${lessonId} が開いた`);

    // G4: 7 段。クイズを終えた所でページを読み直す
    let reload = null;
    const before = await page.evaluate(() => window.__game.progress().xp);
    const rec = await verifyLesson(page, lessonId, {
      opened: true,
      shotDir: 'shots/loop',
      onStage: async (stage) => {
        if (stage === '解説') await shot('loop-g4-explain');
        if (stage === 'クイズ') await shot('loop-g4-quiz');
        if (stage === '結果') await shot('loop-g4-practice-done');
        if (stage !== '実戦') return;
        // 記録は、鍵の順を揃えて比べる（保存から読み直すと、鍵の並びだけが変わる）
        const was = await page.evaluate((id) => {
          const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
          const p = window.__game.progress();
          return { xp: p.xp, lesson: JSON.stringify(sorted(p.lessons[id] ?? null)) };
        }, lessonId);
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('[data-testid="stage-practice"]', { timeout: 30000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        const now = await page.evaluate((id) => {
          const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
          const p = window.__game?.progress();
          return { xp: p?.xp, lesson: JSON.stringify(sorted(p?.lessons[id] ?? null)), hash: window.location.hash, resumed: !!document.querySelector('[data-testid="stage-practice"]') };
        }, lessonId);
        reload = { was, now };
        await wait(page, 700);
        await shot('loop-g4-reloaded');
      },
    });
    check('G4 読み直しても、実戦の段から続き、XP と記録が消えない', reload && reload.now.resumed && reload.was.xp > 0 && reload.now.xp === reload.was.xp && reload.now.lesson === reload.was.lesson,
      reload ? `読み直した後 ${reload.now.hash}・実戦の段 ${reload.now.resumed ? 'あり' : 'なし'}・XP ${String(reload.was.xp)} → ${String(reload.now.xp)}・レッスンの記録 ${reload.now.lesson === reload.was.lesson ? '同じ' : `違う（前 ${reload.was.lesson}、後 ${reload.now.lesson}）`}` : '読み直す所まで進めない');
    check('G4 7 段を通せる', rec.ok, rec.ok ? `解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP / スキル → 都市（${rec.notes.join('・')}）` : `[${rec.stage}] ${rec.saw}`);

    // G5: XP とスキルが式どおり
    const want = expectedGain(lessonId);
    const got = await page.evaluate(({ id, domain }) => {
      const p = window.__game.progress();
      return { xp: p.xp, record: p.lessons[id]?.completions ?? 0, domain };
    }, { id: lessonId, domain: lessonId.split('.')[0] });
    const skillNote = rec.notes.find((n) => n.startsWith('XP +')) ?? '';
    const skillShown = Number(/スキル (\d+)/.exec(skillNote)?.[1] ?? NaN);
    check('G5 XP とスキルが式どおりに増える', got.xp - before === want.xp && skillShown === want.skill,
      `XP +${String(got.xp - before)}（式: まとめ ${String(want.parts.complete)} + クイズ ${String(want.parts.quiz)} + 実戦（ヒントあり）${String(want.parts.practice)} + 段階が上がった ${String(want.parts.skillUp)} = ${String(want.xp)}）・スキル ${String(skillShown)}（式: ${String(want.skill)}）`);

    // G6: 都市へ戻ると、変化の知らせ・施設が選ばれ、カメラが寄る（verifyLesson が「都市へ戻る」を押した直後）
    await wait(page, 600);
    const notice = await text(page, '.city-notice');
    const back = await cityOf(page);
    const dist = await offCenter(page, academy.origin.x + 1.5, academy.origin.y + 1.5);
    await shot('loop-g6-back');
    const selected = JSON.stringify(back.selected ?? '');
    check('G6 都市へ戻ると変化が見え、その場所へカメラが寄る', Boolean(notice) && selected.includes(academy.id) && dist < 80,
      `知らせ「${notice ?? 'なし'}」・選ばれた物 ${selected}・施設の真ん中から画面の真ん中まで ${String(Math.round(dist))}px`);

    // 都市が発展: 学習で得た資金で、選ばれた施設を Lv2 に上げる
    const fundsBefore = back.funds;
    let applied = null;
    if (await page.$('[data-testid="info-upgrade"]')) {
      await page.click('[data-testid="info-upgrade"]');
      await wait(page, 800);
      applied = await text(page, '.city-notice');
      // アップグレードも申請になる。反対の受付 → 議会 → 工事 21 日の後に Lv が上がる
      await untilBuilt(page, 'academy', 2);
      await wait(page, 500);
    }
    const up = await cityOf(page);
    const lv = up.facilities.find((f) => f.id === academy.id)?.level ?? 0;
    await shot('loop-g6-upgraded');
    check('G6 学習で得た資金で施設が発展する', lv === 2 && up.funds < fundsBefore, `市立 IT 学院 Lv${String(lv)}・資金 ${String(fundsBefore)} → ${String(up.funds)}・申請の知らせ「${applied ?? 'なし'}」・上げられない理由「${await text(page, '[data-testid="info-upgrade-blocked"]') ?? 'なし'}」`);
  } catch (e) {
    check('台本', false, `進めない: ${String(e.message ?? e).split('\n')[0]}`);
    await shot('loop-stuck').catch(() => {});
  }
  if (errors.length > 0) check('ページの誤り', false, errors.join(' ／ '));
  return { ok: checks.every((c) => c.ok), checks, lesson: lessonId };
}

/** 撮影の道具（npm run shoot）から動かす時 */
export default async function loop(page, shot) {
  await runLoop(page, shot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { mkdirSync } = await import('node:fs');
  const { chromium } = await import('playwright');
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  let result = { ok: false };
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    mkdirSync('shots/loop', { recursive: true });
    await page.goto(root, { waitUntil: 'load' });
    result = await runLoop(page, async (name) => {
      await page.screenshot({ path: `shots/loop/${name}.png` });
    });
    await context.close();
  } finally {
    await browser.close();
    await close();
  }
  console.log(result.ok ? '\n合格' : '\n不合格');
  process.exitCode = result.ok ? 0 : 1;
}

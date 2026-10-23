#!/usr/bin/env node
// ドラッグの実戦（sim-connect・sim-assign・sim-order）を、画面を撮って確かめる（VERIFY-ALL.txt【4】・REWORK-PRACTICE.txt 原則 4）。
//
//   node tools/scenarios/verify-drag.mjs                 全て
//   node tools/scenarios/verify-drag.mjs found.b.01 sec  分野か ID で絞る
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-drag.mjs
//   VERIFY_SIZE=1280x720                                 画面の大きさ（既定 1920x1080）
//
// 1 本ごとに、新しい記録で実戦を開き、次の順に本物のマウスのドラッグで操作して確かめる。
//   1. 開いた所を撮る（-start）
//   2. わざと誤る（tools/scenarios/simDrive.mjs の wrongAction）。赤い印と、何が違うかの理由が 1 行（1 つの文の行。枠の幅で折り返してよい）で出るか（-wrong）
//   3. 「初めに戻す」で、線・枠の中・並びが開いた時と同じに戻るか（-reset）
//   4. 最後のヒントの操作（手順の actions）を行う。最初のドラッグの途中で、指先に札か線が付いて動き、受け口が光るか（-drag）
//      全ての手順が達成になるか。置いた・つないだ・並べた結果が動きで出るか（動きの始まり animationstart を数える。
//      つないだ線は、光の粒が流れ続けるか）（-done）
//   5. 動きを減らす設定（OS の prefers-reduced-motion と、ゲームの「動きを減らす」）で、2 と 4 を繰り返す。
//      動きが 1 つも始まらず、光の粒が見えず、赤い印と達成（終わりの形）は出るか（-reduced-wrong・-reduced-done）
// VERIFY_SIZE を付けた時は、開いた所・誤った所・終えた所で、文の重なり・切れ・はみ出しも見る（VERIFY-FREE.txt【3】。tools/scenarios/layoutCheck.mjs）。
// 持つ物と受け口を同時に見られない（画面の外にある）時は、運ぶ前に止まる（simDrive.mjs の dragTo）。
// 画像は shots/verify-drag/<ID>-<段>.png、結果は shots/verify-drag/results.json と table.md。
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { allLessonIds, readLesson, siteRoot } from './verify-lesson.mjs';
import { layoutProblems } from './layoutCheck.mjs';
import { perform, wrongAction } from './simDrive.mjs';

const DIR = 'shots/verify-drag';
const [W, H] = (process.env.VERIFY_SIZE ?? '1920x1080').split('x').map(Number);
const wait = (page, ms = 250) => page.waitForTimeout(ms);

/** 実戦の型（中身の setup の形から） */
export function dragKind(lesson) {
  const p = lesson.practice;
  if (p.mode !== 'simulation') return null;
  if (p.setup.nodes) return 'connect';
  if (p.setup.slots) return 'assign';
  if (p.setup.items) return 'order';
  return null;
}

/** 盤の今の形（線・枠の中・並び・置き場・達成した手順） */
const boardOf = (page) => page.evaluate(() => {
  const ids = (root, attr) => [...root.querySelectorAll(`[${attr}]`)].map((e) => e.getAttribute(attr));
  const doc = document;
  return {
    wires: ids(doc, 'data-wire').sort(),
    slots: Object.fromEntries([...doc.querySelectorAll('[data-slot]')].map((s) => [s.dataset.slot, ids(s, 'data-card').sort()])),
    stages: [...doc.querySelectorAll('.sim-stage')].map((st) => ids(st, 'data-card')),
    pool: [...doc.querySelectorAll('.sim-pool [data-card]')].map((c) => c.dataset.card).sort(),
    sent: [...doc.querySelectorAll('.sim-send.is-arrived')].map((b) => b.dataset.send).sort(),
    done: [...doc.querySelectorAll('.practice-step')].map((s) => s.dataset.done === 'true'),
  };
});

/** 赤い印と、理由の文（見えている物だけ）。理由は描かれた行の数も返す */
const wrongOf = (page) => page.evaluate(() => {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const marks = [...document.querySelectorAll('.sim-slot.is-refused, .sim-card.is-wrong, .sim-stage.is-stop, .sim-node.is-stuck, .sim-node.is-refuse, .sim-packet.is-stuck, .sim-note.is-bad')].filter(shown).map((e) => (e.getAttribute('class') ?? '').replace(/\s+/g, ' '));
  // 描かれた行の数（字の並ぶ高さの違う所を数える）
  const linesOf = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.bottom))).size;
  };
  const reasons = [...document.querySelectorAll('.sim-note.is-bad, .sim-slot-why, .sim-stage-why, .sim-node-stuck')].filter(shown).map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), oneLine: !e.innerText.trim().includes('\n'), lines: linesOf(e) }));
  const guide = document.querySelector('[data-testid="practice-error"]')?.getAttribute('data-guide') ?? null;
  return { marks, reasons, guide };
});

/** 今見えている光の粒の数と、その位置（流れているかを比べる） */
const particlesOf = (page) => page.evaluate(() => [...document.querySelectorAll('.sim-particle')].filter((e) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && getComputedStyle(e).display !== 'none';
}).map((e) => {
  const r = e.getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top)];
}));

/** 持っている途中の見え方（指先に付いて動く物・光る受け口・持つ物のカーソル） */
const carryOf = (page) => page.evaluate(() => {
  const ghost = document.querySelector('.sim-ghost');
  const draft = document.querySelector('.sim-wire-draft');
  return {
    ghost: ghost ? ghost.textContent : null,
    draft: draft !== null,
    over: [...document.querySelectorAll('.sim-console .is-over')].map((e) => e.getAttribute('data-drop') ?? e.querySelector('[data-drop]')?.getAttribute('data-drop') ?? (e.getAttribute('class') ?? '').split(' ')[0]),
    tip: document.querySelector('.sim-drag-tip')?.textContent ?? null,
    red: [...document.querySelectorAll('.sim-console .is-refuse, .sim-console .is-refused, .sim-wire-draft.is-bad, .sim-drag-tip.is-bad')].map((e) => (e.getAttribute('class') ?? '').split(' ')[0]),
    carrying: document.querySelector('.sim-console .is-carrying') !== null,
  };
});

/** 実戦の画面を、新しい記録で開く（都市 → レッスンの記録を実戦まで進め、その画面へ） */
async function openPractice(browser, root, id, { reduced = null } = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: reduced === 'os' ? 'reduce' : 'no-preference' });
  // 動きの始まりを数える（模擬の画面の中と、指先に付いて動く札）
  await context.addInitScript(() => {
    window.__anims = [];
    document.addEventListener('animationstart', (e) => {
      const t = e.target;
      if (t instanceof Element && (t.closest('.sim-console') || t.classList.contains('sim-ghost'))) window.__anims.push(`${(t.getAttribute('class') ?? '').split(' ')[0]}:${e.animationName}`);
    }, true);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await page.goto(root, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-testid="intro"] .intro-skip').click({ timeout: 10000 }).catch(() => {});
  if (reduced === 'game') {
    // ゲームの設定の画面で「動きを減らす」を「減らす」にする
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.locator('[data-setting="reduceMotion"] button', { hasText: '減らす' }).filter({ hasNotText: '減らさない' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced');
  }
  await page.evaluate((lessonId) => {
    const store = window.__game.store;
    store.getState().start(lessonId, new Date().toISOString());
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach(lessonId, st);
    window.location.hash = `#/lesson/${lessonId}`;
  }, id);
  await page.waitForSelector('[data-testid="sim-console"]');
  await wait(page, 700);
  return { context, page, errors };
}

const animsTake = (page) => page.evaluate(() => window.__anims.splice(0));

/** わざと誤る。最初のドラッグの途中の見え方も返す */
async function doWrong(page, p) {
  const bad = wrongAction(p.setup, p.steps[0]);
  if (!bad) return null;
  await animsTake(page);
  let mid = null;
  for (const a of [bad].flat()) {
    await perform(page, a, p.setup, mid === null ? async () => { mid = await carryOf(page); } : undefined);
  }
  await wait(page, 700);
  return { actions: [bad].flat(), mid, ...(await wrongOf(page)), anims: await animsTake(page) };
}

/** 最後のヒントの操作を全て行う。最初のドラッグの途中を撮る */
async function doRight(page, p, shot) {
  await animsTake(page);
  let mid = null;
  const stepDone = [];
  for (const step of p.steps) {
    for (const a of step.actions ?? []) {
      const drags = ['connect', 'put', 'take', 'arrange'].includes(a.op);
      await perform(page, a, p.setup, drags && mid === null ? async () => {
        mid = await carryOf(page);
        if (shot) await shot('drag');
      } : undefined);
    }
    stepDone.push((await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true');
  }
  await wait(page, 600);
  return { mid, stepDone, anims: await animsTake(page) };
}

export async function verifyDrag(browser, root, id) {
  const lesson = readLesson(id);
  const p = lesson.practice;
  const kind = dragKind(lesson);
  const rec = { id, kind, ok: false, checks: {}, notes: [], shots: [] };
  const problems = [];
  mkdirSync(DIR, { recursive: true });
  const tag = W === 1920 ? '' : `-${String(W)}`;

  // 1〜4: 動きのある設定
  {
    const { context, page, errors } = await openPractice(browser, root, id);
    const shot = async (name) => {
      const path = `${DIR}/${id}${tag}-${name}.png`;
      await page.screenshot({ path });
      rec.shots.push(path);
      // 小さい画面では、撮った画面の文の崩れを見る（ドラッグの途中は除く）
      if (tag && name !== 'drag') for (const x of await layoutProblems(page)) problems.push(`${name}: ${x}（${path}）`);
    };
    try {
      await shot('start');
      const first = await boardOf(page);
      // 初めから赤い印のある並び（片付ける前の机など）は、それを初めの形とする
      const firstMarks = (await wrongOf(page)).marks;

      const wrong = await doWrong(page, p);
      if (wrong) {
        await shot('wrong');
        rec.wrong = wrong;
        // 1 行: 理由は 1 つの文の行（改行で分けた説明や、並んだ複数の文ではない）
        const one = wrong.reasons.filter((r) => r.oneLine);
        if (wrong.marks.length === 0 && !(wrong.mid?.red.length > 0)) problems.push('誤った時に赤い印が無い');
        if (wrong.reasons.length === 0) problems.push('誤った時に理由の文が無い');
        else if (one.length === 0) problems.push(`理由が 1 行でない（${wrong.reasons.map((r) => r.text).join(' ／ ')}）`);
        if (!wrong.anims.some((a) => /refuse|shake|stuck|stage-stop/.test(a))) problems.push(`誤った時に赤く光る動きが無い（動き: ${wrong.anims.join(' ') || 'なし'}）`);
        rec.checks.wrong = (wrong.marks.length > 0 || wrong.mid?.red.length > 0) && one.length > 0;
      } else {
        rec.notes.push('わざと誤る操作が無い');
      }

      await page.click('[data-testid="practice-reset"]');
      await wait(page, 400);
      await page.locator('.practice-error-close').click({ timeout: 500 }).catch(() => {});
      const back = await boardOf(page);
      await shot('reset');
      const same = JSON.stringify({ ...back, done: null }) === JSON.stringify({ ...first, done: null });
      if (!same) problems.push(`「初めに戻す」で初めの形に戻らない（初め ${JSON.stringify(first)}、戻した後 ${JSON.stringify(back)}）`);
      const leftover = await wrongOf(page);
      const stays = leftover.marks.filter((m) => !firstMarks.includes(m));
      if (stays.length > 0 || leftover.reasons.length > 0) problems.push(`「初めに戻す」の後も赤い印・理由が残る（${[...stays, ...leftover.reasons.map((r) => r.text)].join(' ／ ')}）`);

      const right = await doRight(page, p, shot);
      rec.right = right;
      const mid = right.mid;
      const grab = mid !== null && (mid.ghost !== null || mid.draft) && mid.over.length > 0 && mid.carrying;
      if (!grab) problems.push(`ドラッグの途中で、持つ物が指先に付いて動き受け口が光る、が見えない（${JSON.stringify(mid)}）`);
      if (right.stepDone.some((d) => !d)) problems.push(`最後のヒントの操作で達成にならない手順がある（${right.stepDone.map((d, i) => `${p.steps[i].id}:${d ? '済' : 'まだ'}`).join(' ')}）`);
      const moved = right.anims.filter((a) => !/^sim-ghost/.test(a));
      if (moved.length === 0) problems.push('操作の結果が動きで出ない（動きが始まらない）');
      await shot('done');
      if (kind === 'connect') {
        const a = await particlesOf(page);
        await wait(page, 400);
        const b = await particlesOf(page);
        rec.particles = a.length;
        if (a.length === 0) problems.push('つないだ線に光の粒が無い');
        else if (JSON.stringify(a) === JSON.stringify(b)) problems.push('光の粒が流れていない（0.4 秒で位置が変わらない）');
      }
      rec.checks.grab = grab;
      rec.checks.done = right.stepDone.every(Boolean);
      rec.checks.reset = same;
      rec.checks.motion = moved.length > 0;
      if (errors.length > 0) problems.push(`ページの誤り: ${errors.join(' ／ ')}`);
    } catch (e) {
      problems.push(`台本が進めない: ${String(e.message ?? e).split('\n')[0]}`);
      await shot('stuck').catch(() => {});
    } finally {
      await context.close();
    }
  }

  // 5: 動きを減らす設定（OS と、ゲームの設定）
  for (const reduced of ['os', 'game']) {
    const { context, page, errors } = await openPractice(browser, root, id, { reduced });
    const label = reduced === 'os' ? 'prefers-reduced-motion' : 'ゲームの「動きを減らす」';
    try {
      const wrong = await doWrong(page, p);
      if (reduced === 'os') {
        const path = `${DIR}/${id}${tag}-reduced-wrong.png`;
        await page.screenshot({ path });
        rec.shots.push(path);
      }
      if (wrong) {
        if (wrong.marks.length === 0 || wrong.reasons.length === 0) problems.push(`${label}: 誤った時の赤い印・理由が出ない`);
        if (wrong.anims.length > 0) problems.push(`${label}: 誤った時に動きが始まる（${wrong.anims.join(' ')}）`);
      }
      await page.click('[data-testid="practice-reset"]');
      await wait(page, 400);
      await page.locator('.practice-error-close').click({ timeout: 500 }).catch(() => {});
      const right = await doRight(page, p, null);
      if (reduced === 'os') {
        const path = `${DIR}/${id}${tag}-reduced-done.png`;
        await page.screenshot({ path });
        rec.shots.push(path);
      }
      if (right.stepDone.some((d) => !d)) problems.push(`${label}: 達成にならない手順がある`);
      if (right.anims.length > 0) problems.push(`${label}: 動きが始まる（${[...new Set(right.anims)].join(' ')}）`);
      const parts = await particlesOf(page);
      if (parts.length > 0) problems.push(`${label}: 光の粒が見える（${String(parts.length)} 個）`);
      rec.checks[reduced === 'os' ? 'reducedOs' : 'reducedGame'] = wrong === null || (wrong.anims.length === 0 && right.anims.length === 0 && parts.length === 0);
      if (errors.length > 0) problems.push(`${label}: ページの誤り: ${errors.join(' ／ ')}`);
    } catch (e) {
      problems.push(`${label}: 台本が進めない: ${String(e.message ?? e).split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
  rec.problems = problems;
  rec.ok = problems.length === 0;
  return rec;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const mark = (b) => (b === undefined ? '-' : b ? '○' : '×');

function rowOf(r) {
  const why = r.wrong ? `${r.wrong.reasons.map((x) => x.text).join(' ／ ')}` : '';
  return `| ${r.id} | ${r.kind} | ${mark(r.checks.grab)} | ${mark(r.checks.done)} | ${mark(r.checks.wrong)} | ${mark(r.checks.reset)} | ${mark(r.checks.motion)}${r.particles ? `（粒 ${String(r.particles)}）` : ''} | ${mark(r.checks.reducedOs)}・${mark(r.checks.reducedGame)} | ${cell(why)} | ${r.ok ? '合格' : `不合格: ${cell(r.problems.join(' ／ '))}`} |`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const ids = allLessonIds().filter((id) => dragKind(readLesson(id)) !== null && (args.length === 0 || args.some((w) => id === w || id.startsWith(`${w}.`))));
  const { chromium } = await import('playwright');
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  const list = [];
  try {
    for (const id of ids) {
      const rec = await verifyDrag(browser, root, id);
      list.push(rec);
      console.log(`${rec.ok ? '合格' : '不合格'} ${id}（${rec.kind}）${rec.ok ? '' : `\n  ${rec.problems.join('\n  ')}`}`);
    }
  } finally {
    await browser.close();
    await close();
  }
  mkdirSync(DIR, { recursive: true });
  const tag = W === 1920 ? '' : `-${String(W)}`;
  writeFileSync(`${DIR}/results${tag}.json`, `${JSON.stringify(list, null, 2)}\n`);
  writeFileSync(`${DIR}/table${tag}.md`, [
    '| レッスン | 型 | つかんで動かせる | 正しく置けば達成 | 誤りが 1 行で出る | やり直せる | 結果が動く | 動きを減らす（OS・ゲーム） | 誤った時の理由 | 結果 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...list.map(rowOf),
    '',
  ].join('\n'));
  const bad = list.filter((r) => !r.ok).length;
  console.log(`\n${String(list.length)} 本中 合格 ${String(list.length - bad)}・不合格 ${String(bad)}`);
  process.exitCode = bad > 0 ? 1 : 0;
}

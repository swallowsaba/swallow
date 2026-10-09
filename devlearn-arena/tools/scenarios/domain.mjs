// 分野ごとの視覚確認の台本（docs/development-plan.md Phase 10「分野ごとに 1 本、全段を撮影」）。
//
//   LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/domain.mjs npm run shoot -- p10-found
//   SHOOT_SIZE=1280x720 LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/domain.mjs npm run shoot -- p10-found-1280
//
// レッスンの中身（content/lessons）を読んで正しく答え、7 段を通す: 解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP / スキル。
// 実戦は、各手順の最初に 1 度わざと誤った文（コマンド）を入れてエラーの小窓を撮り、最後のヒントの答えを入れて進める。
// 画面で操作する実戦（模）は、手順の actions をマウスのドラッグと押す操作で行う（tools/scenarios/simDrive.mjs）。わざと誤る操作も画面で行う。
// FIRST='docker logs web' を付けると、わざと誤る代わりにその行を入れる（出力に当てる想定エラーの小窓を撮る）。
// 2 つ以上の欄を選んで出来上がる誤りは、FIRST='set a 1 ;; set b 2' のように ` ;; ` で区切って順に入れる。
// RESET=1 を付けると、エラーの小窓を撮った後に「初めに戻す」を押してから答える。
// FIRST_STEP=手順の ID を付けると、最初の手順の代わりにその手順でわざと誤る。
// 答える手順で FIRST を端末に打つ時は FIRST_TERM=1 を付ける。
// HINTS=1 を付けると、最初の手順のヒント 3 段を開いた画面（-hints）も撮る。
// 撮る物: p10-<分野>-explain・-understand・-quiz・-practice・-error・-afterward・-result・-summary・-done（-1280 も）
import { perform, wrongAction } from './simDrive.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const next = (page) => page.click('[data-testid="lesson-next"]');
const wait = (page, ms = 300) => page.waitForTimeout(ms);

/** 画面の字が text と同じボタンを押す（用語の印は画面の語に直して比べる） */
async function clickText(page, selector, label) {
  const seen = await page.evaluate(([sel, want]) => {
    // 用語の印の前後に入る空白に左右されないよう、空白を除いて比べる
    const norm = (s) => s.replace(/\s+/g, '');
    const all = [...document.querySelectorAll(sel)];
    const el = all.find((b) => norm(b.innerText) === norm(want));
    if (!el) return all.map((b) => norm(b.innerText));
    el.click();
    return null;
  }, [selector, label]);
  if (seen !== null) throw new Error(`「${label}」が ${selector} に無い（あるのは ${seen.join(' ／ ')}）`);
  await wait(page, 120);
}

/** 最後のヒントの `...`（打つ物・入れる文） */
const answersOf = (step) => [...step.hints[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);

export default async function domain(page, shot) {
  const id = process.env.LESSON ?? 'found.b.01';
  const dom = id.split('.')[0];
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = process.env.TAG ?? `p10-${dom}${w === '1920' ? '' : `-${w}`}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', (e.stack ?? '').split('\n').slice(0, 5).join(' | ')));

  // 中身と用語集（用語の印を画面の語に直す）
  const data = await page.evaluate(async ([lessonId, d]) => {
    const lesson = await fetch(`/content/lessons/${d}/${lessonId}.json`).then((r) => r.json());
    const files = ['found', 'linux', 'net', 'web', 'sec', 'git', 'cicd', 'ctr', 'docker', 'k8s', 'db', 'cloud', 'mon', 'devops', 'trouble', 'lab'];
    const words = {};
    for (const f of files) {
      const r = await fetch(`/content/glossary/${f}.json`);
      if (!r.ok) continue;
      try {
        for (const t of (await r.json()).terms) words[t.id] = t.word;
      } catch { /* 無い分野 */ }
    }
    return { lesson, words };
  }, [id, dom]);
  // 画面に出る字（用語の印は語に、`...` は中身に）
  const plain = (s) => s.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, t) => data.words[t] ?? t).replace(/`([^`]+)`/g, '$1');
  const { lesson } = data;

  await page.evaluate((lessonId) => {
    window.location.hash = `#/lesson/${lessonId}`;
  }, id);
  await page.waitForSelector('[data-testid="stage-explain"]');
  await wait(page, 600);
  console.log('始めた', id, await text(page, '.lesson-bar'));
  await shot(`${tag}-explain`);

  // 解説（4 問い ＋ 状況説明）
  const screens = lesson.explain.situation ? 5 : 4;
  for (let i = 0; i < screens; i += 1) {
    await next(page);
    await wait(page, 200);
  }

  // 理解
  await page.waitForSelector('[data-testid="stage-understand"]');
  for (const [i, u] of lesson.understand.entries()) {
    await page.waitForSelector('[data-testid="understand-item"]');
    if (u.kind === 'figure-pick') {
      for (const part of u.answer) await page.click(`[data-testid="lesson-figure"] [data-part="${part}"]`);
      // 答えが複数の部分なら、全て押してから「確かめる」
      if (u.answer.length > 1) await page.click('.stage-check');
    } else if (u.kind === 'yesno') {
      await clickText(page, '.yesno-button', u.answer ? 'はい' : 'いいえ');
    } else if (u.kind === 'relation') {
      const word = { contains: 'を含む', before: 'より先に起きる', cause: 'が原因で' }[u.answer];
      await page.click(`.choice-button >> text=${word}`);
    } else if (u.kind === 'situation') {
      await page.click(`.choice-button[data-choice="${u.choices.find((c) => c.correct).id}"]`);
    } else if (u.kind === 'match') {
      for (const [a, b] of u.pairs) {
        await clickText(page, '.match-col:first-child .match-item', plain(a));
        await clickText(page, '.match-col:last-child .match-item', plain(b));
      }
      await page.click('.stage-check');
    } else if (u.kind === 'order') {
      for (const item of u.items) await clickText(page, '.order-pool .order-item', plain(item));
      await page.click('.stage-check');
    }
    await wait(page);
    console.log(`理解 ${String(i + 1)}`, u.kind, await text(page, '[data-testid="feedback"]'));
    if (i === 0) await shot(`${tag}-understand`);
    await next(page);
    await wait(page);
  }

  // クイズ
  await page.waitForSelector('[data-testid="stage-quiz"]');
  for (const [i, q] of lesson.quiz.entries()) {
    await page.waitForSelector('[data-testid="quiz-question"]');
    if (q.kind === 'order') {
      for (const item of q.order) await clickText(page, '.order-pool .order-item', plain(item));
    } else {
      for (const c of q.choices.filter((x) => x.correct)) await page.click(`.choice-button[data-choice="${c.id}"]`);
    }
    await page.click('[data-testid="quiz-submit"]');
    await wait(page);
    console.log(`クイズ ${q.id}`, q.kind, await text(page, '[data-testid="feedback"]'));
    if (i === 0) await shot(`${tag}-quiz`);
    await next(page);
    await wait(page);
  }

  // 実戦
  await page.waitForSelector('[data-testid="stage-practice"]');
  const sim = lesson.practice.mode === 'simulation';
  const editor = lesson.practice.mode === 'editor';
  const sql = lesson.practice.mode === 'sql';
  if (editor) await page.waitForSelector('[data-testid="editor-text"]');
  else if (sql) await page.waitForSelector('[data-testid="sql-input"]:not([disabled])');
  else if (!sim && !sql) await page.waitForSelector('.term-host .xterm');
  await wait(page, 600);
  await shot(`${tag}-practice`);
  // HINTS=1 なら、最初の手順のヒントを 3 段とも開いて撮る（そのまま打てる答えの見え方を確かめる。結果は「ヒントを使った」になる）
  if (process.env.HINTS) {
    for (let i = 0; i < 3; i += 1) await page.click('[data-testid="practice-hint"]');
    await wait(page);
    await shot(`${tag}-hints`);
  }
  const enter = async (line, answerStep) => {
    if (editor) {
      // 設定の編集: 中身をファイル全体として書き、保存して確かめる
      await page.fill('[data-testid="editor-text"]', line);
      await page.click('[data-testid="editor-save"]');
    } else if (answerStep) {
      await page.fill('#practice-answer', line);
      await page.press('#practice-answer', 'Enter');
    } else if (sql) {
      // ブラウザ内 SQL: 書いて「実行」
      await page.fill('#sql-input', line);
      await page.click('[data-testid="sql-run"]');
    } else {
      await page.click('.term-host');
      await page.keyboard.type(line, { delay: 10 });
      await page.keyboard.press('Enter');
    }
    await wait(page, 400);
  };
  if (sim) {
    // 画面で操作する実戦: わざと誤る操作 → エラーの小窓 → 各手順の actions をドラッグで行う
    const setup = lesson.practice.setup;
    for (const [i, step] of lesson.practice.steps.entries()) {
      if (i > 0 && (await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true') continue;
      if (step.id === (process.env.FIRST_STEP ?? lesson.practice.steps[0].id)) {
        const bad = wrongAction(setup, step);
        if (bad) {
          await perform(page, bad, setup);
          console.log('エラー', await page.getAttribute('[data-testid="practice-error"]', 'data-guide'), await text(page, '[data-testid="practice-error"]'));
          await shot(`${tag}-error`);
          await page.click('[data-testid="practice-reset"]');
          await wait(page);
        }
      }
      for (const a of step.actions ?? []) await perform(page, a, setup);
      console.log(`手順 ${step.id}`, await text(page, '[data-testid="practice-afterward"]'));
    }
  }
  for (const [i, step] of (sim ? [] : lesson.practice.steps).entries()) {
    // 前の手順の操作で、もう満たした手順（設定の編集は 1 回の保存で全てを満たすことがある）
    if (i > 0 && (await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true') continue;
    const lines = answersOf(step);
    const answerStep = step.check.kind === 'answer';
    if (step.id === (process.env.FIRST_STEP ?? lesson.practice.steps[0].id)) {
      // わざと誤る（無い名前・違う答え）→ エラーの小窓
      // 設定の編集は、WRONG（「誤り=>正しい」の形。無ければ閉じる } の前の ; を 1 つ消す）で誤った中身を保存する
      const [bad, good] = (process.env.WRONG ?? '').split('=>');
      const wrong = editor ? (bad ? lines[0].replace(good ?? '', bad) : lines[0].replace(/;(\s*\n\s*\})/, '$1')) : null;
      // ブラウザ内 SQL は、最初の語の綴りを誤った文（syntax error）
      const sqlWrong = sql && !answerStep ? lines[0].replace(/^(\w+)\w/, '$1') : null;
      const firsts = process.env.FIRST?.split(' ;; ') ?? [wrong ?? sqlWrong ?? (answerStep ? 'わからない' : 'cd /no-such-dir')];
      for (const f of firsts) await enter(f, answerStep && process.env.FIRST_TERM === undefined);
      console.log('エラー', await page.getAttribute('[data-testid="practice-error"]', 'data-guide'), await text(page, '[data-testid="practice-error"]'));
      await shot(`${tag}-error`);
      // RESET=1: わざと誤った操作が残ると最後のヒントで通れない時（表に行を足しすぎた など）は、初めに戻してから答える
      if (process.env.RESET) {
        await page.click('[data-testid="practice-reset"]');
        await wait(page);
      }
    }
    for (const [j, line] of lines.entries()) {
      // 答える手順は、最後の物が答え。前の物は端末で調べるコマンド
      await enter(line, answerStep && j === lines.length - 1);
    }
    console.log(`手順 ${step.id}`, await text(page, '[data-testid="practice-afterward"]'));
  }
  await shot(`${tag}-afterward`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-result"]');
  await wait(page);
  console.log('結果', await page.getAttribute('[data-testid="stage-result"]', 'data-result'), await text(page, '[data-testid="stage-result"]'));
  await shot(`${tag}-result`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-summary"]');
  await wait(page);
  await shot(`${tag}-summary`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-done"]');
  await wait(page, 600);
  console.log('XP / スキル', await text(page, '[data-testid="done-xp"]'));
  await shot(`${tag}-done`);
}

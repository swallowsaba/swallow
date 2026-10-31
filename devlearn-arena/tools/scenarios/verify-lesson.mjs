#!/usr/bin/env node
// レッスン 1 本を、人と同じ順序・同じ操作で端から端まで通して確かめる（VERIFY-ALL.txt【1】）。
//
//   node tools/scenarios/verify-lesson.mjs linux.b.04
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-lesson.mjs linux.b.04
//
// 都市の画面 → 上の「学ぶ」→ 学習ライブラリでレッスンを選ぶ → 入口の札の「始める」→ 解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP / スキル → 都市の画面。
// 正解はレッスンの中身（content/lessons/**）から読む。実戦は手順ごとにヒントを 3 段開き、最後のヒントに書かれた操作だけを行う:
//   端末: 最後のヒントの `` のコマンドを 1 文字ずつ打って Enter（答える手順は、最後の `` を答えの欄に打つ）
//   SQL・設定の編集: 入力欄に打ち込んで「実行」「保存して確かめる」
//   画面の操作（模）: 手順の actions（最後のヒントで通る操作）を、マウスのドラッグと押す操作で行う（tools/scenarios/simDrive.mjs）
// 合格の条件: 結果の「できたこと」に全ての手順が並び「まだの手順」が無い・正しい操作でエラーの案内が出ない・まとめまで進める・
// XP とスキルが増える・都市の画面に戻れる。不合格なら、止まった段階・した操作・起きたこと・その瞬間の画面（shots/verify/<ID>.png）を返す。
// VERIFY_URL が無ければ、開発用のサーバを自分で立てて片付ける（npm run shoot と同じ）。
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { perform } from './simDrive.mjs';

const ROOT = new URL('../../content/', import.meta.url);

/** 手順の目的そのものが、失敗を見て読むことのレッスン（docs/progress/verify-all.md の C2「想定した失敗」） */
export const DESIGNED_FAILURES = new Set(['git.b.06', 'git.i.05', 'git.i.02', 'trouble.b.02', 'docker.b.01', 'k8s.b.01', 'net.b.03', 'net.b.04', 'net.i.01', 'net.i.02',
  // 目的の文が「送って、どこで止まるかを見る」「入れ替えが進むかを見る」「curl の誤りを読む」「200 が返らなければ返事の数から原因を探す」と、失敗を見ることを書いている手順（最後のヒントは先に直すので通らないが、目的の文のとおりに打つと通る。docs/progress/verify-free.md）
  'found.b.07', 'net.b.01', 'k8s.i.08', 'sec.b.07', 'web.b.07',
  // 範囲を広げた 80 本（docs/progress/expand-scope.md）: 目的の文が「curl の警告の文を読み」と、失敗を見ることを書いている手順
  'sec.i.01',
  // 目的の文が「これが断られる」と、失敗を見ることを書いている手順
  'db.i.04', 'trouble.i.02', 'trouble.i.03', 'linux.a.01', 'net.a.01', 'net.a.02', 'web.a.02']);

/** 確かめるための台本側の別解と、間違える操作（tools/scenarios/variants/<ID>.json。無ければ null） */
export function variantsFile(id) {
  const f = new URL(`./variants/${id}.json`, import.meta.url);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/** 用語の ID → 画面の語 */
function glossaryWords() {
  const words = {};
  const dir = new URL('glossary/', ROOT);
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (!f.endsWith('.json')) continue;
    for (const t of JSON.parse(readFileSync(new URL(f, dir), 'utf8')).terms ?? []) words[t.id] = t.word;
  }
  return words;
}

/** 初回公開の範囲の全レッスンの ID（推奨学習順） */
export function allLessonIds() {
  const ids = [];
  const catalog = JSON.parse(readFileSync(new URL('catalog.json', ROOT), 'utf8'));
  for (const dom of catalog.domainOrder) {
    const dir = new URL(`lessons/${dom}/`, ROOT);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) ids.push(f.replace(/\.json$/, ''));
  }
  return ids;
}

export function readLesson(id) {
  return JSON.parse(readFileSync(new URL(`lessons/${id.split('.')[0]}/${id}.json`, ROOT), 'utf8'));
}

const squash = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);
const wait = (page, ms = 250) => page.waitForTimeout(ms);
const next = (page) => page.click('[data-testid="lesson-next"]');

/** 画面の字が label と同じボタンを押す（空白を除いて比べる） */
async function clickText(page, selector, label) {
  const seen = await page.evaluate(([sel, want]) => {
    const norm = (s) => s.replace(/\s+/g, '');
    // 結んだ・並べた番号（.match-no・.order-no）は札の名前に入れない（一度誤って結んだ札も、名前で押し直す）
    const name = (b) => {
      const c = b.cloneNode(true);
      for (const n of c.querySelectorAll('.match-no, .order-no')) n.remove();
      return norm(c.innerText ?? c.textContent ?? '');
    };
    const all = [...document.querySelectorAll(sel)];
    const el = all.find((b) => name(b) === norm(want));
    if (!el) return all.map((b) => name(b));
    el.click();
    return null;
  }, [selector, label]);
  if (seen !== null) throw new Error(`「${label}」が無い（あるのは ${seen.join(' ／ ')}）`);
  await wait(page, 120);
}

/** 最後のヒントの `...`（打つ物・入れる文） */
const answersOf = (step) => [...step.hints[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** 今出ているエラーの案内（無ければ null） */
const errorGuide = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="practice-error"]');
  return el ? { guide: el.getAttribute('data-guide'), text: el.innerText.replace(/\s+/g, ' ').trim() } : null;
});

/** 学習の記録（XP と、そのレッスンの分野のスキルの計算に使う完了の数） */
const progressOf = (page) => page.evaluate(() => {
  const p = window.__game?.progress();
  return p ? { xp: p.xp, completed: Object.values(p.lessons).filter((l) => l.completions > 0).length } : null;
});

/**
 * レッスン id を、都市の画面から人と同じ道で通す。page は都市の画面を開いた直後（操作説明は閉じた）。
 * opts.opened: レッスンの画面をもう開いた（施設の情報パネルから入った時など）。学習ライブラリから開く所を飛ばす
 * opts.onStage(段階): 解説・理解・クイズ・実戦・結果・まとめ の各段の初めに呼ぶ（途中でページを読み直す時など）
 * opts.onLook(場面): 解説の各ページと、実戦の操作を終えた所で呼ぶ（画面の崩れを見る時。VERIFY-FREE.txt【3】）
 * opts.onDesigned(案内): 想定した失敗の案内（その手順の想定エラー）が出た瞬間に、閉じる前に呼ぶ（VERIFY-FREE.txt【5】）
 * opts.inputs(手順): 実戦で、最後のヒントの代わりに行う物（端末・SQL は打つ行、設定の編集は保存する中身、模は操作）。
 *   渡すとヒントを一度も開かず、実戦の XP がヒント無しの満額で入ることも確かめる（VERIFY-FREE.txt【1】）
 * opts.shotName: 画像の名前（既定はレッスンの ID）
 * 返す物: { id, ok, stage, did, saw, shot, notes, errors, designed, xp }
 */
export async function verifyLesson(page, id, opts = {}) {
  const shotDir = opts.shotDir ?? 'shots/verify';
  const words = glossaryWords();
  const lesson = readLesson(id);
  const plain = (s) => s.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, t) => words[t] ?? t).replace(/`([^`]+)`/g, '$1');
  const free = opts.inputs !== undefined;
  const rec = { id, ok: false, stage: '都市', did: [], saw: '', shot: null, notes: [], errors: [], designed: [], xp: null, wrong: {}, problems: [] };
  const shotPath = () => `${shotDir}/${opts.shotName ?? id}.png`;
  const did = (s) => {
    rec.did.push(s);
    if (rec.did.length > 12) rec.did.shift();
  };
  const fail = (saw) => {
    const e = new Error(saw);
    e.verify = true;
    return e;
  };
  const pageErrors = [];
  const onError = (e) => pageErrors.push(String(e).split('\n')[0]);
  page.on('pageerror', onError);

  try {
    // a. 都市の画面
    await page.waitForSelector('[data-testid="city-screen"]');
    const before = await progressOf(page);

    // b. 上の「学ぶ」→ 学習ライブラリ → 行を選ぶ → 入口の札の「始める」
    rec.stage = '都市';
    if (!opts.opened) {
      await page.locator('.topbar-entry', { hasText: '学ぶ' }).click();
      did('上の「学ぶ」を押した');
      await page.waitForSelector('[data-testid="learn-screen"]');
      const row = page.locator(`[data-lesson="${id}"]`);
      await row.scrollIntoViewIfNeeded();
      await row.click();
      did(`学習ライブラリで「${lesson.title}」を選んだ`);
      await page.click('[data-testid="entry-start"]');
      did('入口の札の「始める」を押した');
    }
    const stageStart = async (name) => {
      rec.stage = name;
      await opts.onStage?.(name);
    };

    // c. 解説を読み進める
    await stageStart('解説');
    await page.waitForSelector('[data-testid="stage-explain"]');
    for (let i = 0; i < 12 && (await page.$('[data-testid="stage-explain"]')); i += 1) {
      await opts.onLook?.(`解説 ${String(i + 1)}`);
      await next(page);
      did('解説の「次へ」');
      await wait(page, 150);
    }
    if (await page.$('[data-testid="stage-explain"]')) throw fail('解説から先へ進めない');

    // d. 理解の問いに全て正しく答える（opts.wrong なら、1 問をわざと誤ってから正しく答える）
    await stageStart('理解');
    await page.waitForSelector('[data-testid="stage-understand"]');
    const wrongAt = opts.wrong ? Math.max(0, lesson.understand.findIndex((u) => u.kind !== 'figure-pick')) : -1;
    for (const [i, u] of lesson.understand.entries()) {
      await page.waitForSelector('[data-testid="understand-item"]');
      const n = `理解 ${String(i + 1)}（${u.kind}）`;
      if (i === wrongAt) await wrongUnderstand(page, u, n, plain, rec, did, fail);
      if (u.kind === 'figure-pick') {
        for (const part of u.answer) {
          // 人と同じく、その部分の見えている所を押す。真ん中から探し、周り 8px も全てその部分に当たる所（指先の幅で外れない所）を押す。
          // 無ければ、上に重なった別の部分に当たるか、当たりが狭い
          const spot = await page.evaluate((name) => {
            const el = document.querySelector(`[data-testid="lesson-figure"] [data-part="${name}"]`);
            if (!el) return { miss: null };
            const r = el.getBoundingClientRect();
            const owner = (x, y) => document.elementFromPoint(x, y)?.closest('[data-part]')?.getAttribute('data-part') ?? '';
            const firm = (x, y) => [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].every(([dx, dy]) => owner(x + dx, y + dy) === name);
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const tries = [[cx, cy]];
            for (let x = r.left + 4; x < r.right; x += 6) for (let y = r.top + 4; y < r.bottom; y += 6) tries.push([x, y]);
            const at = tries.find(([x, y]) => firm(x, y));
            return at ? { x: at[0], y: at[1] } : { miss: owner(cx, cy) };
          }, part);
          if (spot.miss !== undefined) throw fail(`図の「${part}」を押せない: ${spot.miss === null ? 'その部分が図に無い' : spot.miss === '' ? '押して当たる所が狭い（周り 8px まで当たる所が無い）' : `上に重なった「${spot.miss}」に当たる`}`);
          await page.mouse.click(spot.x, spot.y);
        }
        if (u.answer.length > 1) await page.click('.stage-check');
        did(`${n}: 図の ${u.answer.join('・')} を押した`);
      } else if (u.kind === 'yesno') {
        await clickText(page, '.yesno-button', u.answer ? 'はい' : 'いいえ');
        did(`${n}: ${u.answer ? 'はい' : 'いいえ'}`);
      } else if (u.kind === 'relation') {
        const word = { contains: 'を含む', before: 'より先に起きる', cause: 'が原因で' }[u.answer];
        await page.click(`.choice-button >> text=${word}`);
        did(`${n}: ${word}`);
      } else if (u.kind === 'situation') {
        const c = u.choices.find((x) => x.correct);
        await page.click(`.choice-button[data-choice="${c.id}"]`);
        did(`${n}: ${plain(c.text)}`);
      } else if (u.kind === 'match') {
        for (const [a, b] of u.pairs) {
          await clickText(page, '.match-col:first-child .match-item', plain(a));
          await clickText(page, '.match-col:last-child .match-item', plain(b));
        }
        await page.click('.stage-check');
        did(`${n}: ${u.pairs.map(([a, b]) => `${plain(a)}=${plain(b)}`).join('・')}`);
      } else if (u.kind === 'order') {
        for (const item of u.items) await clickText(page, '.order-pool .order-item', plain(item));
        await page.click('.stage-check');
        did(`${n}: ${u.items.map(plain).join(' → ')}`);
      } else {
        throw fail(`台本の知らない理解の形: ${u.kind}`);
      }
      await wait(page);
      if (!(await page.$('[data-testid="feedback"].is-ok'))) throw fail(`正しく答えたのに正解にならない: ${await text(page, '[data-testid="feedback"]') ?? '（知らせが出ない）'}`);
      await next(page);
      await wait(page);
    }

    // e. クイズに全て正しく答える
    await stageStart('クイズ');
    await page.waitForSelector('[data-testid="stage-quiz"]');
    for (const [qi, q] of lesson.quiz.entries()) {
      await page.waitForSelector('[data-testid="quiz-question"]');
      if (opts.wrong && qi === 0) await wrongQuiz(page, q, plain, rec, did, fail);
      if (q.kind === 'order') {
        for (const item of q.order) await clickText(page, '.order-pool .order-item', plain(item));
        did(`クイズ ${q.id}: ${q.order.map(plain).join(' → ')}`);
      } else {
        const right = q.choices.filter((x) => x.correct);
        for (const c of right) await page.click(`.choice-button[data-choice="${c.id}"]`);
        did(`クイズ ${q.id}: ${right.map((c) => plain(c.text)).join('・')}`);
      }
      await page.click('[data-testid="quiz-submit"]');
      await wait(page);
      if (!(await page.$('[data-testid="feedback"].is-ok'))) throw fail(`正しく答えたのに正解にならない: ${await text(page, '[data-testid="feedback"]') ?? '（知らせが出ない）'}`);
      await next(page);
      await wait(page);
    }

    // f. 実戦。最後のヒントに書かれた操作だけを行う
    await stageStart('実戦');
    await page.waitForSelector('[data-testid="stage-practice"]');
    const p = lesson.practice;
    if (p.mode === 'editor') await page.waitForSelector('[data-testid="editor-text"]');
    else if (p.mode === 'sql') await page.waitForSelector('[data-testid="sql-input"]:not([disabled])');
    else if (p.mode === 'terminal') await page.waitForSelector('.term-host .xterm');
    await wait(page, 500);

    // エラーの案内が出るたびに、その案内と、その時の今の手順を残す（1 行に区切りが並ぶ時や、何枚も運ぶ操作の途中で出て、
    // 次の操作で消える案内も逃さない）
    await page.evaluate(() => {
      const w = window;
      w.__seenErrors = [];
      let last = '';
      const look = () => {
        const el = document.querySelector('[data-testid="practice-error"]');
        const sig = el ? `${el.getAttribute('data-guide')}
${el.innerText}` : '';
        if (sig && sig !== last) {
          w.__seenErrors.push({ guide: el.getAttribute('data-guide'), text: el.innerText.replace(/\s+/g, ' ').trim(), current: document.querySelector('.practice-step.is-current')?.getAttribute('data-step') ?? null });
        }
        last = sig;
      };
      new MutationObserver(look).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
    // エラーの案内が出たら、その瞬間の画面を撮り、何を打った時の何という案内かを残して、閉じて続ける（達成になるかも確かめる）
    const checkError = async (what, step) => {
      const seen = await page.evaluate(() => (window.__seenErrors ?? []).splice(0));
      for (const g of seen) {
        // 想定した失敗の案内（下の designed）は撮らない。最初の、想定していない案内の瞬間を撮る（もう消えていれば、その後の画面）
        const expected = g.current === step.id && (step.expectedErrors ?? []).includes(g.guide);
        if ((!expected || free) && !rec.shot) {
          mkdirSync(shotDir, { recursive: true });
          rec.shot = shotPath();
          await page.screenshot({ path: rec.shot });
        }
        rec.errors.push({ line: what, step: step.id, current: g.current, guide: g.guide, text: g.text });
        // 想定した失敗の案内が出た瞬間（案内を閉じる前）。VERIFY-FREE.txt【5】で画面を撮る
        if (expected) await opts.onDesigned?.({ ...g, step: step.id, line: what });
      }
      if (await errorGuide(page)) {
        await page.locator('.practice-error-close').click().catch(() => {});
        await wait(page, 120);
      }
    };
    for (const [i, step] of p.steps.entries()) {
      // 前の手順の操作で、もう満たした手順
      if ((await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true') continue;
      if (!free) {
        // 人と同じく、ヒントを最後の段まで開く（画面の最後のヒントが中身と同じかも見る）
        for (let k = 0; k < 3 && (await page.$('[data-testid="practice-hint"]')); k += 1) await page.click('[data-testid="practice-hint"]');
        await wait(page, 100);
        const shown = await text(page, '.practice-hint[data-hint="3"]');
        if (!shown) throw fail(`手順 ${String(i + 1)}（${step.id}）の最後のヒントが開けない`);
      }
      if (p.mode === 'terminal') {
        const cands = await page.evaluate(() => [...document.querySelectorAll('.practice-candidate')].map((c) => c.textContent));
        rec.candidates = [...new Set([...(rec.candidates ?? []), ...cands])];
      }
      // わざと間違える（VERIFY-FREE.txt【2】）: 間違った操作 → エラーの案内と原因候補 → そこからヒントを開く → 閉じて正しく打ち直す
      const w = opts.wrong?.practice;
      if (w && step.id === w.step) {
        await doItems(step, w.input, true, w.commands === true);
        // 案内が出ない（不合格の）瞬間の画面を撮る
        const shoot = async () => {
          if (rec.shot) return;
          mkdirSync(shotDir, { recursive: true });
          rec.shot = shotPath();
          await page.screenshot({ path: rec.shot });
        };
        await wrongPractice(page, step, w, p, rec, did, shoot);
        if (w.reset) {
          // 間違えた操作が壊した物を「初めに戻す」で戻し、前の手順から打ち直す
          await page.click('[data-testid="practice-reset"]');
          await wait(page, 300);
          did('「初めに戻す」を押した');
          for (const before of p.steps.slice(0, i)) await doItems(before, opts.inputs(before), false);
        } else if (w.retry) {
          await doItems(step, w.retry, false);
          continue;
        }
      }
      await doItems(step, free ? opts.inputs(step) : p.mode === 'simulation' ? step.actions ?? [] : answersOf(step), false);
    }
    // 端末・SQL・設定の編集は打つ行、模は操作を、人と同じく行う。keep なら、出たエラーの案内を閉じない（わざと間違えた時）
    async function doItems(step, items, keep, allCommands = false) {
      if (p.mode === 'simulation') {
        for (const a of items) {
          // 何枚も運ぶ操作は、1 枚放すたびに見る
          page.__dropHook = keep ? undefined : () => checkError(`${JSON.stringify(a)}（途中の 1 枚）`, step);
          await perform(page, a, p.setup);
          page.__dropHook = undefined;
          did(`手順 ${step.id}: ${JSON.stringify(a)}`);
          if (!keep) await checkError(JSON.stringify(a), step);
        }
        return;
      }
      const lines = items;
      if (lines.length === 0 && !free) throw fail(`手順 ${step.id} の最後のヒントに、打つ物（\`\`）が無い: ${squash(step.hints[2])}`);
      const answerStep = step.check.kind === 'answer';
      for (const [j, line] of lines.entries()) {
        if (answerStep && !allCommands && j === lines.length - 1) {
          // 答える手順の最後の物は、答えの欄に打つ
          // 前に打った答えが欄に残っていれば、消してから打つ（人と同じく、選んで打ち直す）
          await page.click('#practice-answer');
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Delete');
          await page.keyboard.type(line, { delay: 5 });
          await page.keyboard.press('Enter');
          did(`手順 ${step.id}: 答えの欄に「${line}」`);
        } else if (p.mode === 'editor') {
          await page.click('[data-testid="editor-text"]');
          await page.keyboard.press('Control+A');
          await page.keyboard.type(line, { delay: 0 });
          await page.click('[data-testid="editor-save"]');
          did(`手順 ${step.id}: ${String(line.split('\n').length)} 行の中身を書いて保存した`);
        } else if (p.mode === 'sql') {
          await page.click('#sql-input');
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Delete');
          await page.keyboard.type(line, { delay: 2 });
          await page.click('[data-testid="sql-run"]');
          did(`手順 ${step.id}: SQL「${squash(line)}」を実行`);
        } else {
          await page.click('.term-host');
          await page.keyboard.type(line, { delay: 8 });
          await page.keyboard.press('Enter');
          did(`手順 ${step.id}: $ ${line}`);
        }
        // 端末の命令が終わるまで待つ（kubectl の待ち・git push の流れなど）
        await wait(page, p.mode === 'terminal' ? 500 : 350);
        if (!keep) await checkError(squash(line).slice(0, 120), step);
      }
    }
    await opts.onLook?.('実戦の後');
    const unfinished = await page.evaluate(() => [...document.querySelectorAll('.practice-step')].filter((s) => s.dataset.done !== 'true').map((s) => s.querySelector('.practice-step-text')?.innerText.replace(/\s+/g, ' ').trim()));
    // 想定した失敗（衝突・拒否・届かないことを見せる手順）の案内は、その手順の想定エラーで、その手順の間に出た物だけ。
    // 命令が本当に失敗したかは、同じ関数で最後のヒントを通す内容の検証（npm run content:check）が確かめる
    const designed = (e) => {
      const step = p.steps.find((x) => x.id === e.step);
      return e.current === e.step && (step?.expectedErrors ?? []).includes(e.guide);
    };
    for (const e of rec.errors.filter(designed)) rec.notes.push(`想定した失敗の案内 ${e.guide}（${e.line}）`);
    rec.designed = rec.errors.filter(designed);
    rec.errors = rec.errors.filter((e) => !designed(e));
    if (rec.errors.length > 0) rec.saw = `正しい操作でエラーの案内が出た: ${rec.errors.map((e) => `${e.line} → ${e.text.slice(0, 160)}`).join(' ／ ')}`;
    if (unfinished.length > 0) {
      const term = p.mode === 'terminal' ? await page.evaluate(() => document.querySelector('.term-host .xterm-rows')?.innerText ?? null) : null;
      throw fail(`${rec.saw ? `${rec.saw}。` : ''}最後のヒントの操作を全て行ったのに、まだの手順がある: ${unfinished.join(' ／ ')}${term ? `（端末: ${squash(term).slice(-300)}）` : ''}`);
    }
    if (rec.errors.length > 0) throw fail(rec.saw);

    // g. 結果の画面
    await stageStart('結果');
    await next(page);
    did('「結果へ」を押した');
    await page.waitForSelector('[data-testid="stage-result"]');
    await wait(page);
    const result = await page.evaluate(() => {
      const sec = document.querySelector('[data-testid="stage-result"]');
      const heads = [...sec.querySelectorAll('.stage-subheading')];
      const listAfter = (name) => {
        const h = heads.find((x) => x.textContent === name);
        const ul = h?.nextElementSibling;
        return ul?.tagName === 'UL' ? [...ul.querySelectorAll('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()) : null;
      };
      return { kind: sec.dataset.result, done: listAfter('できたこと') ?? [], todo: listAfter('まだの手順'), none: sec.innerText.includes('まだ達成した手順は無い') };
    });
    if (result.done.length !== p.steps.length || result.todo !== null || result.none || result.kind === 'retry') {
      throw fail(`結果の画面: ${result.kind}。できたこと ${String(result.done.length)} / ${String(p.steps.length)}${result.todo ? `、まだの手順: ${result.todo.join(' ／ ')}` : ''}${result.none ? '、「まだ達成した手順は無い」' : ''}`);
    }

    // h. まとめ
    await stageStart('まとめ');
    await next(page);
    did('「まとめへ」を押した');
    await page.waitForSelector('[data-testid="stage-summary"]');
    await wait(page);
    await next(page);
    did('まとめの「次へ」');
    await page.waitForSelector('[data-testid="stage-done"]');
    await wait(page, 400);
    const after = await progressOf(page);
    const skill = Number(await text(page, '.done-skill-value'));
    const xpShown = await text(page, '[data-testid="done-xp"] .done-xp-total');
    if (!after || !before || after.xp <= before.xp) throw fail(`XP が増えていない（前 ${String(before?.xp)}、後 ${String(after?.xp)}。画面 ${xpShown ?? '-'}）`);
    if (!(skill > 0)) throw fail(`スキルが増えていない（${String(skill)} / 100）`);
    rec.notes.push(`XP +${String(after.xp - before.xp)}・スキル ${String(skill)}`);
    // XP の内訳（まとめの右の欄）。ヒントを開かずに通した時は、実戦の成功がヒント無しの満額（docs/game-design.md 3 章）
    rec.xp = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="done-xp"] .done-xp-list li')].map((li) => [li.children[0]?.textContent ?? '', Number((li.children[1]?.textContent ?? '').replace(/[^0-9]/g, ''))])));
    if (free) {
      const full = { beginner: 20, intermediate: 35, advanced: 55 }[lesson.level];
      const got = rec.xp['実戦の成功'];
      // わざと間違えてヒントを開いた時は、ヒントありの半分（docs/game-design.md 3 章。端数は四捨五入）
      const hinted = rec.wrong.practice?.hint !== undefined;
      const want = hinted ? Math.round(full / 2) : full;
      if (got !== want) throw fail(`${hinted ? 'ヒントを開いて通したのに、実戦の XP がヒントありの半分' : 'ヒントを開かずに通したのに、実戦の XP が満額'}（${String(want)}）でない: ${String(got)}（内訳 ${JSON.stringify(rec.xp)}）`);
      if (hinted && rec.xp['エラーから自力で立て直した'] !== undefined) throw fail(`ヒントを開いたのに「エラーから自力で立て直した」の XP が入った（内訳 ${JSON.stringify(rec.xp)}）`);
    }
    if (opts.wrong) {
      // 1 問目を誤ってから正解: その問題は 2、ほかは初回の正解の 5
      const want = 5 * (lesson.quiz.length - 1) + 2;
      if (rec.xp['クイズの正解'] !== want) throw fail(`クイズを 1 問誤った後の XP が決まり（${String(want)}）でない: ${String(rec.xp['クイズの正解'])}（内訳 ${JSON.stringify(rec.xp)}）`);
    }

    // i. 都市の画面に戻る
    rec.stage = '都市へ戻る';
    await page.click('[data-testid="lesson-to-city"]');
    did('「都市へ戻る」を押した');
    await page.waitForSelector('[data-testid="city-screen"]');
    await page.waitForFunction(() => window.location.hash === '#/city' || window.location.hash === '' || window.location.hash === '#/');
    await page.waitForSelector('[data-testid="lesson-screen"]', { state: 'detached', timeout: 5000 }).catch(() => {});
    if (await page.$('[data-testid="lesson-screen"]')) throw fail('レッスンの画面が閉じない');
    if (pageErrors.length > 0) throw fail(`ページの誤り: ${pageErrors.join(' ／ ')}`);
    if (rec.problems.length > 0) throw fail(rec.problems.join(' ／ '));
    rec.ok = true;
    rec.stage = '';
  } catch (e) {
    rec.saw = e.verify ? e.message : `${rec.saw ? `${rec.saw}。` : ''}台本が進めない: ${String(e.message ?? e).split('\n')[0]}`;
    // その瞬間の画面（エラーの案内が出た時は、もう撮ってある）
    if (!rec.shot) {
      mkdirSync(shotDir, { recursive: true });
      rec.shot = shotPath();
      await page.screenshot({ path: rec.shot }).catch(() => {
        rec.shot = null;
      });
    }
  } finally {
    page.off('pageerror', onError);
  }
  return rec;
}

/* ---------- わざと間違える（VERIFY-FREE.txt【2】。tools/scenarios/verify-wrong.mjs） ---------- */

const RELATION_WORDS = { contains: 'を含む', before: 'より先に起きる', cause: 'が原因で' };

/** 誤った後の知らせ（判定・題・何が違うかの文） */
const feedbackOf = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="feedback"]');
  if (!el) return null;
  const sq = (s) => s.replace(/\s+/g, ' ').trim();
  const why = [...document.querySelectorAll('.choice-note, [data-testid="feedback"] .feedback-text, [data-testid="feedback-see"]')].map((e) => sq(e.innerText)).filter(Boolean);
  return { ok: el.classList.contains('is-ok'), title: sq(el.querySelector('.feedback-title')?.innerText ?? ''), why: [...new Set(why)] };
});

/** 図の部分の、押して当たる所（verifyLesson の理解の図と同じ探し方） */
const figureSpot = (page, name) => page.evaluate((part) => {
  const el = document.querySelector(`[data-testid="lesson-figure"] [data-part="${part}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const owner = (x, y) => document.elementFromPoint(x, y)?.closest('[data-part]')?.getAttribute('data-part') ?? '';
  const firm = (x, y) => [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].every(([dx, dy]) => owner(x + dx, y + dy) === part);
  const tries = [[r.left + r.width / 2, r.top + r.height / 2]];
  for (let x = r.left + 4; x < r.right; x += 6) for (let y = r.top + 4; y < r.bottom; y += 6) tries.push([x, y]);
  const at = tries.find(([x, y]) => firm(x, y));
  return at ? { x: at[0], y: at[1] } : null;
}, name);

/** 理解の 1 問をわざと誤り、何が違うのかが出てやり直せる形に戻す */
async function wrongUnderstand(page, u, n, plain, rec, did, fail) {
  let what = '';
  let wrongPart = null;
  if (u.kind === 'yesno') {
    what = u.answer ? 'いいえ' : 'はい';
    await clickText(page, '.yesno-button', what);
  } else if (u.kind === 'situation') {
    const c = u.choices.find((x) => !x.correct);
    what = plain(c.text);
    await page.click(`.choice-button[data-choice="${c.id}"]`);
  } else if (u.kind === 'relation') {
    what = RELATION_WORDS[Object.keys(RELATION_WORDS).find((k) => k !== u.answer)];
    await page.click(`.choice-button >> text=${what}`);
  } else if (u.kind === 'order') {
    const rev = [...u.items].reverse();
    for (const item of rev) await clickText(page, '.order-pool .order-item', plain(item));
    await page.click('.stage-check');
    what = rev.map(plain).join(' → ');
  } else if (u.kind === 'match') {
    const rights = u.pairs.map((x) => x[1]);
    for (const [k, [a]] of u.pairs.entries()) {
      await clickText(page, '.match-col:first-child .match-item', plain(a));
      await clickText(page, '.match-col:last-child .match-item', plain(rights[(k + 1) % rights.length]));
    }
    await page.click('.stage-check');
    what = u.pairs.map(([a], k) => `${plain(a)}=${plain(rights[(k + 1) % rights.length])}`).join('・');
  } else if (u.kind === 'figure-pick') {
    const parts = await page.evaluate(() => [...document.querySelectorAll('[data-testid="lesson-figure"] [data-part]')].map((e) => e.getAttribute('data-part')));
    wrongPart = parts.find((x) => !u.answer.includes(x)) ?? null;
    const spot = wrongPart ? await figureSpot(page, wrongPart) : null;
    if (!spot) throw fail(`${n}: わざと誤るために押す、答えでない部分が図に無い`);
    await page.mouse.click(spot.x, spot.y);
    if (u.answer.length > 1) await page.click('.stage-check');
    what = `図の ${wrongPart}`;
  }
  await wait(page);
  const fb = await feedbackOf(page);
  did(`${n}: わざと誤る（${what}）`);
  if (!fb) throw fail(`${n}: わざと誤った（${what}）のに、知らせが出ない`);
  if (fb.ok) throw fail(`${n}: わざと誤った（${what}）のに、正解になった`);
  rec.wrong.understand = { item: n, did: what, title: fb.title, why: fb.why };
  if (fb.why.length === 0) rec.problems.push(`${n}: 誤った時に、何が違うのかが出ない（「${fb.title}」だけ）`);
  // やり直す: 並べた札を外す・押した部分を外す（ほかの形は、正しい答えを押し直せばよい）
  if (u.kind === 'order') for (let k = 0; k < 20 && (await page.$('.order-placed .order-item')); k += 1) await page.click('.order-placed .order-item');
  if (u.kind === 'figure-pick' && u.answer.length > 1 && wrongPart) {
    const spot = await figureSpot(page, wrongPart);
    if (spot) await page.mouse.click(spot.x, spot.y);
  }
}

/** クイズの 1 問目をわざと誤り、何が違うのかが出てやり直せる形に戻す */
async function wrongQuiz(page, q, plain, rec, did, fail) {
  let what;
  let picked = null;
  if (q.kind === 'order') {
    const rev = [...q.order].reverse();
    for (const item of rev) await clickText(page, '.order-pool .order-item', plain(item));
    what = rev.map(plain).join(' → ');
  } else {
    picked = q.choices.find((x) => !x.correct);
    await page.click(`.choice-button[data-choice="${picked.id}"]`);
    what = plain(picked.text);
  }
  await page.click('[data-testid="quiz-submit"]');
  await wait(page);
  const fb = await feedbackOf(page);
  did(`クイズ ${q.id}: わざと誤る（${what}）`);
  if (!fb) throw fail(`クイズ ${q.id}: わざと誤った（${what}）のに、知らせが出ない`);
  if (fb.ok) throw fail(`クイズ ${q.id}: わざと誤った（${what}）のに、正解になった`);
  rec.wrong.quiz = { item: q.id, did: what, title: fb.title, why: fb.why };
  if (fb.why.length === 0) rec.problems.push(`クイズ ${q.id}: 誤った時に、何が違うのかが出ない（「${fb.title}」だけ）`);
  // やり直す: 並べた札を外す・複数選ぶ問題は誤った選択を外す（1 つ選ぶ問題は、正しい物を押せば替わる）
  if (q.kind === 'order') for (let k = 0; k < 20 && (await page.$('.order-placed .order-item')); k += 1) await page.click('.order-placed .order-item');
  else if (q.kind === 'multi' || q.choices.filter((c) => c.correct).length > 1) await page.click(`.choice-button[data-choice="${picked.id}"]`);
}

/** 実戦でわざと間違えた後: エラーの案内と原因候補が出て、そこからヒントを開け、閉じて打ち直せる（模は置き違えた札・線を戻す） */
async function wrongPractice(page, step, wrong, practice, rec, did, shoot) {
  await wait(page, 300);
  const seen = await page.evaluate(() => (window.__seenErrors ?? []).splice(0));
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="practice-error"]');
    if (!el) return null;
    const sq = (s) => s.replace(/\s+/g, ' ').trim();
    const sec = [...el.querySelectorAll('.practice-error-flow > li')].map((li) => sq(li.querySelector('p')?.innerText ?? ''));
    return {
      guide: el.getAttribute('data-guide'),
      said: el.querySelector('.practice-error-said')?.innerText.trim() ?? '',
      meaning: sec[0] ?? '',
      causes: [...el.querySelectorAll('.practice-error-causes li')].map((li) => sq(li.innerText)),
      next: sec[2] ?? '',
    };
  });
  const done = (await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true';
  const out = { step: step.id, why: wrong.why, input: wrong.input.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))), card, seen: seen.map((g) => g.guide), done };
  rec.wrong.practice = out;
  did(`手順 ${step.id}: わざと間違える（${wrong.why}）`);
  if (done) rec.problems.push(`実戦 ${step.id}: わざと間違えた（${wrong.why}）のに、手順が達成になった`);
  if (!card || done) await shoot();
  if (!card) rec.problems.push(`実戦 ${step.id}: わざと間違えた（${wrong.why}）のに、エラーの案内が出ない${seen.length ? `（出て消えた: ${seen.map((g) => g.guide).join('・')}）` : ''}`);
  else if (card.causes.length === 0) rec.problems.push(`実戦 ${step.id}: エラーの案内に原因候補が無い（${card.guide}）`);
  // そこからヒントを開ける（案内を出したまま。案内が出なかった時は開かない）
  const hint = page.locator('[data-testid="practice-hint"]');
  if (!card) {
    // 開かない
  } else if (!(await hint.isVisible().catch(() => false)) || !(await hint.isEnabled().catch(() => false))) {
    rec.problems.push(`実戦 ${step.id}: エラーの案内が出ている時に、ヒントを開けない`);
  } else {
    await hint.click();
    await wait(page, 150);
    out.hint = await text(page, '.practice-hint[data-hint="1"]');
    if (!out.hint) rec.problems.push(`実戦 ${step.id}: ヒントを押しても、ヒントが出ない`);
    did(`手順 ${step.id}: エラーの案内からヒントを開いた`);
  }
  // 閉じて打ち直す。模は、置き違えた札を置き場へ戻し、引いた線を外す
  if (await page.$('[data-testid="practice-error"]')) await page.locator('.practice-error-close').click();
  await wait(page, 120);
  if (practice.mode === 'simulation') {
    for (const a of [...wrong.input].reverse()) {
      if (a.op === 'put') await perform(page, { op: 'take', item: a.item, slot: a.slot }, practice.setup).catch(() => {});
      else if (a.op === 'connect') await perform(page, { op: 'cut', a: a.a, b: a.b }, practice.setup).catch(() => {});
    }
    await page.evaluate(() => (window.__seenErrors ?? []).splice(0));
    if (await page.$('[data-testid="practice-error"]')) await page.locator('.practice-error-close').click();
  }
}

/** 開発用のサーバを立てる（VERIFY_URL が無い時）。根の URL と片付けを返す */
export async function siteRoot() {
  const site = process.env.VERIFY_URL;
  if (site) return { root: site.endsWith('/') ? site : `${site}/`, close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  return { root: `http://localhost:${String(port)}/`, close: () => server.close() };
}

/** 新しい記録（空の localStorage）のページで都市の画面を開き、操作説明を閉じる */
export async function openCity(browser, root, size = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  await page.goto(root, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // 初回の始め方の選択（docs/ui-design.md 10.12）は「ふつう」で閉じ、操作説明は飛ばす
  await page.locator('[data-testid="start-go"]').click({ timeout: 5000 }).catch(() => {});
  await page.locator('[data-testid="intro"] .intro-skip').click({ timeout: 10000 }).catch(() => {});
  return { context, page };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('使い方: node tools/scenarios/verify-lesson.mjs <レッスン ID> …');
    process.exit(2);
  }
  const { chromium } = await import('playwright');
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  let bad = 0;
  try {
    for (const id of ids) {
      const { context, page } = await openCity(browser, root);
      const rec = await verifyLesson(page, id);
      await context.close();
      if (!rec.ok) bad += 1;
      console.log(rec.ok ? `合格 ${id}（${rec.notes.join('・')}）` : `不合格 ${id} [${rec.stage}] ${rec.saw}\n  した操作: ${rec.did.join(' / ')}\n  画像: ${String(rec.shot)}`);
      if (rec.candidates) console.log(`  候補の行: ${rec.candidates.join(' ')}`);
    }
  } finally {
    await browser.close();
    await close();
  }
  process.exitCode = bad > 0 ? 1 : 0;
}

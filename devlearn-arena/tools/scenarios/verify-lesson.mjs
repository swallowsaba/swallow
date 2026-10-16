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
    const all = [...document.querySelectorAll(sel)];
    const el = all.find((b) => norm(b.innerText) === norm(want));
    if (!el) return all.map((b) => norm(b.innerText));
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
 * 返す物: { id, ok, stage, did, saw, shot, notes }
 */
export async function verifyLesson(page, id, opts = {}) {
  const shotDir = opts.shotDir ?? 'shots/verify';
  const words = glossaryWords();
  const lesson = readLesson(id);
  const plain = (s) => s.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, t) => words[t] ?? t).replace(/`([^`]+)`/g, '$1');
  const rec = { id, ok: false, stage: '都市', did: [], saw: '', shot: null, notes: [], errors: [] };
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
    await page.locator('.topbar-entry', { hasText: '学ぶ' }).click();
    did('上の「学ぶ」を押した');
    await page.waitForSelector('[data-testid="learn-screen"]');
    const row = page.locator(`[data-lesson="${id}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    did(`学習ライブラリで「${lesson.title}」を選んだ`);
    await page.click('[data-testid="entry-start"]');
    did('入口の札の「始める」を押した');

    // c. 解説を読み進める
    rec.stage = '解説';
    await page.waitForSelector('[data-testid="stage-explain"]');
    for (let i = 0; i < 12 && (await page.$('[data-testid="stage-explain"]')); i += 1) {
      await next(page);
      did('解説の「次へ」');
      await wait(page, 150);
    }
    if (await page.$('[data-testid="stage-explain"]')) throw fail('解説から先へ進めない');

    // d. 理解の問いに全て正しく答える
    rec.stage = '理解';
    await page.waitForSelector('[data-testid="stage-understand"]');
    for (const [i, u] of lesson.understand.entries()) {
      await page.waitForSelector('[data-testid="understand-item"]');
      const n = `理解 ${String(i + 1)}（${u.kind}）`;
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
    rec.stage = 'クイズ';
    await page.waitForSelector('[data-testid="stage-quiz"]');
    for (const q of lesson.quiz) {
      await page.waitForSelector('[data-testid="quiz-question"]');
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
    rec.stage = '実戦';
    await page.waitForSelector('[data-testid="stage-practice"]');
    const p = lesson.practice;
    if (p.mode === 'editor') await page.waitForSelector('[data-testid="editor-text"]');
    else if (p.mode === 'sql') await page.waitForSelector('[data-testid="sql-input"]:not([disabled])');
    else if (p.mode === 'terminal') await page.waitForSelector('.term-host .xterm');
    await wait(page, 500);

    // エラーの案内が出たら、その瞬間の画面を撮り、何を打った時の何という案内かを残して、閉じて続ける（達成になるかも確かめる）
    const checkError = async (what, step) => {
      const g = await errorGuide(page);
      if (!g) return;
      const current = await page.evaluate(() => document.querySelector('.practice-step.is-current')?.getAttribute('data-step') ?? null);
      // 想定した失敗の案内（下の designed）は撮らない。最初の、想定していない案内の瞬間を撮る
      const expected = current === step.id && (step.expectedErrors ?? []).includes(g.guide);
      if (!expected && !rec.shot) {
        mkdirSync(shotDir, { recursive: true });
        rec.shot = `${shotDir}/${id}.png`;
        await page.screenshot({ path: rec.shot });
      }
      rec.errors.push({ line: what, step: step.id, current, guide: g.guide, text: g.text });
      await page.locator('.practice-error-close').click().catch(() => {});
      await wait(page, 120);
    };
    for (const [i, step] of p.steps.entries()) {
      // 前の手順の操作で、もう満たした手順
      if ((await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true') continue;
      // 人と同じく、ヒントを最後の段まで開く（画面の最後のヒントが中身と同じかも見る）
      for (let k = 0; k < 3 && (await page.$('[data-testid="practice-hint"]')); k += 1) await page.click('[data-testid="practice-hint"]');
      await wait(page, 100);
      const shown = await text(page, '.practice-hint[data-hint="3"]');
      if (!shown) throw fail(`手順 ${String(i + 1)}（${step.id}）の最後のヒントが開けない`);
      if (p.mode === 'terminal') {
        const cands = await page.evaluate(() => [...document.querySelectorAll('.practice-candidate')].map((c) => c.textContent));
        rec.candidates = [...new Set([...(rec.candidates ?? []), ...cands])];
      }
      if (p.mode === 'simulation') {
        for (const a of step.actions ?? []) {
          await perform(page, a, p.setup);
          did(`手順 ${step.id}: ${JSON.stringify(a)}`);
          await checkError(JSON.stringify(a), step);
        }
        continue;
      }
      const lines = answersOf(step);
      if (lines.length === 0) throw fail(`手順 ${step.id} の最後のヒントに、打つ物（\`\`）が無い: ${squash(step.hints[2])}`);
      const answerStep = step.check.kind === 'answer';
      for (const [j, line] of lines.entries()) {
        if (answerStep && j === lines.length - 1) {
          // 答える手順の最後の物は、答えの欄に打つ
          await page.click('#practice-answer');
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
        await checkError(squash(line).slice(0, 120), step);
      }
    }
    const unfinished = await page.evaluate(() => [...document.querySelectorAll('.practice-step')].filter((s) => s.dataset.done !== 'true').map((s) => s.querySelector('.practice-step-text')?.innerText.replace(/\s+/g, ' ').trim()));
    // 想定した失敗（衝突・拒否・届かないことを見せる手順）の案内は、その手順の想定エラーで、その手順の間に出た物だけ。
    // 命令が本当に失敗したかは、同じ関数で最後のヒントを通す内容の検証（npm run content:check）が確かめる
    const designed = (e) => {
      const step = p.steps.find((x) => x.id === e.step);
      return e.current === e.step && (step?.expectedErrors ?? []).includes(e.guide);
    };
    for (const e of rec.errors.filter(designed)) rec.notes.push(`想定した失敗の案内 ${e.guide}（${e.line}）`);
    rec.errors = rec.errors.filter((e) => !designed(e));
    if (rec.errors.length > 0) rec.saw = `正しい操作でエラーの案内が出た: ${rec.errors.map((e) => `${e.line} → ${e.text.slice(0, 160)}`).join(' ／ ')}`;
    if (unfinished.length > 0) {
      const term = p.mode === 'terminal' ? await page.evaluate(() => document.querySelector('.term-host .xterm-rows')?.innerText ?? null) : null;
      throw fail(`${rec.saw ? `${rec.saw}。` : ''}最後のヒントの操作を全て行ったのに、まだの手順がある: ${unfinished.join(' ／ ')}${term ? `（端末: ${squash(term).slice(-300)}）` : ''}`);
    }
    if (rec.errors.length > 0) throw fail(rec.saw);

    // g. 結果の画面
    rec.stage = '結果';
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
    rec.stage = 'まとめ';
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

    // i. 都市の画面に戻る
    rec.stage = '都市へ戻る';
    await page.click('[data-testid="lesson-to-city"]');
    did('「都市へ戻る」を押した');
    await page.waitForSelector('[data-testid="city-screen"]');
    await page.waitForFunction(() => window.location.hash === '#/city' || window.location.hash === '' || window.location.hash === '#/');
    await page.waitForSelector('[data-testid="lesson-screen"]', { state: 'detached', timeout: 5000 }).catch(() => {});
    if (await page.$('[data-testid="lesson-screen"]')) throw fail('レッスンの画面が閉じない');
    if (pageErrors.length > 0) throw fail(`ページの誤り: ${pageErrors.join(' ／ ')}`);
    rec.ok = true;
    rec.stage = '';
  } catch (e) {
    rec.saw = e.verify ? e.message : `${rec.saw ? `${rec.saw}。` : ''}台本が進めない: ${String(e.message ?? e).split('\n')[0]}`;
    // その瞬間の画面（エラーの案内が出た時は、もう撮ってある）
    if (!rec.shot) {
      mkdirSync(shotDir, { recursive: true });
      rec.shot = `${shotDir}/${id}.png`;
      await page.screenshot({ path: rec.shot }).catch(() => {
        rec.shot = null;
      });
    }
  } finally {
    page.off('pageerror', onError);
  }
  return rec;
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

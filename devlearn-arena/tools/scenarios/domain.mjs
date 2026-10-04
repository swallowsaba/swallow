// 分野ごとの視覚確認の台本（docs/development-plan.md Phase 10「分野ごとに 1 本、全段を撮影」）。
//
//   LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/domain.mjs npm run shoot -- p10-found
//   SHOOT_SIZE=1280x720 LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/domain.mjs npm run shoot -- p10-found-1280
//
// レッスンの中身（content/lessons）を読んで正しく答え、7 段を通す: 解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP / スキル。
// 実戦は、各手順の最初に 1 度わざと誤った文（コマンド）を入れてエラーの小窓を撮り、最後のヒントの答えを入れて進める。
// 撮る物: p10-<分野>-explain・-understand・-quiz・-practice・-error・-afterward・-result・-summary・-done（-1280 も）
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const next = (page) => page.click('[data-testid="lesson-next"]');
const wait = (page, ms = 300) => page.waitForTimeout(ms);

/** 画面の字が text と同じボタンを押す（用語の印は画面の語に直して比べる） */
async function clickText(page, selector, label) {
  const ok = await page.evaluate(([sel, want]) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const el = [...document.querySelectorAll(sel)].find((b) => norm(b.innerText) === norm(want));
    if (!el) return false;
    el.click();
    return true;
  }, [selector, label]);
  if (!ok) throw new Error(`「${label}」が ${selector} に無い`);
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
  const plain = (s) => s.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, t) => data.words[t] ?? t);
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
  if (!sim) await page.waitForSelector('.term-host .xterm');
  await wait(page, 600);
  await shot(`${tag}-practice`);
  const enter = async (line, answerStep) => {
    if (sim) {
      await page.fill('#sim-command', line);
      await page.press('#sim-command', 'Enter');
    } else if (answerStep) {
      await page.fill('#practice-answer', line);
      await page.press('#practice-answer', 'Enter');
    } else {
      await page.click('.term-host');
      await page.keyboard.type(line, { delay: 10 });
      await page.keyboard.press('Enter');
    }
    await wait(page, 400);
  };
  for (const [i, step] of lesson.practice.steps.entries()) {
    const lines = answersOf(step);
    const answerStep = step.check.kind === 'answer';
    if (i === 0) {
      // わざと誤る（無い名前・違う答え）→ エラーの小窓
      await enter(sim ? `${lines[0].split(' ')[0]} no-such-thing` : answerStep ? 'わからない' : 'cd /no-such-dir', answerStep);
      console.log('エラー', await page.getAttribute('[data-testid="practice-error"]', 'data-guide'), await text(page, '[data-testid="practice-error"]'));
      await shot(`${tag}-error`);
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

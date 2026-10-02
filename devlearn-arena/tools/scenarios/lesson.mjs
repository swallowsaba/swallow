// レッスン画面の前半（解説 → 理解 → クイズ）を通す台本（docs/development-plan.md Phase 6）。
//
//   SHOOT_SCRIPT=tools/scenarios/lesson.mjs npm run shoot -- p6-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/lesson.mjs npm run shoot -- p6-end-1280
//
// 学習ライブラリの入口の札から found.b.04 を始める → 解説の 5 画面（用語の小窓）→ 理解（図を押す・結ぶ・はい／いいえ。わざと誤る）→
// クイズ（わざと誤ってから正す）→ 実戦の入口 → 中断して都市へ → 開き直すと続きから → linux.i.01 を情報パネルの直リンクで。
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const next = (page) => page.click('[data-testid="lesson-next"]');
const wait = (page, ms = 250) => page.waitForTimeout(ms);

/** 理解の 1 問を、正しく答える（わざと誤る時は wrong） */
async function understand(page, lessonId, wrong = false, shotWrong = null) {
  const kind = await page.getAttribute('[data-testid="understand-item"]', 'data-kind');
  if (kind === 'figure-pick') {
    const answer = { 'found.b.04': 'minato', 'linux.i.01': 'active' }[lessonId];
    if (wrong) {
      await page.click('[data-testid="lesson-figure"] [data-part="home"], [data-testid="lesson-figure"] [data-part="inactive"]');
      await wait(page);
      if (shotWrong) await shotWrong();
    }
    await page.click(`[data-testid="lesson-figure"] [data-part="${answer}"]`);
  } else if (kind === 'yesno') {
    if (wrong) {
      await page.click('.yesno-button >> text=はい');
      await wait(page);
    }
    await page.click('.yesno-button >> text=いいえ');
  } else if (kind === 'match') {
    const pairs = await page.evaluate(() => [...document.querySelectorAll('.match-col')].map((c) => [...c.querySelectorAll('.match-item')].map((b) => b.innerText)));
    // 正しい組は中身から読む（台本は答えを知らないので、画面の札で総当たりせず、データの順で結ぶ）
    const truth = await page.evaluate(() => window.__lessonTruth ?? null);
    const lefts = pairs[0] ?? [];
    for (const [i, l] of lefts.entries()) {
      await page.click(`.match-col:first-child .match-item >> nth=${String(i)}`);
      const r = truth?.[l];
      await page.click(`.match-col:last-child .match-item:has-text("${r}")`);
    }
    await page.click('.stage-check');
  } else if (kind === 'relation') {
    await page.click('.choice-button >> text=が原因で');
  }
  await wait(page);
}

export default async function lesson(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;

  // 学習ライブラリの入口の札から始める
  await page.keyboard.press('l');
  await page.waitForSelector('[data-testid="learn-screen"]');
  await page.click('[data-lesson="found.b.04"]');
  await page.click('[data-testid="entry-start"]');
  await page.waitForSelector('[data-testid="stage-explain"]');
  await wait(page, 500);
  console.log('始めた', await page.evaluate(() => window.location.hash), await text(page, '.lesson-bar'));
  await shot(`p6-explain${tag}`);

  // 用語の小窓
  await page.click('[data-testid="explain-text"] .rich-term >> nth=0');
  await wait(page);
  console.log('用語の小窓', await text(page, '[data-testid="term-popover"]'));
  await shot(`p6-term${tag}`);
  await page.keyboard.press('Escape');
  await wait(page);
  console.log('Esc で小窓だけ閉じた', !!(await page.$('[data-testid="lesson-screen"]')), !(await page.$('[data-testid="term-popover"]')));

  // 解説の 5 画面
  const titles = [];
  for (let i = 0; i < 5; i += 1) {
    titles.push(await text(page, '[data-testid="explain-title"]'));
    if (i === 4) await shot(`p6-situation${tag}`);
    await next(page);
    await wait(page);
  }
  console.log('解説の順', titles.join(' → '));

  // 理解の答え（結ぶ問題のため、中身と用語集を読んで、画面に出る語と説明の組を渡す）
  await page.evaluate(async () => {
    const [l, g] = await Promise.all(['/content/lessons/found/found.b.04.json', '/content/glossary/found.json'].map((u) => fetch(u).then((r) => r.json())));
    const word = Object.fromEntries(g.terms.map((t) => [t.id, t.word]));
    const truth = {};
    for (const u of l.understand) if (u.kind === 'match') for (const [a, b] of u.pairs) truth[a.replace(/\{\{term:([a-z-]+)\}\}/g, (_, id) => word[id] ?? id)] = b;
    window.__lessonTruth = truth;
  });

  // 理解: 1 問目は図をわざと誤って押す → 解説の箇所 → 正しく押す
  await understand(page, 'found.b.04', true, async () => {
    console.log('理解 1 の誤り', await text(page, '[data-testid="feedback"]'));
    await shot(`p6-understand-wrong${tag}`);
  });
  console.log('理解 1', await text(page, '[data-testid="feedback"]'));
  await shot(`p6-understand${tag}`);
  await next(page);
  await wait(page);
  await understand(page, 'found.b.04');
  console.log('理解 2', await text(page, '[data-testid="feedback"]'));
  await shot(`p6-match${tag}`);
  await next(page);
  await wait(page);
  await understand(page, 'found.b.04', true);
  console.log('理解 3', await text(page, '[data-testid="feedback"]'));
  await next(page);
  await page.waitForSelector('[data-testid="stage-quiz"]');
  await wait(page);

  // クイズ: 1 問目はわざと誤る → なぜ違うか → 正す
  await page.click('.choice-button[data-choice="b"]');
  await page.click('[data-testid="quiz-submit"]');
  await wait(page);
  console.log('誤答', await text(page, '.question'));
  await shot(`p6-quiz-wrong${tag}`);
  await page.click('.choice-button[data-choice="a"]');
  await page.click('[data-testid="quiz-submit"]');
  await wait(page);
  console.log('正答', await text(page, '[data-testid="feedback"]'), 'XP', await text(page, '[data-testid="lesson-xp"]'));
  await shot(`p6-quiz-right${tag}`);
  await next(page);
  await wait(page);
  // 2 問目（結果予測）は答えて、3 問目で中断する
  await page.click('.choice-button[data-choice="a"]');
  await page.click('[data-testid="quiz-submit"]');
  await wait(page);
  await shot(`p6-quiz-predict${tag}`);
  await next(page);
  await wait(page);
  await page.click('[data-testid="lesson-exit"]');
  await wait(page, 400);
  console.log('中断', await page.evaluate(() => window.location.hash), await page.evaluate(() => JSON.stringify(window.__progressStore?.getState().progress.lessons['found.b.04']?.stage ?? null)));

  // 開き直すと、クイズの 3 問目から
  await page.evaluate(() => {
    window.location.hash = '#/lesson/found.b.04';
  });
  await page.waitForSelector('[data-testid="stage-quiz"]');
  await wait(page, 400);
  console.log('再開', await text(page, '.stage-count'), await page.getAttribute('[data-testid="quiz-question"]', 'data-quiz'));
  await shot(`p6-resume${tag}`);
  for (const id of ['a', 'a']) {
    await page.click(`.choice-button[data-choice="${id}"]`);
    await page.click('[data-testid="quiz-submit"]');
    await wait(page);
    await next(page);
    await wait(page);
  }
  await page.waitForSelector('[data-testid="stage-practice"]');
  console.log('実戦の入口', await text(page, '[data-testid="stage-practice"]'), 'XP', await text(page, '[data-testid="lesson-xp"]'));
  await shot(`p6-practice${tag}`);
  // 終わった段は戻って見られる
  await page.click('.lesson-stage button[data-stage="explain"]');
  await wait(page);
  console.log('戻って見る', await text(page, '[data-testid="explain-title"]'));

  // 2 本目: linux.i.01（直リンク）
  await page.evaluate(() => {
    window.location.hash = '#/lesson/linux.i.01';
  });
  await page.waitForSelector('[data-testid="stage-explain"]');
  await wait(page, 500);
  console.log('2 本目', await text(page, '.lesson-bar'));
  await shot(`p6-linux${tag}`);
  for (let i = 0; i < 5; i += 1) {
    await next(page);
    await wait(page, 150);
  }
  await understand(page, 'linux.i.01');
  await next(page);
  await wait(page);
  await understand(page, 'linux.i.01', true);
  await next(page);
  await wait(page);
  await understand(page, 'linux.i.01');
  console.log('関係性', await text(page, '[data-testid="feedback"]'));
  await shot(`p6-relation${tag}`);
  await next(page);
  await page.waitForSelector('[data-testid="stage-quiz"]');
  await wait(page);
  // 1・2 問目に答え、3 問目（原因特定: 記録を読む）を撮る
  for (let i = 0; i < 2; i += 1) {
    await page.click('.choice-button[data-choice="a"]');
    await page.click('[data-testid="quiz-submit"]');
    await wait(page);
    await next(page);
    await wait(page);
  }
  console.log('原因特定', await text(page, '[data-testid="quiz-log"]'));
  await shot(`p6-cause${tag}`);
  await page.keyboard.press('Escape');
  await wait(page, 300);
  console.log('Esc で都市へ', await page.evaluate(() => window.location.hash));
  await shot(`p6-end${tag}`);
}

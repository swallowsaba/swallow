// レッスン画面の後半（実戦 → 結果 → まとめ → XP / スキル）を通す台本（docs/development-plan.md Phase 7）。
//
//   SHOOT_SCRIPT=tools/scenarios/practice.mjs npm run shoot -- p7-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/practice.mjs npm run shoot -- p7-end-1280
//
// 前半（解説 → 理解 → クイズ）は Phase 6 の台本（lesson.mjs）で撮った。ここでは記録を実戦の段まで進めてから開く。
// found.b.04: わざと誤る → エラーの小窓 → 打ち直して成功 → 結果 → まとめ → XP / スキル → 都市へ。
// linux.i.01: ヒントを 3 段開く → 最後のヒントをそのまま打つ → 結果（ヒントあり）。
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const next = (page) => page.click('[data-testid="lesson-next"]');
const wait = (page, ms = 300) => page.waitForTimeout(ms);

async function toPractice(page, id) {
  await page.evaluate((lessonId) => {
    const store = window.__game.store;
    store.getState().start(lessonId, new Date().toISOString());
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach(lessonId, st);
    window.location.hash = `#/lesson/${lessonId}`;
  }, id);
  await page.waitForSelector('[data-testid="stage-practice"]');
  await page.waitForSelector('.term-host .xterm');
  await wait(page, 600);
}

async function typeLine(page, line) {
  await page.click('.term-host');
  await page.keyboard.type(line, { delay: 15 });
  await page.keyboard.press('Enter');
  await wait(page, 400);
}

export default async function practice(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', (e.stack ?? '').split('\n').slice(0, 5).join(' | ')));

  await toPractice(page, 'found.b.04');
  console.log('実戦', await text(page, '[data-testid="stage-practice"]'));
  await shot(`p7-practice${tag}`);

  await typeLine(page, 'cd /srv/ap');
  console.log('エラー', await page.getAttribute('[data-testid="practice-error"]', 'data-guide'), await text(page, '[data-testid="practice-error"]'));
  await shot(`p7-error${tag}`);

  await typeLine(page, 'pwd');
  await typeLine(page, 'cd /srv/app');
  console.log('達成', await text(page, '[data-testid="practice-afterward"]'), 'エラーの小窓', !!(await page.$('[data-testid="practice-error"]')));
  await shot(`p7-success${tag}`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-result"]');
  await wait(page);
  console.log('結果', await page.getAttribute('[data-testid="stage-result"]', 'data-result'), await text(page, '[data-testid="stage-result"]'));
  await shot(`p7-result${tag}`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-summary"]');
  await wait(page);
  console.log('まとめ', await text(page, '[data-testid="stage-summary"]'));
  await shot(`p7-summary${tag}`);

  await next(page);
  await page.waitForSelector('[data-testid="stage-done"]');
  await wait(page);
  console.log('XP / スキル', await text(page, '[data-testid="stage-done"]'), await text(page, '[data-testid="done-xp"]'));
  await shot(`p7-done${tag}`);

  await page.click('[data-testid="lesson-to-city"]');
  await wait(page, 500);
  console.log('都市へ', await page.evaluate(() => window.location.hash), await text(page, '.top-bar, [data-testid="top-bar"]'));

  // 2 本目: linux.i.01（ヒントを 3 段）
  await toPractice(page, 'linux.i.01');
  await typeLine(page, 'systemctl status web');
  for (let i = 0; i < 3; i += 1) {
    await page.click('[data-testid="practice-hint"]');
    await wait(page, 150);
  }
  console.log('ヒント', await text(page, '[data-testid="practice-hints"]'));
  await shot(`p7-hints${tag}`);
  await typeLine(page, 'systemctl enable --now web');
  await typeLine(page, 'systemctl status web');
  await shot(`p7-linux-done${tag}`);
  await next(page);
  await page.waitForSelector('[data-testid="stage-result"]');
  await wait(page);
  console.log('結果', await page.getAttribute('[data-testid="stage-result"]', 'data-result'));
  await shot(`p7-result-partial${tag}`);
}

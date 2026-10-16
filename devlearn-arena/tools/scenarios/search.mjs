// linux.b.04（探す）の実戦: 読めない場所を飛ばしただけの grep・find でエラーの案内を出さないこと（docs/progress/urgent-02.md）。
//
//   SHOOT_SCRIPT=tools/scenarios/search.mjs npm run shoot -- u2-search
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/search.mjs npm run shoot -- u2-search-1280
//
// grep -r timeout /var/log | wc -l → 3 と Permission denied（案内なし）→ 3 と答える →
// find / -name app.conf → 場所と Permission denied（案内なし）→ 場所を答える → 全て達成。
// 比べるため、読めないファイルを cat した時（目的を果たせない）は案内が出ることも撮る。
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const guide = async (page) => (await page.$('[data-testid="practice-error"]')) ? await page.getAttribute('[data-testid="practice-error"]', 'data-guide') : 'なし';

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

async function answer(page, value) {
  await page.fill('#practice-answer', value);
  await page.press('#practice-answer', 'Enter');
  await wait(page, 400);
}

export default async function search(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', (e.stack ?? '').split('\n').slice(0, 5).join(' | ')));

  await toPractice(page, 'linux.b.04');
  await typeLine(page, 'grep -r timeout /var/log | wc -l');
  console.log('grep | wc -l の後の案内', await guide(page), '手順', await text(page, '[data-testid="stage-practice"]'));
  await shot(`u2-grep${tag}`);

  await answer(page, '3');
  console.log('3 と答えた後の案内', await guide(page), '達成', await text(page, '[data-testid="practice-afterward"]'));
  await shot(`u2-count-done${tag}`);

  await typeLine(page, 'find / -name app.conf');
  console.log('find の後の案内', await guide(page));
  await shot(`u2-find${tag}`);

  await answer(page, '/etc/app/app.conf');
  console.log('場所を答えた後の案内', await guide(page), '実戦', await text(page, '[data-testid="stage-practice"]'));
  await shot(`u2-done${tag}`);

  // 比べる: 読めないファイルだけを読む（結果が無い）と、案内が出る
  await toPractice(page, 'linux.b.04');
  await page.click('[data-testid="practice-reset"]');
  await wait(page);
  await typeLine(page, 'cat /var/log/secure');
  console.log('cat の後の案内', await guide(page), await text(page, '[data-testid="practice-error"]'));
  await shot(`u2-cat-denied${tag}`);
}

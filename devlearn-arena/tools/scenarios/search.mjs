// linux.b.04（探す）の実戦（docs/progress/urgent-02.md・urgent-03.md）。
//
//   SHOOT_SCRIPT=tools/scenarios/search.mjs npm run shoot -- u3-search
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/search.mjs npm run shoot -- u3-search-1280
//
// 打った結果で達成する: grep -r timeout /var/log | wc -l → 3 と Permission denied（案内なし）で 1 つ目の手順を満たす →
// find / -name app.conf → 場所と Permission denied（案内なし）で 2 つ目の手順を満たす → 「結果へ」で、できたことが 2 つ並ぶ。
// 答えの欄は出ない。比べるため、数え方を誤った時（想定の解説が出る）と、読めないファイルを cat した時（目的を果たせない）も撮る。
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const guide = async (page) => (await page.$('[data-testid="practice-error"]')) ? await page.getAttribute('[data-testid="practice-error"]', 'data-guide') : 'なし';
const answerBox = async (page) => ((await page.$('#practice-answer')) ? 'ある' : '無い');

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

export default async function search(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', (e.stack ?? '').split('\n').slice(0, 5).join(' | ')));

  await toPractice(page, 'linux.b.04');
  console.log('始めの答えの欄', await answerBox(page));
  await typeLine(page, 'grep -r timeout /var/log | wc -l');
  console.log('grep | wc -l の後の案内', await guide(page), '答えの欄', await answerBox(page), '何が起きたか', await text(page, '[data-testid="practice-afterward"]'));
  await shot(`u3-grep${tag}`);

  await typeLine(page, 'find / -name app.conf');
  console.log('find の後の案内', await guide(page), '実戦', await text(page, '[data-testid="stage-practice"]'));
  await shot(`u3-find${tag}`);

  await page.click('[data-testid="lesson-next"]');
  await wait(page, 800);
  console.log('結果', await text(page, '[data-testid="stage-result"]') ?? await text(page, 'main'));
  await shot(`u3-result${tag}`);

  // 比べる: grep と wc で数えたが、1 つのファイルだけを数えた（想定の解説が出る）。上の段の並びから実戦へ戻り、初めに戻す
  await page.click('button[data-stage="practice"]');
  await page.waitForSelector('.term-host .xterm');
  await wait(page, 600);
  await page.click('[data-testid="practice-reset"]');
  await wait(page);
  await typeLine(page, 'grep timeout /var/log/app/web.log | wc -l');
  console.log('数え違いの後の案内', await guide(page), await text(page, '[data-testid="practice-error"]'));
  await shot(`u3-wrong-count${tag}`);

  // 比べる: 読めないファイルだけを読む（結果が無い）と、案内が出る
  await page.click('[data-testid="practice-reset"]');
  await wait(page);
  await typeLine(page, 'cat /var/log/secure');
  console.log('cat の後の案内', await guide(page), await text(page, '[data-testid="practice-error"]'));
  await shot(`u3-cat-denied${tag}`);

  // 答えの欄が残る手順（読み取って答える値）: 「答える」のボタンを押して通る。全角で入れても同じ答え（linux.b.00）
  await toPractice(page, 'linux.b.00');
  console.log('uname の前の答えの欄', await answerBox(page));
  await typeLine(page, 'uname');
  console.log('uname の後の案内', await guide(page), '答えの欄', await answerBox(page), '何が起きたか', await text(page, '[data-testid="practice-afterward"]'));
  await page.fill('#practice-answer', 'Ｕｂｕｎｔｕ');
  console.log('答えるのボタン', (await page.isEnabled('[data-testid="practice-answer"] button')) ? '押せる' : '押せない');
  await page.click('[data-testid="practice-answer"] button');
  await wait(page);
  console.log('Ｕｂｕｎｔｕ を押した後', await guide(page), await text(page, '[data-testid="stage-practice"]'));
  await shot(`u3-answer-button${tag}`);

  // SQL: SELECT COUNT(*) で 15 と出た時点で数える手順を満たす（db.b.04）
  await page.evaluate(() => {
    const store = window.__game.store;
    store.getState().start('db.b.04', new Date().toISOString());
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach('db.b.04', st);
    window.location.hash = '#/lesson/db.b.04';
  });
  await page.waitForSelector('[data-testid="sql-input"]:not([disabled])');
  console.log('SQL の始めの答えの欄', await answerBox(page));
  for (const statement of ['SELECT COUNT(*) FROM members', "SELECT COUNT(*) FROM members WHERE status = '在籍'"]) {
    await page.fill('[data-testid="sql-input"]', statement);
    await page.click('[data-testid="sql-run"]');
    await wait(page);
    console.log(statement, '→ 案内', await guide(page), '何が起きたか', await text(page, '[data-testid="practice-afterward"]'), '答えの欄', await answerBox(page));
  }
  await shot(`u3-sql-count${tag}`);
}

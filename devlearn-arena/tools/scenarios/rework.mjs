// 実戦の作り直し（REWORK-PRACTICE.txt）の視覚確認の台本。実戦の画面だけを、操作の途中も含めて撮る。
//
//   LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/rework.mjs npm run shoot -- rw-found.b.01
//   SHOOT_SIZE=1280x720 LESSON=found.b.01 SHOOT_SCRIPT=tools/scenarios/rework.mjs npm run shoot -- rw-found.b.01-1280
//
// 撮る物（名前は shoot の名前に付け足す）:
//   -start   実戦を開いた所（左の目的と右の画面が見て結び付くか: 原則 5）
//   -drag    画面の操作の途中（ドラッグして受け口の上にある時。原則 3）
//   -wrong   わざと誤った操作の後（赤く示し、理由が出る。原則 4）
//   -done    最後のヒントの操作を全てした後（動きの終わり。原則 4）
// 端末・設定の編集の実戦は、最後のヒントのコマンドを打って -start・-done を撮る（原則 1: 本物の道具が出ているか）。
// REDUCED=1 を付けると、動きを減らす設定で撮る（動きが即時になるか）。
import { readFileSync } from 'node:fs';
import { perform, wrongAction } from './simDrive.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const wait = (page, ms = 300) => page.waitForTimeout(ms);

export default async function rework(page, shot) {
  const id = process.env.LESSON ?? 'found.b.01';
  const lesson = JSON.parse(readFileSync(`content/lessons/${id.split('.')[0]}/${id}.json`, 'utf8'));
  const name = process.argv[2] ?? `rw-${id}`;
  const p = lesson.practice;
  if (process.env.REDUCED) await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; });
  await page.evaluate((lessonId) => {
    const store = window.__game.store;
    store.getState().start(lessonId, new Date().toISOString());
    for (const st of ['understand', 'quiz', 'practice']) store.getState().reach(lessonId, st);
    window.location.hash = `#/lesson/${lessonId}`;
  }, id);
  await page.waitForSelector('[data-testid="stage-practice"]');
  if (p.mode === 'terminal') await page.waitForSelector('.term-host .xterm');
  await wait(page, 700);
  await shot(`${name}-start`);

  if (p.mode === 'simulation') {
    const bad = wrongAction(p.setup, p.steps[0]);
    if (bad) {
      await perform(page, bad, p.setup);
      await wait(page, 900);
      const guide = await page.evaluate(() => document.querySelector('[data-testid="practice-error"]')?.getAttribute('data-guide') ?? null);
      console.log('誤り', guide, await text(page, '.sim-note, .sim-slot-why, .sim-stage-why, .sim-node-stuck, .sim-card.is-wrong'));
      await shot(`${name}-wrong`);
      await page.click('[data-testid="practice-reset"]');
      await wait(page);
    }
    let first = true;
    for (const step of p.steps) {
      for (const a of step.actions ?? []) {
        const mid = first && ['connect', 'put', 'take', 'arrange'].includes(a.op) ? async () => shot(`${name}-drag`) : undefined;
        if (mid) first = false;
        await perform(page, a, p.setup, mid);
      }
      console.log('手順', step.id, await page.evaluate((sid) => document.querySelector(`[data-step="${sid}"]`)?.getAttribute('data-done'), step.id));
    }
    await wait(page, 1500);
  } else {
    for (const step of p.steps) {
      const lines = [...step.hints[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const answerStep = step.check.kind === 'answer';
      for (const [j, line] of lines.entries()) {
        if (p.mode === 'editor') {
          await page.fill('[data-testid="editor-text"]', line);
          await page.click('[data-testid="editor-save"]');
        } else if (answerStep && j === lines.length - 1) {
          await page.fill('#practice-answer', line);
          await page.press('#practice-answer', 'Enter');
        } else if (p.mode === 'sql') {
          await page.fill('#sql-input', line);
          await page.click('[data-testid="sql-run"]');
        } else {
          await page.click('.term-host');
          await page.keyboard.type(line, { delay: 5 });
          await page.keyboard.press('Enter');
        }
        await wait(page, 500);
      }
      console.log('手順', step.id, await page.getAttribute(`[data-step="${step.id}"]`, 'data-done'));
    }
  }
  console.log('達成', await text(page, '.practice-steps'));
  await shot(`${name}-done`);
}

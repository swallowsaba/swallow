#!/usr/bin/env node
// 初回公開の範囲の全レッスンを、1 本ずつ人と同じ道で通す（VERIFY-ALL.txt【2】）。失敗しても止めず、最後まで流す。
//
//   node tools/scenarios/verify-all.mjs                 全て
//   node tools/scenarios/verify-all.mjs linux k8s.b.01  分野か ID で絞る
//   node tools/scenarios/verify-all.mjs --table         前に流した結果（shots/verify/results.json）から表だけを作り直す
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-all.mjs
//   VERIFY_JOBS=3                                       同時に通す本数（既定 3）
//   VERIFY_SIZE=1280x720                                画面の大きさ（既定 1920x1080）。付けると、各段・解説の各ページ・実戦の後で
//                                                       文の重なり・切れ・はみ出しと、今打てるコマンドの候補の行を見る（VERIFY-FREE.txt【3】。tools/scenarios/layoutCheck.mjs）。
//                                                       結果は shots/verify-<幅>/ に書く
//
// 1 本ごとに新しい記録（空の localStorage）で都市の画面を開き、tools/scenarios/verify-lesson.mjs で通す。
// 結果は shots/verify/results.json と shots/verify/table.md（docs/progress/verify-all.md に載せる表）に書く。
// 絞って流した時は、前の結果の該当する行だけを置き換える。不合格の画面は shots/verify/<ID>.png。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { candidatesProblem, layoutProblems } from './layoutCheck.mjs';
import { allLessonIds, openCity, siteRoot, verifyLesson } from './verify-lesson.mjs';

const SIZE = process.env.VERIFY_SIZE;
const [W, H] = (SIZE ?? '1920x1080').split('x').map(Number);
const DIR = SIZE ? `shots/verify-${String(W)}` : 'shots/verify';
const RESULTS = `${DIR}/results.json`;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 表の 1 行。エラーの案内が出た時は、打った物と案内の見出し（何と言われたか）を並べる */
function rowOf(r) {
  if (r.ok && r.layout?.length) return `| ${r.id} | 不合格 | ${r.layout[0].at} | | ${cell(r.layout.map((x) => `${x.at}: ${x.what.join('・')}`).join(' ／ ').slice(0, 600))} | ${r.layout.map((x) => `\`${x.shot}\``).join(' ')} |`;
  if (r.ok) return `| ${r.id} | 合格 | | | ${cell(r.notes.join('・'))} | |`;
  const errors = r.errors ?? [];
  const did = errors.length > 0 ? errors.map((e) => `\`${e.line}\``).join('・') : r.did.slice(-3).join(' / ');
  const saw = errors.length > 0
    ? `エラーの案内（${errors.map((e) => `${e.guide}${e.current && e.current !== e.step ? `。手順 ${e.step} の行が次の手順 ${e.current} で` : ''}`).join('・')}）: ${cut(errors[0].text.replace(/^エラーが出た。調べてみよう\s*/, '').replace(errors[0].line, '').split(' 何と言われたか')[0].trim(), 140)}`
    : cut(r.saw, 260);
  return `| ${r.id} | 不合格 | ${r.stage} | ${cell(did)} | ${cell(saw)} | ${r.shot ? `\`${r.shot}\`` : ''} |`;
}

function writeTable(list) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify(list, null, 2)}\n`);
  writeFileSync(`${DIR}/table.md`, ['| レッスン | 結果 | 止まった段階 | した操作 | 起きたこと | 画像 |', '|---|---|---|---|---|---|', ...list.map(rowOf), ''].join('\n'));
  const bad = list.filter((r) => !r.ok || r.layout?.length);
  console.log(`\n${String(list.length)} 本中 合格 ${String(list.length - bad.length)}・不合格 ${String(bad.length)}`);
  return bad.length;
}

const args = process.argv.slice(2);
const previous = existsSync(RESULTS) ? new Map(JSON.parse(readFileSync(RESULTS, 'utf8')).map((r) => [r.id, r])) : new Map();
if (args.includes('--table')) {
  writeTable(allLessonIds().map((id) => previous.get(id)).filter(Boolean));
} else {
  const { chromium } = await import('playwright');
  const ids = allLessonIds().filter((id) => args.length === 0 || args.some((w) => id === w || id.startsWith(`${w}.`)));
  const jobs = Number(process.env.VERIFY_JOBS ?? 3);
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        let rec;
        const opened = await openCity(browser, root, { width: W, height: H }).catch(() => null);
        if (!opened) {
          rec = { id, ok: false, stage: '都市', did: ['都市の画面を開いた'], saw: '都市の画面が開けない', shot: null, notes: [], errors: [] };
        } else {
          // 小さい画面では、各段の初め（少し待ってから）・解説の各ページ・実戦の後に、画面の崩れを見る。崩れた画面は撮る
          const layout = [];
          const look = async (at) => {
            if (!SIZE) return;
            await opened.page.waitForTimeout(400);
            const what = await layoutProblems(opened.page);
            const cand = at === '実戦の後' || at === '実戦' ? await candidatesProblem(opened.page) : null;
            if (cand) what.push(cand);
            if (what.length === 0) return;
            const shot = `${DIR}/${id}-${String(layout.length + 1)}.png`;
            mkdirSync(DIR, { recursive: true });
            await opened.page.screenshot({ path: shot });
            layout.push({ at, what, shot });
          };
          rec = await verifyLesson(opened.page, id, SIZE ? { onStage: look, onLook: look, shotDir: DIR } : {});
          if (layout.length) rec.layout = layout;
          await opened.context.close();
        }
        previous.set(id, rec);
        const broke = rec.layout?.length ? ` 崩れ: ${rec.layout.map((x) => `${x.at}: ${x.what.join('・')}`).join(' ／ ').slice(0, 300)}` : '';
        console.log(`${rec.ok && !broke ? '合格' : '不合格'} ${id}${rec.ok ? '' : ` [${rec.stage}] ${rec.saw.slice(0, 300)}`}${broke}`);
      }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
  } finally {
    await browser.close();
    await close();
  }
  console.log(`（${String(Math.round((Date.now() - t0) / 1000))} 秒）`);
  const bad = writeTable(allLessonIds().map((id) => previous.get(id)).filter(Boolean));
  process.exitCode = ids.some((id) => !previous.get(id)?.ok || previous.get(id)?.layout?.length) || bad > 0 ? 1 : 0;
}

#!/usr/bin/env node
// ヒントを開かず、最後のヒントとは違う正しい操作（別解）で、全レッスンを人と同じ道で通す（VERIFY-FREE.txt【1】）。
//
//   node tools/scenarios/verify-free.mjs                 全て
//   node tools/scenarios/verify-free.mjs linux k8s.b.01  分野か ID で絞る（前の結果の該当する行だけを置き換える）
//   node tools/scenarios/verify-free.mjs --table         前に流した結果（shots/verify-free/results.json）から表だけを作り直す
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-free.mjs
//   VERIFY_JOBS=3                                        同時に通す数（既定 3）
//
// 別解は tools/scenarios/variants/<ID>.json（確かめるための台本側の持ち物。レッスンの中身は変えない）。手順ごとに、
// 端末・SQL は打つ行（答える手順は最後の物が答え）、設定の編集は保存する中身、模は操作（並べるの dropOrder: 'reverse' は下の段から置く）。
// 1 つの別解ごとに新しい記録（空の localStorage）で、tools/scenarios/verify-lesson.mjs と同じ道を通る。違いは、
// ヒントを一度も開かないことと、実戦で別解を行うこと。合格の条件は verify-lesson.mjs に加えて、実戦の XP がヒント無しの満額で入ること。
// その手順の想定エラーで、その手順の間に出た案内は「想定した案内」として残す（表に打った物と一緒に出し、目で見て判断する）。
// 結果は shots/verify-free/results.json と shots/verify-free/table.md。不合格の画面は shots/verify-free/<ID>-<番号>.png。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allLessonIds, openCity, siteRoot, verifyLesson } from './verify-lesson.mjs';

const DIR = 'shots/verify-free';
const RESULTS = `${DIR}/results.json`;
const VARIANTS = new URL('./variants/', import.meta.url);
/** 手順の目的そのものが、失敗を見て読むことのレッスン（docs/progress/verify-all.md の C2「想定した失敗」） */
const DESIGNED_FAILURES = new Set(['git.b.06', 'git.i.05', 'git.i.02', 'trouble.b.02', 'docker.b.01', 'k8s.b.01', 'net.b.03', 'net.b.04', 'net.i.01', 'net.i.02',
  // 目的の文が「送って、どこで止まるかを見る」「入れ替えが進むかを見る」「curl の誤りを読む」「200 が返らなければ返事の数から原因を探す」と、失敗を見ることを書いている手順（最後のヒントは先に直すので通らないが、目的の文のとおりに打つと通る。docs/progress/verify-free.md）
  'found.b.07', 'net.b.01', 'k8s.i.08', 'sec.b.07', 'web.b.07']);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** レッスンの別解（無ければ null） */
export function variantsOf(id) {
  const f = new URL(`${id}.json`, VARIANTS);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).variants : null;
}

/** 表の 1 行（レッスンごと）。別解ごとの結果を並べ、不合格の物は止まった段階と起きたことを書く */
function rowOf(id, recs) {
  if (!recs?.length) return `| ${id} | 未 | | | |`;
  const bad = recs.filter((r) => !r.ok);
  const marks = recs.map((r) => `${r.variant}${r.ok ? '○' : '×'}`).join(' ');
  const designed = [...new Set(recs.flatMap((r) => (r.designed ?? []).map((e) => `${e.guide}（\`${cut(e.line, 60)}\`）`)))];
  const saw = bad.map((r) => `#${r.variant}「${r.name}」[${r.stage}] ${cut(r.saw, 300)}`).join(' ／ ');
  const shots = bad.map((r) => (r.shot ? `\`${r.shot}\`` : '')).filter(Boolean).join(' ');
  return `| ${id} | ${bad.length ? '不合格' : '合格'} | ${marks} | ${cell(saw || (designed.length ? `想定した案内: ${designed.join('・')}` : ''))} | ${shots} |`;
}

function writeTable(all) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify(Object.fromEntries(all), null, 2)}\n`);
  const ids = allLessonIds();
  writeFileSync(`${DIR}/table.md`, ['| レッスン | 結果 | 別解 | 起きたこと | 画像 |', '|---|---|---|---|---|', ...ids.map((id) => rowOf(id, all.get(id))), ''].join('\n'));
  const done = ids.filter((id) => all.get(id)?.length);
  const bad = done.filter((id) => all.get(id).some((r) => !r.ok));
  console.log(`\n${String(done.length)} 本中 合格 ${String(done.length - bad.length)}・不合格 ${String(bad.length)}（別解 ${String(done.reduce((n, id) => n + all.get(id).length, 0))} 通り）`);
  return bad.length;
}

const args = process.argv.slice(2);
const previous = new Map(Object.entries(existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {}));
if (args.includes('--table')) {
  writeTable(previous);
} else {
  const { chromium } = await import('playwright');
  const ids = allLessonIds().filter((id) => args.length === 0 || args.some((w) => id === w || id.startsWith(`${w}.`)));
  const missing = ids.filter((id) => !variantsOf(id));
  if (missing.length) console.log(`別解の無いレッスン: ${missing.join(' ')}`);
  const jobs = Number(process.env.VERIFY_JOBS ?? 3);
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  const t0 = Date.now();
  const fresh = new Map();
  try {
    const queue = ids.flatMap((id) => (variantsOf(id) ?? []).map((v, k) => ({ id, v, n: k + 1 })));
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { id, v, n } = job;
        const inputs = (step) => v.steps[step.id] ?? [];
        let rec;
        const opened = await openCity(browser, root).catch(() => null);
        if (!opened) {
          rec = { id, ok: false, stage: '都市', did: ['都市の画面を開いた'], saw: '都市の画面が開けない', shot: null, notes: [], errors: [] };
        } else {
          rec = await verifyLesson(opened.page, id, { inputs, shotDir: DIR, shotName: `${id}-${String(n)}` });
          await opened.context.close();
        }
        Object.assign(rec, { variant: n, name: v.name });
        // 正しい操作で出てよい案内は、想定した失敗の手順（docs/progress/verify-all.md の C2 の一覧）だけ。
        // ほかのレッスンで出た想定エラーの案内は不合格として並べ、画面を見て判断する（記録に書く）
        const outside = (rec.designed ?? []).filter(() => !DESIGNED_FAILURES.has(id));
        if (rec.ok && outside.length > 0) {
          Object.assign(rec, { ok: false, stage: '実戦', saw: `正しい操作でエラーの案内が出た（想定した失敗の一覧に無いレッスン）: ${outside.map((e) => `${e.line} → ${e.guide}`).join(' ／ ')}` });
        }
        fresh.set(id, [...(fresh.get(id) ?? []), rec].sort((a, b) => a.variant - b.variant));
        console.log(`${rec.ok ? '合格' : '不合格'} ${id} #${String(n)} ${v.name}${rec.ok ? '' : ` [${rec.stage}] ${rec.saw.slice(0, 300)}`}`);
      }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
  } finally {
    await browser.close();
    await close();
  }
  console.log(`（${String(Math.round((Date.now() - t0) / 1000))} 秒）`);
  for (const [id, recs] of fresh) previous.set(id, recs);
  const bad = writeTable(previous);
  process.exitCode = bad > 0 ? 1 : 0;
}

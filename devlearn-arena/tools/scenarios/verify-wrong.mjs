#!/usr/bin/env node
// 全レッスンで、わざと間違えた時の道を、人と同じ道で通す（VERIFY-FREE.txt【2】）。
//
//   node tools/scenarios/verify-wrong.mjs                 全て
//   node tools/scenarios/verify-wrong.mjs linux k8s.b.01  分野か ID で絞る（前の結果の該当する行だけを置き換える）
//   node tools/scenarios/verify-wrong.mjs --table         前に流した結果（shots/verify-wrong/results.json）から表だけを作り直す
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-wrong.mjs
//   VERIFY_JOBS=3                                        同時に通す数（既定 3）
//
// tools/scenarios/verify-lesson.mjs と同じ道（新しい記録・ヒントは開かず、実戦は別解の 1 つ目）を通る。違いは 3 つ。
//   理解: 1 問（図を押す形でない最初の問い）をわざと誤る → 何が違うのかが出る → 正しく答え直すと進める
//   クイズ: 1 問目をわざと誤る → 何が違うのかが出る → 正しく答え直すと進める。XP はその問題だけ 2（ほかは 5）
//   実戦: 別解の wrong の手順で、wrong の操作をする → エラーの案内に原因候補が出る → 案内を出したままヒントを開ける →
//         閉じて正しく打ち直すと達成になる。ヒントを開いたので、実戦の XP はヒントありの半分
// 誤った時に出た文は、そのまま results.json と表に残す（読んで、次に何をすればよいか分かるかを見る）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allLessonIds, DESIGNED_FAILURES, openCity, siteRoot, variantsFile, verifyLesson } from './verify-lesson.mjs';

const DIR = 'shots/verify-wrong';
const RESULTS = `${DIR}/results.json`;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 表の 1 行。誤った時に出た文を、そのまま並べる */
function rowOf(id, r) {
  if (!r) return `| ${id} | 未 | | | | |`;
  const u = r.wrong?.understand;
  const q = r.wrong?.quiz;
  const p = r.wrong?.practice;
  // 知らせの文（ほかの文の中に含まれる文は、重ねて書かない）
  const why = (w) => w.why.filter((x) => !w.why.some((o) => o !== x && o.includes(x)));
  const said = (w) => (w ? `${w.item}: ${w.did} → 「${w.title}」${w.why.length ? ` ${why(w).map((x) => cut(x, 160)).join(' / ')}` : ''}` : '');
  const card = p?.card
    ? `${p.why}: \`${cut(p.input.join(' ; '), 80)}\` → [${p.card.guide}] 何と言われたか: ${cut(p.card.meaning, 140)} ／ 考えられる理由: ${p.card.causes.map((c) => cut(c, 90)).join(' / ')} ／ 次に確かめること: ${cut(p.card.next, 140)}${p.hint ? ` ／ ヒント 1: ${cut(p.hint.replace(/^ヒント\s*1\s*/, ''), 120)}` : ''}`
    : p ? `${p.why}: 案内が出ない` : '';
  const result = r.ok ? '合格' : `不合格 [${r.stage}] ${cut(r.saw, 300)}`;
  return `| ${id} | ${cell(result)} | ${cell(said(u))} | ${cell(said(q))} | ${cell(card)} | ${r.ok || !r.shot ? '' : `\`${r.shot}\``} |`;
}

function writeTable(all) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify(Object.fromEntries(all), null, 2)}\n`);
  const ids = allLessonIds();
  writeFileSync(`${DIR}/table.md`, ['| レッスン | 結果 | 理解（誤った時） | クイズ（誤った時） | 実戦（間違えた時の案内） | 画像 |', '|---|---|---|---|---|---|', ...ids.map((id) => rowOf(id, all.get(id))), ''].join('\n'));
  const done = ids.filter((id) => all.get(id));
  const bad = done.filter((id) => !all.get(id).ok);
  console.log(`\n${String(done.length)} 本中 合格 ${String(done.length - bad.length)}・不合格 ${String(bad.length)}`);
  return bad.length;
}

const args = process.argv.slice(2);
const previous = new Map(Object.entries(existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {}));
if (args.includes('--table')) {
  writeTable(previous);
} else {
  const { chromium } = await import('playwright');
  const ids = allLessonIds().filter((id) => args.length === 0 || args.some((w) => id === w || id.startsWith(`${w}.`)));
  const jobs = Number(process.env.VERIFY_JOBS ?? 3);
  const { root, close } = await siteRoot();
  const browser = await chromium.launch();
  const t0 = Date.now();
  const fresh = new Map();
  try {
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const file = variantsFile(id);
        let rec;
        if (!file?.wrong) {
          rec = { id, ok: false, stage: '台本', saw: '間違える操作（wrong）が無い', shot: null };
        } else {
          const first = file.variants[0];
          const opened = await openCity(browser, root).catch(() => null);
          if (!opened) {
            rec = { id, ok: false, stage: '都市', saw: '都市の画面が開けない', shot: null };
          } else {
            rec = await verifyLesson(opened.page, id, { inputs: (step) => first.steps[step.id] ?? [], wrong: { practice: file.wrong }, shotDir: DIR, shotName: id });
            await opened.context.close();
          }
          // 正しく打ち直した後に、想定した失敗の一覧に無いレッスンで想定エラーの案内が出たら不合格（verify-free.mjs と同じ）
          const outside = (rec.designed ?? []).filter(() => !DESIGNED_FAILURES.has(id));
          if (rec.ok && outside.length > 0) Object.assign(rec, { ok: false, stage: '実戦', saw: `打ち直した正しい操作でエラーの案内が出た: ${outside.map((e) => `${e.line} → ${e.guide}`).join(' ／ ')}` });
        }
        fresh.set(id, rec);
        console.log(`${rec.ok ? '合格' : '不合格'} ${id}${rec.ok ? '' : ` [${rec.stage}] ${String(rec.saw).slice(0, 300)}`}`);
      }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
  } finally {
    await browser.close();
    await close();
  }
  console.log(`（${String(Math.round((Date.now() - t0) / 1000))} 秒）`);
  for (const [id, rec] of fresh) previous.set(id, rec);
  const bad = writeTable(previous);
  process.exitCode = bad > 0 ? 1 : 0;
}

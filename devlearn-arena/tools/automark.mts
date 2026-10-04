// 書いたレッスンの本文で、用語集の語が初めて出る所に {{term:ID}} を付け、terms に足す（書き起こしの手伝い。docs/content-spec.md 5 章）。
//
//   npx vite-node tools/automark.mts content/lessons/linux/linux.b.01.json [...]
//
// 検証（src/content/validate.ts）と同じ順（画面に出る順）・同じ語の当て方で探す。大文字の英字の語（用語集に無い物）は直さず、知らせるだけ。
import { readFileSync, writeFileSync } from 'node:fs';
import { TERMS } from '../src/content/glossary';
import { parseRich } from '../src/content/rich';

type Json = Record<string, unknown>;
const words = [...TERMS].sort((a, b) => b.word.length - a.word.length);

function pattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kana = '[ァ-ヶー]';
  const before = /^[A-Za-z0-9]/.test(word) ? '(?<![A-Za-z0-9])' : /^[ァ-ヶー]/.test(word) ? `(?<!${kana})` : '';
  const after = /[A-Za-z0-9]$/.test(word) ? '(?![A-Za-z0-9])' : /[ァ-ヶー]$/.test(word) ? `(?!${kana})` : '';
  return new RegExp(`${before}${escaped}${after}`);
}

for (const file of process.argv.slice(2)) {
  const lesson = JSON.parse(readFileSync(file, 'utf8')) as Json;
  const seen = new Set<string>();
  const added: string[] = [];
  const warnings: string[] = [];

  /** 1 つの本文を直して返す。wrap なら、用語集に無い大文字の英字の語（続く小文字の語も）を `` で囲む */
  const fix = (text: string | undefined, wrap = true): string | undefined => {
    if (text === undefined) return text;
    let out = '';
    for (const part of parseRich(text)) {
      if (part.kind === 'term') {
        seen.add(part.id);
        out += `{{term:${part.id}}}`;
        continue;
      }
      if (part.kind === 'code') {
        out += `\`${part.text}\``;
        continue;
      }
      // 長い語から探す。見つけた語は、同じ所を別の語として数えないよう伏せる
      let masked = part.text;
      const marks: { at: number; len: number; id: string }[] = [];
      for (const t of words) {
        const re = new RegExp(pattern(t.word).source, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(masked)) !== null) {
          const at = m.index;
          if (!seen.has(t.id)) {
            marks.push({ at, len: t.word.length, id: t.id });
            seen.add(t.id);
            if (!added.includes(t.id)) added.push(t.id);
          }
          masked = masked.slice(0, at) + '\u0000'.repeat(t.word.length) + masked.slice(at + t.word.length);
        }
      }
      const edits: { at: number; len: number; put: (x: string) => string }[] = marks.map((mk) => ({ at: mk.at, len: mk.len, put: () => `{{term:${mk.id}}}` }));
      for (const w of masked.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[./-][A-Za-z0-9]+)*(?: [a-z][a-z0-9]*(?![./\w]))*/g)) {
        if (wrap) edits.push({ at: w.index, len: w[0].length, put: (x) => `\`${x}\`` });
        else warnings.push(w[0]);
      }
      let piece = part.text;
      for (const ed of edits.sort((a, b) => b.at - a.at)) piece = `${piece.slice(0, ed.at)}${ed.put(piece.slice(ed.at, ed.at + ed.len))}${piece.slice(ed.at + ed.len)}`;
      out += piece;
    }
    return out;
  };

  const e = lesson.explain as Json;
  // 解説にはコマンド（``）を書けないので、大文字の語は直さず知らせる
  for (const k of ['what', 'why', 'use', 'when', 'situation']) if (typeof e[k] === 'string') e[k] = fix(e[k] as string, false);
  for (const u of lesson.understand as Json[]) {
    u.prompt = fix(u.prompt as string);
    if (u.kind === 'situation') for (const c of u.choices as Json[]) { c.text = fix(c.text as string); if (c.whyNot !== undefined) c.whyNot = fix(c.whyNot as string); }
    if (u.kind === 'order') u.items = (u.items as string[]).map((x) => fix(x));
    if (u.kind === 'match') u.pairs = (u.pairs as string[][]).map(([a, b]) => [fix(a), fix(b)]);
    if (u.kind === 'relation') { u.a = fix(u.a as string); u.b = fix(u.b as string); u.why = fix(u.why as string); }
    if (u.kind === 'yesno') u.why = fix(u.why as string);
  }
  for (const q of lesson.quiz as Json[]) {
    q.prompt = fix(q.prompt as string);
    for (const c of (q.choices as Json[] | undefined) ?? []) { c.text = fix(c.text as string); if (c.whyNot !== undefined) c.whyNot = fix(c.whyNot as string); }
    if (q.order) q.order = (q.order as string[]).map((x) => fix(x));
    q.explanation = fix(q.explanation as string);
  }
  const p = lesson.practice as Json;
  p.purpose = fix(p.purpose as string);
  for (const s of p.steps as Json[]) {
    s.purpose = fix(s.purpose as string);
    // 最後のヒントの `` は打つ物（答え）なので、大文字の語は直さず知らせる
    s.hints = (s.hints as string[]).map((h, i) => fix(h, i < 2));
    s.afterward = fix(s.afterward as string);
  }
  const r = lesson.result as Json;
  for (const k of ['success', 'partial', 'retry']) r[k] = fix(r[k] as string);
  const sm = lesson.summary as Json;
  sm.points = (sm.points as string[]).map((x) => fix(x));

  const terms = lesson.terms as string[];
  for (const id of seen) if (!terms.includes(id)) terms.push(id);
  writeFileSync(file, `${JSON.stringify(lesson, null, 2)}\n`);
  console.log(file, '足した印:', added.join(' ') || 'なし', warnings.length ? `／ 大文字の語: ${[...new Set(warnings)].join(' ')}` : '');
}

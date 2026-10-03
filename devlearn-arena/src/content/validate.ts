import { isEnvironmentId, resolveSetup } from '@/engines/environments';
import { replayAnswers } from '@/learning/practice';
import { parseRich, termsIn } from './rich';
import type { CatalogEntry, ErrorGuide, Lesson, Mission, Practice, Term } from './schema';

/**
 * コンテンツの検証（docs/content-spec.md 6 章）。純粋な関数で、見つけた問題を文で返す（無ければ空）。
 * 形（zod）を通った後の、中身の規則を確かめる。テスト（validate.test.ts）とビルド（scripts/validate-content.mts）が使う。
 */

export interface ValidateContext {
  catalog: ReadonlyMap<string, CatalogEntry>;
  terms: ReadonlyMap<string, Term>;
  errors: ReadonlySet<string>;
  /** エラーの解説（答えの途中で出てよい想定エラーを見分ける） */
  guides?: readonly ErrorGuide[];
  /** 図の ID → SVG の文字列 */
  figures: ReadonlyMap<string, string>;
  /** docs/lessons/ の設計の見出しにある ID */
  designs: ReadonlySet<string>;
}

/** 本文を、画面に出る順に並べる（用語の初出を確かめるため） */
export function richInOrder(l: Lesson): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined): void => {
    if (text !== undefined) out.push({ where, text });
  };
  const e = l.explain;
  add('解説.何か', e.what);
  add('解説.なぜ', e.why);
  add('解説.何に', e.use);
  add('解説.どんな場面で', e.when);
  add('解説.状況説明', e.situation);
  l.understand.forEach((u, i) => {
    const w = `理解${String(i + 1)}`;
    add(w, u.prompt);
    const texts: (string | undefined)[] =
      u.kind === 'situation' ? u.choices.flatMap((c) => [c.text, c.whyNot])
        : u.kind === 'order' ? u.items
          : u.kind === 'match' ? u.pairs.flat()
            : u.kind === 'relation' ? [u.a, u.b, u.why]
              : u.kind === 'yesno' ? [u.why]
                : [];
    for (const t of texts) add(w, t);
  });
  for (const q of l.quiz) {
    const w = `クイズ ${q.id}`;
    add(w, q.prompt);
    for (const c of q.choices ?? []) {
      add(w, c.text);
      add(w, c.whyNot);
    }
    q.order?.forEach((t) => add(w, t));
    add(w, q.explanation);
  }
  add('実戦.目的', l.practice.purpose);
  for (const s of l.practice.steps) {
    const w = `実戦 ${s.id}`;
    add(w, s.purpose);
    s.hints.forEach((h) => add(w, h));
    add(w, s.afterward);
  }
  add('結果', l.result.success);
  add('結果', l.result.partial);
  add('結果', l.result.retry);
  for (const point of l.summary.points) add('まとめ', point);
  return out;
}

const KIND_FAMILY: Record<string, string> = { choice: 'choice', multi: 'choice' };
const CHOICE_KINDS = new Set(['choice', 'multi', 'situation', 'cause', 'predict', 'term']);
/** 大文字で始まる英字の語（製品名・略語）。本文に出すなら用語集に載せる */
const UPPER_WORD = /\b[A-Z][A-Za-z0-9]*(?:[./-][A-Za-z0-9]+)*\b/g;
const SCREEN_LIMIT = 200;

export function validateLesson(l: Lesson, ctx: ValidateContext): string[] {
  const p: string[] = [];
  const entry = ctx.catalog.get(l.id);

  // 目録・設計・置き場所との一致
  if (!entry) p.push('目録（docs/curriculum.md）に無い ID');
  else {
    for (const k of ['domain', 'level', 'theme', 'title', 'goal'] as const) if (l[k] !== entry[k]) p.push(`${k} が目録と違う（${String(l[k])} / ${entry[k]}）`);
    for (const k of ['prerequisites', 'related', 'next'] as const) if (JSON.stringify(l[k]) !== JSON.stringify(entry[k])) p.push(`${k} が目録と違う`);
    if (!entry.practice.includes(l.practice.mode)) p.push(`実戦の形 ${l.practice.mode} が目録（${entry.practice.join('・')}）と違う`);
  }
  if (!ctx.designs.has(l.id)) p.push('docs/lessons/ に設計が無い');
  for (const id of [...l.prerequisites, ...l.related, ...l.next, ...l.summary.next]) if (!ctx.catalog.has(id)) p.push(`存在しないレッスン ${id}`);

  // 7 段（形の数は zod。ここは種類と選択肢）
  const kinds = new Set(l.quiz.map((q) => KIND_FAMILY[q.kind] ?? q.kind));
  if (kinds.size < 3) p.push(`クイズの種類が ${String(kinds.size)} つ（3 つ以上）`);
  if (new Set(l.quiz.map((q) => q.id)).size !== l.quiz.length) p.push('クイズの ID が重なる');
  for (const q of l.quiz) {
    if (CHOICE_KINDS.has(q.kind)) {
      const choices = q.choices ?? [];
      if (choices.length < 2) p.push(`クイズ ${q.id}: 選択肢が 2 つ未満`);
      const correct = choices.filter((c) => c.correct).length;
      if (q.kind === 'multi' ? correct < 1 : correct !== 1) p.push(`クイズ ${q.id}: 正答の数が ${String(correct)}`);
      for (const c of choices) if (!c.correct && !c.whyNot) p.push(`クイズ ${q.id}: 誤答 ${c.id} に whyNot が無い`);
    }
    if (q.kind === 'order' && (q.order?.length ?? 0) < 2) p.push(`クイズ ${q.id}: 並べる物が 2 つ未満`);
  }
  for (const [i, u] of l.understand.entries()) {
    if (u.kind === 'situation') for (const c of u.choices) if (!c.correct && !c.whyNot) p.push(`理解${String(i + 1)}: 誤答 ${c.id} に whyNot が無い`);
    if (u.kind === 'figure-pick') {
      const svg = ctx.figures.get(u.figure);
      if (!svg) p.push(`理解${String(i + 1)}: 図 ${u.figure} が無い`);
      else for (const a of u.answer) if (!svg.includes(`data-part="${a}"`)) p.push(`理解${String(i + 1)}: 図 ${u.figure} に部分 ${a} が無い`);
    }
  }
  for (const f of l.explain.figures) if (!ctx.figures.has(f)) p.push(`図 ${f} が無い（content/figures/${f}.svg）`);

  // 解説の前にコマンドを出さない。1 画面 200 字以内
  for (const [k, text] of Object.entries(l.explain)) {
    if (typeof text !== 'string') continue;
    if (parseRich(text).some((x) => x.kind === 'code')) p.push(`解説.${k}: コマンドを書いている（解説の前にコマンドを出さない）`);
    const shown = parseRich(text).map((x) => (x.kind === 'term' ? (ctx.terms.get(x.id)?.word ?? x.id) : x.text)).join('');
    if (shown.length > SCREEN_LIMIT) p.push(`解説.${k}: ${String(shown.length)} 字（1 画面 200 字以内）`);
  }

  // 実戦
  p.push(...practiceProblems(l.practice, ctx));

  // 用語: 印は用語集にあり、レッスンの terms に載せる。用語集の語は初出で印を付ける。大文字の英字の語は用語集に載せる
  const rich = richInOrder(l);
  const marked = new Set(rich.flatMap((r) => termsIn(r.text)));
  for (const id of [...marked, ...l.terms, ...l.summary.terms]) if (!ctx.terms.has(id)) p.push(`用語集に無い用語 ${id}`);
  for (const id of marked) if (!l.terms.includes(id)) p.push(`本文の用語 ${id} が terms に無い`);
  p.push(...firstUseProblems(rich, ctx.terms));
  return p;
}

/** 実戦の規則: 想定エラーの解説がある・手順の ID が重ならない・模擬環境と初期状態が正しい・最後のヒントで通る */
function practiceProblems(practice: Practice, ctx: Pick<ValidateContext, 'errors' | 'guides'>): string[] {
  const p: string[] = [];
  for (const s of practice.steps) for (const e of s.expectedErrors ?? []) if (!ctx.errors.has(e)) p.push(`実戦 ${s.id}: エラーの解説 ${e} が無い（content/errors）`);
  if (new Set(practice.steps.map((s) => s.id)).size !== practice.steps.length) p.push('実戦の手順の ID が重なる');
  if (!isEnvironmentId(practice.environment)) p.push(`実戦: 模擬環境 ${practice.environment} が無い（src/engines/environments.ts）`);
  else {
    try {
      resolveSetup(practice.environment, practice.setup);
      // 全実戦の最後のヒントを模擬環境で実行すると、達成条件を満たす
      p.push(...replayAnswers(practice, ctx.guides));
    } catch (e) {
      p.push(`実戦: 初期状態（setup）の形が違う: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return p;
}

/** ミッションの本文を、画面に出る順に並べる */
export function missionRichInOrder(m: Mission): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [{ where: '都市の課題', text: m.story }];
  m.knowledge.forEach((k, i) => out.push({ where: `必要な知識${String(i + 1)}`, text: k }));
  out.push({ where: '実戦.目的', text: m.practice.purpose });
  for (const s of m.practice.steps) {
    const w = `実戦 ${s.id}`;
    out.push({ where: w, text: s.purpose });
    s.hints.forEach((h) => out.push({ where: w, text: h }));
    out.push({ where: w, text: s.afterward });
  }
  return out;
}

export interface MissionContext extends Pick<ValidateContext, 'catalog' | 'terms' | 'errors' | 'guides'> {
  /** 記念碑の ID（content/facilities.json の landmarks） */
  landmarks: ReadonlySet<string>;
}

/**
 * ミッションの規則（docs/content-spec.md 4・6 章、docs/game-design.md 8 章）:
 * 複数の分野が重ならない・おすすめのレッスンが目録にある・用語の規則・実戦の規則・報酬の XP は 100〜400・記念碑がある
 */
export function validateMission(m: Mission, ctx: MissionContext): string[] {
  const p: string[] = [];
  if (new Set(m.domains).size !== m.domains.length) p.push('関係する分野が重なる');
  for (const id of m.recommended) if (!ctx.catalog.has(id)) p.push(`おすすめのレッスン ${id} が目録に無い`);
  if (m.rewards.xp < 100 || m.rewards.xp > 400) p.push(`報酬の XP ${String(m.rewards.xp)} が 100〜400 の外`);
  if (m.rewards.funds <= 0) p.push('報酬の開発資金が無い');
  if (m.rewards.landmark !== undefined && !ctx.landmarks.has(m.rewards.landmark)) p.push(`記念碑 ${m.rewards.landmark} が無い（content/facilities.json の landmarks）`);
  p.push(...practiceProblems(m.practice, ctx));
  const rich = missionRichInOrder(m);
  for (const id of new Set(rich.flatMap((r) => termsIn(r.text)))) if (!ctx.terms.has(id)) p.push(`用語集に無い用語 ${id}`);
  p.push(...firstUseProblems(rich, ctx.terms));
  return p;
}

/** 用語集の語が、印より先に印無しで出ていないか。印の無い大文字の英字の語が無いか */
function firstUseProblems(rich: { where: string; text: string }[], terms: ReadonlyMap<string, Term>): string[] {
  const p: string[] = [];
  const seen = new Set<string>();
  const words = [...terms.values()].sort((a, b) => b.word.length - a.word.length);
  for (const r of rich) {
    for (const part of parseRich(r.text)) {
      if (part.kind === 'term') {
        seen.add(part.id);
        continue;
      }
      if (part.kind !== 'text') continue;
      // 長い語から探し、見つけた語は消す（「絶対パス」の中の「パス」を別に数えない）
      let text = part.text;
      for (const t of words) {
        const re = wordPattern(t.word);
        if (!re.test(text)) continue;
        if (!seen.has(t.id)) {
          p.push(`${r.where}: 用語「${t.word}」が初めて出る所に印（{{term:${t.id}}}）が無い`);
          seen.add(t.id);
        }
        text = text.replace(re, ' ');
      }
      for (const m of text.matchAll(UPPER_WORD)) p.push(`${r.where}: 「${m[0]}」は用語集に無い（用語集に載せるか、\`\` で囲む）`);
    }
  }
  return p;
}

/** 語を探す形。英字の語（ls・cd）は、ほかの英字の語の一部に当てない */
function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 片仮名で始まる・終わる語（ログ）は、ほかの片仮名の語の一部（プログラム）に当てない
  const kana = '[ァ-ヶー]';
  const before = /^[A-Za-z0-9]/.test(word) ? '(?<![A-Za-z0-9])' : /^[ァ-ヶー]/.test(word) ? `(?<!${kana})` : '';
  const after = /[A-Za-z0-9]$/.test(word) ? '(?![A-Za-z0-9])' : /[ァ-ヶー]$/.test(word) ? `(?!${kana})` : '';
  return new RegExp(`${before}${escaped}${after}`, 'g');
}

/** 用語集の中の規則: ID が重ならない・関連する用語とレッスンがある */
export function validateGlossary(terms: readonly Term[], catalog: ReadonlyMap<string, CatalogEntry>): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const t of terms) {
    if (ids.has(t.id)) p.push(`用語 ${t.id} が重なる`);
    ids.add(t.id);
  }
  for (const t of terms) {
    for (const r of t.related) if (!ids.has(r)) p.push(`用語 ${t.id}: 関連の ${r} が用語集に無い`);
    for (const l of t.lessons) if (!catalog.has(l)) p.push(`用語 ${t.id}: レッスン ${l} が目録に無い`);
  }
  return p;
}

/**
 * 図の決まり（docs/visual-design.md 6 章・6.1）: viewBox を持つ・30KB 以内・色は tokens の値だけ・
 * 文字は 13px 以上で決めた大きさ・要素（class="el"）は 7 つまで
 */
export function validateFigure(svg: string, allowedColors: ReadonlySet<string>, fontSizes: readonly number[]): string[] {
  const p: string[] = [];
  if (!/<svg[^>]*\bviewBox="/.test(svg)) p.push('viewBox が無い');
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > 30 * 1024) p.push(`${String(bytes)} バイト（30KB 以内）`);
  for (const m of svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!allowedColors.has(m[0].toLowerCase())) p.push(`tokens に無い色 ${m[0]}`);
  if (/\brgba?\(|\bhsla?\(/.test(svg)) p.push('色は # の形で tokens の値を書く');
  for (const m of svg.matchAll(/font-size="(\d+)"/g)) {
    const size = Number(m[1]);
    if (size < 13 || !fontSizes.includes(size)) p.push(`文字の大きさ ${String(size)}（13 以上の決めた大きさ）`);
  }
  const elements = svg.match(/class="el"/g)?.length ?? 0;
  if (elements === 0) p.push('要素（class="el"）が無い');
  if (elements > 7) p.push(`要素が ${String(elements)} つ（7 つまで）`);
  if (!/<title>[^<]+<\/title>/.test(svg)) p.push('図の説明（title）が無い');
  return p;
}

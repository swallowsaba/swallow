import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { accent, domain, hud, state } from '@/ui/tokens';
import { FONT_SIZES } from '@/ui/tokens';
import { ENTRIES, inFirstRelease } from './catalog';
import { parseDesign } from './curriculum';
import { ERROR_GUIDES, TERMS } from './glossary';
import { AUTHORED, loadAllLessons, loadLesson } from './lessons';
import { DOMAIN_IDS, type Lesson } from './schema';
import { replaySqlAnswers } from '@/learning/practice';
import { validateFigure, validateGlossary, validateLesson, type ValidateContext } from './validate';

/** docs/content-spec.md 6 章の検証を、書き起こした全てのコンテンツに掛ける */

const root = join(__dirname, '../..');
const figureDir = join(root, 'content/figures');
const figures = new Map(readdirSync(figureDir).filter((f) => f.endsWith('.svg')).map((f) => [f.replace(/\.svg$/, ''), readFileSync(join(figureDir, f), 'utf8')]));
const designs = new Set(DOMAIN_IDS.flatMap((d) => parseDesign(readFileSync(join(root, `docs/lessons/${d}.md`), 'utf8')).map((h) => h.id)));
const ctx: ValidateContext = {
  catalog: new Map(ENTRIES.map((e) => [e.id, e])),
  terms: new Map(TERMS.map((t) => [t.id, t])),
  errors: new Set(ERROR_GUIDES.map((e) => e.id)),
  guides: ERROR_GUIDES,
  figures,
  designs,
};
/** 図に使ってよい色: tokens の値と、操作盤の地の色（不透明にした紺） */
const navy = '#0a1424';
const COLORS = new Set([...Object.values(hud), ...Object.values(accent), ...Object.values(state), ...Object.values(domain), navy].filter((c) => c.startsWith('#')).map((c) => c.toLowerCase()));

/** 書き終えた分野（docs/development-plan.md Phase 10 の順に足す） */
const DONE_DOMAINS = ['found', 'linux', 'net', 'web', 'git', 'trouble', 'sec', 'db', 'cicd', 'ctr', 'docker'] as const;

let lessons: Lesson[] = [];
beforeAll(async () => {
  lessons = await loadAllLessons();
});

describe('書き起こしたコンテンツの検証（docs/content-spec.md 6 章）', () => {
  it('書き起こした全てのレッスンが読み込め、形（zod）を通る', () => {
    expect(lessons.map((l) => l.id).sort()).toEqual([...AUTHORED].sort());
  });

  it('書き終えた分野は、初回公開の範囲（docs/decisions.md Q-04）のレッスンが全て揃う', () => {
    for (const d of DONE_DOMAINS) {
      const missing = ENTRIES.filter((e) => e.domain === d && inFirstRelease(e) && !AUTHORED.has(e.id)).map((e) => e.id);
      expect(missing, d).toEqual([]);
    }
  });

  it('全レッスンが、目録・設計・置き場所と一致し、7 段の規則と用語の規則を満たす', () => {
    for (const l of lessons) expect(validateLesson(l, ctx), l.id).toEqual([]);
  });

  it('ブラウザ内 SQL の実戦は、最後のヒントの SQL を順に実行すると全ての手順を満たす', async () => {
    for (const l of lessons.filter((x) => x.practice.mode === 'sql')) expect(await replaySqlAnswers(l.practice, ERROR_GUIDES), l.id).toEqual([]);
  });

  it('用語集: ID が重ならず、関連する用語とレッスンがある', () => {
    expect(TERMS.length).toBeGreaterThan(0);
    expect(validateGlossary(TERMS, ctx.catalog)).toEqual([]);
  });

  it('エラーの解説: 原因候補は 2〜3 個。本文の用語は用語集にある', () => {
    for (const e of ERROR_GUIDES) {
      expect(e.causes.length).toBeGreaterThanOrEqual(2);
      for (const t of e.terms ?? []) expect(ctx.terms.has(t), `${e.id} → ${t}`).toBe(true);
    }
  });

  it('図: viewBox・30KB 以内・tokens の色・13px 以上の決めた文字・要素 7 つまで', () => {
    expect(figures.size).toBeGreaterThan(0);
    for (const [id, svg] of figures) expect(validateFigure(svg, COLORS, FONT_SIZES), id).toEqual([]);
  });

  it('ID の違うファイルは読み込みで落ちる。書き起こしていないレッスンは null', async () => {
    expect(await loadLesson('net.a.01')).toBeNull();
    expect(await loadLesson('found.b.04')).toMatchObject({ id: 'found.b.04', domain: 'found' });
  });
});

describe('検証が誤りを見つける', () => {
  const base = (): Lesson => structuredClone(lessons.find((l) => l.id === 'found.b.04') as Lesson);
  const problems = (edit: (l: Lesson) => void): string[] => {
    const l = base();
    edit(l);
    return validateLesson(l, ctx);
  };

  it('誤答に whyNot が無い', () => {
    expect(problems((l) => delete l.quiz[0]?.choices?.[1]?.whyNot).join()).toContain('whyNot が無い');
  });

  it('クイズの種類が 3 つ未満', () => {
    expect(problems((l) => l.quiz.forEach((q) => (q.kind = 'choice'))).join()).toContain('クイズの種類');
  });

  it('解説にコマンドを書いた', () => {
    expect(problems((l) => (l.explain.use += '例えば `cd /srv` と打つ。')).join()).toContain('コマンドを書いている');
  });

  it('用語集の語を、初めて出る所で印を付けずに書いた', () => {
    expect(problems((l) => (l.explain.what = `ディレクトリの話。${l.explain.what}`)).join()).toContain('用語「ディレクトリ」が初めて出る所に印');
  });

  it('用語集に無い用語や、用語集に無い略語を書いた', () => {
    expect(problems((l) => (l.explain.why += '{{term:no-such-term}}')).join()).toContain('用語集に無い用語 no-such-term');
    expect(problems((l) => (l.explain.why += 'CPU と NIC がある。')).join()).toContain('「NIC」は用語集に無い');
  });

  it('前提が目録と違う・存在しないレッスン・無い図・無いエラーの解説', () => {
    expect(problems((l) => (l.prerequisites = ['found.b.02'])).join()).toContain('prerequisites が目録と違う');
    expect(problems((l) => (l.summary.next = ['found.b.99'])).join()).toContain('存在しないレッスン found.b.99');
    expect(problems((l) => (l.explain.figures = ['no-figure'])).join()).toContain('図 no-figure が無い');
    expect(problems((l) => (l.practice.steps[0] as { expectedErrors?: string[] }).expectedErrors = ['no-error']).join()).toContain('エラーの解説 no-error が無い');
  });

  it('実戦: 無い模擬環境・形の違う初期状態・最後のヒントで通らない', () => {
    expect(problems((l) => (l.practice.environment = 'no-env')).join()).toContain('模擬環境 no-env が無い');
    expect(problems((l) => (l.practice.setup = { cwd: 'relative' })).join()).toContain('初期状態（setup）の形が違う');
    expect(problems((l) => {
      const s = l.practice.steps[0];
      if (s) s.hints = [s.hints[0], s.hints[1], '`cd /srv` と打つ。'];
    }).join()).toContain('最後のヒントを打っても達成条件を満たさない');
  });

  it('図: tokens に無い色・小さな文字・要素が多すぎる', () => {
    const svg = '<svg viewBox="0 0 10 10"><title>t</title>' + '<g class="el"><text font-size="11" fill="#123456">x</text></g>'.repeat(8) + '</svg>';
    const p = validateFigure(svg, COLORS, FONT_SIZES).join();
    expect(p).toContain('tokens に無い色 #123456');
    expect(p).toContain('文字の大きさ 11');
    expect(p).toContain('要素が 8 つ');
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_SIZES } from './tokens';

/**
 * 見た目の規則（docs/visual-design.md 2・3・7 章、docs/testing-strategy.md 2 章）。
 * 画面の部品・都市の描画に、生の色・指定外の文字の大きさ・絵文字を書かない。
 */

const SRC = join(__dirname, '..');
const show = (f: string): string => relative(SRC, f).split(sep).join('/');

function filesUnder(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, pattern));
    else if (pattern.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const CHECKED = ['ui', 'screens', 'city', 'game'].flatMap((d) => {
  try {
    return filesUnder(join(SRC, d), /\.(tsx?|css)$/);
  } catch {
    return [];
  }
});
const TOKENS = join(SRC, 'ui', 'tokens.ts');

const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('見た目の規則', () => {
  it('調べるファイルがある', () => {
    expect(CHECKED.length).toBeGreaterThan(10);
  });

  it('色は tokens からだけ引く（生の色を書かない）', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    const offenders = CHECKED.filter((f) => f !== TOKENS)
      .map((f) => ({ f, hit: raw.exec(stripComments(readFileSync(f, 'utf8')))?.[0] }))
      .filter((r) => r.hit !== undefined)
      .map((r) => `${show(r.f)}: ${r.hit ?? ''}`);
    expect(offenders).toEqual([]);
  });

  it('CSS の文字の大きさは、決めた大きさの変数だけ', () => {
    const allowed = new Set(FONT_SIZES.map((s) => `var(--fs-${String(s)})`));
    const offenders: string[] = [];
    for (const f of CHECKED.filter((x) => x.endsWith('.css'))) {
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/font-size\s*:\s*([^;]+);/g)) {
        const value = (m[1] ?? '').trim();
        if (!allowed.has(value)) offenders.push(`${show(f)}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('部品の中で文字の大きさを数で書かない（fontSize に決めた大きさ以外を使わない）', () => {
    const allowed = new Set<number>(FONT_SIZES);
    const offenders: string[] = [];
    for (const f of CHECKED.filter((x) => x.endsWith('.tsx') || x.endsWith('.ts'))) {
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/fontSize\s*[:=]\s*['"{]?\s*(\d+)/g)) {
        if (!allowed.has(Number(m[1]))) offenders.push(`${show(f)}: ${m[0]}`);
      }
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(\d+)px\s+["']?(?:M PLUS|Noto|Barlow|JetBrains)/g)) {
        if (!allowed.has(Number(m[1]))) offenders.push(`${show(f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('同じ名前の部品の形（.名前 { … }）を、2 つの CSS で定義しない（別の画面の部品の見た目を壊さないため）', () => {
    const owner = new Map<string, string>();
    const offenders: string[] = [];
    for (const f of CHECKED.filter((x) => x.endsWith('.css'))) {
      const css = stripComments(readFileSync(f, 'utf8'));
      // 1 つの名前だけの選択子（「.window {」や「.window, .x {」）。修飾（.a.is-b・.a:hover・.a b）は数えない
      for (const m of css.matchAll(/(?:^|[},]\s*)\.([a-z][a-z0-9-]*)\s*(?=[{,])/gm)) {
        const name = m[1] ?? '';
        const prev = owner.get(name);
        if (prev && prev !== f) offenders.push(`.${name}: ${show(prev)} と ${show(f)}`);
        else owner.set(name, f);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('絵文字を使わない', () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}|\u{200D}/u;
    const offenders = CHECKED.filter((f) => EMOJI.test(readFileSync(f, 'utf8'))).map(show);
    expect(offenders).toEqual([]);
  });

  it('フォントは指定の 4 つを同梱して読み込む（外部の配信に頼らない）', () => {
    const fonts = readFileSync(join(SRC, 'ui', 'fonts.ts'), 'utf8');
    for (const pkg of ['m-plus-1', 'noto-sans-jp', 'barlow-condensed', 'jetbrains-mono']) expect(fonts).toContain(`@fontsource/${pkg}/`);
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});

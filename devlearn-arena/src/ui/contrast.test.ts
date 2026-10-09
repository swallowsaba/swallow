import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, over } from './contrast';
import { accent, city, cssVariables, hud, rgbaOf, state } from './tokens';

/**
 * 見やすさの自動検査: 文字と地の明るさの差（docs/acceptance-criteria.md U5: 4.5:1 以上）。
 * HUD の地は半透明なので、下の都市の一番明るい色（白線）と一番暗い色（地盤の側面）の両方に重ねて測る。
 * 文字でない印（アイコン・縁・線）は 3:1 以上（WCAG 2 の 1.4.11）。
 */
const UNDER = { 明るい都市: city.lineWhite, 暗い都市: city.groundSide };
const GROUNDS = Object.entries(UNDER).flatMap(([where, u]) => [
  [`操作盤の地（${where}）`, over(hud.bg, u)],
  [`窓の地（${where}）`, over(hud.bgStrong, u)],
] as const);
const worst = (fg: string): number => Math.min(...GROUNDS.map(([, bg]) => contrast(fg, bg)));

const SRC = join(__dirname, '..');
function cssUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssUnder(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

/** CSS の規則のうち、文字の色を変数で決めている物（選択子・変数の名前） */
function textColors(): { where: string; selector: string; name: string }[] {
  const out: { where: string; selector: string; name: string }[] = [];
  for (const file of [...cssUnder(join(SRC, 'ui')), ...cssUnder(join(SRC, 'screens'))]) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const decl of (rule[2] ?? '').matchAll(/(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/g)) {
        out.push({ where: relative(SRC, file).split(sep).join('/'), selector: (rule[1] ?? '').trim(), name: decl[1] ?? '' });
      }
    }
  }
  return out;
}

/** 文字でなく、アイコン（線の SVG）だけに色を付ける選択子 */
const ICON_ONLY = /(^|[\s>,])svg\b|-mark\b/;

describe('文字と地の明るさの差', () => {
  it('HUD の文字の色（本文・補足・金・明るい金・成功・情報）は、どの地でも 4.5:1 以上', () => {
    const texts = { 本文: hud.text, 補足: hud.textSub, 金: accent.gold, 明るい金: accent.goldLight, 成功: state.ok, 情報: state.info };
    const low = Object.entries(texts).filter(([, fg]) => worst(fg) < 4.5).map(([n, fg]) => `${n}: ${worst(fg).toFixed(2)}`);
    expect(low).toEqual([]);
  });

  it('画面の CSS で文字に使う色は、どの地でも 4.5:1 以上（紺は金の地の上だけで使う）', () => {
    const vars = cssVariables();
    const found = textColors();
    expect(found.length).toBeGreaterThan(100);
    const low = found
      .filter((t) => t.name !== 'navy' && !ICON_ONLY.test(t.selector))
      .filter((t) => {
        const c = vars[`--${t.name}`];
        return c === undefined || worst(c) < 4.5;
      })
      .map((t) => `${t.where} ${t.selector} → --${t.name}`);
    expect(low).toEqual([]);
  });

  it('エラー・注意の色はアイコンと縁の印に使い、どの地でも 3:1 以上', () => {
    for (const c of [state.bad, state.warn]) expect(worst(c)).toBeGreaterThanOrEqual(3);
  });

  it('金のボタンの紺の文字は 4.5:1 以上', () => {
    const navy = rgbaOf(hud.bg, 1);
    for (const gold of [accent.gold, accent.goldLight]) expect(contrast(navy, gold)).toBeGreaterThanOrEqual(4.5);
  });

  it('危ない操作の赤いボタンの文字は 4.5:1 以上', () => {
    expect(contrast(rgbaOf(hud.bg, 1), state.bad)).toBeGreaterThanOrEqual(4.5);
  });
});

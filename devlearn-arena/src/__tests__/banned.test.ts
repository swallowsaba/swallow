import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 禁じたことを機械で押さえる。
 *
 * 1. 芝居がかった台詞と感嘆符を、ソースのどこにも置かない
 * 2. 人物に顔を描かない（顔の部品の名前を .tsx に置かない）
 *
 * 言いつけを人の目で守るのはやめ、ここで落とす。
 */

const SRC = join(__dirname, '..');

/**
 * 使わない文言。そのまま書くとこのテスト自身が引っ掛かるので符号位置で組み立てる。
 * reading はどの語なのかを読む人に伝えるためのもの。
 */
const BANNED: readonly { text: string; reading: string }[] = [
  { text: String.fromCodePoint(0x56f0, 0x3063, 0x305f), reading: 'komatta' },
  { text: String.fromCodePoint(0x306a, 0x3093, 0x3068, 0x304b, 0x3057, 0x3066), reading: 'nantokashite' },
  { text: String.fromCodePoint(0xff01), reading: 'zenkaku exclamation mark' },
  { text: String.fromCodePoint(0x21, 0x300d), reading: 'hankaku exclamation mark before a closing quote' },
  { text: String.fromCodePoint(0x52a9, 0x3051, 0x3066), reading: 'tasukete' },
  { text: String.fromCodePoint(0x5927, 0x5909, 0x3060), reading: 'taihenda' },
];

/** 顔の部品。変数名・SVG の id・className のどれに出てきても落とす */
const FACE_PARTS: readonly string[] = [
  'eye', 'eyes',
  'mouth', 'mouths',
  'brow', 'brows', 'eyebrow', 'eyebrows',
  'face', 'faces',
  'nose', 'noses',
];

function sourcesUnder(dir: string, suffixes: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path, suffixes));
    else if (suffixes.some((suffix) => name.endsWith(suffix))) out.push(path);
  }
  return out;
}

const show = (file: string): string => relative(SRC, file).split(sep).join('/');

/**
 * 語に割る。`MoodFace` `mood-face` `mood_face` はどれも mood と face になる。
 * `interface` や `surface` は 1 語のままなので、顔の部品とは見なされない。
 */
export function wordsIn(text: string): string[] {
  const out: string[] = [];
  for (const token of text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
    for (const word of token.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      out.push(word.toLowerCase());
    }
  }
  return out;
}

describe('禁じたことを機械で押さえる', () => {
  const sources = sourcesUnder(SRC, ['.ts', '.tsx']);
  const views = sourcesUnder(SRC, ['.tsx']);

  it('調べる先が見つかる', () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(views.length).toBeGreaterThan(5);
  });

  it.each(BANNED.map((banned) => [banned.reading, banned.text]))(
    '%s を使っていない',
    (_reading, text) => {
      const hits = sources.flatMap((file) => {
        const lines = readFileSync(file, 'utf8').split('\n');
        return lines.flatMap((line, i) => (line.includes(text) ? [`${show(file)}:${String(i + 1)}: ${line.trim()}`] : []));
      });
      expect(hits).toEqual([]);
    },
  );

  it('語に割って調べる。interface や surface は顔の部品ではない', () => {
    expect(wordsIn('MoodFace')).toEqual(['mood', 'face']);
    expect(wordsIn('interface Surface')).toEqual(['interface', 'surface']);
    expect(wordsIn('class="mood-face"')).toEqual(['class', 'mood', 'face']);
  });

  it('顔の部品を .tsx で描いていない', () => {
    const parts = new Set(FACE_PARTS);
    const hits = views.flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, i) => {
        const found = wordsIn(line).filter((word) => parts.has(word));
        return found.length === 0 ? [] : [`${show(file)}:${String(i + 1)}: ${found.join(' ')}`];
      });
    });
    expect(hits).toEqual([]);
  });
});

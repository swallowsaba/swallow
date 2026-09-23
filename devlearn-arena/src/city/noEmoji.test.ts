import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 街と図は SVG か 3D の形で描く。絵文字を絵として使わない。
 * 絵文字の符号位置（記号・絵文字の面、その他の記号、異体字セレクタ、ゼロ幅接合子）が
 * 1 文字でも入っていれば落とす。
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}|\u{200D}/u;

const SRC = join(__dirname, '..');
const ROOTS = ['city', 'city3d', 'visual'];

function tsxUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...tsxUnder(path));
    else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('絵文字を絵として使わない', () => {
  const files = ROOTS.flatMap((root) => tsxUnder(join(SRC, root)));

  it('調べる .tsx が見つかる', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(SRC, f).replace(/\\/g, '/'), f]))('%s に絵文字が無い', (_name, file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    const hits = lines.flatMap((line, i) => (EMOJI.test(line) ? [`${String(i + 1)}: ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });
});

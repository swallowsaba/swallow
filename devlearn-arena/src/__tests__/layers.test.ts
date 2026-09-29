import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 層の境界（CLAUDE.md「層の境界」）。
 *
 * `src/engines/` と `src/game/` は仕組みの模型で、React・DOM・Canvas に触れない。
 * 画面から切り離して、テストと保存だけで動かせることを守る。
 */

const SRC = join(__dirname, '..');

/** 模型の層。まだ無い層は飛ばす */
const MODEL_LAYERS = ['engines', 'game'] as const;

/** 模型から import してはいけない包み */
const BANNED_MODULES = /from\s+['"](react|react-dom|react-router-dom|three|@react-three\/[^'"]+|@xterm\/[^'"]+|framer-motion|zustand)(\/[^'"]*)?['"]/;

/** 模型に出てきてはいけない画面の物 */
const BANNED_GLOBALS = /\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas|requestAnimationFrame)\b/;

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const show = (file: string): string => relative(SRC, file).split(sep).join('/');

/** 文字列とコメントは「window」などの語を中身に持つことがあるので、読む前に外す */
const stripStringsAndComments = (code: string): string =>
  code
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('模型の層は React・DOM・Canvas に触れない', () => {
  for (const layer of MODEL_LAYERS) {
    const dir = join(SRC, layer);
    it.skipIf(!existsSync(dir))(`src/${layer}/ は画面の包みを import しない`, () => {
      const offenders = sourcesUnder(dir).filter((file) => BANNED_MODULES.test(readFileSync(file, 'utf8')));
      expect(offenders.map(show)).toEqual([]);
    });

    it.skipIf(!existsSync(dir))(`src/${layer}/ は document・window・Canvas を使わない`, () => {
      const offenders = sourcesUnder(dir)
        .map((file) => ({ file, hit: BANNED_GLOBALS.exec(stripStringsAndComments(readFileSync(file, 'utf8')))?.[0] }))
        .filter((row) => row.hit !== undefined)
        .map((row) => `${show(row.file)}: ${row.hit}`);
      expect(offenders).toEqual([]);
    });
  }
});

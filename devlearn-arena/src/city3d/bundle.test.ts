import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GitHub Pages に置けること、初回の読み込みに three を載せないことを見張る。
 *
 * - three を使うのは `src/city3d/**` だけ（ほかから使うと入口の塊に入ってしまう）
 * - `CityScene` は動的な読み込みでしか参照しない
 * - 置き場所（base）はビルド時に差し替えられる。CDN からは何も読まない
 */

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path));
    else if (/[.]tsx?$/.test(name) && !/[.]test[.]tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sourcesUnder(SRC);
const rel = (file: string): string => relative(SRC, file).split(sep).join('/');

describe('3D の荷造り', () => {
  it('three を使うのは src/city3d の中だけ', () => {
    const offenders = FILES.filter((file) => !rel(file).startsWith('city3d/')).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /from '(three|three\/|@react-three)/.test(text);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('CityScene は動的な読み込みでしか参照しない', () => {
    const statics = FILES.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /^import .*'[.][^']*CityScene'/m.test(text);
    });
    expect(statics.map(rel)).toEqual([]);
    const view = readFileSync(join(SRC, 'city3d', 'CityView.tsx'), 'utf8');
    expect(view).toContain("lazy(() => import('./CityScene'))");
  });

  it('置き場所はビルド時に差し替えられる（GitHub Pages のサブフォルダに置ける）', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toContain("base: process.env.VITE_BASE ?? '/'");
  });

  it('index.html は外から何も読まない', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toContain('three');
  });

  it('外から 3D モデルを取ってこない', () => {
    const offenders = FILES.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return ['GLTFLoader', 'useGLTF', 'FBXLoader', 'OBJLoader', '.glb', '.gltf'].filter((needle) => text.includes(needle)).map(
        (needle) => `${rel(file)}: ${needle}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});

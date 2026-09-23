import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORS, SURFACES } from './palette';

const HERE = __dirname;

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path));
    else if (/[.]tsx?$/.test(name) && !/[.]test[.]tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sourcesUnder(HERE);
const rel = (file: string): string => relative(HERE, file).split(sep).join('/');

describe('3D の街の色', () => {
  it('DESIGN.md §7 の表どおりの色を持つ', () => {
    expect(COLORS).toEqual({
      grass: '#6f9447',
      grassDark: '#5a7c38',
      pavement: '#8e8e8a',
      dirt: '#a08a62',
      water: '#4f7fa3',
      stone: '#c9bda6',
      glass: '#8fa8bd',
      roof: '#8a4a3c',
      light: '#ffcf7a',
    });
  });

  it('ガラスは metalness 0.2 / roughness 0.2', () => {
    expect(SURFACES.glass).toMatchObject({ color: COLORS.glass, metalness: 0.2, roughness: 0.2 });
  });

  it('原色と蛍光色を使わない（彩度を抑える）', () => {
    for (const [name, hex] of Object.entries(COLORS)) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b);
      const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      expect({ name, saturation: saturation <= 0.75 }).toEqual({ name, saturation: true });
    }
  });

  it('色を直書きしているのは palette.ts だけ', () => {
    const offenders = FILES.filter((file) => rel(file) !== 'palette.ts').flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, i) => (/#[0-9a-fA-F]{3,8}\b/.test(line) ? [`${rel(file)}:${String(i + 1)}`] : []));
    });
    expect(offenders).toEqual([]);
  });
});

describe('3D の街の持ち物', () => {
  it('外部から 3D モデルを取ってこない（glTF も CDN も使わない）', () => {
    const offenders = FILES.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const bad = ['GLTFLoader', 'useGLTF', 'FBXLoader', 'OBJLoader', 'https://', 'http://', 'unpkg', 'jsdelivr'];
      return bad.filter((needle) => text.includes(needle)).map((needle) => `${rel(file)}: ${needle}`);
    });
    expect(offenders).toEqual([]);
  });

  it('three は依存として持つ。CDN から読まない', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['three', '@react-three/fiber', '@react-three/drei']));
    const html = readFileSync(join(HERE, '..', '..', 'index.html'), 'utf8');
    expect(html).not.toContain('three');
  });
});

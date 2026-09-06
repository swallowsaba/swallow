/** 仮想FSのパス操作。実FSには一切触れない。 */
export const ROOT = '/';
export const HOME = '/home/learner';

export function isAbsolute(p: string): boolean {
  return p.startsWith('/');
}

/** '.' '..' と重複スラッシュを畳む。末尾スラッシュは落とす（ルートを除く）。 */
export function normalize(p: string): string {
  const absolute = isAbsolute(p);
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      const last = out[out.length - 1];
      if (out.length > 0 && last !== '..') out.pop();
      else if (!absolute) out.push('..');
      continue;
    }
    out.push(seg);
  }
  const joined = out.join('/');
  if (absolute) return `/${joined}`;
  return joined === '' ? '.' : joined;
}

/** '~' を展開し、cwd 基準で絶対パスにする。 */
export function resolve(cwd: string, p: string): string {
  let target = p;
  if (target === '~') target = HOME;
  else if (target.startsWith('~/')) target = HOME + target.slice(1);
  return normalize(isAbsolute(target) ? target : `${cwd}/${target}`);
}

export function dirname(p: string): string {
  const n = normalize(p);
  if (n === '/') return '/';
  const i = n.lastIndexOf('/');
  if (i <= 0) return i === 0 ? '/' : '.';
  return n.slice(0, i);
}

export function basename(p: string): string {
  const n = normalize(p);
  if (n === '/') return '/';
  return n.slice(n.lastIndexOf('/') + 1);
}

export function join(a: string, b: string): string {
  return normalize(`${a}/${b}`);
}

/** プロンプト表示用。ホーム配下は '~' に畳む。 */
export function displayPath(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(`${HOME}/`)) return `~${p.slice(HOME.length)}`;
  return p;
}

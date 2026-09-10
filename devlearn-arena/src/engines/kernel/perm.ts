/**
 * ファイルの権限と所有者。
 *
 * ノード本体（種別と中身）とは別の表に持つ。
 * こうしておくと、既に動いているファイル操作に手を入れずに済み、
 * 「権限は付随情報である」という実体にも合う。
 */
export interface FileMeta {
  /** 8 進数の権限ビット（例 0o644） */
  mode: number;
  owner: string;
  group: string;
}

export const DEFAULT_FILE_MODE = 0o644;
export const DEFAULT_DIR_MODE = 0o755;
/**
 * 新しく作るときの出発点。ここから umask のぶんを落とす。
 * ファイルに x が付かないのは、出発点が 666 だからで、
 * umask が x を落としているわけではない。
 */
export const BASE_FILE_MODE = 0o666;
export const BASE_DIR_MODE = 0o777;
export const DEFAULT_OWNER = 'learner';

export function defaultMeta(isDir: boolean, owner = DEFAULT_OWNER): FileMeta {
  return { mode: isDir ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE, owner, group: owner };
}

/** `rwxr-xr-x` の形にする */
export function formatMode(mode: number, isDir: boolean): string {
  const bit = (shift: number): string => {
    const value = (mode >> shift) & 0o7;
    return `${(value & 4) !== 0 ? 'r' : '-'}${(value & 2) !== 0 ? 'w' : '-'}${(value & 1) !== 0 ? 'x' : '-'}`;
  };
  return `${isDir ? 'd' : '-'}${bit(6)}${bit(3)}${bit(0)}`;
}

export function formatOctal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(3, '0');
}

const WHO: Record<string, number> = { u: 6, g: 3, o: 0 };
const PERM_BIT: Record<string, number> = { r: 4, w: 2, x: 1 };

/**
 * chmod の指定を読む。
 * 8 進数（755）と記号（u+x, go-w, a=r, +x）の両方を受け取る。
 * 読めなければ null を返す。
 */
export function applyModeSpec(current: number, spec: string, isDir: boolean): number | null {
  if (/^[0-7]{3,4}$/.test(spec)) return Number.parseInt(spec, 8);

  let mode = current;
  for (const clause of spec.split(',')) {
    const parsed = /^([ugoa]*)([+\-=])([rwxX]*)$/.exec(clause);
    if (!parsed) return null;
    const [, whoRaw = '', op = '+', permRaw = ''] = parsed;
    const whos = (whoRaw === '' || whoRaw === 'a' ? 'ugo' : whoRaw).split('');
    let bits = 0;
    for (const p of permRaw) {
      if (p === 'X') {
        // X はディレクトリか、既にどこかに x が立っているときだけ効く
        if (isDir || (current & 0o111) !== 0) bits |= PERM_BIT['x'] ?? 0;
        continue;
      }
      bits |= PERM_BIT[p] ?? 0;
    }
    for (const who of whos) {
      const shift = WHO[who];
      if (shift === undefined) return null;
      const mask = 0o7 << shift;
      if (op === '=') mode = (mode & ~mask) | (bits << shift);
      else if (op === '+') mode |= bits << shift;
      else mode &= ~(bits << shift);
    }
  }
  return mode;
}

export type AccessKind = 'read' | 'write' | 'exec';

const NEEDED: Record<AccessKind, number> = { read: 4, write: 2, exec: 1 };

/**
 * その利用者がその権限を持つか。
 * root は常に通る（実物の挙動に合わせる）。
 */
export function allows(meta: FileMeta, user: string, kind: AccessKind): boolean {
  if (user === 'root') return true;
  const need = NEEDED[kind];
  const shift = meta.owner === user ? 6 : meta.group === user ? 3 : 0;
  return ((meta.mode >> shift) & need) === need;
}

/** umask を反映した既定の権限 */
export function withUmask(mode: number, umask: number): number {
  return mode & ~umask;
}

export function parseUmask(text: string): number | null {
  if (!/^[0-7]{1,4}$/.test(text)) return null;
  return Number.parseInt(text, 8);
}

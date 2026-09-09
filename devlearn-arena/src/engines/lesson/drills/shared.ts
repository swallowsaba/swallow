import type { DocRef } from '@/content/types';
import { defineMission, type MissionSource, type MissionSpec } from '../authoring/mission';
import type { MissionTrack } from '../types';

export const HOME = '/home/learner';

/** 出典。man ページと公式ドキュメントだけを指す */
export const man = (page: string, section = 1): DocRef => ({
  label: `${page}(${String(section)})`,
  url: `https://man7.org/linux/man-pages/man${String(section)}/${page}.${String(section)}.html`,
});

export const bash = (anchor: string, label: string): DocRef => ({
  label,
  url: `https://www.gnu.org/software/bash/manual/html_node/${anchor}.html`,
});

export const k8sDoc = (path: string, label: string): DocRef => ({
  label,
  url: `https://kubernetes.io/docs/${path}`,
});

export const gitDoc = (page: string): DocRef => ({
  label: `git ${page}`,
  url: `https://git-scm.com/docs/git-${page}`,
});

export const ghDoc = (path: string, label: string): DocRef => ({
  label,
  url: `https://docs.github.com/${path}`,
});

export const rfc = (number: number, label: string): DocRef => ({
  label,
  url: `https://www.rfc-editor.org/rfc/rfc${String(number)}.html`,
});

/**
 * 同じ形の課題を、値だけ変えて何本も作るための入口。
 * 変える値は必ず引数で受け取り、乱数は使わない。
 */
export interface Variant<T> {
  /** id の末尾になる。重複しないこと */
  slug: string;
  value: T;
}

export interface FamilyOptions<T> {
  track: MissionTrack;
  chapterId: string;
  /** id の中ほど。family ごとに一意にする */
  family: string;
  docs?: readonly DocRef[];
  variants: readonly Variant<T>[];
  make: (value: T, id: string) => Omit<MissionSpec, 'id' | 'track' | 'chapterId' | 'docs'>;
}

/** ひとつの型の課題から、変種をまとめて作る */
export function family<T>(options: FamilyOptions<T>): MissionSource[] {
  return options.variants.map((variant) => {
    const id = `${options.chapterId}/${options.family}-${variant.slug}`;
    return defineMission({
      ...options.make(variant.value, id),
      id,
      track: options.track,
      chapterId: options.chapterId,
      docs: options.docs ?? [],
    });
  });
}

/** 数を並べた変種（1..n） */
export function counted(n: number, prefix = 'v'): Variant<number>[] {
  return Array.from({ length: n }, (_, i) => ({ slug: `${prefix}${String(i + 1)}`, value: i + 1 }));
}

/** 文字列の一覧から変種を作る。slug は値そのものを使う */
export function fromNames(names: readonly string[]): Variant<string>[] {
  return names.map((name) => ({ slug: name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), value: name }));
}

/** 決まった行数の作り物のログ */
export function fakeLog(lines: number, level: string, message: string): string {
  return (
    Array.from(
      { length: lines },
      (_, i) => `2026-05-${String((i % 28) + 1).padStart(2, '0')} 10:00:00 ${level} ${message} #${String(i + 1)}`,
    ).join('\n') + '\n'
  );
}

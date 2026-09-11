import type { MissionKind, MissionTrack } from './types';

/**
 * 推奨順。初めての人が迷わないよう、どの画面でも同じ順に並べる。
 *
 * 世界の順: まず端末に慣れ（序章）、自分の手元の記録（Git）、共同作業（GitHub）、
 * 通信の仕組み（Network）、最後にそれらを全部使う Kubernetes。
 * 世界の中では章の番号順。章の中では「読んで手を動かす任務」→「演習」→「障害対応」の順。
 */
export const TRACK_ORDER: readonly MissionTrack[] = ['kernel', 'git', 'github', 'net', 'k8s'];

export interface Orderable {
  id: string;
  track: MissionTrack;
  chapterId: string;
  kind: MissionKind;
  /** 目次に元から書いてある、読んで手を動かす任務か（演習ではないもの） */
  curated: boolean;
}

function chapterNo(chapterId: string): number {
  return Number(chapterId.split('/')[1] ?? '0');
}

function group(entry: Orderable): number {
  if (entry.kind === 'boss') return 2;
  return entry.curated ? 0 : 1;
}

/**
 * 推奨順の番号を振る。小さいほど先。
 * 同じ位置のものは、渡された順（書かれた順）を保つ。
 */
export function assignOrder<T extends Orderable>(entries: readonly T[]): Map<string, number> {
  const indexed = entries.map((entry, i) => ({ entry, i }));
  indexed.sort((a, b) => {
    const track = TRACK_ORDER.indexOf(a.entry.track) - TRACK_ORDER.indexOf(b.entry.track);
    if (track !== 0) return track;
    const chapter = chapterNo(a.entry.chapterId) - chapterNo(b.entry.chapterId);
    if (chapter !== 0) return chapter;
    const g = group(a.entry) - group(b.entry);
    if (g !== 0) return g;
    return a.i - b.i;
  });
  return new Map(indexed.map(({ entry }, order) => [entry.id, order + 1]));
}

/**
 * 先にやっておくとよい任務。遊べなくはしない。「先に〇〇をやりましょう」と出すだけ。
 * - 読んで手を動かす任務と障害対応: 同じ世界で、ひとつ前にある「読んで手を動かす任務」
 * - 演習: 同じ章の「読んで手を動かす任務」。章に無ければ、ひとつ前にあるもの
 * - 各世界の最初の任務: 序章の最初の任務（端末の使い方）
 */
export function assignRequires<T extends Orderable>(
  entries: readonly T[],
  order: ReadonlyMap<string, number>,
): Map<string, string[]> {
  const sorted = [...entries].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const firstOverall = sorted.find((e) => e.curated && e.track === TRACK_ORDER[0]);
  const curatedByChapter = new Map<string, T[]>();
  for (const e of sorted) {
    if (e.curated && e.kind !== 'boss') curatedByChapter.set(e.chapterId, [...(curatedByChapter.get(e.chapterId) ?? []), e]);
  }
  const out = new Map<string, string[]>();
  const lastCurated = new Map<MissionTrack, T>();
  for (const entry of sorted) {
    const sameChapter = (curatedByChapter.get(entry.chapterId) ?? []).filter((e) => e.id !== entry.id);
    const previous = lastCurated.get(entry.track);
    let requires: string[];
    if (!entry.curated && entry.kind !== 'boss' && sameChapter.length > 0) {
      requires = sameChapter.map((e) => e.id);
    } else if (previous !== undefined) {
      requires = [previous.id];
    } else if (firstOverall !== undefined && firstOverall.id !== entry.id) {
      requires = [firstOverall.id];
    } else {
      requires = [];
    }
    out.set(entry.id, requires);
    if (entry.curated && entry.kind !== 'boss') lastCurated.set(entry.track, entry);
  }
  return out;
}

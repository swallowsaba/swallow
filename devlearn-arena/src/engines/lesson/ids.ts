/** 任務 id は `<track>/<章番号>/<slug>` の形にそろえる */
export function chapterOf(missionId: string): string {
  const parts = missionId.split('/');
  return parts.length >= 2 ? `${parts[0] ?? ''}/${parts[1] ?? ''}` : missionId;
}

export function slugOf(missionId: string): string {
  return missionId.split('/').slice(2).join('/');
}

export function trackOf(missionId: string): string {
  return missionId.split('/')[0] ?? '';
}

/** 番号を 2 桁にそろえる（章 id を組み立てるときに使う） */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function missionId(track: string, chapter: number, slug: string): string {
  return `${track}/${pad2(chapter)}/${slug}`;
}

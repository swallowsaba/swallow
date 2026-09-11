import type { MissionTrack } from '@/engines/lesson/types';

export type VisualTab = 'fs' | 'git' | 'k8s' | 'net' | 'gh';

export const VISUAL_TABS: readonly VisualTab[] = ['fs', 'git', 'k8s', 'net', 'gh'];

/** 任務を開いた瞬間に選ぶ図。学ぶ対象そのものが見えるもの */
const PRIMARY: Record<MissionTrack, VisualTab> = {
  kernel: 'fs',
  git: 'git',
  k8s: 'k8s',
  net: 'net',
  github: 'gh',
};

export function tabForTrack(track: MissionTrack): VisualTab {
  return PRIMARY[track];
}

/**
 * その任務で見る意味のある図。ほかの図は押せなくし、薄く出す。
 * GitHub の任務は手元の Git も使うので、履歴の図も残す。
 */
export function relevantTabs(track: MissionTrack): ReadonlySet<VisualTab> {
  const tabs = new Set<VisualTab>([PRIMARY[track]]);
  if (track === 'github') tabs.add('git');
  return tabs;
}

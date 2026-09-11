import type { MissionTrack } from '@/engines/lesson/types';

export type VisualTab = 'world' | 'git' | 'k8s' | 'net' | 'gh';

export const VISUAL_TABS: readonly VisualTab[] = ['world', 'git', 'k8s', 'net', 'gh'];

/** 任務を開いた瞬間に選ぶ図。その世界の様子が一番よく見えるもの */
const PRIMARY: Record<MissionTrack, VisualTab> = {
  kernel: 'world',
  git: 'git',
  k8s: 'k8s',
  net: 'net',
  github: 'gh',
};

export function tabForTrack(track: MissionTrack): VisualTab {
  return PRIMARY[track];
}

/**
 * その任務で見る意味のある図。ほかの図は薄く出す（押せば見られる）。
 * ファイルの村はどの任務でもファイルを触るので常に残す。GitHub の任務は手元の Git も使う。
 */
export function relevantTabs(track: MissionTrack): ReadonlySet<VisualTab> {
  const tabs = new Set<VisualTab>([PRIMARY[track], 'world']);
  if (track === 'github') tabs.add('git');
  return tabs;
}

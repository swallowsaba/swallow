import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { gitScene } from './git';
import { githubScene } from './github';
import { k8sScene } from './k8s';
import { netScene } from './net';
import { shellScene } from './shell';
import type { Scene, Translate } from './types';

export type { Scene, SceneItem, SceneBuilding, SceneInfo, LegendEntry, Translate, Tone, BuildStyle } from './types';
export { TONE_COLOR } from './types';
export type { TownPlan, PlannedBlock, PlannedLot, PlannedRoad, PlanDistrict, Facing } from './plan';
export { AVENUE, LOT, planTown, SIDEWALK, STREET, stretchTown } from './plan';

/** カテゴリごとの見立てで、いまの状態を街の場面にする */
export function sceneOf(track: MissionTrack, state: ShellState, previous: ShellState | undefined, t: Translate): Scene {
  switch (track) {
    case 'git':
      return gitScene(state.git, state.vfs, previous?.git, t);
    case 'github':
      return githubScene(state.repo, t) ?? gitScene(state.git, state.vfs, previous?.git, t);
    case 'k8s':
      return k8sScene(state.cluster, t);
    case 'net':
      return netScene(state.net, state.vars.get('NET_SELF') ?? 'pc1', t);
    default:
      return shellScene(state, previous, t);
  }
}

import type { MissionTrack } from '@/engines/lesson/types';

/** 街の人の役。案内人は街ごとに違い、住民は共通 */
export type CharacterRole = 'aide' | 'station' | 'port' | 'post' | 'permit' | 'resident';

/** 街ごとの案内人の役（副市長・駅長・港湾局長・郵便局長・建築課長） */
export const ROLE_OF_TRACK: Record<MissionTrack, CharacterRole> = {
  kernel: 'aide',
  git: 'station',
  k8s: 'port',
  net: 'post',
  github: 'permit',
};

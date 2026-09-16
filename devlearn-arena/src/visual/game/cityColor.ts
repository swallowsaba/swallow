import type { MissionTrack } from '@/engines/lesson/types';

/** 街ごとの色。屋根と、案内人の服と帽子 */
export const CITY_COLOR: Record<MissionTrack, { roof: string; shirt: string; hat: string; ground: string }> = {
  kernel: { roof: '#8f4b3f', shirt: '#c0604a', hat: '#8f4b3f', ground: '#77b356' },
  git: { roof: '#b8662b', shirt: '#e8823c', hat: '#6b4a2a', ground: '#7fb35a' },
  github: { roof: '#6f4f9f', shirt: '#8a66c0', hat: '#4a3470', ground: '#74ad55' },
  k8s: { roof: '#3f6f8f', shirt: '#4d7fb3', hat: '#f2c14e', ground: '#86ba5e' },
  net: { roof: '#2f8f84', shirt: '#2fa396', hat: '#1f5f58', ground: '#79b458' },
};

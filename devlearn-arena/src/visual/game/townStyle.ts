import type { MissionTrack } from '@/engines/lesson/types';

/** 町ごとの色。建物の壁・屋根と、依頼主の服・帽子 */
export interface TownStyle {
  wall: string;
  roof: string;
  trim: string;
  shirt: string;
  hat: string;
  ground: string;
}

export const TOWN_STYLE: Record<MissionTrack, TownStyle> = {
  kernel: { wall: '#f1dfbc', roof: '#8f4b3f', trim: '#7a5230', shirt: '#c0604a', hat: '#8f4b3f', ground: '#77b356' },
  git: { wall: '#f3e2c7', roof: '#b8662b', trim: '#6b4a2a', shirt: '#e8823c', hat: '#6b4a2a', ground: '#7fb35a' },
  k8s: { wall: '#e9eef5', roof: '#3f6f8f', trim: '#2c4a6b', shirt: '#4d7fb3', hat: '#f2c14e', ground: '#86ba5e' },
  net: { wall: '#e8f3ef', roof: '#2f8f84', trim: '#1f5f58', shirt: '#2fa396', hat: '#1f5f58', ground: '#79b458' },
  github: { wall: '#efe6f5', roof: '#6f4f9f', trim: '#4a3470', shirt: '#8a66c0', hat: '#4a3470', ground: '#74ad55' },
};

/** 1 階ぶんの高さ(px) */
export const FLOOR_H = 16;

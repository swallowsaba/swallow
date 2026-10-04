import type { SimState } from '@/engines/sim/types';

/** 模擬環境（模）の型の名前（docs/content-spec.md 2.4.1） */
export const SIM_NAMES: Record<SimState['type'], string> = {
  connect: 'つなぐ',
  order: '並べる',
  assign: '割り振る',
  config: '設定する',
  read: '読み取って答える',
};

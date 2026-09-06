import { useReducedMotion } from 'framer-motion';
import { useStore } from '@/store';

/** OS 設定とアプリ設定の両方を尊重する。false ならアニメーションを付けない。 */
export function useMotionEnabled(): boolean {
  const prefersReduced = useReducedMotion();
  const setting = useStore((s) => s.settings.motion);
  if (setting === 'reduced') return false;
  return prefersReduced !== true;
}

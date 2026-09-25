import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useStore } from '@/store';

type MotionSetting = 'system' | 'reduced';

/** OS 設定とアプリ設定の両方を尊重する。false ならアニメーションを付けない。 */
export function useMotionEnabled(): boolean {
  const prefersReduced = useReducedMotion();
  const setting = useStore((s) => s.settings.motion);
  if (setting === 'reduced') return false;
  return prefersReduced !== true;
}

/**
 * 街の何を動かすか。
 *
 * traffic: 車・人・時間帯。街の動きは仕組みの模型そのもの（住人が行き来し、荷車が走る）なので、
 *   OS の「アニメーションを減らす」では止めない。止めるのはアプリの設定で選んだときだけ。
 *   Windows で「アニメーション効果」を切っていると、ブラウザはこの設定を返す。
 *   以前はそれで街がまるごと止まり、「車と人が動かない」と 3 回指摘された（REWORK 3-1）。
 * glide: カメラが街の上を滑る動き。OS の設定に従い、減らすなら瞬間で移る。
 */
export function motionPlan(setting: MotionSetting, prefersReduced: boolean | null): { traffic: boolean; glide: boolean } {
  if (setting === 'reduced') return { traffic: false, glide: false };
  return { traffic: true, glide: prefersReduced !== true };
}

/** OS が「動きを減らす」を返しているか。開いている間に切り替えても追いかける */
function usePrefersReduced(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const read = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = (): void => {
      setReduced(list.matches);
    };
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, []);
  return reduced;
}

/** 街の動き方。`motionPlan` を、いまの設定で引く */
export function useCityMotion(): { traffic: boolean; glide: boolean } {
  const prefersReduced = usePrefersReduced();
  const setting = useStore((s) => s.settings.motion);
  return motionPlan(setting, prefersReduced);
}

/** 1 フレームで進めてよい最長の秒数。タブを離れて戻ったときに、車が街を飛び越えないように */
const MAX_STEP = 0.5;

/**
 * 1 フレームで車と人を進める秒数。
 * 描画が遅い端末でも、実際の時間どおりに進める（以前は 0.1 秒で切っていたので、遅い端末ほど止まって見えた）。
 */
export function advanceOf(delta: number): number {
  return Math.min(Math.max(delta, 0), MAX_STEP);
}

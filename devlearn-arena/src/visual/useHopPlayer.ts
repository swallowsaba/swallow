import { useEffect, useState } from 'react';

/** 1ホップ進むのにかける時間（ミリ秒） */
export const HOP_MS = 800;

/**
 * 直前のパケットを1ホップずつ進める。
 * 送り直すたび（trace.id が変わるたび）に最初のホップから再生する。動きを止める設定なら最後のホップを出す。
 * 図とゲーム画面の両方で使う。
 */
export function useHopPlayer(traceId: number | undefined, hopCount: number, animate: boolean): [number, (n: number) => void] {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (hopCount === 0) return;
    if (!animate) {
      setStep(hopCount - 1);
      return;
    }
    setStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= hopCount) {
        clearInterval(timer);
        return;
      }
      setStep(i);
    }, HOP_MS);
    return () => {
      clearInterval(timer);
    };
  }, [traceId, hopCount, animate]);
  return [Math.min(step, Math.max(0, hopCount - 1)), setStep];
}

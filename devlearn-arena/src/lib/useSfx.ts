import { useMemo } from 'react';
import { useStore } from '@/store';
import { sfx } from './sfx';

/** 設定で音を切っている人には鳴らさない。呼ぶ側で毎回判定しなくてよいようにする */
export function useSfx(): typeof sfx {
  const on = useStore((s) => s.settings.soundEnabled);
  return useMemo(
    () =>
      on
        ? sfx
        : { step: () => undefined, clear: () => undefined, levelUp: () => undefined, error: () => undefined },
    [on],
  );
}

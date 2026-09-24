import { useMemo, useRef } from 'react';
import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { unlockedDistricts } from '@/city/growth';
import { buildCity, whereabouts, type City, type Whereabouts } from '@/city/model';
import { growthOf } from '@/features/citymap/cityStore';
import { useStore } from '@/store';

/**
 * いまの学習の状態から街を導く。
 *
 * 街は状態の写像なので、ここは `buildCity` を呼ぶだけ。
 * 直前の街での住人の居場所だけを覚えておき、引っ越しを歩かせるのに使う。
 */
export function useDerivedCity(track: MissionTrack, state: ShellState, cleared: ReadonlySet<string>): City {
  const growth = useStore((s) => s.growth);
  const before = useRef<Whereabouts | undefined>(undefined);

  return useMemo(() => {
    const next = buildCity({
      home: state.cwd.startsWith('/home/') ? '/home/learner' : state.cwd,
      vfs: state.vfs,
      git: state.git,
      cluster: state.cluster,
      net: state.net,
      repo: state.repo,
      unlocked: unlockedDistricts(cleared),
      before: before.current,
      growth: growthOf(growth, track),
    });
    before.current = whereabouts(next);
    return next;
  }, [state, cleared, growth, track]);
}

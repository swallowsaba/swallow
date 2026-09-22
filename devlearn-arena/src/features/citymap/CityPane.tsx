import { useMemo, useRef } from 'react';
import type { CityState } from '@/content/city';
import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { CityCanvas } from '@/city/CityCanvas';
import { Viewport } from '@/city/Viewport';
import { unlockedDistricts } from '@/city/growth';
import { buildCity, whereabouts, type Whereabouts } from '@/city/model';
import { TILE } from '@/city/palette';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Icon } from '@/ui/Icon';

/** 地図の上に流す出来事（正解・手順・完了・建設） */
export interface CityEvent {
  id: number;
  facilityId: string | null;
  text: string;
  color: string;
}

interface Props {
  track: MissionTrack;
  city: CityState;
  state: ShellState;
  /** クリアした任務。街の区域はここから開く */
  cleared?: ReadonlySet<string> | undefined;
  events?: CityEvent[] | undefined;
  /** 街を押したとき、対応するコマンドを端末に入力して実行する */
  onCommand?: ((line: string) => void) | undefined;
}

/**
 * 右側の枠。学習の状態から導いた街を、真上から見た 2D で映す。
 * 街づくりの絵は `src/city` が持つ。ここは枠と見出しだけを用意する。
 */
export function CityPane({ city, state, cleared, events, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  // 直前の街での住人の居場所。引っ越しを歩かせるのに使う
  const before = useRef<Whereabouts | undefined>(undefined);

  const drawn = useMemo(() => {
    const next = buildCity({
      home: state.cwd.startsWith('/home/') ? '/home/learner' : state.cwd,
      vfs: state.vfs,
      git: state.git,
      cluster: state.cluster,
      net: state.net,
      repo: state.repo,
      unlocked: unlockedDistricts(cleared ?? []),
      before: before.current,
    });
    before.current = whereabouts(next);
    return next;
  }, [state, cleared]);

  return (
    <section data-testid="city-pane" className="flex h-full min-h-0 flex-col bg-cream">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--u-line)] bg-[var(--u-card)] px-3 py-2 text-[13px] font-semibold">
        <Icon name="city" size={15} />
        {city.plan.name}
        <span className="ml-auto font-mono text-[11px] text-[var(--u-text-2)]" data-testid="city-cwd">
          {state.cwd}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Viewport content={{ w: drawn.width * TILE, h: drawn.height * TILE }} label={t('world.stats', { a: city.built, b: city.facilities.length })}>
          <CityCanvas city={drawn} animate={animate} {...(onCommand ? { onCommand } : {})} />
        </Viewport>
      </div>
      {events && events.length > 0 ? (
        <ul className="shrink-0 border-t border-[var(--u-line)] px-3 py-2">
          {events.slice(-3).map((e) => (
            <li key={e.id} data-city-event={e.id} className="text-[12px]" style={{ color: e.color }}>
              {e.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

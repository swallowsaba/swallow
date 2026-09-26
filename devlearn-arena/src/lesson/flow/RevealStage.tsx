import { useEffect, useState } from 'react';
import type { ExperienceKind, RevealScene } from '@/engines/lesson/types';
import { HUD } from '@/features/park/hud/theme';
import type { PlaySummary } from '../experience/sim';
import { TownView } from '../experience/TownView';

/** 施設に寄っている秒数。建ち上がるのを見せてから、町全体に引いて矢印を出す */
const CLOSE_UP_MS = 2200;

interface Props {
  kind: ExperienceKind;
  reveal: RevealScene;
  /** さっきの体験の結果。「手でやるとこうだった」を頭に置く */
  summary: PlaySummary | null;
  onNext: () => void;
}

/**
 * 学びの流れの 2 段目「登場」。
 *
 * さっき手でやっていたことを代わりにやる施設が、町に建ち上がる。カメラがそこへ寄り、
 * 引いたところで、用語が 1 つずつ「いま見ている物」に矢印で結ばれて出てくる。
 * 用語はここで初めて出す（CLAUDE.md 学びの流れ 2）。
 */
export function RevealStage({ kind, reveal, summary, onNext }: Props) {
  const [close, setClose] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setClose(false);
    }, CLOSE_UP_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div data-testid="reveal" data-phase={close ? 'close-up' : 'terms'} className="flex h-full min-h-0 gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md" style={{ background: 'rgba(8,11,15,0.55)' }}>
        <TownView
          kind={kind}
          facility
          rising
          plates={!close}
          focus={close ? 'facility' : null}
          marks={{ facility: 'gold' }}
          pointers={close ? [] : reveal.terms.map((t) => ({ points: t.points, title: t.term, body: t.plain }))}
        />
      </div>
      <aside className="flex w-[260px] shrink-0 flex-col gap-2.5">
        <p className="text-[12px]" style={{ color: HUD.warn }}>
          2. 登場
        </p>
        <p data-testid="reveal-facility" className="text-[17px] font-bold leading-snug">
          {reveal.facility}
        </p>
        {summary === null ? null : (
          <p className="rounded px-2.5 py-1.5 text-[12px] leading-snug" style={{ background: HUD.fill, color: HUD.muted }}>
            {`さっきは手で ${String(summary.done)} 件片付け、${String(summary.missed + summary.left)} 件こぼし、${String(summary.wasted)} 回むだ足を踏んだ。`}
          </p>
        )}
        <p data-testid="reveal-replaces" className="text-[13.5px] leading-relaxed" style={{ color: HUD.soft }}>
          {reveal.replaces}
        </p>
        {close ? null : (
          <ul className="space-y-1.5" aria-label="この施設の言葉">
            {reveal.terms.map((t, i) => (
              <li key={t.term} className="town-pointer text-[12.5px] leading-snug" style={{ animationDelay: `${String(0.3 + i * 0.5)}s` }}>
                <span className="font-bold" style={{ color: HUD.warn }}>
                  {`${String(i + 1)} ${t.term}`}
                </span>
                <span style={{ color: HUD.soft }}>{` … ${t.plain}`}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex-1" />
        <button
          type="button"
          data-testid="reveal-next"
          onClick={onNext}
          disabled={close}
          className="h-9 rounded text-[14px] font-bold disabled:opacity-40"
          style={{ background: HUD.accentDeep, color: '#fff' }}
        >
          町の中で確かめる
        </button>
      </aside>
    </div>
  );
}

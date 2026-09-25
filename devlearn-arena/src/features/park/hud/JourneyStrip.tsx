import type { Journey } from '@/city/journey';
import type { JourneyPlay } from '@/city3d/journey';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD, SIZE } from './theme';
import { RATES } from './journeyRates';

interface Props {
  journey: Journey;
  /** いま粒が着いている停留所（0 始まり） */
  at: number;
  play: JourneyPlay;
  onPlaying: (playing: boolean) => void;
  onRate: (rate: number) => void;
  /** 1 停留所ぶん進める */
  onStep: () => void;
  onClose: () => void;
}

/**
 * 旅路の帯。画面の下に、その旅が通りうる施設を左から並べる。
 *
 * カメラは一度に一か所しか映せない。だから旅の全体はここで見せる。
 * 通った施設には順番の数を付け、通らなかった施設には取り消し線を引く。
 * いま粒がいる所が光る。
 */
export function JourneyStrip({ journey, at, play, onPlaying, onRate, onStep, onClose }: Props) {
  const t = useT();
  const here = journey.stops[Math.min(at, journey.stops.length - 1)];
  const last = at >= journey.stops.length - 1;

  return (
    <div
      data-testid="journey-strip"
      data-at={String(at)}
      className="absolute z-[21] rounded-lg p-2.5"
      style={{
        left: SIZE.dock + 16,
        right: 232,
        bottom: 124,
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon name="route" size={16} />
        <code className="truncate text-[12px]" style={{ color: HUD.accentText }}>
          {journey.command}
        </code>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            data-testid="journey-playing"
            aria-pressed={play.playing}
            aria-label={play.playing ? t('journey.pause') : t('journey.play')}
            onClick={() => {
              onPlaying(!play.playing);
            }}
            className="grid h-7 w-7 place-items-center rounded"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            <Icon name={play.playing ? 'pause' : 'play'} size={14} />
          </button>
          <button
            type="button"
            data-testid="journey-step"
            aria-label={t('journey.step')}
            disabled={last}
            onClick={onStep}
            className="grid h-7 w-7 place-items-center rounded disabled:opacity-40"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            <Icon name="next" size={14} />
          </button>
          {RATES.map((rate) => {
            const on = play.rate === rate;
            return (
              <button
                key={rate}
                type="button"
                data-rate={String(rate)}
                aria-pressed={on}
                onClick={() => {
                  onRate(rate);
                }}
                className="h-7 rounded px-2 text-[12px] tabular-nums"
                style={{
                  border: `1px solid ${on ? HUD.accent : HUD.lineStrong}`,
                  background: on ? HUD.accentFill : 'transparent',
                  color: on ? HUD.text : HUD.muted,
                }}
              >
                {`${String(rate)}x`}
              </button>
            );
          })}
          <button
            type="button"
            data-testid="journey-close"
            aria-label={t('journey.close')}
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.muted }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      <ol className="mt-2 flex flex-wrap items-center gap-1">
        {journey.lanes.map((lane) => {
          const passed = lane.stop !== null;
          const now = lane.stop === at;
          return (
            <li
              key={lane.index}
              data-lane={lane.title}
              data-passed={passed ? 'yes' : 'no'}
              data-now={now ? 'yes' : undefined}
              className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px]"
              style={{
                border: `1px solid ${now ? HUD.accent : passed ? HUD.lineStrong : 'transparent'}`,
                background: now ? HUD.accentFill : passed ? HUD.fill : 'transparent',
                color: passed ? (now ? HUD.text : HUD.soft) : HUD.locked,
                textDecoration: passed ? 'none' : 'line-through',
              }}
            >
              {passed ? (
                <span className="tabular-nums" style={{ color: now ? HUD.accentText : HUD.dim }}>
                  {String((lane.stop ?? 0) + 1)}
                </span>
              ) : null}
              {lane.title}
            </li>
          );
        })}
      </ol>

      <p data-testid="journey-note" className="mt-1.5 text-[12px] leading-relaxed" style={{ color: HUD.soft }}>
        {here?.label ?? ''}
      </p>
    </div>
  );
}

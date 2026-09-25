import type { TourStop } from '@/city/tour';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD, SIZE } from './theme';

interface Props {
  stops: readonly TourStop[];
  /** いま何番目を案内しているか。null なら案内していない */
  at: number | null;
  /** 街を開いたばかりで、まだ何も打っていない。ツアーを勧める */
  invited: boolean;
  onAt: (index: number) => void;
  onLeave: () => void;
  /** 勧めを断ったとき。以後は自分から始めるまで出さない */
  onDecline: () => void;
  /** 下に旅路の帯が出ているか。出ている間は、案内の誘いを引っ込めて場所を譲る */
  busy?: boolean;
}

/**
 * 街の左下に置く板。端末の柱の右隣から始め、下の建設メニューより上に置く。
 * 課題の札（左上）とも、情報の柱（右）とも重ならない。
 */
const BOX = {
  position: 'absolute',
  left: SIZE.dock + 16,
  bottom: 124,
  width: 420,
  zIndex: 21,
} as const;

/**
 * 案内ツアー。カメラが街の施設を順に巡り、1 か所ごとに止まって札を出す。
 *
 * 札は「これは何か・何のためにあるか」だけを平易な言葉で述べる。
 * いつでも抜けられる。抜けても端末はそのまま使える（この板は街の上に浮くだけで、
 * 端末も課題の札も塞がない）。
 */
export function TourPanel({ stops, at, invited, onAt, onLeave, onDecline, busy = false }: Props) {
  const t = useT();
  if (stops.length === 0) return null;
  if (at === null && busy) return null;

  if (at === null) {
    return (
      <div data-testid="tour-idle" style={BOX}>
        {invited ? (
          <div
            data-testid="tour-invite"
            className="rounded-lg p-3.5"
            style={{ background: HUD.panel, border: `1px solid ${HUD.accentEdge}`, boxShadow: HUD.shadow }}
          >
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <Icon name="route" size={16} />
              {t('tour.title')}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: HUD.soft }}>
              {t('tour.invite', { n: stops.length })}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                data-testid="tour-start"
                onClick={() => {
                  onAt(0);
                }}
                className="ui-btn ui-btn-primary h-8 px-3 text-[13px]"
              >
                {t('tour.start')}
              </button>
              <button
                type="button"
                data-testid="tour-decline"
                onClick={onDecline}
                className="ui-btn ui-btn-plain h-8 px-3 text-[13px]"
              >
                {t('tour.later')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="tour-start"
            onClick={() => {
              onAt(0);
            }}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px]"
            style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            <Icon name="route" size={16} />
            {t('tour.start')}
          </button>
        )}
      </div>
    );
  }

  const index = Math.min(at, stops.length - 1);
  const stop = stops[index];
  if (stop === undefined) return null;

  return (
    <div data-testid="tour-card" style={BOX}>
      {/* 案内中の板は、いま光らせている施設と揃えて縁を光らせる */}
      <div
        className="rounded-lg p-3.5"
        style={{ background: HUD.panel, border: `1px solid ${HUD.accentEdge}`, boxShadow: HUD.shadow }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Icon name="route" size={16} />
            <span data-testid="tour-stop-title">{stop.title}</span>
          </p>
          <span className="text-[12px] tabular-nums" style={{ color: HUD.muted }}>
            {t('tour.count', { a: index + 1, b: stops.length })}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: HUD.soft }}>
          {stop.body}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            data-testid="tour-prev"
            disabled={index === 0}
            onClick={() => {
              onAt(index - 1);
            }}
            className="ui-btn ui-btn-plain h-8 px-2.5 text-[13px] disabled:opacity-40"
          >
            <Icon name="back" size={15} />
          </button>
          {index + 1 < stops.length ? (
            <button
              type="button"
              data-testid="tour-next"
              onClick={() => {
                onAt(index + 1);
              }}
              className="ui-btn ui-btn-primary h-8 px-3 text-[13px]"
            >
              {t('tour.next')}
            </button>
          ) : (
            <button
              type="button"
              data-testid="tour-next"
              onClick={onLeave}
              className="ui-btn ui-btn-primary h-8 px-3 text-[13px]"
            >
              {t('tour.done')}
            </button>
          )}
          <button
            type="button"
            data-testid="tour-leave"
            onClick={onLeave}
            className="ui-btn ui-btn-plain ml-auto h-8 px-2.5 text-[13px]"
          >
            {t('tour.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}

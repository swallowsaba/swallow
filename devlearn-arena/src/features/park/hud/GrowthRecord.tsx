import { Icon } from '@/ui/Icon';
import type { GrowthMark } from '../growthLog';
import { HUD } from './theme';

interface Props {
  log: readonly GrowthMark[];
  /** 記録を押したとき。カメラがその建物へ飛び、輪と札を出し直す */
  onPick: (mark: GrowthMark) => void;
}

/** 札の金色。街の上の「＋家 1」と同じ色で、同じ出来事だと分かるようにする */
const GROW = '#ffd27a';

/**
 * 成長の記録（REWORK 2-2）。右上に、直近の育ちを「何をしたら・何が増えた」で並べる。
 * 押すと、その建物へカメラが飛ぶ。
 */
export function GrowthRecord({ log, onPick }: Props) {
  return (
    <section
      data-testid="growth-record"
      aria-label="成長の記録"
      className="shrink-0 overflow-hidden rounded-lg"
      style={{ background: HUD.panelSoft, border: `1px solid ${HUD.lineStrong}`, backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${HUD.line}` }}>
        <span style={{ color: GROW }}>
          <Icon name="sparkle" size={14} strokeWidth={1.6} />
        </span>
        <span className="text-[12px]" style={{ color: HUD.soft }}>
          成長の記録
        </span>
      </div>
      {log.length === 0 ? (
        <p className="px-3 py-2 text-[12px]" style={{ color: HUD.muted }}>
          コマンドを通す・問いに正解する・任務を終えると、街が育ってここに残る。
        </p>
      ) : (
        <ol className="flex flex-col py-1">
          {log.map((mark, i) => (
            <li key={mark.key}>
              <button
                type="button"
                data-testid="growth-entry"
                data-building={mark.building}
                onClick={() => {
                  onPick(mark);
                }}
                title={`${mark.label}へ飛ぶ`}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-2 px-3 py-1 text-left text-[12px] leading-snug hover:bg-white/5"
                style={{ opacity: i === 0 ? 1 : 0.78 }}
              >
                <span className="min-w-0 truncate" style={{ color: HUD.soft }}>
                  {mark.cause}
                </span>
                <span className="font-bold" style={{ color: GROW }}>
                  {mark.gain}
                </span>
                <span className="col-span-2 truncate text-[11px]" style={{ color: HUD.dim }}>
                  {`→ ${mark.label}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

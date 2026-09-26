import type { Recap } from '@/engines/lesson/types';
import { HUD } from '@/features/park/hud/theme';
import { FlowSteps } from './FlowStage';

/** 振り返りに出す、任務を終えたときの結果 */
export interface RecapData {
  /** 表示のたびに変わる識別子 */
  key: number;
  title: string;
  score: number;
  xp: number;
  /** 手に入れた建築権（街に建物を置ける数） */
  rights: number;
  levelUp?: { level: number; rank: string } | undefined;
  /** 街の施設がどうなったか（「〇〇が建った」） */
  facility?: string | undefined;
  recap: Recap;
  /** 任務を始めたときの街の写真。撮れなかったら null */
  before: string | null;
  /** 終えたときの街の写真 */
  after: string | null;
}

interface Props {
  data: RecapData;
  nextLabel?: string | undefined;
  onNext?: (() => void) | undefined;
  onRetry: () => void;
  /** 閉じて街に戻る */
  onClose: () => void;
}

/**
 * 学びの流れの 5 段目「振り返り」。任務を終えたときの画面。
 *
 * 始める前と終えた後の街を左右に並べ、分かったことを 3 行でまとめる。
 * 獲得した経験値と建築権、次の任務への道をここで出す。
 */
export function RecapScreen({ data, nextLabel, onNext, onRetry, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="振り返り"
      data-testid="recap"
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgba(8,11,15,0.72)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="town-pointer flex max-h-full w-full max-w-[1040px] flex-col overflow-y-auto rounded-xl"
        style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, boxShadow: HUD.shadowStrong, color: HUD.text }}
      >
        <header
          className="flex items-center gap-4 rounded-t-xl px-6 py-4"
          style={{ background: 'linear-gradient(90deg, rgba(55,179,122,.22), rgba(47,143,216,0) 70%)', borderBottom: `1px solid ${HUD.line}` }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[12px]" style={{ color: HUD.okText }}>
              任務クリア
            </p>
            <p data-testid="recap-title" className="truncate text-[22px] font-bold" style={{ fontFamily: 'Overpass, "Noto Sans JP", sans-serif' }}>
              {data.title}
            </p>
          </div>
          <FlowSteps at="recap" />
        </header>

        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 px-6 pt-5">
          <Shot label="始める前" image={data.before} text={data.recap.before} testId="recap-before" />
          <div className="grid place-items-center" aria-hidden="true">
            <svg viewBox="0 0 32 20" width={32} height={20}>
              <path d="M2 10h24M20 3l8 7-8 7" fill="none" stroke={HUD.ok} strokeWidth={2.2} />
            </svg>
          </div>
          <Shot label="終えた後" image={data.after} text={data.recap.after} testId="recap-after" highlight />
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-5 px-6 py-5">
          <section>
            <p className="text-[12px]" style={{ color: HUD.muted }}>
              分かったこと
            </p>
            <ol data-testid="recap-lines" className="mt-2 space-y-2">
              {data.recap.lines.map((line, i) => (
                <li key={line} className="flex gap-2.5 text-[14px] leading-relaxed">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                    style={{ background: HUD.accentFill, color: HUD.accentText }}
                  >
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-2">
            <p className="text-[12px]" style={{ color: HUD.muted }}>
              手に入れたもの
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Reward label="経験値" value={`+${String(data.xp)}`} tone={HUD.warn} />
              <Reward label="建築権" value={`+${String(data.rights)}`} tone={HUD.accent} testId="recap-rights" />
            </div>
            <p className="text-[12.5px]" style={{ color: HUD.soft }}>
              {`点数 ${String(data.score)}`}
              {data.levelUp === undefined ? '' : ` ・ レベル ${String(data.levelUp.level)}（${data.levelUp.rank}）に上がった`}
            </p>
            {data.facility === undefined ? null : (
              <p className="text-[12.5px] leading-snug" style={{ color: HUD.okText }}>
                {data.facility}
              </p>
            )}
            <p className="text-[12px] leading-snug" style={{ color: HUD.muted }}>
              建築権は、下の建設メニューで街に建物を置くのに使える。
            </p>
          </section>
        </div>

        <footer className="flex items-center gap-2 rounded-b-xl px-6 py-4" style={{ borderTop: `1px solid ${HUD.line}`, background: HUD.fillSoft }}>
          <button
            type="button"
            data-testid="recap-retry"
            onClick={onRetry}
            className="h-10 rounded px-4 text-[13.5px]"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            もう一度この任務
          </button>
          <button
            type="button"
            data-testid="recap-close"
            onClick={onClose}
            className="h-10 rounded px-4 text-[13.5px]"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            街を眺める
          </button>
          {onNext === undefined ? null : (
            <button
              type="button"
              data-testid="recap-next"
              onClick={onNext}
              className="ml-auto h-10 max-w-[420px] truncate rounded px-5 text-[14px] font-bold"
              style={{ background: HUD.accentDeep, color: '#fff' }}
            >
              {`次の任務へ: ${nextLabel ?? ''}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Shot({ label, image, text, testId, highlight = false }: { label: string; image: string | null; text: string; testId: string; highlight?: boolean }) {
  return (
    <figure data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-[12px]" style={{ color: highlight ? HUD.okText : HUD.muted }}>
        {label}
      </figcaption>
      <div
        className="aspect-video overflow-hidden rounded-md"
        style={{ border: `1px solid ${highlight ? HUD.ok : HUD.lineStrong}`, background: '#10151c' }}
      >
        {image === null ? (
          <div className="grid h-full place-items-center px-4 text-center text-[12.5px]" style={{ color: HUD.dim }}>
            この回は写真を撮れなかった
          </div>
        ) : (
          <img src={image} alt={`${label}の街`} className="h-full w-full object-cover" />
        )}
      </div>
      <p className="text-[13px] leading-snug" style={{ color: highlight ? HUD.text : HUD.soft }}>
        {text}
      </p>
    </figure>
  );
}

function Reward({ label, value, tone, testId }: { label: string; value: string; tone: string; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-md px-3 py-2" style={{ background: HUD.fill }}>
      <p className="text-[11.5px]" style={{ color: HUD.muted }}>
        {label}
      </p>
      <p className="text-[22px] font-bold" style={{ color: tone, fontFamily: 'Overpass, sans-serif' }}>
        {value}
      </p>
    </div>
  );
}

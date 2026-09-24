import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { commandLabel } from './stepLabel';
import { HUD, SIZE } from './theme';

interface Props {
  mission: LessonDefinition;
  progress: LessonProgressState;
  /** いま条件を満たしているか。満たした瞬間に印が変わる */
  passingNow: boolean;
  /** 通らなかったときの助言。1 行だけ出す */
  diagnosis: string | null;
  /** 端末で hint と打つか、この札のヒントを押して開いた数 */
  revealedHints: number;
  reward: { xp: number; rights: number };
  onHint: () => void;
  onWhy: () => void;
}

/**
 * 課題の札。端末の右、上の帯の下に重なる。
 *
 * 見出し・2 行以内の説明・チェック項目・報酬・ヒント、それだけ。
 * 長い解説はここに書かず、「なぜ」から開く引き出しへ回す。
 */
export function TaskCard({ mission, progress, passingNow, diagnosis, revealedHints, reward, onHint, onWhy }: Props) {
  const t = useT();
  const total = mission.steps.length;
  const at = Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), total);
  const step = progress.cleared ? undefined : mission.steps[progress.stepIndex];
  const hints = (step?.hints ?? []).slice(0, revealedHints);

  return (
    <section
      data-testid="task-card"
      className="absolute z-20 overflow-hidden rounded-lg"
      style={{
        left: SIZE.dock + 16,
        top: SIZE.panelTop,
        width: SIZE.task,
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: 'linear-gradient(90deg, rgba(47,143,216,.25), rgba(47,143,216,0))',
          borderBottom: `1px solid ${HUD.line}`,
        }}
      >
        <Icon name="flag" size={16} />
        <span className="text-[12px]" style={{ color: HUD.accentText }}>
          {t('hud.task')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{mission.title}</span>
        <span className="shrink-0 text-[12px]" style={{ color: HUD.muted }} data-testid="task-progress">
          {t('hud.stepCount', { a: at, b: total })}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        {/* 説明は 2 行まで。溢れる分は「なぜ」の引き出しで読む */}
        <p data-testid="task-lead" className="line-clamp-2 text-[13px] leading-relaxed" style={{ color: HUD.soft }}>
          {mission.intro.summary}
        </p>

        <ul className="flex flex-col gap-1.5">
          {mission.steps.map((s, i) => {
            const done = progress.cleared || i < progress.stepIndex;
            const here = !progress.cleared && i === progress.stepIndex;
            const command = commandLabel(s.solution);
            return (
              <li key={`${String(i)}-${s.prompt}`} data-step={i} data-done={done ? 'true' : undefined} className="flex items-center gap-2 text-[13px]">
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded"
                  style={
                    done
                      ? { background: HUD.ok }
                      : { border: `1.5px solid ${here ? (passingNow ? HUD.ok : HUD.accent) : HUD.locked}` }
                  }
                >
                  {done ? <Icon name="check" size={11} strokeWidth={3} /> : null}
                </span>
                <span
                  className="min-w-0 flex-1 truncate"
                  style={done ? { color: HUD.okDone, textDecoration: 'line-through' } : here ? undefined : { color: HUD.muted }}
                >
                  {s.prompt}
                </span>
                {command === '' ? null : (
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: HUD.dim }}>
                    {command}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {diagnosis === null ? null : (
          <p data-testid="task-diagnosis" className="text-[12px] leading-relaxed" style={{ color: HUD.warn }}>
            {diagnosis}
          </p>
        )}

        {hints.length === 0 ? null : (
          <ul data-testid="task-hints" className="flex flex-col gap-1">
            {hints.map((hint, i) => (
              <li key={`${String(i)}-${hint}`} className="font-mono text-[12px] leading-relaxed" style={{ color: HUD.accentText }}>
                {hint}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderTop: `1px solid ${HUD.line}`, background: HUD.fillSoft }}
      >
        <span className="text-[12px]" style={{ color: HUD.muted }}>
          {t('hud.reward')}
        </span>
        <span className="text-[12px]" style={{ color: HUD.warn }}>
          {t('hud.rewardXp', { n: reward.xp })}
        </span>
        <span className="text-[12px]" style={{ color: HUD.accent }}>
          {t('hud.rewardRights', { n: reward.rights })}
        </span>
        <button
          type="button"
          data-testid="task-why"
          onClick={onWhy}
          className="ml-auto h-7 rounded px-2 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          {t('hud.why')}
        </button>
        <button
          type="button"
          data-testid="task-hint"
          onClick={onHint}
          className="h-7 rounded px-2.5 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.text }}
        >
          {t('hud.hint')}
        </button>
      </div>
    </section>
  );
}

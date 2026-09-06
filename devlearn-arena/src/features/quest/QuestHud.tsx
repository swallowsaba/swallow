import { motion } from 'framer-motion';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { Badge } from '@/ui/components/Badge';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  mission: LessonDefinition;
  progress: LessonProgressState;
}

/** 常時見える計器盤。HP・進行・手数をここに集約し、本文は下の1行だけにする。 */
export function QuestHud({ mission, progress }: Props) {
  const animate = useMotionEnabled();

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-2 border-line bg-panel px-6 py-4">
      <div className="flex items-center gap-3">
        <Badge tone={mission.kind === 'boss' ? 'warn' : 'accent'} size="sm">
          {mission.kind === 'boss' ? '★ ボス' : '任務'}
        </Badge>
        <span className="display text-2xl">{mission.title}</span>
      </div>

      <div className="flex items-center gap-2" role="img" aria-label={`残り HP ${String(progress.hp)}`}>
        <span className="font-mono text-sm uppercase tracking-[0.2em] text-muted">HP</span>
        {Array.from({ length: mission.maxHp }, (_, i) => {
          const alive = i < progress.hp;
          return (
            <motion.span
              key={i}
              aria-hidden
              animate={animate && !alive ? { opacity: [1, 0.2] } : {}}
              className={`h-5 w-5 ${alive ? 'bg-[var(--c-bad)]' : 'bg-line'}`}
              style={{ clipPath: 'polygon(50% 0, 100% 38%, 50% 100%, 0 38%)' }}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm uppercase tracking-[0.2em] text-muted">進行</span>
        {mission.steps.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-3 w-12 ${
              progress.cleared || i < progress.stepIndex
                ? 'bg-[var(--c-ok)]'
                : i === progress.stepIndex
                  ? 'bg-accent'
                  : 'bg-line'
            }`}
          />
        ))}
      </div>

      <span className="ml-auto font-mono text-sm text-muted">
        手数 {progress.commandsUsed} / 目安 {mission.parCommands}
      </span>
    </div>
  );
}

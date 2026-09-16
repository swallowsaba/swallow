import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Sparkle } from '@/visual/game/scenery';
import { FloorBuilding } from '@/visual/game/townArt';
import { FLOOR_H } from '@/visual/game/townStyle';

interface Props {
  mission: LessonDefinition;
  progress: LessonProgressState;
}

/**
 * 任務の建設現場。工程（手順）を 1 つ通すたびに建物が 1 階ずつ建ち、全部通すと屋根が載って完成する。
 * いま何階目を建てているのかが、端末の作業と並んでいつも見える。
 */
export function ConstructionSite({ mission, progress }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const floors = mission.steps.length;
  const built = progress.cleared ? floors : Math.min(progress.stepIndex, floors);
  const height = floors * FLOOR_H + 64;
  return (
    <figure
      className="flex shrink-0 flex-col items-center"
      aria-label={t('site.label')}
      data-testid="construction-site"
      data-built={built}
      data-floors={floors}
    >
      <svg width={110} height={height} viewBox={`0 0 110 ${String(height)}`} aria-hidden>
        <rect width={110} height={height} fill="#bfe3f5" />
        <rect x={0} y={height - 12} width={110} height={12} fill="#77b356" />
        <FloorBuilding
          track={mission.track}
          x={25}
          y={height - 18}
          w={60}
          floors={floors}
          built={built}
          landmark={mission.kind === 'boss'}
          animate={animate}
          working={!progress.cleared}
        />
        {progress.cleared ? <Sparkle x={86} y={24} animate={animate} /> : null}
      </svg>
      <figcaption className="mt-1 text-center font-mono text-xs font-bold">
        {progress.cleared ? t('site.done') : t('site.progress', { a: built, b: floors })}
      </figcaption>
    </figure>
  );
}

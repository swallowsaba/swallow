import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Chapter } from '@/content/types';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  chapters: readonly Chapter[];
  clearedLessonIds: ReadonlySet<string>;
}

/** 章を進行順のウェイポイントとして一本のレール上に並べる。 */
export function ChapterRail({ chapters, clearedLessonIds }: Props) {
  const animate = useMotionEnabled();
  return (
    <ol className="flex items-stretch gap-0 overflow-x-auto pb-2">
      {chapters.map((ch, i) => {
        const total = ch.lessons.length;
        const done = ch.lessons.filter((l) => clearedLessonIds.has(l.id)).length;
        const complete = total > 0 && done === total;
        return (
          <li key={ch.id} className="flex min-w-[132px] flex-1 flex-col gap-2">
            <div className="flex items-center">
              <span className={`rail flex-1 ${i === 0 ? 'opacity-0' : ''} ${complete ? 'rail--done' : ''}`} />
              <motion.span
                initial={animate ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: animate ? i * 0.03 : 0, duration: 0.25 }}
                aria-hidden
                className={`grid h-7 w-7 place-items-center border font-mono text-xs ${
                  complete ? 'border-accent text-accent' : 'border-line text-muted'
                }`}
              >
                {ch.no}
              </motion.span>
              <span className={`rail flex-1 ${i === chapters.length - 1 ? 'opacity-0' : ''}`} />
            </div>
            <Link
              to={`/track/${ch.trackId}#${ch.id.replace('/', '-')}`}
              className="px-1 text-center text-xs leading-snug text-muted hover:text-ink"
            >
              {ch.title}
              <span className="mt-1 block font-mono text-[11px] text-muted/70">
                {done}/{total}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

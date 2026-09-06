import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Chapter } from '@/content/types';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  chapter: Chapter;
  index: number;
  clearedLessonIds: ReadonlySet<string>;
}

/** 章1つ = 大きな番号プレート。押せる面積を大きく取る。 */
export function ChapterTile({ chapter, index, clearedLessonIds }: Props) {
  const animate = useMotionEnabled();
  const total = chapter.lessons.length;
  const done = chapter.lessons.filter((l) => clearedLessonIds.has(l.id)).length;
  const complete = total > 0 && done === total;
  const bossCount = chapter.lessons.filter((l) => l.kind === 'boss').length;
  // まだエンジンが無い章は「準備中」。押せば目次は読める
  const locked = chapter.lessons.every((l) => l.status === 'planned') && done === 0;

  return (
    <motion.div
      initial={animate ? { opacity: 0, scale: 0.94 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: animate ? index * 0.02 : 0, duration: 0.25 }}
    >
      <Link
        to={`/track/${chapter.trackId}#${chapter.id.replace('/', '-')}`}
        className={`cut flex h-full flex-col gap-2 border bg-panel p-5 transition-all hover:bg-raised ${
          complete ? 'border-accent glow' : 'border-line hover:border-accent'
        } ${locked ? 'opacity-55' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={`display text-3xl ${complete ? 'text-accent' : 'text-muted'}`}>
            {String(chapter.no).padStart(2, '0')}
          </span>
          <span className="font-mono text-sm text-muted">
            {done}/{total}
          </span>
        </div>
        <p className="text-base font-medium leading-snug text-ink">{chapter.title}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {bossCount > 0 ? (
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--c-warn)]">
              ★ BOSS ×{bossCount}
            </span>
          ) : (
            <span />
          )}
          {locked ? <span className="font-mono text-xs text-muted">🔒 準備中</span> : null}
        </div>
      </Link>
    </motion.div>
  );
}

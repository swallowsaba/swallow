import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from './motion';

export interface CelebrationData {
  /** 表示のたびに変わる識別子。同じ内容を再表示するため */
  key: number;
  title: string;
  subtitle: string;
  xp: number;
  levelUp?: { level: number; rank: string } | undefined;
  /** ここまでで分かったこと（3行） */
  takeaways?: readonly string[] | undefined;
}

interface Props {
  data: CelebrationData | null;
  onDismiss: () => void;
  /** 次の任務へ進む導線。無ければ表示しない */
  nextLabel?: string | undefined;
  onNext?: (() => void) | undefined;
}

/** ミッション達成の全画面演出。クリックか3秒で閉じる。 */
export function Celebration({ data, onDismiss, nextLabel, onNext }: Props) {
  const t = useT();
  const animate = useMotionEnabled();

  return (
    <AnimatePresence>
      {data ? (
        <motion.div
          key={data.key}
          role="status"
          aria-live="assertive"
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onDismiss}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--wood-dark)]/85 p-6"
        >
          <motion.div
            initial={animate ? { scale: 0.8, y: 24 } : false}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="bevel border-4 border-[var(--ok)] bg-cream px-12 py-10 text-center"
            style={{ ['--c-accent' as string]: 'var(--ok)' }}
          >
            <p className="title text-6xl text-[var(--ok)] lg:text-8xl">{data.title}</p>
            <p className="mt-4 text-xl text-ink">{data.subtitle}</p>

            <motion.p
              initial={animate ? { scale: 0.6, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
              className="title mt-8 text-5xl text-[var(--warn)]"
            >
              +{data.xp} XP
            </motion.p>

            {data.levelUp ? (
              <motion.p
                initial={animate ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="title mt-6 text-3xl text-[var(--gold-dark)]"
              >
                LEVEL {data.levelUp.level} — {data.levelUp.rank}
              </motion.p>
            ) : null}

            {data.takeaways && data.takeaways.length > 0 ? (
              <div className="mx-auto mt-6 max-w-xl text-left">
                <p className="text-sm font-extrabold text-ink-soft">{t('takeaways.title')}</p>
                <ol className="mt-1 flex list-decimal flex-col gap-1 pl-6 text-base leading-snug text-ink">
                  {data.takeaways.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {nextLabel !== undefined && onNext ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                className="sign mt-8 px-8 py-4 text-xl font-extrabold"
              >
                {t('celebration.next', { title: nextLabel })}
              </button>
            ) : null}

            <p className="mt-6 font-mono text-sm text-ink-soft">{t('celebration.dismiss')}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

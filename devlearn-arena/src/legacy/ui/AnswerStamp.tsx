import { motion } from 'framer-motion';
import { useT } from '@/i18n/useT';

/**
 * 正解したときに押される判子。
 * 合っていたことを一目で分かるようにして、問題に答える手応えを作る。
 */
export function AnswerStamp({ animate, label }: { animate: boolean; label?: string }) {
  const t = useT();
  return (
    <motion.span
      data-testid="answer-stamp"
      aria-hidden
      initial={animate ? { scale: 2.4, opacity: 0, rotate: -28 } : false}
      animate={{ scale: 1, opacity: 1, rotate: -12 }}
      transition={{ type: 'spring', stiffness: 320, damping: 16 }}
      className="pointer-events-none select-none border-4 border-[var(--bad)] px-3 py-1 text-xl font-black tracking-widest text-[var(--bad)]"
      style={{ boxShadow: 'inset 0 0 0 2px rgba(224,72,58,0.35)' }}
    >
      {label ?? t('quiz.stampOk')}
    </motion.span>
  );
}

/** 連続正解の数。続くほど大きく出る */
export function Streak({ count, animate }: { count: number; animate: boolean }) {
  const t = useT();
  if (count < 2) return null;
  return (
    <motion.span
      data-testid="quiz-streak"
      data-count={count}
      initial={animate ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      className="ui-chip ui-chip-accent"
    >
      {t('quiz.streak', { n: count })}
    </motion.span>
  );
}

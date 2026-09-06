import { motion } from 'framer-motion';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  onRetry: () => void;
}

/** HP が尽きたとき。責めずに、原因の振り返りへ促す。 */
export function DefeatOverlay({ onRetry }: Props) {
  const animate = useMotionEnabled();
  return (
    <motion.div
      role="alertdialog"
      aria-label="撤退"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 p-6"
    >
      <motion.div
        initial={animate ? { scale: 0.85, y: 20 } : false}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        className="cut border-4 border-[var(--c-bad)] bg-panel px-12 py-10 text-center"
      >
        <p className="display text-6xl text-[var(--c-bad)]">RETREAT</p>
        <p className="mt-4 text-xl">コマンドの失敗が重なり、撤退しました。</p>
        <p className="mt-2 max-w-md text-base text-muted">
          失敗したコマンドのエラーメッセージには、たいてい原因がそのまま書かれています。
          時間を巻き戻して、どこで何が起きたか見てから挑み直してください。
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-8 border-2 border-accent px-8 py-4 text-xl font-bold text-accent transition-colors hover:bg-accent hover:text-void"
        >
          もう一度挑む
        </button>
      </motion.div>
    </motion.div>
  );
}

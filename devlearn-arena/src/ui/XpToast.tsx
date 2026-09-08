import { AnimatePresence, motion } from 'framer-motion';
import { useMotionEnabled } from './motion';

export interface ToastData {
  key: number;
  text: string;
}

interface Props {
  toasts: readonly ToastData[];
}

/** 手順達成などの小さな見返り。右上に浮かんで消える。 */
export function XpToast({ toasts }: Props) {
  const animate = useMotionEnabled();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-6 top-24 z-40 flex flex-col items-end gap-2"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.key}
            initial={animate ? { opacity: 0, x: 30, scale: 0.9 } : false}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="border-2 border-[var(--ok)] bg-cream px-5 py-3 font-mono text-lg font-bold text-[var(--ok)]"
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { HUD } from '@/features/park/hud/theme';

/** 断られた所を赤く揺らす。`shake` が変わるたびに 1 回揺れる */
export function Shake({ shake, children, className, style }: { shake: number | null; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      key={shake ?? 'still'}
      className={className}
      style={style}
      animate={shake === null ? undefined : { x: [0, -6, 6, -4, 4, 0] }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
}

/** 回る歯車。監督や kubelet が働いている間だけ回す（光と同じく、動きは意味を運ぶ） */
export function Gear({ spinning, size = 18 }: { spinning: boolean; size?: number }) {
  return (
    <motion.svg
      data-testid="playground-gear"
      data-spinning={spinning ? 'true' : undefined}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { repeat: Infinity, duration: 1.4, ease: 'linear' } : { duration: 0.3 }}
      style={{ color: spinning ? HUD.accent : HUD.dim }}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm7.4 3.5.9-1.9-1.8-3.1-2.1.2-1.3-1.1-.6-2.1h-3.6l-.6 2.1-1.3 1.1-2.1-.2-1.8 3.1.9 1.9-.9 1.9 1.8 3.1 2.1-.2 1.3 1.1.6 2.1h3.6l.6-2.1 1.3-1.1 2.1.2 1.8-3.1Z"
      />
    </motion.svg>
  );
}

/** 小さなボタン。図の中の操作に使う */
export function MiniButton({ onClick, children, testId, disabled, tone = 'accent' }: {
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
  tone?: 'accent' | 'plain';
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="h-7 rounded px-2 text-[12px] disabled:opacity-40"
      style={{
        border: `1px solid ${tone === 'accent' ? HUD.accentEdge : HUD.lineStrong}`,
        color: tone === 'accent' ? HUD.accentText : HUD.soft,
        background: tone === 'accent' ? HUD.accentFill : HUD.fill,
      }}
    >
      {children}
    </button>
  );
}

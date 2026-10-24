import { useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons/Icon';
import { smallWindowRight } from './smallWindowPlace';
import './SmallWindow.css';

/**
 * 都市の上に重ねる小さな窓（docs/ui-design.md 10.0）。幅 400、高さは内容に応じて最大 60%。
 * 右端から左へ、ずらして重ねる（情報パネルがある時は、その左に出る）。見出しを掴んで動かせ、畳むと見出しだけになる。
 * 後ろの都市は見えたままで、都市の時間は止めない。
 */
export function SmallWindow({
  testId, icon, title, stack, shifted, onClose, onFront, children,
}: {
  testId: string;
  icon: IconName;
  title: string;
  /** 重ねた順（0 が一番奥）。ずらす量に使う */
  stack: number;
  /** 情報パネルが開いている（その左に出す） */
  shifted: boolean;
  onClose: () => void;
  /** 触ったら一番上へ */
  onFront?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const right = smallWindowRight(stack, shifted);
  const top = 62 + stack * 28;
  return (
    <section
      className={`small-window${collapsed ? ' is-collapsed' : ''}`}
      data-testid={testId}
      data-label-block
      role="dialog"
      aria-labelledby={`${testId}-title`}
      style={{ right: right - offset.x, top: top + offset.y, zIndex: 12 + stack }}
      onPointerDown={() => onFront?.()}
    >
      <header
        className="small-window-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + e.clientX - d.x, y: Math.max(-top + 52, d.oy + e.clientY - d.y) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className="small-window-icon"><Icon name={icon} size={18} /></span>
        <h2 id={`${testId}-title`} className="small-window-title">{title}</h2>
        <button type="button" className="small-window-button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? '広げる' : '畳む'} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'down' : 'collapse'} size={16} />
        </button>
        <button type="button" className="small-window-button" data-testid={`${testId}-close`} onClick={onClose} title="閉じる（Esc）" aria-label="閉じる">
          <Icon name="close" size={16} />
        </button>
      </header>
      {collapsed ? null : <div className="small-window-body">{children}</div>}
    </section>
  );
}

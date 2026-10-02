import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './icons/Icon';
import './Window.css';

/**
 * 都市の上に重ねる大きな窓（docs/ui-design.md 2・6 章: 学習ライブラリ・知識グラフ・成長画面・用語集）。
 * 画面の 80% ほどで、後ろに都市が見える。Esc と「都市へ戻る」で都市に戻る（どの画面からも 1 回の操作）。
 */
export function HudWindow({
  testId, icon, title, sub, onClose, tools, children, className = '', focusClose = true,
}: {
  testId: string;
  icon: IconName;
  title: string;
  sub?: string;
  onClose: () => void;
  /** 見出しの帯の右に置く操作（表示の切り替えなど） */
  tools?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 開いた時に「都市へ戻る」に焦点を置く（中の部品が焦点を取る時は false） */
  focusClose?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (focusClose) closeRef.current?.focus();
    // 開いた時だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="window-backdrop" data-testid={testId}>
      <section className={`window ${className}`} role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`}>
        <header className="window-head">
          <span className="window-head-icon"><Icon name={icon} size={22} /></span>
          <h1 id={`${testId}-title`} className="window-title">{title}</h1>
          {sub ? <p className="window-sub">{sub}</p> : <span className="window-sub" />}
          {tools}
          <button ref={closeRef} type="button" className="window-close" onClick={onClose} title="都市へ戻る（Esc）">
            <Icon name="close" size={16} />
            <span>都市へ戻る</span>
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

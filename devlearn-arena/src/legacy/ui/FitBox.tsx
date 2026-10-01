import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 枠に収まるように中身を縮める箱。
 *
 * 説明や問題の途中で画面を送らせない（送ると、いま何を読むべきかを見失う）ため、
 * 中身が枠より高いときは字ごと縮めて、必ず全部が一度に見えるようにする。
 * 縮めても足りないときだけ、下端を切らずに最小の倍率で止める。
 */
export function FitBox({
  children,
  /** これ以上は縮めない倍率 */
  min = 0.5,
  className = '',
  testId,
}: {
  children: ReactNode;
  min?: number;
  className?: string;
  testId?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const fit = useCallback(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const avail = host.clientHeight;
    // 中身は transform で縮めるだけなので、ここで測る高さはいつも等倍のまま
    const need = inner.offsetHeight;
    if (avail <= 0 || need <= 0) return;
    const next = Math.min(1, Math.max(min, avail / need));
    // 端数で行ったり来たりしないように、少しの差は無視する
    setScale((now) => (Math.abs(now - next) < 0.005 ? now : next));
  }, [min]);

  useLayoutEffect(fit);

  useEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    observer.observe(inner);
    return () => {
      observer.disconnect();
    };
  }, [fit]);

  return (
    <div ref={hostRef} data-testid={testId} data-fit={scale < 1 ? 'shrunk' : 'full'} className={`min-h-0 overflow-hidden ${className}`}>
      <div
        ref={innerRef}
        style={{ transform: scale < 1 ? `scale(${String(scale)})` : undefined, transformOrigin: 'top center' }}
      >
        {children}
      </div>
    </div>
  );
}

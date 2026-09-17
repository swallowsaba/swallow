import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 「戻る / 次へ」を、文章の量にかかわらず同じ場所に出すための操作帯。
 * 置き場（useFooterSlot の ref を付けた要素）をスクロール枠の下端に貼り付け、中身は各段から portal で差し込む。
 * 左・真ん中・右の幅を固定し、ボタンが横にもずれないようにする。
 */
export function FooterBar({ slot, left, center, right }: { slot: HTMLElement | null; left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  if (slot === null) return null;
  return createPortal(
    <div data-testid="footer-bar" className="grid grid-cols-[7rem_1fr_minmax(11rem,auto)] items-center gap-2">
      <div className="flex justify-start">{left}</div>
      <div className="flex min-w-0 justify-center">{center}</div>
      <div className="flex justify-end">{right}</div>
    </div>,
    slot,
  );
}

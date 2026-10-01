import { useCallback, useState } from 'react';

/** 操作帯の置き場。ref を付けた要素に、FooterBar の中身が差し込まれる */
export function useFooterSlot(): { slot: HTMLElement | null; ref: (el: HTMLElement | null) => void } {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    setSlot(el);
  }, []);
  return { slot, ref };
}

export const FOOTER_SLOT_CLASS =
  'sticky bottom-0 z-10 mt-auto border-t border-[var(--u-line,#e8e5e0)] bg-[var(--u-card,#fff)] px-4 py-2.5';


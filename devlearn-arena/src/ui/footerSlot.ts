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
  'sticky bottom-0 z-10 mt-auto border-t-4 border-wood-dark bg-[var(--cream)] px-3 py-2 shadow-[0_-4px_8px_rgba(0,0,0,0.08)]';


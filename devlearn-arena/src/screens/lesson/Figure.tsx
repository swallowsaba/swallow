import { useEffect, useRef } from 'react';
import { figureOf, figureTitle } from '@/content/figures';

/**
 * レッスンの図（content/figures/<ID>.svg）。図は作る側のデータで、SVG の文字のまま埋め込む。
 *
 * onPick を渡すと、図の部分（data-part を持つ要素）を押せるようにする（理解の「図の一部を押す」）。
 * 部分はキーボードでも選べる（Tab で移り、Enter か Space で押す）。picked の部分と marks の部分に印を付ける。
 */
export function Figure({ id, onPick, picked = [], marks = {} }: {
  id: string;
  onPick?: ((part: string) => void) | undefined;
  picked?: readonly string[];
  /** 部分ごとの印（正しい・違う） */
  marks?: Readonly<Record<string, 'ok' | 'bad'>>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svg = figureOf(id);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // 押せる部分にする（焦点・役目・名前）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const n of el.querySelectorAll<SVGElement>('[data-part]')) {
      if (onPick) {
        n.setAttribute('tabindex', '0');
        n.setAttribute('role', 'button');
        n.setAttribute('aria-label', (n.textContent ?? '').trim() || (n.dataset.part ?? ''));
      } else {
        n.removeAttribute('tabindex');
        n.removeAttribute('role');
      }
    }
  }, [svg, onPick]);

  // 印を付ける
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const n of el.querySelectorAll<SVGElement>('[data-part]')) {
      const part = n.dataset.part ?? '';
      n.classList.toggle('is-picked', picked.includes(part));
      n.classList.toggle('is-ok', marks[part] === 'ok');
      n.classList.toggle('is-bad', marks[part] === 'bad');
    }
  }, [svg, picked, marks]);

  if (!svg) return null;
  const partOf = (t: EventTarget | null): string | null => (t instanceof Element ? (t.closest<SVGElement>('[data-part]')?.dataset.part ?? null) : null);
  return (
    <figure className={`lesson-figure${onPick ? ' is-pickable' : ''}`} data-testid="lesson-figure" data-figure={id}>
      <div
        ref={ref}
        className="lesson-figure-art"
        onClick={(e) => {
          const part = partOf(e.target);
          if (part) pickRef.current?.(part);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const part = partOf(e.target);
          if (!part) return;
          e.preventDefault();
          pickRef.current?.(part);
        }}
        // 図は作る側のデータ（content/figures）で、検証を通った物だけを置く
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="lesson-figure-caption">{figureTitle(id)}</figcaption>
    </figure>
  );
}

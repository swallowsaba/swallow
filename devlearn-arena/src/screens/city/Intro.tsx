import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Icon } from '@/ui/icons/Icon';
import type { Session } from '../session';
import { INTRO_STEPS } from './introSteps';
import './Intro.css';

/**
 * 初回の操作説明（docs/ui-design.md 9 章: 都市の作り方と学び方を、画面の該当箇所を示しながら 3 回に分けて説明する。いつでも飛ばせる）。
 * 初めて遊ぶ市長にだけ出す。見終えた・飛ばしたことは市長の記録（introSeen）に残し、次からは出さない。
 * Enter で次へ、Esc で飛ばす。
 */

type Rect = { left: number; top: number; width: number; height: number };

function rectsOf(selectors: readonly string[]): Rect[] {
  return selectors.flatMap((s) => [...document.querySelectorAll(s)]).map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** 説明の札の位置: 示す所の下に入れば下、入らなければ上。横は画面に収める */
function placeCallout(target: Rect | undefined): { left: number; top?: number; bottom?: number } {
  const W = 420;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!target) return { left: Math.max(16, (vw - W) / 2), top: Math.round(vh * 0.3) };
  const left = Math.min(Math.max(16, target.left), Math.max(16, vw - W - 16));
  return target.top + target.height + 260 < vh ? { left, top: target.top + target.height + 14 } : { left, bottom: vh - target.top + 14 };
}

export function Intro({ session }: { session: Session }) {
  const seen = useStore(session.player, (s) => s.player.introSeen);
  const [step, setStep] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const current = INTRO_STEPS[step];
  const last = step === INTRO_STEPS.length - 1;
  const done = (): void => session.player.getState().set({ introSeen: true });
  const next = (): void => (last ? done() : setStep(step + 1));

  useLayoutEffect(() => {
    if (seen || !current) return;
    const measure = (): void => setRects(rectsOf(current.targets));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [seen, current]);

  useEffect(() => {
    if (seen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        next();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done();
      }
    };
    // 都市の操作（Esc で道具を外すなど）より先に受ける
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  if (seen || !current) return null;
  const at = placeCallout(rects[0]);
  return (
    <div className="intro" data-testid="intro" data-step={step + 1}>
      {rects.map((r, i) => (
        <span key={i} className="intro-mark" style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }} />
      ))}
      <section className="intro-card" role="dialog" aria-labelledby="intro-title" style={at}>
        <p className="intro-count num">{step + 1} / {INTRO_STEPS.length}</p>
        <h2 id="intro-title" className="intro-title">{current.title}</h2>
        {current.lines.map((line) => <p key={line} className="intro-line">{line}</p>)}
        <div className="intro-actions">
          <button type="button" className="intro-skip" onClick={done}>飛ばす<kbd>Esc</kbd></button>
          <button type="button" className="intro-next" onClick={next} autoFocus>
            {last ? '始める' : '次へ'}
            <kbd>Enter</kbd>
            <Icon name="start" size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

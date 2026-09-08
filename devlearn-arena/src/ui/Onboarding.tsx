import { useCallback, useEffect, useRef } from 'react';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { flushSave } from '@/store/persistence';

/**
 * 初回だけ出る案内。
 *
 * 読み終えたかどうかは保存データに持つので、リロードしても二度と出ない。
 * 逃げ道（Esc と閉じるボタン）を必ず用意し、開いている間は中に焦点を閉じ込める。
 */
export function Onboarding() {
  const t = useT();
  const onboarded = useStore((s) => s.profile.onboarded);
  const hydrated = useStore((s) => s.hydrated);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 閉じた直後にリロードされても二度と出ないよう、その場で書き込む
  const complete = useCallback(() => {
    completeOnboarding();
    flushSave();
  }, [completeOnboarding]);

  const open = hydrated && !onboarded;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        complete();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
      if (focusable === undefined || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, complete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(44,29,16,0.6)] p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="max-w-2xl border-4 border-wood-dark bg-cream p-6 shadow-lg"
      >
        <h2 id="onboarding-title" className="title text-3xl">
          {t('onboarding.title')}
        </h2>
        <div id="onboarding-body" className="mt-4 flex flex-col gap-3 text-base leading-relaxed">
          <p>{t('onboarding.lead')}</p>
          <ol className="flex list-decimal flex-col gap-2 pl-6">
            <li>{t('onboarding.step1')}</li>
            <li>{t('onboarding.step2')}</li>
            <li>{t('onboarding.step3')}</li>
          </ol>
          <p className="text-ink-soft">{t('onboarding.note')}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={complete}
            className="border-2 border-wood-dark bg-[var(--gold)] px-5 py-2 font-mono text-base font-bold text-ink hover:bg-[var(--gold-dark)]"
          >
            {t('onboarding.start')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useT } from '@/i18n/useT';

interface Props {
  /** まだ終えていない前提の任務 */
  prerequisites: readonly { id: string; title: string }[];
  onSwitch: (id: string) => void;
}

/**
 * 「先に〇〇をやりましょう」。
 * 止めはしない。このまま進めてもよいし、押せば前提の任務に移れる。
 */
export function PrerequisiteNote({ prerequisites, onSwitch }: Props) {
  const t = useT();
  const first = prerequisites[0];
  if (first === undefined) return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-2 border-l-4 border-[var(--warn)] bg-[var(--cream-dark)] px-3 py-2 text-sm">
      <span>{t('prereq.first', { title: first.title })}</span>
      <button
        type="button"
        className="knob px-2 py-0.5 text-xs"
        onClick={() => {
          onSwitch(first.id);
        }}
      >
        {t('prereq.go')}
      </button>
      <span className="text-xs text-ink-soft">{t('prereq.canContinue')}</span>
    </div>
  );
}

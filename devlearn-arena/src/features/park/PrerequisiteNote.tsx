import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';

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
    <div role="note" className="ui-note ui-note-warn flex flex-wrap items-center gap-2">
      <Icon name="idea" size={15} />
      <span className="min-w-0 flex-1">{t('prereq.first', { title: first.title })}</span>
      <button
        type="button"
        className="ui-btn ui-btn-quiet h-7 px-2.5 text-xs"
        onClick={() => {
          onSwitch(first.id);
        }}
      >
        {t('prereq.go')}
      </button>
      <span className="text-[11px] opacity-75">{t('prereq.canContinue')}</span>
    </div>
  );
}

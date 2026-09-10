import { useT } from '@/i18n/useT';

export interface PartState {
  label: string;
  passing: boolean;
  howTo?: string | undefined;
}

interface Props {
  /** 通過条件の内訳。無ければ check の一文だけを見せる */
  parts: readonly PartState[];
  /** 内訳が無いときに見せる一文 */
  fallback: string;
  passingNow: boolean;
}

/**
 * いまどこまで満たせているかを一覧で見せる。
 *
 * 「正しそうなコマンドを打ったのに通らない」ときに、
 * 何が足りないのかを自分で確かめられるようにするためのもの。
 */
export function StepChecklist({ parts, fallback, passingNow }: Props) {
  const t = useT();

  if (parts.length === 0) {
    return (
      <p
        className={`mt-2 border-l-4 px-3 py-1.5 text-sm ${
          passingNow ? 'border-[var(--ok)] bg-[var(--ok)]/15' : 'border-[var(--cream-dark)] text-ink-soft'
        }`}
      >
        <span className="font-bold">{passingNow ? t('park.passing') : t('park.notPassing')} </span>
        {fallback}
      </p>
    );
  }

  const done = parts.filter((p) => p.passing).length;
  return (
    <div className="mt-2 border-l-4 border-[var(--cream-dark)] px-3 py-1.5">
      <p className="text-sm font-bold text-ink-soft">
        {t('park.conditions', { a: done, b: parts.length })}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {parts.map((part) => (
          <li key={part.label} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border-2 border-wood-dark text-xs font-extrabold ${
                part.passing ? 'bg-[var(--ok)] text-ink' : 'bg-white text-ink-soft'
              }`}
            >
              {part.passing ? '✓' : ''}
            </span>
            <span className={part.passing ? 'text-ink' : 'text-ink-soft'}>
              <span className="sr-only">
                {part.passing ? t('park.partDone') : t('park.partPending')}:{' '}
              </span>
              {part.label}
              {!part.passing && part.howTo !== undefined ? (
                <span className="block text-xs text-ink-soft">{part.howTo}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

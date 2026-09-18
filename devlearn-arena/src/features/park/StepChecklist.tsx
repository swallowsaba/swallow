import { useT } from '@/i18n/useT';
import { Glossed } from '@/ui/Term';
import { Icon } from '@/ui/Icon';

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
      <p className={`ui-note mt-2 ${passingNow ? 'ui-note-ok' : 'bg-[var(--u-sunk)] text-[var(--u-text-2)]'}`}>
        <span className="font-bold">{passingNow ? t('park.passing') : t('park.notPassing')} </span>
        <Glossed text={fallback} />
      </p>
    );
  }

  const done = parts.filter((p) => p.passing).length;
  return (
    <div className="ui-flat mt-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="ui-eyebrow">{t('park.conditions', { a: done, b: parts.length })}</p>
        <div className="ui-track min-w-0 flex-1">
          <span style={{ width: `${((done / Math.max(1, parts.length)) * 100).toFixed(0)}%` }} />
        </div>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {parts.map((part) => (
          <li key={part.label} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${
                part.passing ? 'border-[var(--u-ok)] bg-[var(--u-ok)] text-white' : 'border-[var(--u-line-strong)] bg-[var(--u-card)]'
              }`}
            >
              {part.passing ? <Icon name="check" size={11} strokeWidth={3} /> : null}
            </span>
            <span className={part.passing ? '' : 'text-[var(--u-text-2)]'}>
              <span className="sr-only">
                {part.passing ? t('park.partDone') : t('park.partPending')}:{' '}
              </span>
              <Glossed text={part.label} />
              {!part.passing && part.howTo !== undefined ? (
                <span className="block text-[11px] text-[var(--u-text-3)]">{part.howTo}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

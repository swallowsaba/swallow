import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';

interface Props {
  /** 直前のコマンドが失敗していれば、その出力 */
  lastError: string | null;
}

/**
 * 手が止まったときの助け舟。
 *
 * 直前のコマンドが失敗していたら、まずそれを見せる。
 * 「打ったつもりが実は失敗していた」がいちばん多い迷い方なので、
 * 判定の話をする前にそこを潰す。
 */
export function Assist({ lastError }: Props) {
  const t = useT();
  if (lastError === null) return null;

  return (
    <div className="ui-note ui-note-bad mt-3">
      <p className="flex items-center gap-1.5 font-bold">
        <Icon name="alert" size={15} strokeWidth={2.2} />
        {t('park.lastFailed')}
      </p>
      <pre className="mt-1.5 overflow-hidden whitespace-pre-wrap rounded-md bg-[#12131a] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-[#ffd7d2]">
        {lastError.trimEnd()}
      </pre>
      <p className="mt-1.5 text-[12px] opacity-80">{t('park.lastFailedLead')}</p>
    </div>
  );
}

import { useT } from '@/i18n/useT';

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
    <div className="mt-3 border-l-4 border-[var(--bad)] bg-[var(--bad)]/10 px-3 py-2">
      <p className="text-sm font-bold">{t('park.lastFailed')}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-ink">
        {lastError.trimEnd()}
      </pre>
      <p className="mt-1 text-xs text-ink-soft">{t('park.lastFailedLead')}</p>
    </div>
  );
}

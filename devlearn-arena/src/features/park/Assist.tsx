import { useT } from '@/i18n/useT';

interface Props {
  /** 直前のコマンドが失敗していれば、その出力 */
  lastError: string | null;
  /** いまの手順で通らなかった回数 */
  attempts: number;
  /** 次にヒントが開くまでの回数 */
  untilNextHint: number;
  /** 見せてよい答え。詰まりきったときだけ入る */
  answer: string | null;
  onInsert: (text: string) => void;
}

/**
 * 手が止まったときの助け舟。
 *
 * 直前のコマンドが失敗していたら、まずそれを見せる。
 * 「打ったつもりが実は失敗していた」がいちばん多い迷い方なので、
 * 判定の話をする前にそこを潰す。
 */
export function Assist({ lastError, attempts, untilNextHint, answer, onInsert }: Props) {
  const t = useT();
  if (lastError === null && answer === null && attempts < 2) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {lastError !== null ? (
        <div className="border-l-4 border-[var(--bad)] bg-[var(--bad)]/10 px-3 py-2">
          <p className="text-sm font-bold">{t('park.lastFailed')}</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-ink">
            {lastError.trimEnd()}
          </pre>
          <p className="mt-1 text-xs text-ink-soft">{t('park.lastFailedLead')}</p>
        </div>
      ) : null}

      {answer !== null ? (
        <div className="border-l-4 border-[var(--warn)] bg-[var(--gold)]/25 px-3 py-2">
          <p className="text-sm font-bold">{t('park.answerTitle')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="overflow-x-auto font-mono text-sm">{answer}</code>
            <button
              type="button"
              onClick={() => {
                onInsert(answer);
              }}
              className="knob px-3 py-1 text-xs font-bold"
            >
              {t('park.answerInsert')}
            </button>
          </div>
        </div>
      ) : attempts >= 2 ? (
        <p className="text-xs text-ink-soft">{t('park.nextHintIn', { n: untilNextHint })}</p>
      ) : null}
    </div>
  );
}

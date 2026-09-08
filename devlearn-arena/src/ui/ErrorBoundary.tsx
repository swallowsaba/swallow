import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '@/i18n';
import { useStore } from '@/store';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string;
}

/**
 * 描画中の例外でアプリ全体が消えるのを防ぐ。
 * 学習中に手が止まらないよう、原因と復帰手段を画面に出す。
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 本番でも原因を追えるようにコンソールには必ず残す
    console.error('[DevLearn Arena] 描画中に例外が発生しました', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  override render(): ReactNode {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    // フック無しでも訳を引けるよう、ストアから直接読む
    const locale = useStore.getState().settings.locale;
    const t = (key: Parameters<typeof translate>[1]): string => translate(locale, key);

    return (
      <div role="alert" className="mx-auto max-w-2xl border border-[var(--bad)] bg-cream p-5">
        <h1 className="text-lg font-semibold text-[var(--bad)]">{t('error.title')}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {t('error.body')}
        </p>
        <pre className="mt-3 max-h-64 overflow-auto border border-wood-dark bg-[var(--wood-dark)] p-3 font-mono text-[11px] text-ink">
          {error.message}
          {stack === '' ? '' : `\n${stack}`}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null, stack: '' });
            }}
            className="border border-wood-dark px-3 py-1.5 font-mono text-xs text-[var(--gold-dark)] hover:bg-gold hover:text-ink"
          >
            {t('error.retry')}
          </button>
          <a
            href={import.meta.env.BASE_URL}
            className="border border-wood-dark px-3 py-1.5 font-mono text-xs text-ink-soft hover:border-wood-dark"
          >
            {t('error.home')}
          </a>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

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

    return (
      <div role="alert" className="mx-auto max-w-2xl border border-[var(--c-bad)] bg-panel p-5">
        <h1 className="text-lg font-semibold text-[var(--c-bad)]">画面の描画に失敗しました</h1>
        <p className="mt-2 text-sm text-muted">
          不具合です。下の内容を添えて報告してもらえると直せます。進捗は保存されているので失われません。
        </p>
        <pre className="mt-3 max-h-64 overflow-auto border border-line bg-void p-3 font-mono text-[11px] text-ink">
          {error.message}
          {stack === '' ? '' : `\n${stack}`}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null, stack: '' });
            }}
            className="border border-accent px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent hover:text-void"
          >
            もう一度描画する
          </button>
          <a
            href={import.meta.env.BASE_URL}
            className="border border-line px-3 py-1.5 font-mono text-xs text-muted hover:border-accent"
          >
            トップへ戻る
          </a>
        </div>
      </div>
    );
  }
}

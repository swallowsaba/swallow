import { useEffect, useState } from 'react';
import { useT } from '@/i18n/useT';

export interface EditorTarget {
  path: string;
  content: string;
  tool: string;
}

interface Props {
  target: EditorTarget;
  onSave: (content: string) => void;
  onCancel: () => void;
}

/**
 * 簡易エディタ。端末の中で全画面編集を再現する代わりに、板の上で書いて保存する。
 * vi の操作体系そのものではないが、ファイルを編集するという学習上の目的は満たす。
 */
export function EditorPanel({ target, onSave, onCancel }: Props) {
  const t = useT();
  const [text, setText] = useState(target.content);
  useEffect(() => {
    setText(target.content);
  }, [target]);

  return (
    <div
      role="dialog"
      aria-label={t('editor.title', { tool: target.tool, path: target.path })}
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(44_29_16/85%)] p-6"
    >
      <div className="bevel flex h-[70vh] w-[min(900px,95vw)] flex-col p-4">
        <div className="flex items-center gap-3">
          <span className="sign px-3 py-1 text-base font-extrabold">{target.tool}</span>
          <span className="font-mono text-base">{target.path}</span>
          <span className="ml-auto font-mono text-sm text-ink-soft">
            {t('editor.keys')}
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSave(text);
            }
          }}
          spellCheck={false}
          autoFocus
          aria-label={t('editor.body')}
          className="mt-3 min-h-0 flex-1 resize-none border-4 border-wood-dark bg-[var(--wood-dark)] p-4 font-mono text-base text-cream"
        />

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => {
              onSave(text);
            }}
            className="knob px-6 py-2 text-base font-bold"
          >
            {t('editor.save')}
          </button>
          <button type="button" onClick={onCancel} className="knob px-6 py-2 text-base">
            {t('editor.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

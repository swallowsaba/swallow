import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Rich } from './Rich';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(text: string): HTMLElement {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Rich text={text} />));
  return host;
}

describe('本文の表示（Rich）', () => {
  it('複数の行にまたがる `...`（ヒアドキュメントで書くスクリプトなど）は、行を保った塊で出す', () => {
    const host = render("`cat > a.sh << 'EOF'\necho hi\nEOF` と打つ。");
    const code = host.querySelector('code');
    expect(code?.classList.contains('is-block')).toBe(true);
    expect(code?.textContent).toBe("cat > a.sh << 'EOF'\necho hi\nEOF");
  });

  it('1 行の `...` は、文の中の等幅の語のまま', () => {
    const code = render('`ls -l` と打つ。').querySelector('code');
    expect(code?.classList.contains('is-block')).toBe(false);
  });
});

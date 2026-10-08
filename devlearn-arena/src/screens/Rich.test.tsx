import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Rich } from './Rich';
import { SettingsContext } from './settingsContext';
import { createSettingsStore } from './settingsStore';
import { DEFAULT_SETTINGS } from '@/save/schema';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(text: string, furigana?: boolean): HTMLElement {
  const host = document.createElement('div');
  const root = createRoot(host);
  const node = <Rich text={text} onTerm={() => undefined} />;
  act(() => root.render(furigana === undefined ? node : <SettingsContext.Provider value={createSettingsStore({ ...DEFAULT_SETTINGS, furigana })}>{node}</SettingsContext.Provider>));
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

  it('ふりがなの設定を入れると、漢字の用語に読みを添える（漢字の無い用語には添えない）。切ると添えない', () => {
    const on = render('{{term:virtualization}} と {{term:systemctl}}', true);
    expect(on.querySelector('[data-term="virtualization"] rt')?.textContent).toBe('かそうか');
    expect(on.querySelector('[data-term="virtualization"] ruby')?.firstChild?.textContent).toBe('仮想化');
    expect(on.querySelector('[data-term="systemctl"] ruby')).toBeNull();
    expect(on.querySelector('[data-term="systemctl"]')?.textContent).toBe('systemctl');
    for (const host of [render('{{term:virtualization}}', false), render('{{term:virtualization}}')]) {
      expect(host.querySelector('ruby')).toBeNull();
      expect(host.querySelector('[data-term="virtualization"]')?.textContent).toBe('仮想化');
    }
  });
});

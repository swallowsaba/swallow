import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import type { TerminalHandle } from './TerminalView';
import { useDiagramRunner } from './useDiagramRunner';

function fakeTerminal(): TerminalHandle {
  return {
    submit: vi.fn(),
    type: vi.fn(),
    insertText: vi.fn(),
    note: vi.fn(),
    requestComplete: vi.fn(),
    focus: vi.fn(),
  };
}

function Diagram({ terminal }: { terminal: TerminalHandle }) {
  const ref = useRef<TerminalHandle>(terminal);
  const run = useDiagramRunner(ref);
  return (
    <button
      type="button"
      onClick={() => {
        run('kubectl describe pod web');
      }}
    >
      run
    </button>
  );
}

afterEach(() => {
  useStore.getState().updateSettings({ motion: 'system' });
});

describe('図の操作を端末に打つ', () => {
  it('動きを付ける設定では、なぜそのコマンドかを注記してから1文字ずつ打ち込む', () => {
    const terminal = fakeTerminal();
    const view = mount(<Diagram terminal={terminal} />);
    click(view, 'button');
    expect(terminal.type).toHaveBeenCalledWith('kubectl describe pod web', expect.any(Function));
    expect(terminal.submit).not.toHaveBeenCalled();
    // 注記は打ち始める直前に出る
    expect(terminal.note).not.toHaveBeenCalled();
    const before = vi.mocked(terminal.type).mock.calls[0]?.[1];
    before?.();
    expect(terminal.note).toHaveBeenCalledWith(expect.stringContaining('describe'));
  });

  it('動きを減らす設定では、すぐに実行する', () => {
    useStore.getState().updateSettings({ motion: 'reduced' });
    const terminal = fakeTerminal();
    const view = mount(<Diagram terminal={terminal} />);
    click(view, 'button');
    expect(terminal.note).toHaveBeenCalledWith(expect.stringContaining('describe'));
    expect(terminal.submit).toHaveBeenCalledWith('kubectl describe pod web');
    expect(terminal.type).not.toHaveBeenCalled();
  });
});

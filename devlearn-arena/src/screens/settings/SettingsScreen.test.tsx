import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportFile, freshSave } from '@/save/manage';
import { toSaveData, newPlayer } from '@/save/saveData';
import { DEFAULT_SETTINGS, type SaveData } from '@/save/schema';
import { createSession } from '../session';
import { useSaveStatus } from '../saveStatus';
import { SettingsScreen, type SaveControls } from './SettingsScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AT = '2026-10-09T10:00:00+09:00';

/** レッスンを 1 本修了した、今の記録 */
function current(): SaveData {
  const session = createSession();
  session.progress.getState().learn([{ kind: 'lesson', lessonId: 'linux.b.01', at: AT, quiz: [{ quizId: 'q1', correct: true }], complete: true }]);
  const p = session.progress.getState();
  return toSaveData({ player: newPlayer('p-1', AT), settings: DEFAULT_SETTINGS, city: session.city.getState().city, progress: p.progress, practiceSessions: p.practiceSessions }, AT, AT.slice(0, 10));
}

function controls(replace: SaveControls['replace'] = () => Promise.resolve()) {
  return {
    snapshot: vi.fn(current),
    replace: vi.fn(replace),
    fresh: vi.fn(() => freshSave({ id: 'p-new', now: AT, settings: DEFAULT_SETTINGS })),
    download: vi.fn<SaveControls['download']>(),
  };
}

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
  useSaveStatus.getState().set(null);
});

function mount(saves: SaveControls): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<SettingsScreen saves={saves} onClose={() => undefined} />));
  return host;
}

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes(label));
  if (!b) throw new Error(`「${label}」のボタンが無い`);
  return b;
};

async function choose(host: HTMLElement, text: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('ファイルを選ぶ欄が無い');
  // jsdom の File は text() を持たないので、ブラウザの File と同じく text() で中身を返す物を渡す
  const file = { name: 'devlearn-save-2026-10-09.json', text: () => Promise.resolve(text) };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  // file.text() を待つ
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('設定の保存（書き出し・読み込み・最初からやり直す）', () => {
  it('「書き出す」で、今の記録を devlearn-save-<日付>.json として渡す', () => {
    const saves = controls();
    const host = mount(saves);
    act(() => button(host, '書き出す').click());
    expect(saves.download).toHaveBeenCalledTimes(1);
    const file = saves.download.mock.calls[0]?.[0];
    expect(file?.name).toBe('devlearn-save-2026-10-09.json');
    expect(JSON.parse(file?.text ?? '')).toEqual(current());
  });

  it('ファイルを選ぶと中身を示し、「置き換える」を押すまで今の記録を置き換えない', async () => {
    const saves = controls();
    const host = mount(saves);
    await choose(host, exportFile(current()).text);
    const preview = host.querySelector('[data-testid="import-preview"]');
    expect(preview?.textContent).toContain('みなと市');
    expect(preview?.textContent).toContain('2026-10-09 10:00');
    expect(preview?.textContent).toMatch(/修了\s*1\s*本/);
    expect(saves.replace).not.toHaveBeenCalled();

    // やめると何もしない
    act(() => button(host, 'やめる').click());
    expect(host.querySelector('[data-testid="import-preview"]')).toBeNull();
    expect(saves.replace).not.toHaveBeenCalled();

    await choose(host, exportFile(current()).text);
    await act(async () => {
      button(host, '置き換える').click();
      await Promise.resolve();
    });
    expect(saves.replace).toHaveBeenCalledTimes(1);
    expect(saves.replace.mock.calls[0]?.[0]).toEqual(current());
    expect(saves.replace.mock.calls[0]?.[1]).toMatch(/読み込んだ/);
  });

  it('壊れたファイルは読み込まず、何が起きたか・どうすればよいかを 1 行ずつ出す', async () => {
    const saves = controls();
    const host = mount(saves);
    await choose(host, '{ "version": 1, ');
    const error = host.querySelector('[data-testid="import-error"]');
    expect(error?.textContent).toContain('JSON の形ではない');
    expect(error?.querySelectorAll('p')).toHaveLength(2);
    expect(host.querySelector('[data-testid="import-preview"]')).toBeNull();
    expect(saves.replace).not.toHaveBeenCalled();
  });

  it('「最初からやり直す」は確かめてから。やめれば何もせず、やり直すと新しい都市の保存データに置き換える', async () => {
    const saves = controls();
    const host = mount(saves);
    act(() => button(host, '最初からやり直す').click());
    expect(saves.replace).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="reset-confirm"]')?.textContent).toMatch(/消え/);
    act(() => button(host, 'やめる').click());
    expect(host.querySelector('[data-testid="reset-confirm"]')).toBeNull();

    act(() => button(host, '最初からやり直す').click());
    // 確かめの中から、先に書き出せる
    act(() => button(host, '先に書き出す').click());
    expect(saves.download).toHaveBeenCalledTimes(1);
    await act(async () => {
      button(host, 'やり直す').click();
      await Promise.resolve();
    });
    expect(saves.replace).toHaveBeenCalledTimes(1);
    expect(saves.replace.mock.calls[0]?.[0].player.id).toBe('p-new');
    expect(saves.replace.mock.calls[0]?.[1]).toMatch(/やり直した/);
  });

  it('置き換えの書き込みに失敗したら、何が起きたかを 1 行で出し、今の記録が残っていると伝える', async () => {
    const saves = controls(() => Promise.reject(new DOMException('full', 'QuotaExceededError')));
    const host = mount(saves);
    act(() => button(host, '最初からやり直す').click());
    await act(async () => {
      button(host, 'やり直す').click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const error = host.querySelector('[data-testid="replace-error"]');
    expect(error?.textContent).toContain('QuotaExceededError');
    expect(error?.textContent).toContain('今の記録はそのまま');
  });

  it('自動保存に問題があれば、保存の欄にも出す', () => {
    useSaveStatus.getState().set('保存できなかった（QuotaExceededError）。');
    const host = mount(controls());
    expect(host.querySelector('[data-testid="autosave-state"]')?.textContent).toContain('保存できなかった');
  });
});

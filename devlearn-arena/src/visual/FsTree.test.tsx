import { describe, expect, it, vi } from 'vitest';
import { createVfs, writeFile } from '@/engines/kernel/vfs';
import { FsTree } from './FsTree';
import { click, mount } from './mountForTest';

const vfs = createVfs({
  '/home/learner': null,
  '/home/learner/notes.txt': 'a\n',
  '/home/learner/work': null,
  '/etc/hosts': '127.0.0.1 localhost\n',
});

describe('ファイルシステムの図', () => {
  it('ディレクトリを箱、ファイルを札として描き、親から子へ線を引く', () => {
    const view = mount(<FsTree vfs={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[data-dir="/home/learner/work"]')).not.toBeNull();
    expect(view.querySelector('[data-file="/etc/hosts"]')).not.toBeNull();
    expect(view.querySelector('[data-edge="/home/learner"]')).not.toBeNull();
    // 田んぼの絵ではなく、学ぶ対象（階層）そのものが見える
    expect(view.textContent).not.toContain('🧑‍🌾');
  });

  it('いまいる場所に「現在地」を出す', () => {
    const view = mount(<FsTree vfs={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[data-dir="/home/learner"]')?.textContent).toContain('現在地');
    expect(view.querySelector('[data-dir="/etc"]')?.textContent).not.toContain('現在地');
  });

  it('増えたファイルは光る', () => {
    const after = writeFile(vfs, '/home/learner/new.txt', 'x', true);
    const view = mount(<FsTree vfs={after} previous={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[data-file="/home/learner/new.txt"]')?.getAttribute('data-glow')).toBe('true');
    expect(view.querySelector('[data-file="/home/learner/notes.txt"]')?.getAttribute('data-glow')).toBe('false');
  });

  it('ディレクトリを押すと cd、ファイルを押すと cat が端末に流れる', () => {
    const onCommand = vi.fn();
    const view = mount(<FsTree vfs={vfs} cwd="/home/learner" onCommand={onCommand} />);
    click(view, '[aria-label="cd /home/learner/work"]');
    expect(onCommand).toHaveBeenLastCalledWith('cd /home/learner/work');
    click(view, '[aria-label="cat /etc/hosts"]');
    expect(onCommand).toHaveBeenLastCalledWith('cat /etc/hosts');
  });
});

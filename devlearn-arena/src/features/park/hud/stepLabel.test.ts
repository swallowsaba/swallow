import { describe, expect, it } from 'vitest';
import { commandLabel } from './stepLabel';

describe('課題の札のコマンド名', () => {
  it('副コマンドを持つものは副コマンドを見せる', () => {
    expect(commandLabel(['kubectl cordon node-1'])).toBe('cordon');
    expect(commandLabel(['git commit -m "x"'])).toBe('commit');
    expect(commandLabel(['gh pr create'])).toBe('pr');
  });

  it('副コマンドを持たないものはそのまま', () => {
    expect(commandLabel(['ls -la'])).toBe('ls');
    expect(commandLabel(['sudo chmod 600 secret'])).toBe('chmod');
  });

  it('旗しか続かないときは親の名前を見せる', () => {
    expect(commandLabel(['git --version'])).toBe('git');
  });

  it('解答が無い手順は空', () => {
    expect(commandLabel([])).toBe('');
    expect(commandLabel(['  '])).toBe('');
  });
});

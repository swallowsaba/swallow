import { HOME } from '@/engines/kernel/path';
import { exists, isDir, readFile } from '@/engines/kernel/vfs';
import type { LessonDefinition } from './types';

/**
 * P1 の動作確認用ミッション。
 * P2 以降、同じ形式で各トラックのレッスンを書く（判定は状態アサーション）。
 */
export const shellWarmup: LessonDefinition = {
  id: 'kernel/00/shell-warmup',
  title: 'シェルに慣れる',
  objectives: [
    'ディレクトリを作って移動できる',
    'リダイレクトでファイルに書き出せる',
    'パイプで出力を次のコマンドに渡せる',
  ],
  parCommands: 5,
  initial: {},
  steps: [
    {
      prompt: 'ホームに reports ディレクトリを作れ。',
      hints: ['mkdir でディレクトリを作れる', 'mkdir reports'],
      assert: ({ shell }) => isDir(shell.vfs, `${HOME}/reports`),
      explain: 'mkdir は親が無いと失敗する。深い階層をまとめて作るなら -p を付ける。',
    },
    {
      prompt: 'reports/hosts.txt に /etc/hosts の中身を書き出せ。',
      hints: ['> はコマンドの標準出力をファイルに向ける', 'cat /etc/hosts > reports/hosts.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/hosts.txt`;
        if (!exists(shell.vfs, path)) return false;
        return readFile(shell.vfs, path).includes('localhost');
      },
      explain: '> は毎回ファイルを空にしてから書く。追記したいときは >> を使う。',
    },
    {
      prompt: 'そのファイルから localhost を含む行だけを reports/local.txt に残せ。',
      hints: ['grep とリダイレクトを組み合わせる', 'grep localhost reports/hosts.txt > reports/local.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/local.txt`;
        if (!exists(shell.vfs, path)) return false;
        const lines = readFile(shell.vfs, path).split('\n').filter((l) => l !== '');
        return lines.length > 0 && lines.every((l) => l.includes('localhost'));
      },
      explain:
        'パイプでもリダイレクトでも通る。判定は「最終的な中身」を見ているので、どちらの解き方でも正解になる。',
    },
  ],
};

export const missions: readonly LessonDefinition[] = [shellWarmup];

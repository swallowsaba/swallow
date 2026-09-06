import { HOME } from '@/engines/kernel/path';
import { exists, isDir, list, readFile } from '@/engines/kernel/vfs';
import type { LessonDefinition } from './types';

/** ボス戦の初期状態を作る。ログが溢れてディスクが逼迫している想定。 */
function floodedLog(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `2026-05-0${String((i % 9) + 1)} ERROR connection reset by peer (retry ${String(i)})`,
  ).join('\n');
}

export const shellWarmup: LessonDefinition = {
  id: 'kernel/00/shell-warmup',
  kind: 'training',
  title: 'シェルに慣れる',
  objectives: ['ディレクトリを作って移動できる', 'リダイレクトで書き出せる', 'パイプで繋げる'],
  parCommands: 5,
  initial: {},
  steps: [
    {
      prompt: 'ホームに reports ディレクトリを作れ。',
      check: '~/reports がディレクトリとして存在すること',
      hints: ['mkdir でディレクトリを作れる', 'mkdir reports'],
      assert: ({ shell }) => isDir(shell.vfs, `${HOME}/reports`),
      explain: 'mkdir は親が無いと失敗する。深い階層をまとめて作るなら -p を付ける。',
    },
    {
      prompt: 'reports/hosts.txt に /etc/hosts の中身を書き出せ。',
      check: '~/reports/hosts.txt が存在し、中身に localhost が含まれること',
      hints: ['> はコマンドの標準出力をファイルに向ける', 'cat /etc/hosts > reports/hosts.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/hosts.txt`;
        return exists(shell.vfs, path) && readFile(shell.vfs, path).includes('localhost');
      },
      explain: '> は毎回ファイルを空にしてから書く。追記したいときは >> を使う。',
    },
    {
      prompt: 'そのファイルから localhost を含む行だけを reports/local.txt に残せ。',
      check: '~/reports/local.txt の全ての行に localhost が含まれること（空でないこと）',
      hints: ['grep とリダイレクトを組み合わせる', 'grep localhost reports/hosts.txt > reports/local.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/local.txt`;
        if (!exists(shell.vfs, path)) return false;
        const lines = readFile(shell.vfs, path).split('\n').filter((l) => l !== '');
        return lines.length > 0 && lines.every((l) => l.includes('localhost'));
      },
      explain: '判定は最終的な中身を見ている。パイプで解いてもリダイレクトで解いても正解になる。',
    },
  ],
};

export const diskFullBoss: LessonDefinition = {
  id: 'kernel/00/disk-full',
  kind: 'boss',
  title: 'ディスク逼迫',
  objectives: ['溢れたログを止める', '不要な世代を消す', '対応記録を残す'],
  parCommands: 8,
  initial: {
    cwd: '/var/log',
    files: {
      [HOME]: null,
      '/var/log/app.log': floodedLog(400),
      '/var/log/old/2026-03.log': floodedLog(120),
      '/var/log/old/2026-04.log': floodedLog(120),
      '/srv/app/RUNBOOK.txt':
        '障害対応の手順\n1. 一番大きいログを空にする\n2. 古い世代のログを消す\n3. 対応記録を /srv/app/RECOVERY.md に残す（rotate の方針を書くこと）\n',
      '/etc/hosts': '127.0.0.1\tlocalhost\n',
    },
  },
  steps: [
    {
      prompt: '容量を食っているログを特定し、中身を空にせよ。ファイル自体は消すな。',
      check: '/var/log/app.log が存在し、中身が空であること',
      hints: [
        'ls -l で大きさが見える。wc -l でも行数を比べられる',
        '> /var/log/app.log と打つと、ファイルを残したまま中身だけ空にできる',
      ],
      assert: ({ shell }) =>
        exists(shell.vfs, '/var/log/app.log') && readFile(shell.vfs, '/var/log/app.log') === '',
      explain:
        'ログファイルを rm すると、書き込み中のプロセスがファイルを掴んだままになり容量が戻らないことがある。中身だけ空にするのが定石。',
    },
    {
      prompt: '/var/log/old に残っている古い世代のログを片付けろ。',
      check: '/var/log/old に .log ファイルが1つも無いこと（ディレクトリごと消してもよい）',
      hints: ['ディレクトリごと消すなら rm -r', 'rm -r /var/log/old'],
      assert: ({ shell }) => {
        if (!exists(shell.vfs, '/var/log/old')) return true;
        return list(shell.vfs, '/var/log/old').filter((n) => n.endsWith('.log')).length === 0;
      },
      explain: '消す前に、本当に不要かを確認する癖をつける。RUNBOOK に手順が書いてあるのはそのため。',
    },
    {
      prompt: '/srv/app/RECOVERY.md に対応記録を残せ。再発防止として rotate の方針を書くこと。',
      check: '/srv/app/RECOVERY.md が存在し、中身に rotate が含まれること',
      hints: [
        'echo とリダイレクトで書ける',
        'echo "logrotate を導入して日次で rotate する" > /srv/app/RECOVERY.md',
      ],
      assert: ({ shell }) => {
        const path = '/srv/app/RECOVERY.md';
        return exists(shell.vfs, path) && readFile(shell.vfs, path).includes('rotate');
      },
      explain: '記録が無い対応は再発する。何を見て、何をして、次にどう防ぐかを残すまでが復旧作業。',
    },
  ],
};

export const missions: readonly LessonDefinition[] = [shellWarmup, diskFullBoss];

export function findMission(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id || m.id.endsWith(`/${id}`));
}

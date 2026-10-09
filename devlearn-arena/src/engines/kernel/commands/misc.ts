import { displayPath } from '../path';
import type { CommandSpec, ShellState } from '../registry';
import { exists, readFile } from '../vfs';
import { fromLines } from './args';

const OSRELEASE = '/proc/sys/kernel/osrelease';

/** 環境変数の一覧。__ で始まる物は、模擬の機械の中の設定（ディスクの大きさ・アドレス）で、環境変数ではないので出さない */
function envText(shell: ShellState): string {
  return fromLines([...shell.vars.entries()].filter(([k]) => !k.startsWith('__')).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`));
}

export const miscCommands: CommandSpec[] = [
  {
    name: 'env',
    summary: '環境変数を一覧する',
    handler: ({ shell }) => ({ stdout: envText(shell) }),
  },
  {
    name: 'printenv',
    summary: '環境変数の値を見る（名前を書かなければ全て）',
    handler: ({ argv, shell }) => {
      const names = argv.slice(1);
      if (names.length === 0) return { stdout: envText(shell) };
      const values = names.map((n) => (n.startsWith('__') ? undefined : shell.vars.get(n)));
      return { stdout: fromLines(values.filter((v): v is string => v !== undefined)), code: values.every((v) => v !== undefined) ? 0 : 1 };
    },
  },
  {
    name: 'export',
    summary: '環境変数を設定する',
    handler: ({ argv, shell }) => {
      const vars = new Map(shell.vars);
      for (const assignment of argv.slice(1)) {
        const eq = assignment.indexOf('=');
        if (eq === -1) continue;
        vars.set(assignment.slice(0, eq), assignment.slice(eq + 1));
      }
      return { patch: { vars } };
    },
  },
  {
    name: 'unset',
    summary: '環境変数を消す',
    handler: ({ argv, shell }) => {
      const vars = new Map(shell.vars);
      for (const name of argv.slice(1)) vars.delete(name);
      return { patch: { vars } };
    },
  },
  {
    name: 'history',
    summary: '入力履歴を表示する',
    handler: ({ shell }) => ({
      stdout: fromLines(shell.history.map((line, i) => `${String(i + 1).padStart(5)}  ${line}`)),
    }),
  },
  {
    name: 'clear',
    summary: '画面を消す',
    // xterm がそのまま解釈するエスケープシーケンス
    handler: () => ({ stdout: '\u001b[2J\u001b[H' }),
  },
  {
    name: 'which',
    summary: 'コマンドが存在するか調べる',
    handler: ({ argv, registry }) => {
      const name = argv[1];
      if (name === undefined) return { code: 1 };
      if (!registry.has(name)) return { stderr: `which: no ${name} in this environment\n`, code: 1 };
      return { stdout: `/usr/bin/${name}\n` };
    },
  },
  {
    name: 'help',
    summary: '使えるコマンドを一覧する',
    handler: ({ registry }) => ({
      stdout: fromLines(registry.all().map((s) => `${s.name.padEnd(10)} ${s.summary}`)),
    }),
  },
  { name: 'true', summary: '常に成功する', handler: () => ({ code: 0 }) },
  { name: 'false', summary: '常に失敗する', handler: () => ({ code: 1 }) },
  {
    name: 'whoami',
    summary: '現在のユーザ名を表示する',
    handler: ({ shell }) => ({ stdout: `${shell.vars.get('USER') ?? 'learner'}\n` }),
  },
  {
    name: 'uname',
    summary: 'OS・カーネルの版・機械の名前を表示する',
    handler: ({ argv, shell }) => {
      // カーネルの版は、本物と同じく /proc/sys/kernel/osrelease から読む（無ければ模擬の既定）
      const release = (exists(shell.vfs, OSRELEASE) ? readFile(shell.vfs, OSRELEASE) : '6.8.0-45-generic').trim();
      const fields: Record<string, string> = {
        s: 'Linux', n: shell.vars.get('HOSTNAME') ?? 'arena', r: release,
        v: '#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024', m: 'x86_64', p: 'x86_64', i: 'x86_64', o: 'GNU/Linux',
      };
      let wanted = '';
      for (const a of argv.slice(1)) {
        if (a === '--all') wanted += 'a';
        else if (/^-[a-z]+$/.test(a)) wanted += a.slice(1);
        else return { stderr: `uname: extra operand '${a}'\n`, code: 1 };
      }
      const bad = [...wanted].find((c) => c !== 'a' && fields[c] === undefined);
      if (bad !== undefined) return { stderr: `uname: invalid option -- '${bad}'\nTry 'uname --help' for more information.\n`, code: 1 };
      const order = wanted.includes('a') ? 'snrvmpio' : wanted === '' ? 's' : 'snrvmpio'.split('').filter((c) => wanted.includes(c)).join('');
      return { stdout: `${[...order].map((c) => fields[c]).join(' ')}\n` };
    },
  },
  {
    name: 'uptime',
    summary: '仮想時計の経過を表示する',
    handler: ({ clock }) => {
      const seconds = Math.floor(clock.nowMs / 1000);
      return { stdout: `up ${String(seconds)}s (tick ${String(clock.tick)})\n` };
    },
  },
  {
    name: 'basename',
    summary: 'パスの末尾を取り出す',
    handler: ({ argv }) => {
      const target = argv[1];
      if (target === undefined) return { stderr: 'basename: missing operand\n', code: 1 };
      const trimmed = target.endsWith('/') ? target.slice(0, -1) : target;
      return { stdout: `${trimmed.slice(trimmed.lastIndexOf('/') + 1)}\n` };
    },
  },
  {
    name: 'prompt',
    summary: 'プロンプト文字列を表示する（内部確認用）',
    handler: ({ shell }) => ({ stdout: `${displayPath(shell.cwd)}\n` }),
  },
];

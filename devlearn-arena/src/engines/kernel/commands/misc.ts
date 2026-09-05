import { displayPath } from '../path';
import type { CommandSpec } from '../registry';
import { fromLines } from './args';

export const miscCommands: CommandSpec[] = [
  {
    name: 'env',
    summary: '環境変数を一覧する',
    handler: ({ shell }) => ({
      stdout: fromLines(
        [...shell.vars.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`),
      ),
    }),
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

import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { parseArgs } from './args';
import { issueSubcommands } from './ghIssue';
import { prSubcommands } from './ghPr';
import { NO_REPO, type GhContext, type GhHandler } from './ghShared';

/**
 * gh のサブコマンド表。
 * Pull Request まわりと、Issue / Projects / CODEOWNERS / fork / secret に分けてある。
 */
const subcommands: Record<string, GhHandler> = {
  ...prSubcommands,
  ...issueSubcommands,
};

const NAMES = Object.keys(subcommands).sort();

function runSub(sub: string, argv: readonly string[], shell: ShellState): CommandResult {
  const repo = shell.repo;
  if (repo === null) return { stderr: NO_REPO, code: 1 };
  const rest = argv.slice(2);
  const parsed = parseArgs([sub, ...rest], {
    // 本物の gh と同じく、長い名前は --body x と --body=x のどちらでも受ける
    withValue: [
      't', 'b', 'B', 'm', 'r', 'l', 'a', 'w',
      'title', 'body', 'label', 'assignee', 'approvals', 'checks', 'cache', 'columns', 'commits',
      'milestone', 'paths', 'workflow',
    ],
  });
  const { operands, flags } = parsed;
  const values = new Map(parsed.values);
  // 長い名前で書かれたものを、短い名前でも引けるようにしておく
  for (const [long, short] of [['title', 't'], ['label', 'l'], ['assignee', 'a'], ['workflow', 'w']] as const) {
    const value = values.get(long);
    if (value !== undefined && !values.has(short)) values.set(short, value);
  }

  const handler = subcommands[sub];
  if (handler === undefined) return { stderr: `unknown command: gh ${sub}\n`, code: 1 };

  const ctx: GhContext = { repo, shell, sub, rest, flags, values, operands };
  return handler(ctx);
}

export const ghCommands: CommandSpec[] = [
  {
    name: 'gh',
    summary: 'GitHub を操作する（pr / issue / project / protect / workflow ほか）',
    complete: ({ prefix }) => NAMES.filter((s) => s.startsWith(prefix)),
    handler: ({ argv, shell }) => {
      const sub = argv[1];
      if (sub === undefined) {
        return {
          stdout:
            'usage: gh <command>\n' +
            '  pr create|list|view|review|checks|merge\n' +
            '  issue create|list|view|close|label\n' +
            '  project create|move|view\n' +
            '  codeowners load|list|who <パス>\n' +
            '  protect <branch> --approvals=N --checks=A,B\n' +
            '  secret set|list   fork <owner>   linked <PR 番号>   workflow\n',
        };
      }
      return runSub(sub, argv, shell);
    },
  },
];

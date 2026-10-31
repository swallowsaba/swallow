import type { CommandSpec, ShellState } from '../registry';
import { exists, readFile, writeFile } from '../vfs';
import { currentUser } from './perm';

/**
 * ufw（機械の入口の規則）。本物と同じく /etc/ufw/user.rules に規則を書き、status は規則を書いた順に並べる。
 * 規則は名前付きのアプリ（プロファイル）を持たず、ポート（443・443/tcp）だけを受ける
 */

const RULES = '/etc/ufw/user.rules';
const STATE = '/etc/ufw/ufw.conf';

const rulesOf = (shell: ShellState): string[] => (exists(shell.vfs, RULES) ? readFile(shell.vfs, RULES).split('\n').filter((l) => l.startsWith('### tuple ### ')).map((l) => l.replace('### tuple ### ', '')) : []);

const rulesText = (rules: readonly string[]): string => rules.map((r) => {
  const [action = 'allow', spec = ''] = r.split(' ');
  const [port = '', proto = 'tcp'] = spec.split('/');
  return `### tuple ### ${r}\n-A ufw-user-input -p ${proto} --dport ${port} -j ${action === 'allow' ? 'ACCEPT' : 'DROP'}\n`;
}).join('');

const isActive = (shell: ShellState): boolean => exists(shell.vfs, STATE) && readFile(shell.vfs, STATE).includes('ENABLED=yes');

export const ufwCommands: CommandSpec[] = [
  {
    name: 'ufw',
    summary: '機械の入口の規則を決める（ufw allow 443/tcp・ufw enable・ufw status）',
    handler: ({ argv, shell }) => {
      if (currentUser(shell) !== 'root') return { stderr: 'ERROR: You need to be root to run this script\n', code: 1 };
      const [verb, ...rest] = argv.slice(1);
      const rules = rulesOf(shell);
      const active = isActive(shell);
      const done = active ? 'Rule added\nRule added (v6)\n' : 'Rules updated\nRules updated (v6)\n';
      switch (verb) {
        case 'status': {
          if (!active) return { stdout: 'Status: inactive\n' };
          const row = (to: string, action: string, from: string): string => `${to.padEnd(27)}${action.padEnd(12)}${from}`;
          const parsed = rules.map((r) => r.split(' ') as [string, string]);
          return {
            stdout: [
              'Status: active', '', row('To', 'Action', 'From'), row('--', '------', '----'),
              ...parsed.map(([a, s]) => row(s, a.toUpperCase(), 'Anywhere')),
              ...parsed.map(([a, s]) => row(`${s} (v6)`, a.toUpperCase(), 'Anywhere (v6)')), '', '',
            ].join('\n').replace(/\n\n$/, '\n'),
          };
        }
        case 'enable':
          return { stdout: 'Firewall is active and enabled on system startup\n', patch: { vfs: writeFile(shell.vfs, STATE, 'ENABLED=yes\n', true) } };
        case 'disable':
          return { stdout: 'Firewall stopped and disabled on system startup\n', patch: { vfs: writeFile(shell.vfs, STATE, 'ENABLED=no\n', true) } };
        case 'allow':
        case 'deny': {
          const spec = rest[0];
          if (spec === undefined) return { stderr: 'ERROR: Invalid syntax\n', code: 1 };
          if (!/^\d+(\/(tcp|udp))?$/.test(spec)) return { stderr: `ERROR: Could not find a profile matching '${spec}'\n`, code: 1 };
          const rule = `${verb} ${spec}`;
          if (rules.includes(rule)) return { stdout: 'Skipping adding existing rule\nSkipping adding existing rule (v6)\n' };
          return { stdout: done, patch: { vfs: writeFile(shell.vfs, RULES, rulesText([...rules, rule]), true) } };
        }
        case 'delete': {
          const rule = rest.join(' ');
          if (!rules.includes(rule)) return { stderr: 'Could not delete non-existent rule\nCould not delete non-existent rule (v6)\n', code: 1 };
          return { stdout: active ? 'Rule deleted\nRule deleted (v6)\n' : 'Rules updated\nRules updated (v6)\n', patch: { vfs: writeFile(shell.vfs, RULES, rulesText(rules.filter((r) => r !== rule)), true) } };
        }
        default:
          return { stderr: 'ERROR: Invalid syntax\n', code: 1 };
      }
    },
  },
];

import {
  CRONTAB_DIR, formatTime, matches, nextMinute, parseCrontab, parseTime, START_TIME, weekdayOf, type CronEntry, type SimTime,
} from '../cron';
import type { CommandContext, CommandResult, CommandSpec, ShellState } from '../registry';
import { appendFile, exists, list, mkdir, readFile, remove, writeFile } from '../vfs';
import { resolve } from '../path';
import { currentUser } from './perm';

/**
 * crontab（定期実行の登録）・date（今の時刻）・timeskip（模擬の時計を進める。本物の Linux には無い）。
 * 機械の今の時刻は __NOW に持つ。cron の仕事は、短い PATH とホームを現在地にして動き、出力はメール（/var/mail/<利用者>）に残る（本物と同じ）
 */

const NOW_VAR = '__NOW';
const CRON_PATH = '/usr/bin:/bin';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

const nowOf = (shell: ShellState): SimTime => parseTime(shell.vars.get(NOW_VAR) ?? START_TIME);
const spoolOf = (user: string): string => `${CRONTAB_DIR}/${user}`;
const homeOf = (user: string): string => (user === 'root' ? '/root' : `/home/${user}`);

function install(shell: ShellState, user: string, text: string): CommandResult {
  const parsed = parseCrontab(text);
  if ('error' in parsed) return { stderr: `${parsed.error}\nerrors in crontab file, can't install.\n`, code: 1 };
  const vfs = writeFile(mkdir(shell.vfs, CRONTAB_DIR, true), spoolOf(user), text.endsWith('\n') || text === '' ? text : `${text}\n`);
  return { patch: { vfs } };
}

function crontab({ argv, shell, stdin }: CommandContext): CommandResult {
  const args = argv.slice(1);
  const userFlag = args.indexOf('-u');
  const me = currentUser(shell);
  const user = userFlag >= 0 ? (args[userFlag + 1] ?? me) : me;
  if (user !== me && me !== 'root') return { stderr: 'must be privileged to use -u\n', code: 1 };
  const rest = userFlag >= 0 ? args.filter((_, i) => i !== userFlag && i !== userFlag + 1) : args;
  const spool = spoolOf(user);
  const op = rest[0];
  if (op === '-l') {
    if (!exists(shell.vfs, spool)) return { stderr: `no crontab for ${user}\n`, code: 1 };
    return { stdout: readFile(shell.vfs, spool) };
  }
  if (op === '-r') {
    if (!exists(shell.vfs, spool)) return { stderr: `no crontab for ${user}\n`, code: 1 };
    return { patch: { vfs: remove(shell.vfs, spool) } };
  }
  if (op === '-e') {
    // 編集の欄を開く。保存すると登録の場所に書かれる
    return {
      patch: { vfs: mkdir(shell.vfs, CRONTAB_DIR, true) },
      editor: { path: spool, content: exists(shell.vfs, spool) ? readFile(shell.vfs, spool) : '# 分 時 日 月 曜日 コマンド\n', tool: 'crontab' },
    };
  }
  if (op === '-') return install(shell, user, stdin);
  if (op !== undefined && !op.startsWith('-')) {
    const path = resolve(shell.cwd, op);
    if (!exists(shell.vfs, path)) return { stderr: `${op}: No such file or directory\n`, code: 1 };
    return install(shell, user, readFile(shell.vfs, path));
  }
  return { stderr: 'usage: crontab [-u user] { file | - | -l | -r | -e }\n', code: 1 };
}

function dateText(t: SimTime, format: string | undefined): string {
  if (format === undefined) {
    return `${DAYS[weekdayOf(t)] ?? ''} ${MONTHS[t.month - 1] ?? ''} ${String(t.day).padStart(2, ' ')} ${pad(t.hour)}:${pad(t.minute)}:00 JST ${String(t.year)}`;
  }
  const map: Record<string, string> = {
    F: `${String(t.year)}-${pad(t.month)}-${pad(t.day)}`, Y: String(t.year), m: pad(t.month), d: pad(t.day),
    H: pad(t.hour), M: pad(t.minute), S: '00', T: `${pad(t.hour)}:${pad(t.minute)}:00`, a: DAYS[weekdayOf(t)] ?? '', b: MONTHS[t.month - 1] ?? '', '%': '%',
  };
  return format.replace(/%(.)/g, (whole, c: string) => map[c] ?? whole);
}

/** 進める先の時刻。HH:MM は次にその時刻になる時、+30m・+2h はその分だけ先 */
function target(now: SimTime, spec: string): SimTime | null {
  const at = /^(\d{1,2}):(\d{2})$/.exec(spec);
  if (at) {
    const hour = Number(at[1]);
    const minute = Number(at[2]);
    if (hour > 23 || minute > 59) return null;
    let t = nextMinute(now);
    for (let n = 0; n < 1440 && !(t.hour === hour && t.minute === minute); n += 1) t = nextMinute(t);
    return t;
  }
  const rel = /^\+(\d+)([mh])$/.exec(spec);
  if (!rel) return null;
  const minutes = Number(rel[1]) * (rel[2] === 'h' ? 60 : 1);
  if (minutes < 1 || minutes > 7 * 1440) return null;
  let t = now;
  for (let n = 0; n < minutes; n += 1) t = nextMinute(t);
  return t;
}

function timeskip({ argv, shell, runLine }: CommandContext): CommandResult {
  const spec = argv[1];
  const now = nowOf(shell);
  const end = spec === undefined ? null : target(now, spec);
  if (end === null) return { stderr: 'usage: timeskip HH:MM（次にその時刻になるまで）| +30m | +2h\n', code: 2 };
  // 登録されている全ての利用者の仕事
  const jobs: { user: string; entry: CronEntry }[] = [];
  if (exists(shell.vfs, CRONTAB_DIR)) {
    for (const user of list(shell.vfs, CRONTAB_DIR)) {
      const parsed = parseCrontab(readFile(shell.vfs, spoolOf(user)));
      if ('entries' in parsed) for (const entry of parsed.entries) jobs.push({ user, entry });
    }
  }
  let state = shell;
  let stdout = '';
  let stderr = '';
  let pid = 900;
  const host = shell.vars.get('HOSTNAME') ?? 'arena';
  for (let t = nextMinute(now); ; t = nextMinute(t)) {
    for (const { user, entry } of jobs) {
      if (!matches(entry, t)) continue;
      pid += 1;
      stdout += `${MONTHS[t.month - 1] ?? ''} ${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}:01 ${host} CRON[${String(pid)}]: (${user}) CMD (${entry.command})\n`;
      // cron の仕事は、その利用者として、短い PATH とホームの現在地で動く
      const vars = new Map(state.vars);
      vars.set('USER', user);
      vars.set('HOME', homeOf(user));
      vars.set('PATH', CRON_PATH);
      vars.set('SHELL', '/bin/sh');
      vars.set(NOW_VAR, formatTime(t));
      const r = runLine(entry.command, { ...state, vars, cwd: homeOf(user) });
      state = { ...r.state, vars: new Map([...shell.vars, [NOW_VAR, formatTime(t)]]), cwd: shell.cwd };
      const out = r.stdout + r.stderr;
      if (out !== '') {
        // 書き出し先を決めていない出力は、その利用者へのメールになる
        const mail = `/var/mail/${user}`;
        const body = `From: root (Cron Daemon)\nSubject: Cron <${user}@${host}> ${entry.command}\n\n${out}\n`;
        state = { ...state, vfs: appendFile(mkdir(state.vfs, '/var/mail', true), mail, body) };
      }
      if (r.code !== 0) stderr += `timeskip: (${user}) の仕事が失敗した（終了コード ${String(r.code)}）: ${entry.command}\n`;
    }
    if (formatTime(t) === formatTime(end)) break;
  }
  stdout += `時計を ${formatTime(end)} に進めた\n`;
  return { stdout, stderr, code: stderr === '' ? 0 : 1, patch: { ...state, vars: new Map([...shell.vars, [NOW_VAR, formatTime(end)]]), cwd: shell.cwd } };
}

export const cronCommands: CommandSpec[] = [
  {
    name: 'crontab',
    summary: '定期実行を登録する（crontab - に 1 行を渡す / crontab ファイル / -l で見る / -r で消す / -e で編集）',
    handler: crontab,
  },
  {
    name: 'date',
    summary: '今の日付と時刻を見る（+%F で 年-月-日、+%H:%M で 時:分）',
    handler: ({ argv, shell }) => {
      const fmt = argv[1]?.startsWith('+') ? argv[1].slice(1) : undefined;
      return { stdout: `${dateText(nowOf(shell), fmt)}\n` };
    },
  },
  {
    name: 'timeskip',
    summary: '模擬の機械の時計を進める（本物の Linux には無い。cron の確かめ用）。timeskip 02:01 / +30m',
    handler: timeskip,
  },
];

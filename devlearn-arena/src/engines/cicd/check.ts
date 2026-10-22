import { headCommit } from '@/engines/git/repository';
import type { GitServer, ShellState } from '@/engines/kernel/registry';
import type { Conclusion, RunRecord } from './types';

/**
 * 実戦の達成条件 `{ kind: 'ci', expr }`（docs/content-spec.md 2.4）を、GitHub Actions の実行の記録と配る先で判定する。純粋な関数。
 *
 * 相手は、今いるリポジトリの origin の置き場（無ければ setup.actions のある置き場）。expr は空白で区切った条件で、全てを満たせば達成。先頭の `!` で否定。
 * 手順の文字の空白は `+` で書く（step:test/npm+test）:
 *   head                       一番新しい実行が、手元の今の記録（HEAD）を push して動いた物
 *   run=結果 / run:ワークフロー=結果  一番新しい実行（ワークフローの name かファイルの名前で絞る）の結果（success・failure）
 *   job:job=結果                その job の結果（success・failure・skipped）
 *   step:job/文字=結果           その job の、名前か run・uses にその文字を含む手順の結果
 *   has:job/文字                 その job の手順に、run・uses にその文字を含む物がある（YAML の形）
 *   order:job=文字,文字,…         その job の手順に、その文字を含む物がこの順にある
 *   needs:job=job,job            その job の needs（順は問わない。空なら依存が無い）
 *   elapsed<=分                  一番新しい実行が、その分（4m30s の形も書ける）までに終わった
 *   artifact:名前                一番新しい実行で、その名前の成果物を上げた
 *   got:job=名前                 その job が、その名前の成果物を受け取った
 *   deployed:名前=版             配る先の今の版
 *   release:名前~文字            配る先の今の版の中身に、その文字がある
 *   kept:名前=版                 配る先に、その版が置いてある
 */

function forgeOf(shell: ShellState): GitServer | undefined {
  const url = shell.git?.remotes.get('origin')?.url.replace(/\/+$/, '');
  const servers = [...(shell.gitServers?.values() ?? [])];
  return servers.find((g) => (g.url === url || g.ssh === url) && g.forge?.setup.actions) ?? servers.find((g) => g.forge?.setup.actions);
}

const words = (s: string): string => s.replace(/\+/g, ' ');

/** npm run test・npm run-script test は npm test と同じ（start・stop・restart も）。手順の文字を、この形にそろえて当てる */
const npmAlias = (s: string): string => s.replace(/\bnpm (?:run|run-script) (test|start|stop|restart)(?![\w:-])/g, 'npm $1');
const mentions = (hay: string, want: string): boolean => npmAlias(hay).includes(npmAlias(want));

function latest(runs: readonly RunRecord[], workflow?: string): RunRecord | undefined {
  return [...runs].reverse().find((r) => workflow === undefined || r.workflow === workflow || r.file === workflow || r.file.endsWith(`/${workflow}`));
}

const toSeconds = (t: string): number => {
  const m = /^(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (m && (m[1] !== undefined || m[2] !== undefined)) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return Number(t) * 60;
};

function termHolds(shell: ShellState, server: GitServer, term: string): boolean {
  const forge = server.forge;
  const runs = forge?.runs ?? [];
  const run = latest(runs);
  const bad = (): never => {
    throw new Error(`CI の条件「${term}」は知らない形`);
  };
  if (term === 'head') return run !== undefined && shell.git !== null && headCommit(shell.git) === run.sha;
  const el = /^elapsed<=(.+)$/.exec(term);
  if (el) return run !== undefined && !run.invalid && run.seconds <= toSeconds(el[1] ?? '');
  const m = /^([a-z]+)(?::([^=~]+))?(?:([=~])(.*))?$/.exec(term);
  if (!m) return bad();
  const [, key = '', arg = '', op, value = ''] = m;
  const jobOf = (r: RunRecord | undefined, k: string) => r?.jobs.find((j) => j.key === k);
  const shapeOf = (k: string) => run?.shape.find((j) => j.key === k);
  const site = (host: string) => forge?.sites?.find((s) => s.host === host);
  switch (key) {
    case 'run': {
      const r = arg === '' ? run : latest(runs, arg);
      return r !== undefined && r.conclusion === value;
    }
    case 'job':
      return jobOf(run, arg)?.conclusion === (value as Conclusion);
    case 'step': {
      const [k = '', text = ''] = [arg.slice(0, arg.indexOf('/')), words(arg.slice(arg.indexOf('/') + 1))];
      const s = jobOf(run, k)?.steps.find((x) => x.name.includes(text) || mentions(x.run ?? '', text) || (x.uses ?? '').includes(text));
      return s?.conclusion === (value as Conclusion);
    }
    case 'has': {
      const [k = '', text = ''] = [arg.slice(0, arg.indexOf('/')), words(arg.slice(arg.indexOf('/') + 1))];
      return shapeOf(k)?.steps.some((x) => mentions(x, text)) === true;
    }
    case 'order': {
      const steps = shapeOf(arg)?.steps ?? [];
      let at = -1;
      for (const want of value.split(',').map(words)) {
        const i = steps.findIndex((x, idx) => idx > at && mentions(x, want));
        if (i < 0) return false;
        at = i;
      }
      return true;
    }
    case 'needs': {
      const got = shapeOf(arg)?.needs;
      if (!got) return false;
      const want = value === '' ? [] : value.split(',');
      return got.length === want.length && want.every((w) => got.includes(w));
    }
    case 'artifact':
      return run?.artifacts.some((a) => a.name === arg) === true;
    case 'got':
      return jobOf(run, arg)?.downloaded.includes(value) === true;
    case 'deployed':
      return site(arg)?.current === value;
    case 'release': {
      const s = site(arg);
      const files = s?.releases.find((r) => r.version === s.current)?.files ?? {};
      return op === '~' && Object.values(files).some((t) => t.includes(value));
    }
    case 'kept':
      return site(arg)?.releases.some((r) => r.version === value) === true;
    default:
      return bad();
  }
}

export function ciHolds(shell: ShellState, expr: string): boolean {
  const server = forgeOf(shell);
  if (!server) return false;
  return expr.trim().split(/\s+/).every((t) => (t.startsWith('!') ? !termHolds(shell, server, t.slice(1)) : termHolds(shell, server, t)));
}

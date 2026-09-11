import type { Link, Topology } from '@/engines/net/types';

/**
 * 図の上の操作を、端末で打つコマンドに直す。
 *
 * 図をクリックしても状態を直接いじらない。必ずコマンドを1行作って端末に流す。
 * 端末にそのコマンドが残るので、「いまの操作はこのコマンドだった」と結び付く。
 */
export type RunCommand = (line: string) => void;

/** 空白や記号を含む名前は、端末でそのまま打てるよう引用符で囲む */
export function quoteArg(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/* ---------------- ファイルシステム ---------------- */

export const fsCommands = {
  cd: (path: string): string => `cd ${quoteArg(path)}`,
  cat: (path: string): string => `cat ${quoteArg(path)}`,
};

/* ---------------- Kubernetes ---------------- */

export const k8sCommands = {
  advance: (): string => 'kubectl wait 5',
  describePod: (name: string): string => `kubectl describe pod ${name}`,
  deletePod: (name: string): string => `kubectl delete pod ${name}`,
  /** 置かない印が付いていれば外し、付いていなければ付ける */
  toggleCordon: (node: string, unschedulable: boolean): string =>
    `kubectl ${unschedulable ? 'uncordon' : 'cordon'} ${node}`,
  scale: (deployment: string, replicas: number): string =>
    `kubectl scale deploy ${deployment} --replicas=${String(Math.max(0, replicas))}`,
};

/* ---------------- Git ---------------- */

/** 分岐して試すときのブランチ名。既にある名前とぶつからない最初のもの */
export function nextTryBranch(existing: readonly string[]): string {
  let n = 1;
  while (existing.includes(`try-${String(n)}`)) n += 1;
  return `try-${String(n)}`;
}

export const gitCommands = {
  show: (hash: string): string => `git show ${hash.slice(0, 7)}`,
  switchTo: (branch: string): string => `git switch ${branch}`,
  branchOut: (existing: readonly string[]): string => `git switch -c ${nextTryBranch(existing)}`,
  /** 作業ツリーの札 → 次の記録に入れる */
  stage: (path: string): string => `git add ${quoteArg(path)}`,
  /** インデックスの札 → 次の記録から外す（作業ツリーの中身はそのまま） */
  unstage: (path: string): string => `git restore --staged ${quoteArg(path)}`,
};

/* ---------------- ネットワーク ---------------- */

function ends(link: Link): { device: string; ifname: string }[] {
  return [link.a, link.b].map((end) => {
    const [device = '', ifname = ''] = end.split(':');
    return { device, ifname };
  });
}

/** 両端のインタフェースも含めて、そのケーブルがつながっているか */
export function linkIsUp(net: Topology, link: Link): boolean {
  if (!link.up) return false;
  return ends(link).every(({ device, ifname }) => {
    const iface = net.devices.get(device)?.interfaces.find((i) => i.name === ifname);
    return iface === undefined || iface.up;
  });
}

export const netCommands = {
  /** その機器の最初の IP アドレスへ、いま操作している機器から ping を打つ。IP を持たない機器は null */
  pingTo: (net: Topology, device: string): string | null => {
    const ip = net.devices.get(device)?.interfaces.find((i) => i.ip !== '')?.ip;
    return ip === undefined ? null : `ping ${ip}`;
  },
  operateOn: (device: string): string => `export NET_SELF=${device}`,
  /**
   * リンクを切る／繋ぐ。本物と同じ `ip link set <口> down|up` を打つ。
   * 自分がいる機器の口ならそのまま、ほかの機器の口なら `ip -n <機器>` でその機器の中で打つ。
   * 落ちている口があれば、それを戻す。ケーブルそのものが抜かれていれば、練習場の `netlab cable up` で挿し直す。
   */
  toggleLink: (net: Topology, link: Link, self: string): string => {
    if (!link.up) return `netlab cable up ${link.a} ${link.b}`;
    const both = ends(link);
    const ifaceOf = (e: { device: string; ifname: string }) =>
      net.devices.get(e.device)?.interfaces.find((i) => i.name === e.ifname);
    const down = both.find((e) => ifaceOf(e)?.up === false);
    const target =
      down ??
      both.find((e) => e.device === self) ??
      both.find((e) => net.devices.get(e.device)?.kind !== 'switch') ??
      both[0] ?? { device: self, ifname: '' };
    const ip = target.device === self ? 'ip' : `ip -n ${target.device}`;
    return `${ip} link set ${target.ifname} ${down ? 'up' : 'down'}`;
  },
};

/* ---------------- Pull Request ---------------- */

export const prCommands = {
  view: (n: number): string => `gh pr view ${String(n)}`,
  checks: (n: number): string => `gh pr checks ${String(n)}`,
  approve: (n: number): string => `gh pr review ${String(n)} --approve`,
  requestChanges: (n: number): string => `gh pr review ${String(n)} --request-changes`,
  merge: (n: number): string => `gh pr merge ${String(n)} --merge`,
};

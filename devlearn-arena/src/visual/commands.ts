import type { Link, Topology } from '@/engines/net/types';

/**
 * 図の上の操作を、端末で打つコマンドに直す。
 *
 * 図をクリックしても状態を直接いじらない。必ずコマンドを1行作って端末に流す。
 * 端末にそのコマンドが残るので、「いまの操作はこのコマンドだった」と結び付く。
 */
export type RunCommand = (line: string) => void;

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
   * ケーブルを抜く／挿す。
   * 自分がいる機器のケーブルなら、本物と同じ `ip link set <if> down|up` で落とす。
   * ほかの機器のケーブルは、練習場の `netlab cable` で抜き挿しする。
   */
  toggleLink: (net: Topology, link: Link, self: string): string => {
    const mine = ends(link).find((e) => e.device === self);
    if (mine !== undefined) {
      const iface = net.devices.get(self)?.interfaces.find((i) => i.name === mine.ifname);
      return `ip link set ${mine.ifname} ${iface?.up === false ? 'up' : 'down'}`;
    }
    return `netlab cable ${link.up ? 'down' : 'up'} ${link.a} ${link.b}`;
  },
};

/* ---------------- Pull Request ---------------- */

export const prCommands = {
  view: (n: number): string => `gh pr view ${String(n)}`,
  checks: (n: number): string => `gh pr checks ${String(n)}`,
  approve: (n: number): string => `gh pr review ${String(n)} --approve`,
  requestChanges: (n: number): string => `gh pr review ${String(n)} --request-changes`,
};

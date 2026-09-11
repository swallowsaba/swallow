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

/* ---------------- なぜそのコマンドなのか ---------------- */

/** コマンドの形 → 一行の説明。上から順に最初に合ったものを使う */
const WHY: readonly [RegExp, string][] = [
  [/^kubectl describe pod /, 'Pod の中身（状態やイベント）を見るには describe を使います。'],
  [/^kubectl delete pod /, 'Pod を消すには delete を使います。Deployment の持ち物なら、見張り係がすぐ作り直します。'],
  [/^kubectl cordon /, 'ノードに新しい Pod を置かせないようにするには cordon を使います（いま居る Pod はそのまま）。'],
  [/^kubectl uncordon /, 'cordon の印を外して、また Pod を置けるようにするには uncordon を使います。'],
  [/^kubectl scale /, 'あるべき数を変えるには scale を使います。実際に数を合わせるのは見張り係の仕事です。'],
  [/^kubectl wait /, '練習場では kubectl wait で時間を進めます。その間に各部品が順に仕事をします。'],
  [/^git show /, 'コミットの中身（誰が・何を変えたか）を見るには git show を使います。'],
  [/^git switch -c /, 'いまの場所から新しいブランチを作って移るには git switch -c を使います。'],
  [/^git switch /, 'ブランチを切り替えるには git switch を使います。HEAD の札がそのブランチへ移ります。'],
  [/^git add /, '次の記録（コミット）に入れるには、git add でインデックスに載せます。'],
  [/^git restore --staged /, 'インデックスから外すには git restore --staged を使います。手元の中身は消えません。'],
  [/^ping /, '相手まで届くかを確かめるには ping を使います。'],
  [/^ip -n \S+ link set \S+ down$/, 'ほかの機器の口を止めるには、その機器の中で ip link set <口> down を打ちます（-n で機器を指定）。'],
  [/^ip -n \S+ link set \S+ up$/, 'ほかの機器の止まった口を戻すには、その機器の中で ip link set <口> up を打ちます（-n で機器を指定）。'],
  [/^ip link set \S+ down$/, 'ネットワークの口を止めるには ip link set <口> down を使います。'],
  [/^ip link set \S+ up$/, '止まった口を戻すには ip link set <口> up を使います。'],
  [/^netlab cable up /, '抜かれたケーブルを挿し直します（練習場だけのコマンドです）。'],
  [/^export NET_SELF=/, '操作する機器を切り替えます。練習場では NET_SELF が「いまいる機器」です。'],
  [/^gh pr checks /, 'Pull Request のチェック（Actions）の結果を見るには gh pr checks を使います。'],
  [/^gh pr review \d+ --approve/, 'Pull Request を承認するには gh pr review --approve を使います。'],
  [/^gh pr review \d+ --request-changes/, '直してほしいと返すには gh pr review --request-changes を使います。'],
  [/^gh pr view /, 'Pull Request の中身を見るには gh pr view を使います。'],
  [/^gh pr merge /, 'Pull Request を取り込むには gh pr merge を使います。'],
  [/^cd /, 'いる場所（ディレクトリ）を移るには cd を使います。'],
  [/^cat /, 'ファイルの中身を見るには cat を使います。'],
  [/^hint$/, 'ヒントは端末で hint と打つと1件ずつ出ます。ボタンを押さずに自分で打っても同じです。'],
];

/** 図の操作から打つコマンドが、なぜその形なのかを一行で返す。知らない形なら null */
export function explainCommand(line: string): string | null {
  return WHY.find(([pattern]) => pattern.test(line))?.[1] ?? null;
}

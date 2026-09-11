import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import type { LessonDefinition } from '../types';
import { ran } from '../authoring/ran';

/** web が待ち受けていないため、ping は通るのに curl が失敗する構成 */
function brokenServiceNet(listening: number[]) {
  resetMac();
  const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
  });
  const gw = router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]);
  const web = host('web', [iface('eth0', '10.0.0.20', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
    listening,
  });
  return topology(
    [pc1, gw, web],
    [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
    { 'web.internal': '10.0.0.20' },
  );
}

export const netFirstHop: LessonDefinition = {
  id: 'net/05/ttl-hop',
  track: 'net',
  kind: 'training',
  title: '経路をたどる',
  objectives: ['自分のアドレスと経路を読める', 'ホップごとに何が変わるか分かる', 'CIDR を計算できる'],
  parCommands: 8,
  initial: {
    net: brokenServiceNet([80]),
    vars: { NET_SELF: 'pc1' },
    files: { '/home/learner': null },
  },
  steps: [
    {
      prompt: '自分のアドレスと経路表を確認せよ。',
      check: 'ip addr と ip route を実行したこと',
      hints: ['ip addr', 'ip route'],
      solution: ['ip addr', 'ip route'],
      assert: ({ history }) =>
        ran(history, 'ip', ['addr', 'a', 'address']) && ran(history, 'ip', ['route', 'r']),
      explain:
        '自分の IP とマスク、そしてデフォルトゲートウェイ。切り分けはここから始める。',
    },
    {
      prompt: 'web.internal まで届くことを確かめ、経路を1ホップずつ表示せよ。',
      check: 'ping と traceroute を実行したこと',
      hints: ['ping web.internal', 'traceroute web.internal'],
      solution: ['ping web.internal', 'traceroute web.internal'],
      assert: ({ history }) => ran(history, 'ping') && ran(history, 'traceroute'),
      explain:
        'ホップごとに TTL が 1 ずつ減り、MAC は次の相手のものに書き換わる。IP だけが最後まで変わらない。',
    },
    {
      prompt: '/home/learner/subnet.txt に、192.168.1.10/26 のネットワークアドレスを書き出せ。',
      check: 'subnet.txt に 192.168.1.0 が含まれること',
      hints: ['ipcalc 192.168.1.10/26 で計算できる', 'ipcalc の結果をそのまま書き出してもよい'],
      solution: ['ipcalc 192.168.1.10/26 > subnet.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/subnet.txt');
        return node?.kind === 'file' && node.content.includes('192.168.1.0');
      },
      explain:
        '/26 はホスト部が 6 ビット。62 台まで置ける。設計はこの計算が土台になる。',
    },
  ],
};

export const netUnreachableBoss: LessonDefinition = {
  id: 'net/14/boss-final',
  track: 'net',
  kind: 'boss',
  title: 'ping は通るのに curl が失敗する',
  objectives: ['層ごとに切り分けられる', '到達性と待ち受けの違いが分かる'],
  parCommands: 10,
  initial: {
    net: brokenServiceNet([]),
    vars: { NET_SELF: 'pc1' },
    files: { '/home/learner': null },
  },
  steps: [
    {
      prompt: '症状を確かめよ。ping と curl の両方を試すこと。',
      check: 'ping と curl を実行したこと',
      hints: ['ping web.internal', 'curl -v http://web.internal/'],
      solution: ['ping web.internal', 'curl -v http://web.internal/'],
      assert: ({ history }) => ran(history, 'ping') && ran(history, 'curl'),
      explain:
        'ping が通るなら、IP までは届いている。つまり経路とケーブルは生きている。問題はその上の層。',
    },
    {
      prompt: '/home/learner/diagnosis.txt に、どの層まで到達していて何が原因かを書け。「refused」という語を含めること。',
      check: 'diagnosis.txt に refused が含まれること',
      hints: [
        'curl -v の最後の行に理由が出ている',
        'echo "IP までは到達。TCP 80 が Connection refused" > diagnosis.txt',
      ],
      solution: ['echo "IP までは到達。TCP 80 が Connection refused" > diagnosis.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/diagnosis.txt');
        return node?.kind === 'file' && node.content.includes('refused');
      },
      diagnose: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/diagnosis.txt');
        if (node === undefined) return null;
        if (node.kind === 'file' && !node.content.includes('refused')) {
          return 'ファイルはありますが refused の語がありません。curl の出力をもう一度読んでください。';
        }
        return null;
      },
      explain:
        'Connection refused は「届いたが、そのポートで誰も待っていない」という意味。' +
        'タイムアウト（届いていない）とは原因がまるで違う。この2つを混同しないことが切り分けの要。',
    },
  ],
};

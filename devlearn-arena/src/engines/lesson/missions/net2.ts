import {
  host, iface, link, nat, port, resetMac, router, switchDevice, topology,
} from '@/engines/net/factory';
import { HOME } from '@/engines/kernel/path';
import type { Topology } from '@/engines/net/types';
import type { LessonDefinition } from '../types';

const FILES = { [HOME]: null };

/** pc1 ── sw1 ── pc2 の1セグメント。VLAN を後から付けられるようにしておく */
function lan(vlans: { pc1?: number; pc2?: number } = {}): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], { listening: [80] }),
      host('pc2', [iface('eth0', '192.168.1.20', 24)], { listening: [80] }),
      switchDevice('sw1', [
        port('p1', { vlan: vlans.pc1 ?? null }),
        port('p2', { vlan: vlans.pc2 ?? null }),
      ]),
    ],
    [link('pc1:eth0', 'sw1:p1'), link('pc2:eth0', 'sw1:p2')],
    { 'pc2.local': '192.168.1.20' },
  );
}

/** 内側 → NAT ルータ → 外側 */
function nattedNet(): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], {
        routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      }),
      router(
        'gw',
        [iface('eth0', '192.168.1.1', 24), iface('eth1', '203.0.113.1', 24)],
        [{ destination: '0.0.0.0/0', via: '203.0.113.2', dev: 'eth1' }],
        { nat: nat('192.168.1.0/24', '203.0.113.1') },
      ),
      host('web', [iface('eth0', '203.0.113.2', 24)], { listening: [80, 443] }),
    ],
    [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
    { 'shop.example.com': '203.0.113.2' },
  );
}

import { DNS_WORLD } from './netFixtures';

export const netLayers: LessonDefinition = {
  id: 'net/01/encapsulation',
  track: 'net',
  kind: 'training',
  title: '層ごとに包まれていることを見る',
  objectives: ['フレーム・パケット・セグメントの入れ子が分かる', 'どの層で止まったかを読める'],
  parCommands: 8,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '自分のインタフェースを確認し、pc2 まで届くことを確かめよ。',
      check: 'ip addr と ping を実行したこと',
      hints: ['ip addr', 'ping 192.168.1.20'],
      assert: ({ history }) =>
        history.some((l) => l.includes('ip addr')) && history.some((l) => l.startsWith('ping')),
      explain:
        '通信は上から下へ包まれる。アプリのデータに TCP のヘッダが付き、IP のヘッダが付き、最後に Ethernet のヘッダが付く。',
    },
    {
      prompt: '経路を1ホップずつ表示し、どの機器を通ったか確かめよ。',
      check: 'traceroute を実行したこと',
      hints: ['traceroute 192.168.1.20'],
      assert: ({ history }) => history.some((l) => l.startsWith('traceroute')),
      explain:
        '同じセグメントなら L2 だけで届く。スイッチは IP を見ないので、TTL も減らない。',
    },
    {
      prompt: '待ち受けていないポートへ繋いでみて、どの層で断られるかを見よ。',
      check: 'curl で 8080 番に繋ごうとしたこと',
      hints: ['curl -v http://192.168.1.20:8080/'],
      assert: ({ history }) => history.some((l) => l.includes('8080')),
      explain:
        '「届かない」と「届いたが断られた」は別。L3 まで届いていれば Connection refused、届いていなければ unreachable になる。',
    },
  ],
};

export const netArp: LessonDefinition = {
  id: 'net/02/arp-resolve',
  track: 'net',
  kind: 'training',
  title: 'IP から MAC を引く',
  objectives: ['ARP が何をしているか分かる', '表に覚えることが分かる', '解決できないときの症状が分かる'],
  parCommands: 8,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: 'まだ誰とも話していないので、ARP 表が空であることを確かめよ。',
      check: 'arp を実行したこと',
      hints: ['arp'],
      assert: ({ history }) => history.some((l) => l.trim() === 'arp' || l.startsWith('arp ')),
      explain:
        '同じセグメントに送るには相手の MAC が要る。知らなければ「この IP は誰ですか」とブロードキャストで聞く。',
    },
    {
      prompt: '192.168.1.20 の MAC を引け。',
      check: 'ARP 表に 192.168.1.20 が載っていること',
      hints: ['arp 192.168.1.20'],
      assert: ({ shell }) =>
        shell.net?.devices.get('pc1')?.arp['192.168.1.20'] !== undefined,
      explain: '一度引いた対応は表に残る。だから2回目からは問い合わせが要らない。',
    },
    {
      prompt: 'いない相手（192.168.1.99）を引いてみて、どうなるか確かめよ。',
      check: '192.168.1.99 を引こうとしたこと',
      hints: ['arp 192.168.1.99'],
      assert: ({ history }) => history.some((l) => l.includes('192.168.1.99')),
      explain:
        'ARP は返事が無ければ諦めるしかない。「相手がいない」と「返事をしない」は区別できないので、上の層からは同じに見える。',
    },
  ],
};

export const netSwitching: LessonDefinition = {
  id: 'net/02/switch-learning',
  track: 'net',
  kind: 'training',
  title: 'スイッチは通ったフレームを覚える',
  objectives: ['未学習ならフラッディングすると分かる', '学習後は絞り込まれると分かる', 'VLAN で分けられると分かる'],
  parCommands: 10,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: 'まだ何も通っていないので、MAC テーブルが空であることを確かめよ。',
      check: 'bridge を実行したこと',
      hints: ['bridge fdb sw1'],
      assert: ({ history }) => history.some((l) => l.startsWith('bridge')),
      explain: 'スイッチは最初、誰がどのポートにいるかを知らない。',
    },
    {
      prompt: 'pc2 と通信して、スイッチに覚えさせよ。',
      check: 'sw1 の MAC テーブルに何か載っていること',
      hints: ['arp 192.168.1.20', 'ping 192.168.1.20'],
      assert: ({ shell }) =>
        Object.keys(shell.net?.devices.get('sw1')?.macTable ?? {}).length > 0,
      explain:
        '入ってきたフレームの送信元 MAC と、入ってきたポートを覚える。宛先ではなく送信元で学ぶのがポイント。',
    },
    {
      prompt: '覚えた内容を確かめよ。',
      check: 'もう一度 bridge を実行したこと',
      hints: ['bridge fdb sw1'],
      assert: ({ history }) => history.filter((l) => l.startsWith('bridge')).length >= 2,
      explain:
        '覚えるまでは全ポートに流す（フラッディング）。覚えたら該当ポートだけに送るので、無駄な帯域を使わなくなる。',
    },
  ],
};

export const netSubnetting: LessonDefinition = {
  id: 'net/03/subnet-drill',
  track: 'net',
  kind: 'training',
  title: 'アドレス設計を計算で決める',
  objectives: ['プレフィックス長からホスト数を出せる', '分割の結果を確かめられる'],
  parCommands: 8,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '10.0.0.0/22 に何台置けるかを調べ、/home/learner/hosts.txt に書き出せ。',
      check: 'hosts.txt に 1022 が含まれること',
      hints: ['ipcalc 10.0.0.0/22', 'ipcalc 10.0.0.0/22 > hosts.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/hosts.txt`);
        return node?.kind === 'file' && node.content.includes('1022');
      },
      explain:
        'ホスト部が 10 ビットなら 1024 通り。ネットワークアドレスとブロードキャストを引いて 1022 台。',
    },
    {
      prompt: '172.16.5.130/26 のネットワークアドレスを /home/learner/net.txt に書き出せ。',
      check: 'net.txt に 172.16.5.128 が含まれること',
      hints: ['ipcalc 172.16.5.130/26'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/net.txt`);
        return node?.kind === 'file' && node.content.includes('172.16.5.128');
      },
      explain:
        '/26 は 64 個ずつの区切り。130 は 128〜191 の区画に入る。境界は暗記ではなく計算で出す。',
    },
  ],
};

export const netIpv6: LessonDefinition = {
  id: 'net/04/ipv6-format',
  track: 'net',
  kind: 'training',
  title: 'IPv6 の書き方に慣れる',
  objectives: ['省略記法を展開できる', 'アドレスの種類を見分けられる', 'SLAAC の作られ方が分かる'],
  parCommands: 8,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '2001:db8::1 を展開した形を /home/learner/v6.txt に書き出せ。',
      check: 'v6.txt に 2001:0db8:0000:0000:0000:0000:0000:0001 が含まれること',
      hints: ['ip6calc 2001:db8::1', 'ip6calc 2001:db8::1 > v6.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/v6.txt`);
        return node?.kind === 'file' && node.content.includes('2001:0db8:0000:0000:0000:0000:0000:0001');
      },
      explain:
        '`::` は「0 が続くところ」の省略。1か所にしか使えないのは、そうしないと元に戻せなくなるため。',
    },
    {
      prompt: 'fe80::1 がどの種類のアドレスかを調べよ。',
      check: 'fe80::1 を ip6calc で調べたこと',
      hints: ['ip6calc fe80::1'],
      assert: ({ history }) => history.some((l) => l.includes('fe80::1')),
      explain:
        'fe80::/10 はリンクローカル。同じリンクの中でしか使えず、ルータを越えない。近隣探索はここで動く。',
    },
    {
      prompt: '2001:db8::/64 と MAC 00:1a:2b:3c:4d:5e から、SLAAC のアドレスを /home/learner/slaac.txt に書き出せ。',
      check: 'slaac.txt に 21a:2bff:fe3c:4d5e が含まれること',
      hints: ['ip6calc 2001:db8::/64 00:1a:2b:3c:4d:5e'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/slaac.txt`);
        return node?.kind === 'file' && node.content.includes('21a:2bff:fe3c:4d5e');
      },
      explain:
        'MAC の真ん中に fffe を挟み、7 ビット目を反転させて 64 ビットにする。DHCP なしでアドレスが決まる。',
    },
  ],
};

export const netNat: LessonDefinition = {
  id: 'net/06/pat-ports',
  track: 'net',
  kind: 'training',
  title: '1つの外側アドレスを分け合う',
  objectives: ['NAT が何を書き換えるか分かる', 'ポートで多重化していると分かる', '変換表を読める'],
  parCommands: 10,
  initial: { net: nattedNet(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: 'まだ外に出ていないので、変換表が空であることを確かめよ。',
      check: 'nat を実行したこと',
      hints: ['nat gw'],
      assert: ({ history }) => history.some((l) => l.startsWith('nat')),
      explain: 'NAT の表は、通信が起きて初めて増える。設定ではなく記録。',
    },
    {
      prompt: '外の web（203.0.113.2）に繋いで、変換表に対応が載ることを確かめよ。',
      check: '変換表が1行以上になっていること',
      hints: ['curl http://203.0.113.2/', 'そのあと nat gw'],
      assert: ({ shell }) => (shell.net?.devices.get('gw')?.nat?.table.length ?? 0) >= 1,
      explain:
        '出ていくときに送信元 IP とポートを書き換え、「戻ってきたら誰に返すか」を覚える。だから外から先に繋ぐことはできない。',
    },
    {
      prompt: 'もう一度、別の接続を出して、外側ポートが変わることを確かめよ。',
      check: '変換表が2行以上になっていること',
      hints: ['curl http://203.0.113.2:443/', 'nat gw'],
      assert: ({ shell }) => (shell.net?.devices.get('gw')?.nat?.table.length ?? 0) >= 2,
      explain:
        '外側アドレスは1つでも、ポート番号を変えれば何本でも区別できる。これが PAT（NAPT）。',
    },
  ],
};

export const netTcp: LessonDefinition = {
  id: 'net/07/handshake',
  track: 'net',
  kind: 'training',
  title: '接続を張って、閉じる',
  objectives: ['3ウェイの意味が分かる', '状態が順に遷移すると分かる', 'TIME_WAIT の理由が分かる'],
  parCommands: 10,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: 'まだ接続していない状態で、データを送ろうとしてみよ。',
      check: 'tcp send を実行したこと',
      hints: ['tcp reset', 'tcp send'],
      assert: ({ history }) => history.some((l) => l.startsWith('tcp send')),
      explain: 'CLOSED からいきなりデータは送れない。先に相手と合意を取る必要がある。',
    },
    {
      prompt: '接続を張れ。',
      check: 'client が ESTABLISHED になっていること',
      hints: ['tcp connect'],
      assert: ({ shell }) => {
        const raw = shell.vars.get('TCP_STATE');
        return raw !== undefined && raw.includes('"state":"ESTABLISHED"');
      },
      explain:
        'SYN → SYN+ACK → ACK。3回なのは、双方が「相手に届くこと」を確かめる必要があるから。2回では片方しか確かめられない。',
    },
    {
      prompt: 'データを送り、そのあと接続を閉じよ。',
      check: 'client が TIME_WAIT になっていること',
      hints: ['tcp send 200', 'tcp close'],
      assert: ({ shell }) => {
        const raw = shell.vars.get('TCP_STATE');
        return raw !== undefined && raw.includes('"state":"TIME_WAIT"');
      },
      explain:
        '閉じ始めた側は、最後の ACK が相手に届いたか確かめられない。だからしばらく居残る。それが TIME_WAIT。',
    },
    {
      prompt: '時間を進めて、CLOSED になることを確かめよ。',
      check: 'client が CLOSED になっていること',
      hints: ['tcp tick 8', 'tcp state'],
      assert: ({ shell }) => {
        const raw = shell.vars.get('TCP_STATE');
        return raw !== undefined && raw.includes('"state":"CLOSED"');
      },
      explain:
        'TIME_WAIT が明けて初めて、そのポートの組み合わせを再利用できる。短時間に大量の接続を張ると枯れるのはこのため。',
    },
  ],
};

export const netDns: LessonDefinition = {
  id: 'net/08/dns-recursion',
  track: 'net',
  kind: 'training',
  title: 'ルートから順に聞いていく',
  objectives: ['委任を辿る流れが分かる', 'キャッシュと TTL の効き方が分かる', '古い答えが残る理由が分かる'],
  parCommands: 10,
  initial: {
    net: lan(),
    vars: { NET_SELF: 'pc1', DNS_WORLD },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: 'www.example.com を、ルートから辿って引け。',
      check: 'dnstrace を実行したこと',
      hints: ['dnstrace www.example.com'],
      assert: ({ history }) => history.some((l) => l.startsWith('dnstrace www.example.com')),
      explain:
        'ルートは「com はあっちに聞け」としか言わない。そうやって委任を辿るので、誰も全部を知らなくて済む。',
    },
    {
      prompt: 'もう一度同じ名前を引き、キャッシュから返ることを確かめよ。',
      check: '同じ名前を2回引いたこと',
      hints: ['dnstrace www.example.com をもう一度'],
      assert: ({ history }) =>
        history.filter((l) => l.includes('dnstrace www.example.com')).length >= 2,
      explain: '2回目は辿らない。だから速いが、変更がすぐには反映されない。',
    },
    {
      prompt: '別名（CNAME）の shop.example.com を引き、最後まで辿ることを確かめよ。',
      check: 'shop.example.com を引いたこと',
      hints: ['dnstrace shop.example.com'],
      assert: ({ history }) => history.some((l) => l.includes('shop.example.com')),
      explain:
        'CNAME は「別名」。引いた側が、その先をもう一度引き直す。段数が増えるぶんだけ遅くなる。',
    },
  ],
};

export const netDhcp: LessonDefinition = {
  id: 'net/09/dora',
  track: 'net',
  kind: 'training',
  title: 'アドレスを借りる',
  objectives: ['DORA の4段の意味が分かる', 'リースに期限があると分かる'],
  parCommands: 8,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: 'DHCP でアドレスを借りよ。',
      check: 'dhclient を実行し、192.168.1.100 が割り当たったこと',
      hints: ['dhclient'],
      assert: ({ shell }) =>
        shell.net?.devices.get('pc1')?.interfaces[0]?.ip === '192.168.1.100',
      explain:
        'Discover（誰かいますか）→ Offer（これはどうですか）→ Request（それをください）→ Ack（どうぞ）。',
    },
    {
      prompt: 'なぜ2往復するのかを確かめよ。もう一度実行して、同じアドレスが返ることを見ること。',
      check: 'dhclient を2回実行したこと',
      hints: ['dhclient をもう一度'],
      assert: ({ history }) => history.filter((l) => l.startsWith('dhclient')).length >= 2,
      explain:
        'サーバが複数いるかもしれないので、提案を受けてから「どれにするか」を全体に宣言する。だから Offer と Request が分かれている。',
    },
  ],
};

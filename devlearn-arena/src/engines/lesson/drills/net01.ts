import { emptyTopology } from '@/engines/net/build';
import { parseCidr } from '@/engines/net/subnet';
import {
  canReach, cannotReach, deviceExists, fileEquals, hasRoute, interfaceHas, withNet,
} from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man, rfc } from './shared';
import { PORTS, privateCidrs, slugify } from './values';

const IP_DOC = man('ip', 8);
const RFC1918 = rfc(1918, 'RFC 1918 Address Allocation for Private Internets');

/* ------------------------------------------------------------------ *
 * net/01 まず2台を繋ぐ
 * ------------------------------------------------------------------ */

interface PairSpec {
  slug: string;
  cidr: string;
  a: string;
  b: string;
}

/** 私用アドレス空間から、2台ぶんの組を作る */
const PAIRS: PairSpec[] = privateCidrs(40)
  .filter((cidr) => Number(cidr.split('/')[1] ?? '24') <= 30)
  .map((cidr) => {
    const c = parseCidr(cidr);
    return { slug: slugify(cidr), cidr: String(c.prefix), a: c.firstHost, b: c.lastHost };
  });

const pairDrills = family<PairSpec>({
  track: 'net',
  chapterId: 'net/01',
  family: 'two-hosts',
  docs: [IP_DOC, RFC1918],
  variants: PAIRS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `pc1 と pc2 を ${v.a}/${v.cidr} の網で繋ぐ`,
    objectives: ['機器を用意できる', 'ケーブルを繋げる', 'アドレスを付けられる', '届くことを確かめられる'],
    initial: { net: emptyTopology(), vars: { NET_SELF: 'pc1' }, files: { [HOME]: null } },
    solution: [
      'netlab add host pc1',
      'netlab add host pc2',
      'netlab link pc1:eth0 pc2:eth0',
      `ip addr add ${v.a}/${v.cidr} dev eth0`,
      'export NET_SELF=pc2',
      `ip addr add ${v.b}/${v.cidr} dev eth0`,
      'export NET_SELF=pc1',
    ],
    steps: [
      {
        prompt: 'pc1 と pc2 という機器を用意し、eth0 どうしをケーブルで繋げ。',
        conditions: [
          { label: 'pc1 があること', test: deviceExists('pc1'), howTo: 'netlab add host <名前>' },
          { label: 'pc2 があること', test: deviceExists('pc2'), howTo: 'netlab add host <名前>' },
          {
            label: 'pc1:eth0 と pc2:eth0 が繋がっていること',
            test: withNet((n) =>
              n.links.some(
                (l) =>
                  (l.a === 'pc1:eth0' && l.b === 'pc2:eth0') ||
                  (l.a === 'pc2:eth0' && l.b === 'pc1:eth0'),
              ),
            ),
            howTo: 'netlab link <機器>:<口> <機器>:<口>。netlab list で今の様子が見えます',
          },
        ],
        hints: [
          'netlab add host pc1',
          'netlab link pc1:eth0 pc2:eth0',
        ],
        explain:
          '線が繋がっただけでは何も通らない。IP はまだ付いていないので、この時点では L2 の配線ができただけ。',
      },
      {
        prompt: `pc1 に ${v.a}/${v.cidr}、pc2 に ${v.b}/${v.cidr} を付けよ。操作する機器は export NET_SELF=<名前> で切り替える。`,
        conditions: [
          {
            label: `pc1:eth0 が ${v.a}/${v.cidr} であること`,
            test: interfaceHas('pc1', 'eth0', `${v.a}/${v.cidr}`),
            howTo: 'ip addr add <CIDR> dev <口>',
          },
          {
            label: `pc2:eth0 が ${v.b}/${v.cidr} であること`,
            test: interfaceHas('pc2', 'eth0', `${v.b}/${v.cidr}`),
            howTo: 'export NET_SELF=pc2 で操作する相手を変えます',
          },
        ],
        hints: [
          `ip addr add ${v.a}/${v.cidr} dev eth0`,
          'export NET_SELF=pc2 で pc2 側の操作になる',
          `ip addr add ${v.b}/${v.cidr} dev eth0`,
        ],
        explain:
          'アドレスを付けると、その網への直結経路が自動で生える。ip route を見ると proto kernel と書かれた行がそれ。',
      },
      {
        prompt: `pc1 から ${v.b} に届くことを確かめよ。`,
        check: `pc1 から ${v.b} に届くこと`,
        assert: canReach('pc1', v.b),
        hints: ['export NET_SELF=pc1 に戻す', `ping ${v.b}`],
        explain:
          '同じ網の中なので、ルータは要らない。相手の MAC を ARP で解決して、そのまま投げるだけ。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * net/03 CIDR の計算
 * ------------------------------------------------------------------ */

/** 私用アドレス空間から並べる。プレフィックス長も散らす */
const CIDRS: { slug: string; value: string }[] = privateCidrs(60).map((value) => ({
  slug: slugify(value),
  value,
}));

const cidrDrills = family<string>({
  track: 'net',
  chapterId: 'net/03',
  family: 'cidr',
  docs: [rfc(4632, 'RFC 4632 Classless Inter-domain Routing')],
  variants: CIDRS,
  make: (cidr) => {
    const c = parseCidr(cidr);
    return {
      title: `${cidr} の範囲を求める`,
      objectives: ['ネットワークアドレスが出せる', 'ブロードキャストが出せる', '使える数が出せる'],
      initial: { net: emptyTopology(), files: { [HOME]: null }, cwd: HOME },
      solution: [
        `echo "${c.network}" > network.txt`,
        `echo "${c.broadcast}" > broadcast.txt`,
        `echo "${String(c.hosts)}" > hosts.txt`,
      ],
      steps: [
        {
          prompt: `${cidr} のネットワークアドレスを network.txt に書け。`,
          check: `network.txt の中身が ${c.network} であること`,
          assert: fileEquals('network.txt', c.network),
          hints: ['ipcalc <CIDR> で全部出る', `ipcalc ${cidr}`, `echo "${c.network}" > network.txt`],
          explain:
            'ネットワークアドレスは、ホスト部を全て 0 にしたもの。プレフィックス長がその境目を決める。',
        },
        {
          prompt: 'ブロードキャストアドレスを broadcast.txt に書け。',
          check: `broadcast.txt の中身が ${c.broadcast} であること`,
          assert: fileEquals('broadcast.txt', c.broadcast),
          hints: [`ipcalc ${cidr}`, `echo "${c.broadcast}" > broadcast.txt`],
          explain: 'ブロードキャストは、ホスト部を全て 1 にしたもの。その網の全員に届く宛先。',
        },
        {
          prompt: '割り当てられるホストの数を hosts.txt に書け。',
          check: `hosts.txt の中身が ${String(c.hosts)} であること`,
          assert: fileEquals('hosts.txt', String(c.hosts)),
          hints: [`ipcalc ${cidr}`, `echo "${String(c.hosts)}" > hosts.txt`],
          explain:
            'ホスト部のビット数を n とすると 2^n 個。そこからネットワークとブロードキャストの2つを引く（/31 と /32 は例外）。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * net/05 ルータを挟んで別の網へ
 * ------------------------------------------------------------------ */

interface RouteSpec {
  slug: string;
  left: string;
  right: string;
  gwLeft: string;
  gwRight: string;
  pc1: string;
  pc2: string;
}

/** 隣り合う2つの網を作り、ルータで繋ぐ形に整える */
const ROUTES: RouteSpec[] = privateCidrs(30)
  .filter((cidr) => cidr.endsWith('/24'))
  .map((cidr) => {
    const parts = cidr.split('/')[0]?.split('.').map(Number) ?? [10, 0, 0, 0];
    const [a = 10, b = 0, c = 0] = parts;
    const left = `${String(a)}.${String(b)}.${String(c)}.0/24`;
    const right = `${String(a)}.${String(b)}.${String((c + 1) % 256)}.0/24`;
    return {
      slug: slugify(left),
      left,
      right,
      gwLeft: `${String(a)}.${String(b)}.${String(c)}.254`,
      gwRight: `${String(a)}.${String(b)}.${String((c + 1) % 256)}.254`,
      pc1: `${String(a)}.${String(b)}.${String(c)}.1`,
      pc2: `${String(a)}.${String(b)}.${String((c + 1) % 256)}.1`,
    };
  });

const routeDrills = family<RouteSpec>({
  track: 'net',
  chapterId: 'net/05',
  family: 'router',
  docs: [IP_DOC],
  variants: ROUTES.map((value) => ({ slug: value.slug, value })),
  make: (v) => {
    const prefix = v.left.split('/')[1] ?? '24';
    return {
      title: `${v.left} と ${v.right} をルータで繋ぐ`,
      objectives: ['網をまたぐには経路が要ると分かる', '既定経路を置ける', '経路を消すと届かなくなると分かる'],
      initial: { net: emptyTopology(), vars: { NET_SELF: 'pc1' }, files: { [HOME]: null } },
      solution: [
        'netlab add host pc1',
        'netlab add host pc2',
        'netlab add router r1',
        'netlab link pc1:eth0 r1:eth0',
        'netlab link pc2:eth0 r1:eth1',
        `ip addr add ${v.pc1}/${prefix} dev eth0`,
        'export NET_SELF=r1',
        `ip addr add ${v.gwLeft}/${prefix} dev eth0`,
        `ip addr add ${v.gwRight}/${prefix} dev eth1`,
        'export NET_SELF=pc2',
        `ip addr add ${v.pc2}/${prefix} dev eth0`,
        `ip route add default via ${v.gwRight} dev eth0`,
        'export NET_SELF=pc1',
        `ip route add default via ${v.gwLeft} dev eth0`,
      ],
      steps: [
        {
          prompt: `pc1・pc2・ルータ r1 を用意し、pc1:eth0 を r1:eth0 に、pc2:eth0 を r1:eth1 に繋げ。`,
          conditions: [
            { label: 'pc1 があること', test: deviceExists('pc1') },
            { label: 'pc2 があること', test: deviceExists('pc2') },
            { label: 'r1 がルータとして用意されていること', test: withNet((n) => n.devices.get('r1')?.kind === 'router'), howTo: 'netlab add router r1' },
            {
              label: '2 本のケーブルが繋がっていること',
              test: withNet((n) => n.links.length >= 2),
              howTo: 'netlab list で確かめられます',
            },
          ],
          hints: ['netlab add router r1', 'netlab link pc1:eth0 r1:eth0', 'netlab link pc2:eth0 r1:eth1'],
          explain: 'ルータは2つ以上の網に足を出す機器。片足ずつ別の網に置く。',
        },
        {
          prompt: `pc1 に ${v.pc1}/${prefix}、r1 の eth0 に ${v.gwLeft}/${prefix}、eth1 に ${v.gwRight}/${prefix}、pc2 に ${v.pc2}/${prefix} を付けよ。`,
          conditions: [
            { label: `pc1:eth0 = ${v.pc1}/${prefix}`, test: interfaceHas('pc1', 'eth0', `${v.pc1}/${prefix}`) },
            { label: `r1:eth0 = ${v.gwLeft}/${prefix}`, test: interfaceHas('r1', 'eth0', `${v.gwLeft}/${prefix}`) },
            { label: `r1:eth1 = ${v.gwRight}/${prefix}`, test: interfaceHas('r1', 'eth1', `${v.gwRight}/${prefix}`) },
            { label: `pc2:eth0 = ${v.pc2}/${prefix}`, test: interfaceHas('pc2', 'eth0', `${v.pc2}/${prefix}`) },
          ],
          hints: [
            `ip addr add ${v.pc1}/${prefix} dev eth0`,
            'export NET_SELF=r1 でルータ側の操作になる',
            `ip addr add ${v.gwLeft}/${prefix} dev eth0`,
          ],
          explain:
            'ルータの各口は、それぞれの網の一員になる。だからその網のアドレスを付ける。',
        },
        {
          prompt: `この時点では ${v.pc2} に届かない。pc1 と pc2 の両方に既定経路を置いて、届くようにせよ。`,
          conditions: [
            {
              label: `pc1 に ${v.gwLeft} 宛の既定経路があること`,
              test: hasRoute('pc1', '0.0.0.0/0', v.gwLeft),
              howTo: 'ip route add default via <ルータ> dev <口>',
            },
            {
              label: `pc2 に ${v.gwRight} 宛の既定経路があること`,
              test: hasRoute('pc2', '0.0.0.0/0', v.gwRight),
              howTo: '戻りの経路も要ります。片道だけでは通信になりません',
            },
            {
              label: `pc1 から ${v.pc2} に届くこと`,
              test: canReach('pc1', v.pc2),
              howTo: 'ping と traceroute で経路を確かめてください',
            },
          ],
          hints: [
            '自分の網に無い宛先は、既定経路の指す相手へ投げる',
            `ip route add default via ${v.gwLeft} dev eth0`,
            '戻りの経路も忘れずに（pc2 側にも置く）',
          ],
          explain:
            '通信は往復で成り立つ。行きだけ通しても、戻りの経路が無ければ相手の返事が届かない。片側だけ直して「直らない」と悩むのはこれが原因のことが多い。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * net/12 ポートを閉じる・開ける
 * ------------------------------------------------------------------ */

const PORT_VARIANTS: { slug: string; value: { port: number; what: string } }[] = PORTS.map(
  (value) => ({ slug: String(value.port), value: { ...value } }),
);

const firewallDrills = family<{ port: number; what: string }>({
  track: 'net',
  chapterId: 'net/12',
  family: 'firewall',
  docs: [man('iptables', 8)],
  variants: PORT_VARIANTS,
  make: (v) => ({
    title: `${v.what}（${String(v.port)} 番）だけを通す`,
    objectives: ['待ち受けと遮断の違いが分かる', '塞いだ結果を確かめられる'],
    initial: { net: emptyTopology(), vars: { NET_SELF: 'pc1' }, files: { [HOME]: null } },
    solution: [
      'netlab add host pc1',
      'netlab add host srv',
      'netlab link pc1:eth0 srv:eth0',
      'ip addr add 10.0.0.1/24 dev eth0',
      'export NET_SELF=srv',
      'ip addr add 10.0.0.2/24 dev eth0',
      `service listen ${String(v.port)}`,
      `service block ${String(v.port)}`,
    ],
    steps: [
      {
        prompt: 'pc1 と srv を 10.0.0.1/24 と 10.0.0.2/24 で繋げ。',
        conditions: [
          { label: 'pc1:eth0 = 10.0.0.1/24', test: interfaceHas('pc1', 'eth0', '10.0.0.1/24') },
          { label: 'srv:eth0 = 10.0.0.2/24', test: interfaceHas('srv', 'eth0', '10.0.0.2/24') },
          { label: 'pc1 から 10.0.0.2 に届くこと', test: canReach('pc1', '10.0.0.2') },
        ],
        hints: [
          'netlab add host pc1 / netlab add host srv',
          'netlab link pc1:eth0 srv:eth0',
          'ip addr add 10.0.0.1/24 dev eth0',
        ],
        explain: 'ここまではいつもの配線。ここから先が「通す・通さない」の話。',
      },
      {
        prompt: `srv で ${String(v.port)} 番を待ち受けよ。`,
        check: `srv が ${String(v.port)} 番を待ち受けていること`,
        assert: withNet((n) => (n.devices.get('srv')?.listening ?? []).includes(v.port)),
        hints: ['export NET_SELF=srv', `service listen ${String(v.port)}`],
        explain: '待ち受けていない口に届いても、相手は断る。まず開けるところから。',
      },
      {
        prompt: `次に、その ${String(v.port)} 番を遮断せよ。届かなくなることを確かめること。`,
        conditions: [
          {
            label: `${String(v.port)} 番が遮断されていること`,
            test: withNet((n) => (n.devices.get('srv')?.blockedPorts ?? []).includes(v.port)),
            howTo: `service block ${String(v.port)}`,
          },
        ],
        hints: [`service block ${String(v.port)}`],
        explain:
          '「待ち受けていない」と「塞がれている」は別のこと。前者は断りが返り、後者は黙って落ちる。切り分けではこの違いが手がかりになる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * net/14 届かない原因を切り分ける
 * ------------------------------------------------------------------ */

const BREAKS: { slug: string; value: { kind: 'cable' | 'address' | 'route' } }[] = [
  { slug: 'cable-1', value: { kind: 'cable' } },
  { slug: 'cable-2', value: { kind: 'cable' } },
  { slug: 'address-1', value: { kind: 'address' } },
  { slug: 'address-2', value: { kind: 'address' } },
  { slug: 'route-1', value: { kind: 'route' } },
  { slug: 'route-2', value: { kind: 'route' } },
];

const triageDrills = family<{ kind: 'cable' | 'address' | 'route' }>({
  track: 'net',
  chapterId: 'net/14',
  family: 'triage',
  docs: [IP_DOC],
  variants: BREAKS,
  make: (v) => ({
    title: `届かない原因を突き止める（${v.kind}）`,
    objectives: ['自分で壊せる', '症状から原因を絞れる', '直したことを確かめられる'],
    initial: { net: emptyTopology(), vars: { NET_SELF: 'pc1' }, files: { [HOME]: null } },
    solution: [
      'netlab add host pc1',
      'netlab add host pc2',
      'netlab link pc1:eth0 pc2:eth0',
      'ip addr add 10.0.0.1/24 dev eth0',
      'export NET_SELF=pc2',
      'ip addr add 10.0.0.2/24 dev eth0',
      'export NET_SELF=pc1',
      'ip link set eth0 down',
      'ip link set eth0 up',
    ],
    steps: [
      {
        prompt: '10.0.0.1/24 の pc1 と 10.0.0.2/24 の pc2 を繋ぎ、届くところまで作れ。',
        conditions: [
          { label: 'pc1 から 10.0.0.2 に届くこと', test: canReach('pc1', '10.0.0.2') },
        ],
        hints: [
          'netlab add host pc1 / netlab add host pc2',
          'netlab link pc1:eth0 pc2:eth0',
          'ip addr add 10.0.0.1/24 dev eth0（pc2 側も同様に）',
        ],
        explain: '壊す前に、まず正しく動く状態を作る。比べる相手が無いと切り分けはできない。',
      },
      {
        prompt: 'pc1 の eth0 を落として、届かない状態を作れ。',
        conditions: [
          {
            label: 'pc1:eth0 が落ちていること',
            test: withNet((n) => n.devices.get('pc1')?.interfaces[0]?.up === false),
            howTo: 'ip link set eth0 down',
          },
          {
            label: '10.0.0.2 に届かなくなっていること',
            test: cannotReach('pc1', '10.0.0.2'),
            howTo: 'ping で確かめてください',
          },
        ],
        hints: ['ip link set eth0 down'],
        explain:
          '症状が出る状態を自分の手で作れると、切り分けが速くなる。「何をすると壊れるか」を知っていることが強み。',
      },
      {
        prompt: '元に戻して、また届くようにせよ。',
        conditions: [
          {
            label: 'pc1:eth0 が上がっていること',
            test: withNet((n) => n.devices.get('pc1')?.interfaces[0]?.up === true),
            howTo: 'ip link set eth0 up',
          },
          { label: '10.0.0.2 に届くこと', test: canReach('pc1', '10.0.0.2') },
        ],
        hints: ['ip link set eth0 up'],
        explain:
          '下から順に確かめる。線は繋がっているか、口は上がっているか、アドレスは付いているか、経路はあるか。この順で見ると迷わない。',
      },
    ],
  }),
});

export function net01(): MissionSource[] {
  return [...pairDrills, ...cidrDrills, ...routeDrills, ...firewallDrills, ...triageDrills];
}

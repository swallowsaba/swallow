import { concepts } from '../glossary';
import { host, iface, link, nat, port, resetMac, router, switchDevice, topology } from '@/engines/net/factory';
import { HOME } from '@/engines/kernel/path';
import type { Topology } from '@/engines/net/types';
import type { LessonDefinition } from '../types';
import { hostIs, ran } from '../authoring/ran';

const FILES = { [HOME]: null };

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

/** pc1 ── sw1 ── pc2 の1セグメント */
function lan(): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], { listening: [80] }),
      host('pc2', [iface('eth0', '192.168.1.20', 24)], { listening: [80] }),
      switchDevice('sw1', [port('p1'), port('p2')]),
    ],
    [link('pc1:eth0', 'sw1:p1'), link('pc2:eth0', 'sw1:p2')],
    { 'pc2.local': '192.168.1.20' },
  );
}

/** 3台のバックエンド。1台だけ待ち受けていない */
function backends(): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '10.0.0.10', 24)]),
      host('be1', [iface('eth0', '10.0.0.21', 24)], { listening: [80] }),
      host('be2', [iface('eth0', '10.0.0.22', 24)], { listening: [] }),
      host('be3', [iface('eth0', '10.0.0.23', 24)], { listening: [80] }),
      switchDevice('sw1', [port('p1'), port('p2'), port('p3'), port('p4')]),
    ],
    [
      link('pc1:eth0', 'sw1:p1'),
      link('be1:eth0', 'sw1:p2'),
      link('be2:eth0', 'sw1:p3'),
      link('be3:eth0', 'sw1:p4'),
    ],
  );
}

/** 落とし方の違いを見る構成。9000 は塞がれ、9001 は待ち受けていない */
function firewalled(): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '10.0.0.10', 24)]),
      host('app', [iface('eth0', '10.0.0.20', 24)], { listening: [80], blockedPorts: [9000] }),
    ],
    [link('pc1:eth0', 'app:eth0')],
    { 'app.internal': '10.0.0.20' },
  );
}

const CERTS = JSON.stringify({
  'shop.example.com': {
    subject: 'shop.example.com',
    altNames: ['*.example.com'],
    issuer: 'DevLearn CA',
    notBefore: 0,
    notAfter: 50,
  },
  'old.example.com': {
    subject: 'old.example.com',
    altNames: [],
    issuer: 'DevLearn CA',
    notBefore: 0,
    notAfter: 10,
  },
  'self.example.com': {
    subject: 'self.example.com',
    altNames: [],
    issuer: 'Self Signed',
    notBefore: 0,
    notAfter: 100,
  },
});

/** 上位層と切り分け（10〜13 章） */

export const netTls: LessonDefinition = {
  id: 'net/10/tls-handshake',
  track: 'net',
  kind: 'training',
  title: '証明書が通らない理由を見分ける',
  intro: {
    summary: '証明書が通らない理由を、期限切れ・発行者不明で見分ける。',
    why:
      '「安全な接続ではありません」の中身は1つではない。理由によって直し方が全く違うので、まず見分けられるようにする。',
    concepts: concepts('TLS', '証明書', '認証局'),
    commands: [
      { command: 'tlscheck <名前>', means: 'その名前のサーバの証明書を確かめる' },
    ],
  },
  objectives: ['期限切れ・名前違い・発行者不明を区別できる', 'ハンドシェイクの順序が分かる'],
  parCommands: 10,
  initial: {
    net: nattedNet(),
    vars: {
      NET_SELF: 'pc1',
      TLS_CERTS: CERTS,
      TLS_NOW: '20',
      TLS_TRUSTED: 'DevLearn CA',
    },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: 'shop.example.com のハンドシェイクが成立することを確かめよ。',
      check: 'tlscheck shop.example.com が成功すること',
      hints: ['tlscheck shop.example.com'],
      solution: ['tlscheck shop.example.com'],
      assert: ({ history }) => ran(history, 'tlscheck', 'shop.example.com'),
      explain:
        'ClientHello → ServerHello → Certificate → Finished。鍵そのものは送らず、双方が同じ鍵を導ける材料だけを交換する。',
    },
    {
      prompt: '期限切れの old.example.com を試し、理由を確かめよ。',
      check: 'old.example.com を試したこと',
      hints: ['tlscheck old.example.com'],
      solution: ['tlscheck old.example.com'],
      assert: ({ history }) => ran(history, 'tlscheck', 'old.example.com'),
      explain: 'certificate has expired。期限は「その証明書がまだ信用に足るか」の期限。',
    },
    {
      prompt: '自己署名の self.example.com を試し、理由が違うことを確かめよ。',
      check: 'self.example.com を試したこと',
      hints: ['tlscheck self.example.com'],
      solution: ['tlscheck self.example.com'],
      assert: ({ history }) => ran(history, 'tlscheck', 'self.example.com'),
      explain:
        'unable to get local issuer certificate。証明書自体は正しくても、発行者を信用していなければ通らない。',
    },
    {
      prompt: '3つの結果の違いを /home/learner/tls.txt にまとめよ（expired と issuer の両方を書くこと）。',
      check: 'tls.txt に expired と issuer が含まれること',
      hints: ['echo "expired: 期限切れ / issuer: 発行者が信用されていない" > tls.txt'],
      solution: ['echo "expired: 期限切れ / issuer: 発行者が信用されていない" > tls.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/tls.txt`);
        return node?.kind === 'file' && node.content.includes('expired') && node.content.includes('issuer');
      },
      explain:
        '同じ「TLS エラー」でも、直し方は全く違う。期限なら更新、発行者なら信頼ストア、名前なら証明書の作り直し。',
    },
  ],
};

export const netHealthCheck: LessonDefinition = {
  id: 'net/11/health-check',
  track: 'net',
  kind: 'training',
  title: '振り分け先が生きているかを確かめる',
  intro: {
    summary: '振り分け先のサーバが生きているかを確かめ、落ちているものを見つける。',
    why:
      'ロードバランサは、落ちたサーバに振り分けないようにヘルスチェックをしている。同じことを手でやると、仕組みが分かる。',
    concepts: concepts('ロードバランサ', 'ヘルスチェック', 'curl'),
    commands: [
      { command: 'curl http://<アドレス>/', means: 'そのサーバが答えるか確かめる' },
      { command: 'echo <アドレス> > down.txt', means: '落ちていたものを書き残す' },
    ],
  },
  objectives: ['死活確認を機械的にできる', '落ちている1台を特定できる'],
  parCommands: 10,
  initial: { net: backends(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '3台のバックエンド（10.0.0.21 / .22 / .23）に順に繋ぎ、応答を確かめよ。',
      check: '3台とも curl で試したこと',
      hints: ['curl http://10.0.0.21/', '.22 と .23 も同じように'],
      solution: ['curl http://10.0.0.21/', 'curl http://10.0.0.22/', 'curl http://10.0.0.23/'],
      assert: ({ history }) =>
        ['10.0.0.21', '10.0.0.22', '10.0.0.23'].every((ip) => ran(history, 'curl', hostIs(ip))),
      explain:
        'ロードバランサがやっているのは、これを一定間隔で繰り返しているだけ。特別なことはしていない。',
    },
    {
      prompt: '落ちている1台を /home/learner/down.txt に書き出せ。',
      check: 'down.txt に 10.0.0.22 が含まれること',
      hints: ['echo 10.0.0.22 > down.txt'],
      solution: ['echo 10.0.0.22 > down.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/down.txt`);
        return node?.kind === 'file' && node.content.includes('10.0.0.22');
      },
      explain:
        '死活確認が落ちた先を外すから、利用者から見た障害が短くなる。確認の間隔が長いほど、外れるまでの時間も長い。',
    },
  ],
};

export const netDropVsReject: LessonDefinition = {
  id: 'net/12/drop-vs-reject',
  track: 'net',
  kind: 'training',
  title: '落とし方の違いを見分ける',
  intro: {
    summary: '「断られる」と「黙って捨てられる」の違いを、curl の結果で見分ける。',
    why:
      '窓口が閉まっているのか、門で止められているのかで、直しに行く場所が違う。症状の違いを知っていれば、最初の一手が決まる。',
    concepts: concepts('ファイアウォール', 'ポート', 'Connection refused', 'curl'),
    commands: [
      { command: 'curl http://<アドレス>:<ポート>/', means: 'そのポートに繋いでみる' },
    ],
  },
  objectives: ['拒否と無応答の違いが分かる', '症状から原因を絞れる'],
  parCommands: 10,
  initial: { net: firewalled(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '80 番に繋がることを確かめよ。',
      check: 'curl で 80 番に繋いだこと',
      hints: ['curl http://10.0.0.20/'],
      solution: ['curl http://10.0.0.20/'],
      assert: ({ history }) => ran(history, 'curl', hostIs('10.0.0.20')),
      explain: 'まず「通る経路がある」ことを確かめる。ここが駄目なら、ポートの話に進む意味がない。',
    },
    {
      prompt: '待ち受けていない 9001 番に繋いでみよ。',
      check: '9001 番を試したこと',
      hints: ['curl http://10.0.0.20:9001/'],
      solution: ['curl http://10.0.0.20:9001/'],
      assert: ({ history }) => ran(history, 'curl', /:9001(\/|$)/),
      explain:
        'Connection refused。相手まで届いていて、相手が「そのポートは開いていない」と即座に返している。',
    },
    {
      prompt: 'ファイアウォールで塞がれた 9000 番に繋いでみよ。',
      check: '9000 番を試したこと',
      hints: ['curl http://10.0.0.20:9000/'],
      solution: ['curl http://10.0.0.20:9000/'],
      assert: ({ history }) => ran(history, 'curl', /:9000(\/|$)/),
      explain:
        'refused と reject/drop は症状が違う。即座に断られるのか、黙って捨てられるのかで、疑うべき場所が変わる。',
    },
    {
      prompt: '違いを /home/learner/diag.txt にまとめよ（refused と firewall の両方を書くこと）。',
      check: 'diag.txt に refused と firewall が含まれること',
      hints: ['echo "refused=待ち受けなし / firewall=塞がれている" > diag.txt'],
      solution: ['echo "refused=待ち受けなし / firewall=塞がれている" > diag.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/diag.txt`);
        return node?.kind === 'file' && node.content.includes('refused') && node.content.includes('firewall');
      },
      explain: '切り分けは「どこまで届いたか」を1段ずつ狭めていく作業。症状の違いがその手掛かりになる。',
    },
  ],
};

export const netVpcDesign: LessonDefinition = {
  id: 'net/13/vpc-design',
  track: 'net',
  kind: 'training',
  title: '重ならないアドレス設計をする',
  intro: {
    summary: '重ならない住所の割り当てを、計算で決める。',
    why:
      '後から別のネットワークとつなぐとき、住所が重なっていると大きな手戻りになる。最初の設計で重ならないようにしておく。',
    concepts: concepts('VPC', 'CIDR', 'サブネット', 'プレフィックス長'),
    commands: [
      { command: 'ipcalc <まとまり>', means: '範囲を計算する' },
      { command: 'echo <まとまり> >> plan.txt', means: '設計に書き足す' },
    ],
  },
  objectives: ['分割の計算ができる', '重なりが後で何を壊すか分かる'],
  parCommands: 10,
  initial: { net: lan(), vars: { NET_SELF: 'pc1' }, files: { ...FILES } },
  steps: [
    {
      prompt: '10.0.0.0/16 を /20 に分けたとき、2つ目の区画の先頭アドレスを調べ、/home/learner/plan.txt に書き出せ。',
      check: 'plan.txt に 10.0.16.0 が含まれること',
      hints: ['ipcalc 10.0.16.0/20 で確かめられる', '/20 は 4096 個ずつの区切り'],
      solution: ['ipcalc 10.0.16.0/20 > plan.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/plan.txt`);
        return node?.kind === 'file' && node.content.includes('10.0.16.0');
      },
      explain:
        '/16 を /20 に割ると 16 個。区切りは 4096 ごとなので、2つ目は 10.0.16.0 から始まる。',
    },
    {
      prompt: '別の拠点に 10.0.0.0/16 と重ならない範囲を選び、/home/learner/plan.txt に追記せよ（172.16 で始まる範囲にすること）。',
      check: 'plan.txt に 172.16 が含まれること',
      hints: ['echo 172.16.0.0/16 >> plan.txt'],
      solution: ['echo 172.16.0.0/16 >> plan.txt'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/plan.txt`);
        return node?.kind === 'file' && node.content.includes('172.16');
      },
      explain:
        '拠点同士を後から繋ぐとき、範囲が重なっていると NAT を挟むしかなくなる。設計時に空けておくのが一番安い。',
    },
  ],
};

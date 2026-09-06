import { chapter, doc } from '../build';
import type { Track } from '../types';

const rfc = (num: number, label: string) => doc(label, `https://www.rfc-editor.org/rfc/rfc${String(num)}`);
const mdn = (label: string, path: string) => doc(label, `https://developer.mozilla.org/en-US/docs/${path}`);

export const netTrack: Track = {
  id: 'net',
  title: 'Network',
  goal: 'CCNA 相当の基礎から、「ping は通るのに curl が失敗する」を切り分けられる実務力へ',
  phase: 'P4',
  chapters: [
    chapter('net', 1, 'レイヤの地図', '層に分けると、故障の切り分けが二分探索になる。',
      [mdn('HTTP overview', 'Web/HTTP/Overview')], [
        ['osi-tcpip', 'OSI 7層と TCP/IP 4層の対応', 'concept', 12],
        ['encapsulation', 'カプセル化：1つのデータが4枚の封筒に包まれる', 'concept', 12, [rfc(1122, 'Host Requirements')]],
        ['layer-bisection', '層ごとの二分探索で原因を半分に減らす', 'concept', 10],
      ]),
    chapter('net', 2, 'Ethernet と ARP', '同じセグメントの中で、誰が誰に渡すのか。',
      [rfc(826, 'ARP')], [
        ['mac-frame', 'MAC アドレスとフレーム構造', 'concept', 10],
        ['arp-resolve', 'ARP 要求はブロードキャスト、応答はユニキャスト', 'drill', 12],
        ['switch-learning', 'スイッチの MAC アドレステーブル学習とフラッディング', 'drill', 15],
        ['vlan', 'VLAN でブロードキャストドメインを割る', 'concept', 12],
        ['boss-arp-conflict', 'BOSS: IP 重複で通信が断続的に切れる', 'boss', 20],
      ]),
    chapter('net', 3, 'IPv4 アドレッシング', '計算できないと設計できない。',
      [rfc(4632, 'CIDR')], [
        ['ipv4-cidr', '2進数で見るサブネットマスク', 'concept', 15],
        ['subnet-drill', 'サブネット計算ドリル（ネットワーク/ブロードキャスト/ホスト数）', 'drill', 20],
        ['vlsm', 'VLSM でアドレスを無駄なく割る', 'drill', 20],
        ['private-address', 'プライベートアドレスと重複による事故', 'concept', 10, [rfc(1918, 'Private Address Space')]],
      ]),
    chapter('net', 4, 'IPv6', 'アドレスが足りない、の次の世界。',
      [rfc(8200, 'IPv6 Specification')], [
        ['ipv6-format', '表記の省略規則とアドレス種別', 'concept', 12],
        ['ipv6-slaac', 'SLAAC と近隣探索（NDP）', 'concept', 12, [rfc(4861, 'Neighbor Discovery')]],
        ['dual-stack', 'デュアルスタックと Happy Eyeballs', 'concept', 10, [rfc(8305, 'Happy Eyeballs v2')]],
      ]),
    chapter('net', 5, 'ルーティング', '経路表の1行1行が、パケットの運命を決める。',
      [rfc(791, 'Internet Protocol')], [
        ['routing-table', '経路表の読み方とデフォルトゲートウェイ', 'concept', 15],
        ['longest-prefix', '最長プレフィックス一致を手で追う', 'drill', 18],
        ['ttl-hop', 'TTL 減算とホップごとの MAC 書き換え', 'drill', 15],
        ['dynamic-routing', '静的ルートと OSPF / BGP の経路選択の考え方', 'concept', 18],
        ['boss-route-blackhole', 'BOSS: 片道だけ届く（戻りの経路が無い）', 'boss', 25],
      ]),
    chapter('net', 6, 'NAT と PAT', 'IP とポートが書き換えられる場所。',
      [rfc(3022, 'Traditional NAT')], [
        ['nat-basics', 'NAT テーブルと変換の可視化', 'concept', 12],
        ['pat-ports', 'PAT のポート枯渇はどう見えるか', 'drill', 15],
        ['nat-traversal', '外から入れない理由と、ポート転送', 'concept', 12],
      ]),
    chapter('net', 7, 'TCP と UDP', '状態を持つとは、どういうことか。',
      [rfc(9293, 'TCP')], [
        ['handshake', '3ウェイハンドシェイクのシーケンス番号を実値で追う', 'drill', 18],
        ['state-machine', 'LISTEN から TIME_WAIT までの状態遷移', 'concept', 18],
        ['retransmit', '再送、RTO、フロー制御と輻輳制御', 'concept', 18],
        ['close-sequence', '4ウェイクローズと TIME_WAIT が必要な理由', 'concept', 15],
        ['udp', 'UDP を選ぶ判断基準', 'concept', 10, [rfc(768, 'UDP')]],
        ['boss-half-open', 'BOSS: コネクションが残り続けてポートが枯れる', 'boss', 25],
      ]),
    chapter('net', 8, 'DNS', '「名前が引けない」は、どの段で失敗しているのか。',
      [rfc(1034, 'DNS Concepts')], [
        ['dns-recursion', 'ルート → TLD → 権威の再帰解決を段階で見る', 'concept', 18],
        ['record-types', 'A / AAAA / CNAME / MX / TXT / SRV / NS', 'drill', 15, [rfc(1035, 'DNS Implementation')]],
        ['cache-ttl', 'キャッシュと TTL、切り替え時の待ち時間', 'concept', 12],
        ['dig-reading', 'dig の出力を上から読む', 'drill', 15],
        ['boss-stale-dns', 'BOSS: 一部のユーザだけ旧サーバに繋がる', 'boss', 22],
      ]),
    chapter('net', 9, 'DHCP', '勝手に設定される仕組みを知らないと、壊れた時に困る。',
      [rfc(2131, 'DHCP')], [
        ['dora', 'DISCOVER / OFFER / REQUEST / ACK', 'concept', 12],
        ['lease', 'リースと更新、アドレス枯渇', 'drill', 12],
      ]),
    chapter('net', 10, 'HTTP と TLS', 'アプリから見える顔と、その下で起きていること。',
      [rfc(9110, 'HTTP Semantics')], [
        ['http1', 'リクエストライン〜レスポンス、Keep-Alive と HOL blocking', 'concept', 15],
        ['http2', 'HTTP/2 の多重化を HTTP/1.1 と並べて見る', 'concept', 15, [rfc(9113, 'HTTP/2')]],
        ['http3', 'QUIC が解こうとした問題', 'concept', 12, [rfc(9114, 'HTTP/3')]],
        ['tls-handshake', 'TLS 1.3 ハンドシェイクと証明書検証', 'concept', 18, [rfc(8446, 'TLS 1.3')]],
        ['curl-verbose', 'curl -v の各行が何を示すか', 'drill', 15],
        ['boss-cert-expired', 'BOSS: ブラウザは繋がるが、サーバ間通信だけ失敗する', 'boss', 25],
      ]),
    chapter('net', 11, 'ロードバランサとプロキシ', 'L4 と L7 の違いは、見えるものの違い。',
      [mdn('Proxy servers and tunneling', 'Web/HTTP/Proxy_servers_and_tunneling')], [
        ['l4-l7', 'L4 と L7 の分岐点', 'concept', 15],
        ['health-check', 'ヘルスチェックの設計とフラッピング', 'drill', 15],
        ['forward-reverse-proxy', 'フォワード / リバースプロキシと X-Forwarded-For', 'concept', 12],
        ['cdn', 'CDN のキャッシュキーと origin shield', 'concept', 12],
      ]),
    chapter('net', 12, 'ファイアウォールと境界', '「拒否」は静かに起きる。',
      [mdn('CORS', 'Web/HTTP/CORS')], [
        ['stateful-firewall', 'ステートフルフィルタと戻りパケット', 'concept', 15],
        ['security-group', 'セキュリティグループと NACL の違い', 'concept', 12],
        ['drop-vs-reject', 'DROP と REJECT の症状の違い（タイムアウト vs 即時拒否）', 'drill', 15],
      ]),
    chapter('net', 13, 'クラウドのネットワーク設計', 'VPC は、これまでの全部の組み合わせ。',
      [rfc(1918, 'Private Address Space')], [
        ['vpc-design', 'CIDR 設計とサブネット分割', 'challenge', 20],
        ['route-nat-gateway', 'ルートテーブルと NAT ゲートウェイ', 'concept', 15],
        ['peering-overlap', 'ピアリングと CIDR 重複という詰み', 'concept', 15],
      ]),
    chapter('net', 14, '切り分け演習', '道具を順番に当てて、範囲を半分にしていく。',
      [rfc(792, 'ICMP')], [
        ['ping-traceroute', 'ping / traceroute で到達性と経路を測る', 'drill', 15],
        ['ss-netstat', 'ss で「今の接続」を見る', 'drill', 12],
        ['tcpdump-reading', 'パケットキャプチャを読む（フィルタと最初の10行）', 'drill', 20],
        ['mtu-blackhole', 'MTU 不一致：小さい通信は通るが大きい通信が消える', 'challenge', 20],
        ['boss-final', 'BOSS: 総合切り分け（症状だけ渡される）', 'boss', 35],
      ]),
  ],
};

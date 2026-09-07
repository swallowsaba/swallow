import { intToIp, ipToInt } from './subnet';

/* ---- DHCP ---- */

/**
 * DHCP の DORA。
 *
 * Discover → Offer → Request → Ack の4段。
 * 「なぜ2往復するのか」が見えるよう、各段で誰が何を言ったかを残す。
 * 払い出しは先頭から順（乱数を使わない）。
 */
export interface Lease {
  mac: string;
  ip: string;
  /** 期限が切れる tick */
  expiresAt: number;
}

export interface DhcpServer {
  /** 払い出す範囲 */
  poolStart: string;
  poolEnd: string;
  gateway: string;
  dns: string;
  leaseTicks: number;
  leases: Lease[];
  now: number;
}

export interface DhcpStep {
  from: 'client' | 'server';
  kind: 'DISCOVER' | 'OFFER' | 'REQUEST' | 'ACK' | 'NAK';
  detail: string;
}

export interface DhcpResult {
  steps: DhcpStep[];
  lease: Lease | null;
  server: DhcpServer;
  error: string | null;
}

export function dhcpServer(options: Partial<DhcpServer> = {}): DhcpServer {
  return {
    poolStart: options.poolStart ?? '192.168.1.100',
    poolEnd: options.poolEnd ?? '192.168.1.110',
    gateway: options.gateway ?? '192.168.1.1',
    dns: options.dns ?? '192.168.1.1',
    leaseTicks: options.leaseTicks ?? 20,
    leases: options.leases ?? [],
    now: options.now ?? 0,
  };
}

export function advanceDhcp(server: DhcpServer, ticks: number): DhcpServer {
  const now = server.now + ticks;
  return { ...server, now, leases: server.leases.filter((l) => l.expiresAt > now) };
}

/** 空いている一番小さいアドレス。無ければ null */
function nextFree(server: DhcpServer): string | null {
  const start = ipToInt(server.poolStart);
  const end = ipToInt(server.poolEnd);
  const taken = new Set(server.leases.map((l) => ipToInt(l.ip)));
  for (let n = start; n <= end; n += 1n) {
    if (!taken.has(n)) return intToIp(n);
  }
  return null;
}

export function dhcpRequest(server: DhcpServer, mac: string): DhcpResult {
  const steps: DhcpStep[] = [
    { from: 'client', kind: 'DISCOVER', detail: `${mac} が「誰かいませんか」とブロードキャスト` },
  ];

  const existing = server.leases.find((l) => l.mac === mac);
  const ip = existing?.ip ?? nextFree(server);
  if (ip === null) {
    steps.push({ from: 'server', kind: 'NAK', detail: 'プールに空きがありません' });
    return { steps, lease: null, server, error: 'DHCP プールが尽きています' };
  }

  steps.push({
    from: 'server',
    kind: 'OFFER',
    detail: `${ip} を提案（gw ${server.gateway} / dns ${server.dns}）`,
  });
  steps.push({ from: 'client', kind: 'REQUEST', detail: `${ip} を使いたいと正式に要求` });

  const lease: Lease = { mac, ip, expiresAt: server.now + server.leaseTicks };
  steps.push({
    from: 'server',
    kind: 'ACK',
    detail: `${ip} を ${String(server.leaseTicks)} tick 貸し出し`,
  });

  return {
    steps,
    lease,
    server: { ...server, leases: [...server.leases.filter((l) => l.mac !== mac), lease] },
    error: null,
  };
}

/* ---- TLS ---- */

/**
 * TLS 1.3 のハンドシェイク。
 * 証明書の有効期限と名前の一致を実際に確かめ、駄目なら本物と同じ理由で止める。
 */
export interface Certificate {
  subject: string;
  /** 追加で名乗れる名前 */
  altNames: string[];
  issuer: string;
  notBefore: number;
  notAfter: number;
}

export interface TlsHandshakeStep {
  from: 'client' | 'server';
  message: string;
  detail: string;
}

export interface TlsResult {
  steps: TlsHandshakeStep[];
  established: boolean;
  error: string | null;
  /** 往復の回数。1.3 は 1-RTT */
  roundTrips: number;
}

function nameMatches(certificate: Certificate, host: string): boolean {
  const names = [certificate.subject, ...certificate.altNames];
  return names.some((name) => {
    if (name === host) return true;
    if (!name.startsWith('*.')) return false;
    const suffix = name.slice(1);
    return host.endsWith(suffix) && host.slice(0, host.length - suffix.length).split('.').length === 1;
  });
}

export function tlsHandshake(
  certificate: Certificate,
  host: string,
  now: number,
  trustedIssuers: readonly string[],
): TlsResult {
  const steps: TlsHandshakeStep[] = [
    { from: 'client', message: 'ClientHello', detail: `対応する暗号方式と SNI=${host} を伝える` },
    { from: 'server', message: 'ServerHello', detail: '使う暗号方式を1つ選んで返す' },
    { from: 'server', message: 'Certificate', detail: `${certificate.subject}（発行者 ${certificate.issuer}）` },
  ];

  if (now < certificate.notBefore) {
    return { steps, established: false, error: 'certificate is not valid yet', roundTrips: 1 };
  }
  if (now > certificate.notAfter) {
    return { steps, established: false, error: 'certificate has expired', roundTrips: 1 };
  }
  if (!trustedIssuers.includes(certificate.issuer)) {
    return {
      steps,
      established: false,
      error: `unable to get local issuer certificate (${certificate.issuer})`,
      roundTrips: 1,
    };
  }
  if (!nameMatches(certificate, host)) {
    return {
      steps,
      established: false,
      error: `Hostname ${host} does not match certificate's names (${[certificate.subject, ...certificate.altNames].join(', ')})`,
      roundTrips: 1,
    };
  }

  steps.push({ from: 'server', message: 'Finished', detail: '鍵の交換が済み、以降は暗号化される' });
  steps.push({ from: 'client', message: 'Finished', detail: '同じ鍵を導出したことを示す' });
  return { steps, established: true, error: null, roundTrips: 1 };
}

/* ---- HTTP/1.1 と HTTP/2 ---- */

export interface HttpRequest {
  path: string;
  /** 応答が返るまでに掛かる時間（tick） */
  cost: number;
}

export interface HttpTimeline {
  version: '1.1' | '2';
  /** 同時に張った接続の数 */
  connections: number;
  /** 全部終わるまでの時間 */
  finishedAt: number;
  /** 各要求の開始と終了 */
  entries: { path: string; start: number; end: number; connection: number }[];
  /** 先頭の要求が詰まって後続が待たされた回数 */
  blocked: number;
}

/**
 * 同じ要求列を、HTTP/1.1 と HTTP/2 で流したときの時間を出す。
 *
 * 1.1 は1接続につき1要求ずつ（キューの先頭が終わるまで次に進めない）。
 * 2 は1接続に多重化して同時に流せる。
 * 差は「接続の本数」ではなく「先頭で詰まるかどうか」であることが見える。
 */
export function runHttp(
  requests: readonly HttpRequest[],
  version: '1.1' | '2',
  maxConnections = 6,
): HttpTimeline {
  const entries: HttpTimeline['entries'] = [];

  if (version === '2') {
    // 1本の接続に全部載せる。互いを待たない
    for (const request of requests) {
      entries.push({ path: request.path, start: 0, end: request.cost, connection: 0 });
    }
    return {
      version,
      connections: 1,
      finishedAt: Math.max(0, ...entries.map((e) => e.end)),
      entries,
      blocked: 0,
    };
  }

  const connections = Math.min(maxConnections, Math.max(1, requests.length));
  const free = new Array<number>(connections).fill(0);
  let blocked = 0;

  for (const request of requests) {
    // 一番早く空く接続を選ぶ
    let slot = 0;
    for (let i = 1; i < free.length; i += 1) {
      if ((free[i] ?? 0) < (free[slot] ?? 0)) slot = i;
    }
    const start = free[slot] ?? 0;
    if (start > 0) blocked += 1;
    const end = start + request.cost;
    free[slot] = end;
    entries.push({ path: request.path, start, end, connection: slot });
  }

  return {
    version,
    connections,
    finishedAt: Math.max(0, ...free),
    entries,
    blocked,
  };
}

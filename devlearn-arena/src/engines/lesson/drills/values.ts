/**
 * 演習に使う値を、決まった手順で並べる。
 *
 * 乱数は使わない。同じ順番で同じ値が出るので、
 * 演習の id も内容も、実行のたびに変わらない。
 */

/** 小さな線形合同法。並びに偏りを持たせないためだけに使う */
export function sequence(seed: number, count: number, modulo: number): number[] {
  const out: number[] = [];
  let state = seed % 2147483647 || 1;
  for (let i = 0; i < count; i += 1) {
    state = (state * 48271) % 2147483647;
    out.push(state % modulo);
  }
  return out;
}

export function ipv4(a: number, b: number, c: number, d: number): string {
  return `${String(a)}.${String(b)}.${String(c)}.${String(d)}`;
}

/** 私用アドレス空間から、重複しない CIDR を並べる */
export function privateCidrs(count: number): string[] {
  const prefixes = [8, 12, 16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30];
  const out: string[] = [];
  const seen = new Set<string>();
  const bs = sequence(7, count * 2, 256);
  const cs = sequence(13, count * 2, 256);
  for (let i = 0; out.length < count && i < count * 2; i += 1) {
    const prefix = prefixes[i % prefixes.length] ?? 24;
    const base = i % 3;
    const b = bs[i] ?? 0;
    const c = cs[i] ?? 0;
    const address =
      base === 0
        ? ipv4(10, b, c, 0)
        : base === 1
          ? ipv4(172, 16 + (b % 16), c, 0)
          : ipv4(192, 168, c, 0);
    // ホスト部を 0 に揃える（プレフィックスに合わせて丸める）
    const cidr = `${roundDown(address, prefix)}/${String(prefix)}`;
    if (seen.has(cidr)) continue;
    seen.add(cidr);
    out.push(cidr);
  }
  return out;
}

function roundDown(address: string, prefix: number): string {
  const parts = address.split('.').map(Number);
  let value = 0;
  for (const part of parts) value = (value << 8) + (part ?? 0);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (value & mask) >>> 0;
  return [24, 16, 8, 0].map((shift) => String((network >>> shift) & 0xff)).join('.');
}

/** id に使える形にする（記号を落とす） */
export function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** 演習でよく使う語。値違いの名前を作るのに使う */
export const APP_NAMES = [
  'web', 'api', 'worker', 'cache', 'front', 'search', 'proxy', 'auth', 'billing', 'report',
  'gateway', 'scheduler', 'notifier', 'indexer', 'uploader', 'renderer', 'collector', 'router',
  'archiver', 'validator',
] as const;

export const FILE_STEMS = [
  'app', 'db', 'web', 'audit', 'access', 'error', 'debug', 'query', 'batch', 'cron',
  'mail', 'sync', 'boot', 'gc', 'trace', 'metric', 'event', 'session', 'upload', 'render',
] as const;

export const DIR_NAMES = [
  'srv', 'opt', 'data', 'var', 'work', 'stage', 'inbox', 'outbox', 'archive', 'tmp',
  'build', 'dist', 'cache', 'logs', 'config', 'secrets', 'assets', 'reports', 'backup', 'scratch',
] as const;

/** 8 進数の権限のうち、学ぶ意味のある組み合わせ */
export const MODES = [
  '644', '755', '600', '640', '700', '444', '775', '666', '711', '750',
  '664', '660', '622', '733', '740', '770', '707', '766', '744', '555',
] as const;

/** よく使う待ち受けポート */
export const PORTS = [
  { port: 22, what: 'SSH' },
  { port: 25, what: 'SMTP' },
  { port: 53, what: 'DNS' },
  { port: 80, what: 'HTTP' },
  { port: 110, what: 'POP3' },
  { port: 143, what: 'IMAP' },
  { port: 443, what: 'HTTPS' },
  { port: 587, what: 'Submission' },
  { port: 3000, what: '開発サーバ' },
  { port: 3306, what: 'MySQL' },
  { port: 5432, what: 'PostgreSQL' },
  { port: 6379, what: 'Redis' },
  { port: 8080, what: 'アプリ' },
  { port: 8443, what: 'アプリ（TLS）' },
  { port: 9090, what: 'メトリクス' },
  { port: 9200, what: '全文検索' },
  { port: 11211, what: 'Memcached' },
  { port: 27017, what: 'MongoDB' },
] as const;

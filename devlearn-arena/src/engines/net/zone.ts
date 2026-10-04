/**
 * DNS のゾーンファイル（BIND の形の、よく使う所だけ）を読む。純粋な関数。
 * net.b.06 の実戦: 名前の答えを直すには、ゾーンファイルを書き換えて、DNS のサーバ（named）に読み直させる。
 *
 * - 1 行に 1 つのレコード: `名前 [TTL] IN 種類 値`。`;` の後は注釈
 * - `$ORIGIN` が名前の後ろに付く。`@` は $ORIGIN そのもの。名前を省くと前の行と同じ名前
 * - A の答えと、CNAME（別名）の先の A を、名前 → アドレスの表にする
 */
export interface ZoneRecord {
  name: string;
  ttl: number;
  type: string;
  value: string;
}

const strip = (n: string): string => n.replace(/\.$/, '');

export function parseZone(text: string, defaultOrigin = ''): ZoneRecord[] {
  let origin = strip(defaultOrigin);
  let ttl = 3600;
  let last = '';
  const out: ZoneRecord[] = [];
  const full = (n: string): string => (n === '@' ? origin : n.endsWith('.') ? strip(n) : origin ? `${n}.${origin}` : n);
  for (const raw of text.split('\n')) {
    const line = raw.replace(/;.*$/, '').trimEnd();
    if (line.trim() === '') continue;
    const words = line.trim().split(/\s+/);
    if (words[0] === '$ORIGIN') {
      origin = strip(words[1] ?? '');
      continue;
    }
    if (words[0] === '$TTL') {
      ttl = Number(words[1] ?? ttl) || ttl;
      continue;
    }
    // 行頭が空白なら、名前を省いた行（前の行と同じ名前）
    const name = /^\s/.test(line) ? last : full(words.shift() ?? '');
    last = name;
    let recTtl = ttl;
    if (/^\d+$/.test(words[0] ?? '')) recTtl = Number(words.shift());
    if (words[0]?.toUpperCase() === 'IN') words.shift();
    const type = (words.shift() ?? '').toUpperCase();
    const value = words.join(' ');
    if (type === '' || value === '') continue;
    out.push({ name, ttl: recTtl, type, value: type === 'CNAME' ? full(value) : value });
  }
  return out;
}

/** A と、CNAME の先の A を、名前 → アドレスの表にする */
export function addressesOf(records: readonly ZoneRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of records) if (r.type === 'A') map.set(r.name, r.value);
  for (let i = 0; i < 4; i += 1) {
    for (const r of records) {
      const target = map.get(r.value);
      if (r.type === 'CNAME' && target !== undefined) map.set(r.name, target);
    }
  }
  return map;
}

/**
 * DNS のゾーンファイル（BIND の形の、よく使う所だけ）を読む。純粋な関数。
 * net.b.06 の実戦: 名前の答えを直すには、ゾーンファイルを書き換えて、DNS のサーバ（named）に読み直させる。
 *
 * - 1 行に 1 つのレコード: `名前 [TTL] IN 種類 値`。`;` の後は注釈
 * - `$ORIGIN` が名前の後ろに付く。`@` は $ORIGIN そのもの。名前を省くと前の行と同じ名前
 * - A の答えと、CNAME（別名）の先の A を、名前 → アドレスの表にする
 * - named-checkzone と同じ確かめ（知らない種類・A の値・MX の優先度・CNAME と他のレコードの同居）を、本物と同じ言い方で返す
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
    // 別名の先（CNAME）と、メールの受け取り先（MX の 2 つ目の語）は、名前として $ORIGIN を補う
    const mx = type === 'MX' ? /^(\S+)\s+(\S+)$/.exec(value) : null;
    out.push({ name, ttl: recTtl, type, value: type === 'CNAME' ? full(value) : mx ? `${mx[1] ?? ''} ${full(mx[2] ?? '')}` : value });
  }
  return out;
}

const KNOWN_TYPES = new Set(['SOA', 'NS', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'PTR', 'SRV', 'CAA']);

export type ZoneCheck = { ok: true; serial: string } | { ok: false; lines: string[] };

/**
 * named-checkzone と同じ確かめ。zone は名前（shop.example）、file はファイルの場所（言い方に使う）。
 * 通れば SOA の serial、通らなければ本物と同じ言い方の行（最後は not loaded due to errors）
 */
export function checkZone(text: string, zone: string, file: string): ZoneCheck {
  const origin = strip(zone);
  const fail = (first: string, why: string): ZoneCheck => ({ ok: false, lines: [first, `zone ${origin}/IN: loading from master file ${file} failed: ${why}`, `zone ${origin}/IN: not loaded due to errors.`] });
  let lineNo = 0;
  for (const raw of text.split('\n')) {
    lineNo += 1;
    const line = raw.replace(/;.*$/, '').trim();
    if (line === '' || line.startsWith('$')) continue;
    const words = line.split(/\s+/);
    // 名前・TTL・IN を飛ばして、種類を探す（行頭が空白なら名前は無い）
    let i = /^\s/.test(raw) ? 0 : 1;
    if (/^\d+$/.test(words[i] ?? '')) i += 1;
    if ((words[i] ?? '').toUpperCase() === 'IN') i += 1;
    const type = (words[i] ?? '').toUpperCase();
    const rest = words.slice(i + 1);
    if (!KNOWN_TYPES.has(type)) return fail(`dns_master_load: ${file}:${String(lineNo)}: unknown RR type '${words[i] ?? ''}'`, 'unknown class/type');
    if (type === 'A' && !/^\d+\.\d+\.\d+\.\d+$/.test(rest[0] ?? '')) return fail(`dns_rdata_fromtext: ${file}:${String(lineNo)}: near '${rest[0] ?? ''}': bad dotted quad`, 'bad dotted quad');
    if (type === 'AAAA' && !/^[0-9a-fA-F:]*:[0-9a-fA-F:]*$/.test(rest[0] ?? '')) return fail(`dns_rdata_fromtext: ${file}:${String(lineNo)}: near '${rest[0] ?? ''}': bad IPv6 address`, 'bad IPv6 address');
    if (type === 'MX' && !/^\d+$/.test(rest[0] ?? '')) return fail(`dns_rdata_fromtext: ${file}:${String(lineNo)}: near '${rest[0] ?? ''}': not a valid number`, 'not a valid number');
    if (type === 'MX' && rest.length < 2) return fail(`dns_rdata_fromtext: ${file}:${String(lineNo)}: near eol: unexpected end of input`, 'unexpected end of input');
  }
  const records = parseZone(text, origin);
  for (const c of records.filter((r) => r.type === 'CNAME')) {
    if (records.some((r) => r.name === c.name && r.type !== 'CNAME')) return { ok: false, lines: [`zone ${origin}/IN: ${c.name}: CNAME and other data`, `zone ${origin}/IN: not loaded due to errors.`] };
  }
  const soa = records.find((r) => r.type === 'SOA');
  if (!soa) return { ok: false, lines: [`zone ${origin}/IN: has no SOA record`, `zone ${origin}/IN: not loaded due to errors.`] };
  const serial = /\(?\s*(\d+)/.exec(soa.value.split(/\s+/).slice(2).join(' '))?.[1] ?? '0';
  return { ok: true, serial };
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

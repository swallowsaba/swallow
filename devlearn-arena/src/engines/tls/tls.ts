/**
 * TLS の証明書の連鎖と検証の模型（docs/learning-design.md 6 章「証明書の連鎖」）。純粋な関数。
 *
 * サーバは葉の証明書と中間の証明書を送る。手元（ブラウザ・curl）は信頼するルートを持つ。
 * 葉から発行者をたどり、信頼するルートに着けば信頼できる。途中で次のどれかに当たると信頼しない:
 *   期限切れ・まだ有効でない・名前が合わない・発行者が見つからない（中間の送り忘れを含む）・自己署名
 * 日付は文字列（YYYY-MM-DD）で比べる。時刻は引数で渡す（Date を使わない）。
 */

export interface Cert {
  id: string;
  /** 持ち主の名前（CN） */
  subject: string;
  /** 発行者の名前（発行者の subject と一致する） */
  issuer: string;
  /** 使ってよいホスト名（*.example.com の形を含む）。CA の証明書では空 */
  sans: readonly string[];
  notBefore: string;
  notAfter: string;
  /** 証明書を発行できるか（ルート・中間） */
  ca: boolean;
}

export type TlsFailure = 'expired' | 'not-yet-valid' | 'name-mismatch' | 'unknown-issuer' | 'incomplete-chain' | 'self-signed';

export type TlsVerdict =
  | { trusted: true; path: Cert[] }
  | { trusted: false; reason: TlsFailure; cert: Cert };

/** ホスト名が証明書の名前に合うか（*. は 1 段だけに合う） */
export function nameMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (!p.startsWith('*.')) return h === p;
  const rest = p.slice(2);
  const dot = h.indexOf('.');
  return dot > 0 && h.slice(dot + 1) === rest;
}

const valid = (c: Cert, today: string): TlsFailure | null => (today > c.notAfter ? 'expired' : today < c.notBefore ? 'not-yet-valid' : null);

/**
 * 連鎖を検証する。chain[0] が葉、続きがサーバの送った中間。roots は手元が信頼するルート
 */
export function verify(host: string, chain: readonly Cert[], roots: readonly Cert[], today: string): TlsVerdict {
  const leaf = chain[0];
  if (!leaf) throw new Error('証明書が無い');
  if (!leaf.sans.some((n) => nameMatches(host, n))) return { trusted: false, reason: 'name-mismatch', cert: leaf };
  const path: Cert[] = [];
  let cur: Cert = leaf;
  for (let depth = 0; depth < 8; depth += 1) {
    const bad = valid(cur, today);
    if (bad) return { trusted: false, reason: bad, cert: cur };
    path.push(cur);
    const root = roots.find((r) => r.subject === cur.issuer && r.ca);
    if (root) {
      const rootBad = valid(root, today);
      if (rootBad) return { trusted: false, reason: rootBad, cert: root };
      return { trusted: true, path: [...path, root] };
    }
    if (cur.issuer === cur.subject) return { trusted: false, reason: 'self-signed', cert: cur };
    const next = chain.find((c) => c.subject === cur.issuer && c.ca && c !== cur);
    if (!next) {
      // 中間を送っていない（葉しか無い）のか、知らない発行者なのか
      return { trusted: false, reason: chain.length === 1 && cur === leaf ? 'incomplete-chain' : 'unknown-issuer', cert: cur };
    }
    cur = next;
  }
  return { trusted: false, reason: 'unknown-issuer', cert: cur };
}

/** curl と同じ言い方のエラー（終了の値と文）。docs/content-spec.md 2.5 のエラーの解説が、この文に当たる */
export function curlTlsError(host: string, v: Extract<TlsVerdict, { trusted: false }>): { code: number; message: string } {
  switch (v.reason) {
    case 'expired':
      return { code: 60, message: 'SSL certificate problem: certificate has expired' };
    case 'not-yet-valid':
      return { code: 60, message: 'SSL certificate problem: certificate is not yet valid' };
    case 'name-mismatch':
      return { code: 60, message: `SSL: no alternative certificate subject name matches target host name '${host}'` };
    case 'self-signed':
      return { code: 60, message: 'SSL certificate problem: self-signed certificate' };
    case 'incomplete-chain':
    case 'unknown-issuer':
      return { code: 60, message: 'SSL certificate problem: unable to get local issuer certificate' };
  }
}

/** 練習でよく使う証明書の束（信頼するルート 1 枚と、それが発行した中間 1 枚） */
export const DEMO_ROOT: Cert = { id: 'root', subject: 'Minato Root CA', issuer: 'Minato Root CA', sans: [], notBefore: '2020-01-01', notAfter: '2040-01-01', ca: true };
export const DEMO_INTERMEDIATE: Cert = { id: 'inter', subject: 'Minato Issuing CA', issuer: 'Minato Root CA', sans: [], notBefore: '2024-01-01', notAfter: '2030-01-01', ca: true };

/** ホストの葉の証明書（中間が発行）。期限や名前を変えて、壊れた状態を作れる */
export function leafFor(host: string, over: Partial<Cert> = {}): Cert {
  return { id: `leaf-${host}`, subject: host, issuer: DEMO_INTERMEDIATE.subject, sans: [host], notBefore: '2026-01-01', notAfter: '2027-01-01', ca: false, ...over };
}

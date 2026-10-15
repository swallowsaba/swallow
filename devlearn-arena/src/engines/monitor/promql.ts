/**
 * PromQL の一部（docs/lessons/mon.md の mon.b.04）。純粋な関数。
 *
 * 扱う形: 数・時系列の選び出し（`名前{ラベル="値", ラベル=~"正規表現", ラベル!="値"}`）・
 * 四則（`+ - * /`）・比べ（`> < >= <= == !=`。時系列と数を比べると、満たす物だけが残る）・かっこ。
 * 関数（rate など）と集計（sum など）は、この模擬では扱わない（読めない式として断る）
 */

export type Labels = Readonly<Record<string, string>>;

export interface Sample {
  labels: Labels;
  value: number;
}

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'selector'; name: string; matchers: { label: string; op: '=' | '!=' | '=~' | '!~'; value: string }[] }
  | { kind: 'binary'; op: string; left: Node; right: Node };

export class PromqlError extends Error {}

interface Tok { t: string; v: string; at: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? '';
    if (/\s/.test(c)) { i += 1; continue; }
    const rest = src.slice(i);
    const num = /^(?:\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)/i.exec(rest);
    if (num) { out.push({ t: 'num', v: num[0], at: i }); i += num[0].length; continue; }
    const id = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.exec(rest);
    if (id) { out.push({ t: 'id', v: id[0], at: i }); i += id[0].length; continue; }
    const str = /^"((?:[^"\\]|\\.)*)"|^'((?:[^'\\]|\\.)*)'/.exec(rest);
    if (str) { out.push({ t: 'str', v: (str[1] ?? str[2] ?? '').replace(/\\(.)/g, '$1'), at: i }); i += str[0].length; continue; }
    const op = /^(?:==|!=|>=|<=|=~|!~|[-+*/<>(){},=])/.exec(rest);
    if (op) { out.push({ t: 'op', v: op[0], at: i }); i += op[0].length; continue; }
    throw new PromqlError(`1:${String(i + 1)}: parse error: unexpected character: '${c}'`);
  }
  return out;
}

const CMP = ['==', '!=', '>', '<', '>=', '<='];

export function parsePromql(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = (): Tok | undefined => toks[p];
  const where = (): string => `1:${String((peek()?.at ?? src.length) + 1)}`;
  const expect = (v: string): void => {
    const t = peek();
    if (t?.v !== v) throw new PromqlError(`${where()}: parse error: unexpected ${t ? `"${t.v}"` : '<EOF>'}, expected "${v}"`);
    p += 1;
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new PromqlError(`${where()}: parse error: unexpected end of input`);
    if (t.t === 'num') { p += 1; return { kind: 'number', value: Number(t.v) }; }
    if (t.v === '(') { p += 1; const n = comparison(); expect(')'); return n; }
    if (t.v === '-') { p += 1; const n = primary(); return { kind: 'binary', op: '*', left: { kind: 'number', value: -1 }, right: n }; }
    if (t.t === 'id') {
      p += 1;
      if (peek()?.v === '(') throw new PromqlError(`1:${String(t.at + 1)}: parse error: unknown function with name "${t.v}"`);
      const matchers: { label: string; op: '=' | '!=' | '=~' | '!~'; value: string }[] = [];
      if (peek()?.v === '{') {
        p += 1;
        while (peek() && peek()?.v !== '}') {
          const l = peek();
          if (l?.t !== 'id') throw new PromqlError(`${where()}: parse error: unexpected ${l ? `"${l.v}"` : '<EOF>'} in label matching, expected label`);
          p += 1;
          const o = peek();
          if (!o || !['=', '!=', '=~', '!~'].includes(o.v)) throw new PromqlError(`${where()}: parse error: unexpected ${o ? `"${o.v}"` : '<EOF>'} in label matching, expected label matching operator`);
          p += 1;
          const s = peek();
          if (s?.t !== 'str') throw new PromqlError(`${where()}: parse error: unexpected ${s ? `"${s.v}"` : '<EOF>'} in label matching, expected string`);
          p += 1;
          matchers.push({ label: l.v, op: o.v as '=' | '!=' | '=~' | '!~', value: s.v });
          if (peek()?.v === ',') p += 1;
        }
        expect('}');
      }
      return { kind: 'selector', name: t.v, matchers };
    }
    throw new PromqlError(`1:${String(t.at + 1)}: parse error: unexpected "${t.v}"`);
  };
  const term = (): Node => {
    let n = primary();
    while (peek()?.v === '*' || peek()?.v === '/') { const op = peek()?.v ?? '*'; p += 1; n = { kind: 'binary', op, left: n, right: primary() }; }
    return n;
  };
  const sum = (): Node => {
    let n = term();
    while (peek()?.v === '+' || peek()?.v === '-') { const op = peek()?.v ?? '+'; p += 1; n = { kind: 'binary', op, left: n, right: term() }; }
    return n;
  };
  const comparison = (): Node => {
    let n = sum();
    while (CMP.includes(peek()?.v ?? '')) { const op = peek()?.v ?? '>'; p += 1; n = { kind: 'binary', op, left: n, right: sum() }; }
    return n;
  };
  const n = comparison();
  if (p < toks.length) throw new PromqlError(`${where()}: parse error: unexpected "${toks[p]?.v ?? ''}"`);
  return n;
}

type Value = { scalar: number } | { vector: Sample[] };

const arith = (op: string, a: number, b: number): number => (op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
const compare = (op: string, a: number, b: number): boolean =>
  op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '==' ? a === b : a !== b;

const without = (labels: Labels, key: string): Labels => Object.fromEntries(Object.entries(labels).filter(([k]) => k !== key));

function evalNode(n: Node, samples: readonly Sample[]): Value {
  if (n.kind === 'number') return { scalar: n.value };
  if (n.kind === 'selector') {
    return {
      vector: samples.filter((s) => s.labels['__name__'] === n.name && n.matchers.every((m) => {
        const v = s.labels[m.label] ?? '';
        if (m.op === '=') return v === m.value;
        if (m.op === '!=') return v !== m.value;
        const re = new RegExp(`^(?:${m.value})$`);
        return m.op === '=~' ? re.test(v) : !re.test(v);
      })).map((s) => ({ labels: s.labels, value: s.value })),
    };
  }
  const l = evalNode(n.left, samples);
  const r = evalNode(n.right, samples);
  const cmp = CMP.includes(n.op);
  if ('scalar' in l && 'scalar' in r) return { scalar: cmp ? Number(compare(n.op, l.scalar, r.scalar)) : arith(n.op, l.scalar, r.scalar) };
  if ('vector' in l && 'scalar' in r) {
    return { vector: cmp ? l.vector.filter((s) => compare(n.op, s.value, r.scalar)) : l.vector.map((s) => ({ labels: without(s.labels, '__name__'), value: arith(n.op, s.value, r.scalar) })) };
  }
  if ('scalar' in l && 'vector' in r) {
    return { vector: cmp ? r.vector.filter((s) => compare(n.op, l.scalar, s.value)).map((s) => ({ labels: s.labels, value: l.scalar })) : r.vector.map((s) => ({ labels: without(s.labels, '__name__'), value: arith(n.op, l.scalar, s.value) })) };
  }
  // 時系列どうし: ラベル（名前を除く）が同じ物を組にする
  const key = (s: Sample): string => JSON.stringify(Object.entries(without(s.labels, '__name__')).sort());
  const right = new Map((r as { vector: Sample[] }).vector.map((s) => [key(s), s]));
  const out: Sample[] = [];
  for (const s of (l as { vector: Sample[] }).vector) {
    const o = right.get(key(s));
    if (!o) continue;
    if (cmp) { if (compare(n.op, s.value, o.value)) out.push(s); } else out.push({ labels: without(s.labels, '__name__'), value: arith(n.op, s.value, o.value) });
  }
  return { vector: out };
}

/** 式を、その時刻に見える時系列で求める。結果は時系列の並び（数だけの式は、ラベルの無い 1 つ） */
export function evaluate(n: Node, samples: readonly Sample[]): Sample[] {
  const v = evalNode(n, samples);
  return 'scalar' in v ? [{ labels: {}, value: v.scalar }] : v.vector;
}

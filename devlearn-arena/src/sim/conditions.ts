/**
 * 条件の式（docs/content-spec.md 7.7）。請願の `when` と公約の `goal` を読む、ただ 1 つの関数。
 * `&&` でつなぎ、比べ方は `>=` `<=` `>` `<` `=`。右は数か、`start.<語>`（任期の初めの値）に足す・掛ける数。
 * 学習の語（レッスンの修了・XP・スキル）は置かない（学習を市政の条件にしない。docs/game-design.md 21.4）
 */

export const CONDITION_WORDS = [
  'population', 'jobs', 'unemployment', 'approval', 'treasury', 'taxRate',
  'rentBurden.低', 'rentBurden.中', 'rentBurden.高',
  'outageDays', 'noiseAtHome',
  'coverage.police', 'coverage.fire', 'coverage.school', 'coverage.clinic', 'coverage.park',
  'facilities.it', 'facilities.civic', 'missionsDone', 'highApprovalWeeks',
] as const;
export type ConditionWord = (typeof CONDITION_WORDS)[number];

type Op = '>=' | '<=' | '>' | '<' | '=';
export type Clause =
  | { word: string; op: Op; value: number }
  | { word: string; op: Op; start: ConditionWord; plus?: number; times?: number };

const WORDS = new Set<string>(CONDITION_WORDS);
const CLAUSE = /^(any:)?([A-Za-z.一-鿿]+)\s*(>=|<=|>|<|=)\s*(.+)$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const START = /^start\.([A-Za-z.一-鿿]+)(?:\s*([+*])\s*(-?\d+(?:\.\d+)?))?$/;

/** 式を読む。読めない式・知らない語・start の語が 2 つ以上なら null */
export function parseCondition(expr: string): Clause[] | null {
  const parts = expr.split('&&').map((p) => p.trim());
  const out: Clause[] = [];
  for (const p of parts) {
    const m = CLAUSE.exec(p);
    if (!m) return null;
    const [, any, word = '', op, rhs = ''] = m;
    if (!WORDS.has(word)) return null;
    const left = `${any ?? ''}${word}`;
    const r = rhs.trim();
    if (NUMBER.test(r)) {
      out.push({ word: left, op: op as Op, value: Number(r) });
      continue;
    }
    const s = START.exec(r);
    if (!s || !WORDS.has(s[1] ?? '')) return null;
    out.push({ word: left, op: op as Op, start: s[1] as ConditionWord, ...(s[2] === '+' ? { plus: Number(s[3]) } : {}), ...(s[2] === '*' ? { times: Number(s[3]) } : {}) });
  }
  return out.filter((c) => 'start' in c).length > 1 ? null : out;
}

/** 式の中の start の語（無ければ null） */
export function startWordOf(clauses: readonly Clause[]): ConditionWord | null {
  for (const c of clauses) if ('start' in c) return c.start;
  return null;
}

/** 値で判定する（値の無い語は満たさない）。start は任期の初めの値（公約の startValue） */
export function evalCondition(clauses: readonly Clause[], values: Partial<Record<string, number>>, start?: number): boolean {
  return clauses.every((c) => {
    const v = values[c.word];
    if (v === undefined) return false;
    let target: number;
    if ('value' in c) target = c.value;
    else {
      if (start === undefined) return false;
      target = c.times !== undefined ? start * c.times : start + (c.plus ?? 0);
    }
    switch (c.op) {
      case '>=': return v >= target;
      case '<=': return v <= target;
      case '>': return v > target;
      case '<': return v < target;
      case '=': return v === target;
    }
  });
}

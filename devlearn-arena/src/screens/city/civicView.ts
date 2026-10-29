import type { Point } from '@/city/types';
import { capitalCapOf } from '@/sim/awards';
import { factorIndex, layerName, LAYERS, WEIGHTS } from '@/sim/layers';
import { parseCondition } from '@/sim/conditions';
import { groupName } from '@/sim/news';
import { needsApplication } from '@/sim/permits';
import { acceptCost, PETITION_DEADLINE_WEEKS, PETITION_TRUST, petitionProblems } from '@/sim/petitions';
import { DAYS_PER_WEEK, dateOf, taxPoints } from '@/sim/rules';
import { districtCenter } from '@/sim/space';
import type { Terrain } from '@/city/terrain';
import { FACILITY_DEFS } from '@/city/facilities';
import { TAX_RANGE } from '@/sim/budget';
import { plantOutput, powerUse, stoppedNow } from '@/sim/power';
import type { Article, Petition, PoliticsRules, World } from '@/sim/types';

/**
 * 受信箱（docs/ui-design.md 10.8）・予算（10.9）・市内新聞（10.10）の窓に出す中身。画面の部品から切り離した純粋な計算。
 */

const num = (v: number): string => Math.round(v).toLocaleString('ja-JP');
const num1 = (v: number): string => v.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

/* ---------- 受信箱（10.8） ---------- */

export interface InboxRow {
  id: string;
  title: string;
  text: string;
  /** 送った集団（層と地区）「北浜地区の住民（低い収入の子育て）」 */
  from: string;
  /** 届いた理由の模擬の値「北浜地区の低い収入の世帯の家賃の負担が 37%」 */
  basis: string;
  /** 期限までの週 */
  weeksLeft: number;
  /** 受理の効き（押す前に示す） */
  accept: { cost: string; effect: string; trust: string; problem?: string };
  /** 拒否した時に下がる信頼 */
  reject: string;
  /** 保留の意味 */
  hold: string;
  at?: Point;
}

/** 層の番号の並びを、短い呼び名にする（低い収入の帯 4 つなら「低い収入の世帯」） */
function layersText(layers: readonly number[] | undefined, fallback?: number): string {
  const ls = layers && layers.length > 0 ? layers : fallback !== undefined ? [fallback] : [];
  if (ls.length === 0) return '住民';
  const bands = ['低い収入', '中くらいの収入', '高い収入'];
  const ages = ['若者', '子育て', '中年', '高齢'];
  for (let b = 0; b < 3; b += 1) if (ls.length === 4 && ls.every((l) => l % 3 === b)) return `${bands[b] ?? ''}の世帯`;
  for (let a = 0; a < 4; a += 1) if (ls.length === 3 && ls.every((l) => Math.floor(l / 3) === a)) return `${ages[a] ?? ''}の世帯`;
  if (ls.length === 1) return layerName(ls[0] as number);
  return ls.map((l) => layerName(l)).join('・');
}

/** 届いた理由の語の言い表し */
function basisText(p: Petition, place: string, value: number): string {
  const clause = (parseCondition(p.when) ?? [])[0];
  const word = (clause?.word ?? '').replace(/^any:/, '');
  const at = place ? `${place}の` : '';
  const band = /^rentBurden\.(.)$/.exec(word);
  if (band) return `${at}${band[1] === '低' ? '低い' : band[1] === '中' ? '中くらいの' : '高い'}収入の世帯の家賃の負担が ${num1(value)}%（30% を超えると暮らしが苦しくなる）`;
  switch (word) {
    case 'noiseAtHome': return `${at}住まいの騒音が ${num1(value)}（うるさい方から 1 割の平均。40 を超えると眠りを妨げる）`;
    case 'coverage.park': return `${at}公園の行き届きが ${num(value)}%（歩いて行ける公園が無い）`;
    case 'outageDays': return `${place ? `${place}で` : ''}直近 28 日に ${num(value)} 日の停電`;
    case 'unemployment': return `${at}失業率が ${num1(value)}%`;
    case 'population': return `${at}人口が ${num(value)} 人`;
    case 'approval': return `${at}支持率が ${num1(value)}%`;
    case 'taxRate': return `税率が ${num(value)}%`;
    case 'treasury': return `財政が ${num(value)}`;
    default: return `${word} が ${num1(value)}`;
  }
}

/** 受理の中身の言い表し */
function effectText(p: Petition, place: string, who: string): string {
  const e = p.accept.effect;
  const at = place ? `${place}の` : '';
  switch (e.kind) {
    case 'rent-subsidy': return `${at}${who}の家賃を ${num(e.ratio * 100)}% 下げる（${String(e.weeks)} 週）`;
    case 'build': return needsApplication(e.type)
      ? `${at}空き地に${FACILITY_DEFS[e.type].name}の申請を出す（審議を経て建つ。否決・取り下げで費用は戻る）`
      : `${at}空き地に${FACILITY_DEFS[e.type].name}を建てる`;
    case 'power-cap': return `外から買う電気の上限を ${num1(e.mw)} MW 増やす`;
    case 'noise-limit': return `${at}住まいに届く工場の騒音を ${num((1 - e.factor) * 100)}% 下げる。その工場の売上も同じだけ下がる（${String(e.weeks)} 週）`;
    case 'bus': return `${at}通勤の時間を ${num((1 - e.traffic) * 100)}% 縮める（${String(e.weeks)} 週）`;
  }
}

export function inboxRows(world: World, terrain: Terrain, rules: Pick<PoliticsRules, 'petitions'>): InboxRow[] {
  const out: InboxRow[] = [];
  for (const i of world.petitions.inbox) {
    const p = rules.petitions?.find((x) => x.id === i.petitionId);
    if (!p) continue;
    const place = i.district !== undefined ? (world.sim.districtNames[i.district] ?? '') : '';
    const who = layersText(p.layers, i.layer);
    const cost = acceptCost(p);
    const parts: string[] = [];
    if (cost.once > 0) parts.push(`財政から ${num(cost.once)}`);
    if (cost.weekly > 0) parts.push(`毎週 ${num1(cost.weekly)} × ${String(cost.weeks)} 週（計 ${num(cost.weekly * cost.weeks)}）`);
    const problems = petitionProblems(world, terrain, rules, i.id);
    out.push({
      id: i.id,
      title: p.title,
      text: p.text,
      from: `${groupName({ group: p.group, ...(i.district !== undefined ? { district: i.district } : {}) }, world)}（${who}）`,
      basis: basisText(p, place, i.value),
      weeksLeft: Math.max(0, i.arrivedWeek + PETITION_DEADLINE_WEEKS - world.sim.week),
      accept: {
        cost: parts.length > 0 ? parts.join('・') : '財政の費用は無い',
        effect: effectText(p, place, who),
        trust: `${who}の信頼 +${String(PETITION_TRUST.accept)}`,
        ...(problems.includes('no-site') ? { problem: `${place}に建てられる空き地が無い` } : problems.includes('permit') ? { problem: '今は申請を出せない（審議中の申請が 6 件か、財政が赤字）' } : {}),
      },
      reject: `${who}の信頼 ${String(PETITION_TRUST.reject)}`,
      hold: `何も起きない。期限（あと ${String(Math.max(0, i.arrivedWeek + PETITION_DEADLINE_WEEKS - world.sim.week))} 週）が来ると放置になり、信頼 ${String(PETITION_TRUST.expire)}`,
      ...(i.district !== undefined ? { at: districtCenter(i.district) } : {}),
    });
  }
  return out;
}

/* ---------- 予算（10.9） ---------- */

export interface LedgerLine {
  id: string;
  label: string;
  value: number;
  /** 棒の長さ（0〜1。収入と支出の中の一番大きい物を 1） */
  ratio: number;
}

export interface BudgetModel {
  week: number | null;
  income: LedgerLine[];
  spend: LedgerLine[];
  incomeTotal: number;
  spendTotal: number;
  treasury: number;
  deficit: boolean;
  deficitWeeks: number;
  taxRate: number;
  pendingTaxRate?: number;
}

export function budgetModel(world: World): BudgetModel {
  const b = world.budget;
  const row = b.ledger.at(-1);
  const income = [
    { id: 'residents', label: '住民の税', value: row?.income.residents ?? 0 },
    { id: 'businesses', label: '事業者の税', value: row?.income.businesses ?? 0 },
  ];
  const spend = [
    { id: 'services', label: '公共サービスの維持', value: row?.spend.services ?? 0 },
    { id: 'power', label: '発電所の維持', value: row?.spend.power ?? 0 },
    { id: 'external', label: '外からの電気', value: row?.spend.external ?? 0 },
    { id: 'petitions', label: '請願', value: row?.spend.petitions ?? 0 },
  ];
  const max = Math.max(1e-9, ...income.map((x) => x.value), ...spend.map((x) => x.value));
  const withRatio = (xs: typeof income): LedgerLine[] => xs.map((x) => ({ ...x, ratio: x.value / max }));
  return {
    week: row?.week ?? null,
    income: withRatio(income),
    spend: withRatio(spend),
    incomeTotal: income.reduce((s, x) => s + x.value, 0),
    spendTotal: spend.reduce((s, x) => s + x.value, 0),
    treasury: b.treasury,
    deficit: b.treasury < 0,
    deficitWeeks: b.deficitWeeks,
    taxRate: b.taxRate,
    ...(b.pendingTaxRate !== undefined ? { pendingTaxRate: b.pendingTaxRate } : {}),
  };
}

export interface TaxPreview {
  rate: number;
  /** 見込みの税収の増減（今週の税収から、税率の比で） */
  incomeDelta: number;
  /** [層 12] 満足の「税」の点の増減（重みを掛けた後） */
  points: number[];
}

/** 税率を rate にした時の見込み（税収は税率に比例し、税の点は (10 − 税率) × 層の重み。docs/game-design.md 13.8・22.2） */
export function taxPreview(world: World, rate: number): TaxPreview {
  const r = Math.min(TAX_RANGE.max, Math.max(TAX_RANGE.min, Math.round(rate)));
  const cur = world.budget.taxRate;
  const row = world.budget.ledger.at(-1);
  const income = (row?.income.residents ?? 0) + (row?.income.businesses ?? 0);
  const tax = factorIndex('tax');
  return {
    rate: r,
    incomeDelta: cur > 0 ? income * (r / cur - 1) : 0,
    points: LAYERS.map((l) => (taxPoints(r) - taxPoints(cur)) * ((WEIGHTS[l] as readonly number[])[tax] as number)),
  };
}

export interface CapitalModel {
  value: number;
  cap: number;
  /** この任期の得と使い（理由ごとにまとめ、大きい順） */
  gains: { why: string; amount: number; count: number }[];
  uses: { why: string; amount: number; count: number }[];
}

export function capitalModel(world: World): CapitalModel {
  const sum = (sign: 1 | -1): CapitalModel['gains'] => {
    const by = new Map<string, { why: string; amount: number; count: number }>();
    for (const x of world.politics.capitalLog) {
      if (Math.sign(x.amount) !== sign) continue;
      // 理由の括弧の中（施設の名前など）を外してまとめる
      const why = x.why.replace(/（.*）$/, '');
      const cur = by.get(why) ?? { why, amount: 0, count: 0 };
      cur.amount += x.amount;
      cur.count += 1;
      by.set(why, cur);
    }
    return [...by.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  };
  return { value: world.politics.capital, cap: capitalCapOf(world.city), gains: sum(1), uses: sum(-1) };
}

/* ---------- 市内新聞（10.10） ---------- */

export interface NewsIssue {
  week: number;
  /** 「3 年目 12 週」 */
  date: string;
  articles: Article[];
}

/** 最新の号を上に、週ごとにまとめる。query があれば見出しで探す（空白で区切った語を全て含む物） */
export function newsIssues(news: readonly Article[], query = ''): NewsIssue[] {
  const words = query.trim().split(/\s+/).filter((w) => w !== '');
  const hit = (a: Article): boolean => words.every((w) => a.headline.includes(w));
  const by = new Map<number, Article[]>();
  for (const a of news) {
    if (!hit(a)) continue;
    const list = by.get(a.week) ?? [];
    list.push(a);
    by.set(a.week, list);
  }
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([week, articles]) => {
      const d = dateOf(week * DAYS_PER_WEEK);
      return { week, date: `${String(d.year)} 年目 ${String(d.week)} 週`, articles: [...articles].reverse() };
    });
}

/* ---------- 発電所を選んでいる間の電力の 1 行（11.5） ---------- */

/** 「電力 使う 12.4 MW ／ 来る 48.0 MW（発電所 40.0・外の電気 8.0 まで）」。止まった地区があれば数を添える */
export function powerLine(world: Pick<World, 'city' | 'sim' | 'budget'>, rules: Pick<PoliticsRules, 'facilities'>): string {
  const mw = (v: number): string => v.toFixed(1);
  const deficit = world.budget.treasury < 0;
  let plants = 0;
  for (const f of world.city.facilities) if (f.state === 'active') plants += plantOutput(f, deficit);
  const ext = world.sim.power.externalCapMW;
  const stopped = stoppedNow(world.sim.power).size;
  return `電力 使う ${mw(powerUse(world.city, rules))} MW ／ 来る ${mw(plants + ext)} MW（発電所 ${mw(plants)}${deficit && plants > 0 ? '（赤字の間は 7 割）' : ''}・外の電気 ${mw(ext)} まで）`
    + (stopped > 0 ? `・止まっている地区 ${String(stopped)}` : '');
}

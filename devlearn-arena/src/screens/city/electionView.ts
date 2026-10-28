import { DOMAINS } from '@/city/facilityInfo';
import type { DomainId, Point } from '@/city/types';
import { EXPLAIN, PLEDGES } from '@/content/politics';
import { parseCondition, startWordOf, type Clause } from '@/sim/conditions';
import { conditionValues, electionDayOf, electionOf, layerAdults, voteShareOf } from '@/sim/election';
import { causeText } from '@/sim/explain';
import { AGE_BANDS, AGE_NAMES, FACTOR_NAMES, INCOME_BANDS, INCOME_NAMES, layerName } from '@/sim/layers';
import { applicationName } from '@/sim/permits';
import { DAYS_PER_WEEK } from '@/sim/rules';
import type { CauseKind, Pledge, World } from '@/sim/types';
import { siteFocus } from './permitView';

/**
 * 選挙の画面（docs/ui-design.md 10.6）と任期の終わりの一覧（10.7）・公約を選ぶ窓に出す中身。
 * 規則は src/sim/election.ts にあり、ここは文と表に直すだけ
 */


/** 条件の語の名前と単位（公約の今の値と目標を言う） */
const WORDS: Record<string, { name: string; unit: string }> = {
  population: { name: '人口', unit: '人' },
  jobs: { name: '働き口', unit: '人' },
  unemployment: { name: '失業率', unit: '%' },
  approval: { name: '支持率', unit: '%' },
  treasury: { name: '財政', unit: '' },
  taxRate: { name: '税率', unit: '%' },
  outageDays: { name: '停電した日', unit: '日' },
  'facilities.it': { name: '完成した IT 施設', unit: 'つ' },
  'facilities.civic': { name: '公共サービス', unit: 'つ' },
  missionsDone: { name: '達成したミッション', unit: 'つ' },
};
const OPS: Record<string, string> = { '>=': '以上', '<=': '以下', '>': 'より上', '<': 'より下', '=': 'ちょうど' };

const num = (v: number): string => (Math.round(v * 10) / 10).toLocaleString('ja-JP');

/** 公約の今の値と目標（「人口 340 人（目標 408 人以上）」） */
export function goalText(pledge: Pick<Pledge, 'goal'>, values: Partial<Record<string, number>>, start: number | undefined): string {
  const clauses = parseCondition(pledge.goal) ?? [];
  return clauses.map((c: Clause) => {
    const w = WORDS[c.word] ?? { name: c.word, unit: '' };
    const now = values[c.word];
    const target = 'value' in c ? c.value : start === undefined ? undefined : c.times !== undefined ? start * c.times : start + (c.plus ?? 0);
    return `${w.name} ${now === undefined ? '—' : num(now)}${w.unit}（目標 ${target === undefined ? '—' : num(Math.ceil(target * 10) / 10)}${w.unit}${OPS[c.op] ?? ''}）`;
  }).join('・');
}

/** 公約を重く見る層の名前（「低い収入の若者・中くらいの収入の若者」。4 つ以上は「ほか」） */
export function pledgeLayers(p: Pick<Pledge, 'layers'>): string {
  const names = p.layers.map(layerName);
  return names.length > 3 ? `${names.slice(0, 3).join('・')}ほか` : names.join('・');
}

export interface ElectionModel {
  mode: 'preview' | 'result';
  title: string;
  voteShare: number;
  won: boolean;
  /** 4×3 の表（行が年齢の帯、列が収入の帯） */
  rows: { age: string; cells: { layer: number; name: string; support: number; turnout: number }[] }[];
  /** 得票に効いた層の上位 3 つ */
  top: { layer: number; name: string; points: number }[];
  /** 選挙までの週（見込みの時） */
  weeksLeft: number;
  pledges: { id: string; title: string; done: boolean; text: string }[];
  /** 落選の敗因 */
  causes: { layer: number; name: string; factors: string[]; decisions: { key: string; text: string; at: Point | null }[] }[];
  /** 学習の記録は消えない（10.6） */
  defeated: boolean;
}

/** 表の列の見出し（収入の帯） */
export const INCOME_COLUMNS = INCOME_BANDS.map((b) => INCOME_NAMES[b]);

/** 選挙の画面の中身。preview は今の見込み、result は最後の選挙の結果 */
export function electionModel(world: World, mode: 'preview' | 'result'): ElectionModel | null {
  const past = world.politics.pastTerms.at(-1);
  if (mode === 'result' && !past) return null;
  const now = electionOf(world);
  const share = mode === 'result' && past ? past.voteShare : now.voteShare;
  const byLayer = mode === 'result' && past ? past.byLayer : now.byLayer;
  const top = mode === 'result' && past ? voteShareOf(layerAdults(world), past.byLayer.map((x) => x.support)).effects.slice(0, 3) : now.effects.slice(0, 3);
  const values = conditionValues(world);
  const day = Math.floor(world.city.day);
  const term = world.politics.term;
  const pledges = mode === 'preview'
    ? term.pledges.flatMap((p) => {
      const def = PLEDGES.find((x) => x.id === p.pledgeId);
      return def ? [{ id: def.id, title: def.title, done: p.doneDay !== undefined, text: p.doneDay !== undefined ? '果たした' : goalText(def, values, p.startValue) }] : [];
    })
    : (past?.pledgesDone ?? []).flatMap((id) => {
      const def = PLEDGES.find((x) => x.id === id);
      return def ? [{ id, title: def.title, done: true, text: '果たした' }] : [];
    });
  return {
    mode,
    title: mode === 'result' && past ? `${String(past.no)} 期目の選挙の結果` : `${String(term.no)} 期目の選挙の見込み`,
    voteShare: Math.round(share * 10) / 10,
    won: share >= 50,
    rows: AGE_BANDS.map((a, ai) => ({
      age: AGE_NAMES[a],
      cells: INCOME_BANDS.map((_, ii) => {
        const layer = ai * 3 + ii;
        const x = byLayer[layer] ?? { support: 50, turnout: 0 };
        return { layer, name: layerName(layer), support: Math.round(x.support), turnout: Math.round(x.turnout * 100) };
      }),
    })),
    top: top.map((e) => ({ layer: e.layer, name: layerName(e.layer), points: Math.round(e.points * 10) / 10 })),
    weeksLeft: Math.max(0, Math.ceil((electionDayOf(term) - day) / DAYS_PER_WEEK)),
    pledges,
    causes: mode === 'result' && past?.causes ? past.causes.map((c) => ({
      layer: c.layer,
      name: layerName(c.layer),
      factors: c.factors.map((f) => `${FACTOR_NAMES[f.factor]} ${num(f.points)}`),
      decisions: c.decisions.map((key) => decisionOf(world, key)),
    })) : [],
    defeated: world.politics.defeated === true,
  };
}

/** 敗因の決定（「北浜町のデータセンター」と、押すと寄る場所） */
function decisionOf(world: World, key: string): { key: string; text: string; at: Point | null } {
  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  const cause = world.history.breakdown.at(-1)?.causes.find((c) => c.source.kind === kind && c.source.id === id);
  const at = cause?.source.at ?? null;
  const text = causeText(kind as CauseKind, id, at ?? undefined, { city: world.city, districtNames: world.sim.districtNames, taxRate: world.budget.taxRate }, EXPLAIN);
  return { key, text, at };
}

export interface TermModel {
  no: number;
  won: boolean;
  span: string;
  built: { id: string; name: string; at: Point | null; size: Point | null }[];
  approved: number;
  rejected: number;
  numbers: { name: string; from: string; to: string }[];
  /** 支持率の線（任期の間の週の値） */
  approvalLine: number[];
  pledgesDone: string[];
  missionsDone: number;
  lessonsDone: number;
  skillsUp: string[];
}

/** 任期の終わりの一覧（10.7。最後の任期） */
export function termModel(world: World): TermModel | null {
  const t = world.politics.pastTerms.at(-1);
  if (!t) return null;
  const year = (d: number): string => `${String(Math.floor(d / (DAYS_PER_WEEK * 52)) + 1)} 年目`;
  const weeks = world.history.weekly.filter((s) => s.week * DAYS_PER_WEEK >= t.startDay && s.week * DAYS_PER_WEEK <= t.endDay);
  return {
    no: t.no,
    won: t.won,
    span: `${year(t.startDay)} 〜 ${year(t.endDay)}`,
    built: t.built.flatMap((id) => {
      const a = world.applications.find((x) => x.id === id);
      if (!a) return [];
      const f = siteFocus(a, world);
      return [{ id, name: applicationName(a, world.city), at: f?.at ?? null, size: f?.size ?? null }];
    }),
    approved: t.approved,
    rejected: t.rejected,
    numbers: [
      { name: '人口', from: `${num(t.population[0])} 人`, to: `${num(t.population[1])} 人` },
      { name: '働き口', from: `${num(t.jobs[0])} 人`, to: `${num(t.jobs[1])} 人` },
      { name: '財政', from: num(t.treasury[0]), to: num(t.treasury[1]) },
      { name: '支持率', from: `${num(t.approval[0])}%`, to: `${num(t.approval[1])}%` },
    ],
    approvalLine: weeks.map((s) => s.approval),
    pledgesDone: t.pledgesDone.flatMap((id) => PLEDGES.find((p) => p.id === id)?.title ?? []),
    missionsDone: t.missionsDone.length,
    lessonsDone: t.lessonsDone,
    skillsUp: t.skillsUp.map((d: DomainId) => DOMAINS.find((x) => x.id === d)?.name ?? d),
  };
}

/** 公約の候補（10.7: 候補を一覧で。果たす条件と今の値を添える） */
export function pledgeOptions(world: World): { id: string; title: string; text: string; layers: string }[] {
  const values = conditionValues(world);
  return PLEDGES.map((p) => {
    const word = startWordOf(parseCondition(p.goal) ?? []);
    const start = word ? (values as Partial<Record<string, number>>)[word] : undefined;
    return { id: p.id, title: p.title, text: goalText(p, values, start), layers: pledgeLayers(p) };
  });
}


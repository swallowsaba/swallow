import type { Point } from '@/city/types';
import { electionDayOf, electionOf, WARN_DAYS } from './election';
import { moveTrust } from './hearing';
import { LAYERS } from './layers';
import { applicationName, siteCells } from './permits';
import { dateOf, WEEKS_PER_TERM } from './rules';
import { districtCenter, districtOf } from './space';
import type { Application, Article, GroupId, NewsKind, NewsTemplate, ObjectionState, PoliticsRules, World } from './types';

/**
 * 市内新聞（docs/game-design.md 22.3・docs/content-spec.md 7.5）。純粋な計算。
 * 1 日・1 つの命令の前と後の世界を比べ、起きた出来事を型の文に名前と数字を入れて記事にする。
 * 不祥事も乱数でなく、市長の決定（押し切り・公約・赤字・期限切れの請願・誤った説明）の数が境を越えた時だけ出る。記事が出ると、関係する層の信頼 −1
 */

/** 型の文に差し込める名前（docs/content-spec.md 7.5） */
export type NewsSlot = 'city' | 'mayor' | 'facility' | 'district' | 'group' | 'reason' | 'yes' | 'no' | 'n' | 'rate' | 'value' | 'week' | 'year';

/** 記事の種類と場合分けごとに、入る名前（検証で、書いた名前が入る物かを確かめる）。日付と都市の名前はどの記事にも入る */
const COMMON: readonly NewsSlot[] = ['city', 'mayor', 'week', 'year'];
export const NEWS_SLOTS: Record<string, readonly NewsSlot[]> = {
  start: [],
  application: ['facility', 'district'],
  'approved:consent': ['facility', 'district'],
  'approved:vote': ['facility', 'district', 'yes', 'no'],
  rejected: ['facility', 'district', 'yes', 'no', 'reason'],
  'appeal:filed': ['facility', 'district', 'group'],
  'appeal:cleared': ['facility', 'district'],
  completed: ['facility', 'district'],
  'election:near': ['n', 'rate'],
  'election:won': ['n', 'rate'],
  'election:lost': ['n', 'rate'],
  'term-end': ['n', 'value', 'rate'],
  closure: ['n', 'district'],
  'tax:up': ['rate', 'value'],
  'tax:down': ['rate', 'value'],
  'petition:accept': ['reason', 'group', 'district'],
  'petition:reject': ['reason', 'group', 'district'],
  'petition:expire': ['reason', 'group', 'district'],
  mission: ['n'],
  'scandal:push': ['n'],
  'scandal:pledge': ['n'],
  'scandal:deficit': ['n'],
  'scandal:expired': ['n'],
  'scandal:wrong': ['n'],
};

export const slotsOf = (kind: NewsKind, variant?: string): readonly NewsSlot[] | undefined => {
  const own = NEWS_SLOTS[variant ? `${kind}:${variant}` : kind];
  return own ? [...COMMON, ...own] : undefined;
};

/** 不祥事の境（22.3） */
export const SCANDAL = { push: 3, wrong: 3, expired: 5, deficit: 8 } as const;
/** 不祥事の記事が出た時の、関係する層の信頼の動き */
export const SCANDAL_TRUST = -1;

const GROUP_NAMES: Record<GroupId, string> = { neighbors: '住民', merchants: '商店会', environment: '環境の会', taxpayers: '納税者の会', workers: '働く人の会' };

/** 反対する集団の呼び名（近くの集団は地区の名前で呼ぶ。docs/game-design.md 16.1） */
export function groupName(o: Pick<ObjectionState, 'group' | 'district'>, world: Pick<World, 'sim'>): string {
  const local = o.group === 'neighbors' || o.group === 'merchants';
  const place = o.district !== undefined ? world.sim.districtNames[o.district] : undefined;
  return local && place ? `${place}の${GROUP_NAMES[o.group]}` : o.group === 'neighbors' ? '近隣の住民' : GROUP_NAMES[o.group];
}

interface Event {
  kind: NewsKind;
  variant?: string;
  values: Partial<Record<NewsSlot, string | number>>;
  at?: Point;
  /** 不祥事で信頼を下げる層 */
  trust?: readonly number[];
}

/** 申請の敷地の中心と地区 */
function siteOf(app: Application, world: World): { at?: Point; district?: number } {
  const cells = siteCells(app, world.city);
  if (cells.length === 0) return {};
  const x = cells.reduce((s, c) => s + c.x, 0) / cells.length + 0.5;
  const y = cells.reduce((s, c) => s + c.y, 0) / cells.length + 0.5;
  return { at: { x, y }, district: districtOf(Math.floor(x), Math.floor(y)) };
}

function appValues(app: Application, world: World): { values: Event['values']; at?: Point } {
  const site = siteOf(app, world);
  return {
    values: { facility: applicationName(app, world.city), district: site.district !== undefined ? (world.sim.districtNames[site.district] ?? '') : '' },
    ...(site.at ? { at: site.at } : {}),
  };
}

const yesNo = (app: Application): { yes: number; no: number } => ({
  yes: app.vote?.members.filter((m) => m.yes).length ?? 0,
  no: app.vote?.members.filter((m) => !m.yes).length ?? 0,
});

/** 一番割合の大きい反対の理由の題 */
function topReason(app: Application, rules: PoliticsRules): string {
  let top: ObjectionState | undefined;
  for (const o of app.objections) if (!top || o.share > top.share) top = o;
  return top ? (rules.reasons.find((r) => r.id === top.reasonId)?.title ?? '') : '';
}

/** この任期に、押し切った（説明を誤った）理由に反対した層 */
function handLayers(world: World, match: (h: NonNullable<ObjectionState['hand']>) => boolean): number[] {
  const out = new Set<number>();
  const start = world.politics.term.startDay;
  for (const a of world.applications) for (const o of a.objections) if (o.hand && o.hand.day >= start && match(o.hand)) for (const l of o.layers ?? []) out.add(l);
  return [...out];
}

/** 申請の出来事（出した・可決・否決・申し立て・完成） */
function applicationEvents(before: World, after: World, rules: PoliticsRules): Event[] {
  const was = new Map(before.applications.map((a) => [a.id, a]));
  const out: Event[] = [];
  for (const a of after.applications) {
    const prev = was.get(a.id);
    if (prev?.stage === a.stage) continue;
    const { values, at } = appValues(a, after);
    const base = { values, ...(at ? { at } : {}) };
    if (!prev) {
      out.push({ kind: 'application', ...base });
      continue;
    }
    const passed = (a.stage === 'construction' && prev.stage !== 'appeal') || (a.stage === 'appeal') || (a.stage === 'done' && a.kind === 'rezone' && prev.stage !== 'construction');
    if (passed && a.vote) {
      out.push(a.vote.consent ? { kind: 'approved', variant: 'consent', ...base } : { kind: 'approved', variant: 'vote', ...base, values: { ...values, ...yesNo(a) } });
    }
    if (a.stage === 'appeal') {
      const group = a.objections.filter((o) => o.group === a.appeal?.group).sort((x, y) => y.share - x.share)[0];
      out.push({ kind: 'appeal', variant: 'filed', ...base, values: { ...values, group: group ? groupName(group, after) : '反対した人たち' } });
    } else if (a.stage === 'construction' && prev.stage === 'appeal') {
      out.push({ kind: 'appeal', variant: 'cleared', ...base });
    } else if (a.stage === 'done' && prev.stage === 'construction') {
      out.push({ kind: 'completed', ...base });
    } else if (a.stage === 'rejected') {
      out.push({ kind: 'rejected', ...base, values: { ...values, ...yesNo(a), reason: topReason(a, rules) } });
    }
  }
  return out;
}

/** 選挙（8 週前・当選・落選）と任期の終わりの特集。公約を果たせずに選挙を迎えた不祥事 */
function electionEvents(before: World, after: World, rules: PoliticsRules): Event[] {
  const out: Event[] = [];
  const prevDay = Math.floor(before.city.day);
  const day = Math.floor(after.city.day);
  const term = after.politics.term;
  const warn = electionDayOf(term) - WARN_DAYS;
  if (term.no === before.politics.term.no && prevDay < warn && day >= warn) {
    out.push({ kind: 'election', variant: 'near', values: { n: 8, rate: Math.round(electionOf(after).voteShare) } });
  }
  if (after.politics.pastTerms.length > before.politics.pastTerms.length) {
    const t = after.politics.pastTerms.at(-1);
    if (t) {
      const unmet = before.politics.term.pledges.filter((p) => !t.pledgesDone.includes(p.pledgeId));
      if (unmet.length > 0) {
        const layers = new Set<number>();
        for (const u of unmet) for (const l of rules.pledges?.find((p) => p.id === u.pledgeId)?.layers ?? []) layers.add(l);
        out.push({ kind: 'scandal', variant: 'pledge', values: { n: unmet.length }, trust: [...layers] });
      }
      out.push({ kind: 'election', variant: t.won ? 'won' : 'lost', values: { n: t.no, rate: Math.round(t.voteShare) } });
      out.push({ kind: 'term-end', values: { n: t.no, value: t.population[1].toLocaleString('ja-JP'), rate: Math.round(t.approval[1]) } });
    }
  }
  return out;
}

/** 請願の扱い（受理・拒否・放置） */
function petitionEvents(before: World, after: World, rules: PoliticsRules): Event[] {
  const out: Event[] = [];
  for (const [id, h] of Object.entries(after.petitions.handled)) {
    const prev = before.petitions.handled[id];
    if (prev && prev.week === h.week && prev.choice === h.choice) continue;
    const p = rules.petitions?.find((x) => x.id === id);
    const entry = before.petitions.inbox.find((i) => i.petitionId === id);
    if (!p || !entry) continue;
    const district = entry.district;
    const name = district !== undefined ? (after.sim.districtNames[district] ?? '') : '';
    out.push({
      kind: 'petition',
      variant: h.choice,
      values: { reason: p.title, group: groupName({ group: p.group, ...(district !== undefined ? { district } : {}) }, after), district: name },
      ...(district !== undefined ? { at: districtCenter(district) } : {}),
    });
  }
  return out;
}

/** 都市の出来事（事業者の撤退・税率の変更・ミッション）と、数の不祥事（押し切り・誤った説明・期限切れの請願・赤字） */
function cityEvents(before: World, after: World, rules: PoliticsRules): Event[] {
  const out: Event[] = [];
  const closed = Object.keys(after.sim.vacant).filter((id) => before.sim.vacant[id] === undefined);
  if (closed.length > 0) {
    const b = after.city.buildings.find((x) => x.id === closed[0]);
    const d = b ? districtOf(b.cell.x, b.cell.y) : undefined;
    out.push({
      kind: 'closure',
      values: { n: closed.length, district: d !== undefined ? (after.sim.districtNames[d] ?? '') : '' },
      ...(b ? { at: { x: b.cell.x + 0.5, y: b.cell.y + 0.5 } } : {}),
    });
  }
  if (after.budget.taxRate !== before.budget.taxRate) {
    out.push({ kind: 'tax', variant: after.budget.taxRate > before.budget.taxRate ? 'up' : 'down', values: { rate: after.budget.taxRate, value: before.budget.taxRate } });
  }
  const missions = after.politics.missions?.length ?? 0;
  if (missions > (before.politics.missions?.length ?? 0)) out.push({ kind: 'mission', values: { n: missions } });
  // 数の不祥事は、同じ任期の中で境を越えた時に 1 度だけ（任期が変わって 0 に戻った時は出さない）
  const sameTerm = after.politics.term.no === before.politics.term.no;
  const crossed = (a: number, b: number, edge: number): boolean => sameTerm && a < edge && b >= edge;
  if (crossed(before.politics.pushesThisTerm, after.politics.pushesThisTerm, SCANDAL.push)) {
    out.push({ kind: 'scandal', variant: 'push', values: { n: after.politics.pushesThisTerm }, trust: handLayers(after, (h) => h.kind === 'push') });
  }
  if (crossed(before.politics.wrongExplanations, after.politics.wrongExplanations, SCANDAL.wrong)) {
    out.push({ kind: 'scandal', variant: 'wrong', values: { n: after.politics.wrongExplanations }, trust: handLayers(after, (h) => h.kind === 'explain' && h.quality === 'wrong') });
  }
  if (crossed(before.politics.expiredPetitions, after.politics.expiredPetitions, SCANDAL.expired)) {
    const layers = new Set<number>();
    for (const [id, h] of Object.entries(after.petitions.handled)) {
      if (h.choice !== 'expire' || h.week * 7 < after.politics.term.startDay) continue;
      for (const l of rules.petitions?.find((p) => p.id === id)?.layers ?? []) layers.add(l);
    }
    out.push({ kind: 'scandal', variant: 'expired', values: { n: after.politics.expiredPetitions }, trust: [...layers] });
  }
  if (before.budget.deficitWeeks < SCANDAL.deficit && after.budget.deficitWeeks >= SCANDAL.deficit) {
    out.push({ kind: 'scandal', variant: 'deficit', values: { n: after.budget.deficitWeeks }, trust: LAYERS });
  }
  return out;
}

/**
 * 同じ種類の型の文から、都市と、これまでに出た同じ種類の記事の数で 1 つ選ぶ
 * （乱数でなく、同じ都市の同じ記事なら同じ文。同じ種類の記事が続いても、文を順に変える）
 */
function templateFor(templates: readonly NewsTemplate[], e: Event, seed: number, count: number): NewsTemplate | undefined {
  const list = templates.filter((t) => t.kind === e.kind && (t.variant ?? undefined) === e.variant);
  if (list.length === 0) return undefined;
  return list[(((seed >>> 0) % 997) + count) % list.length];
}

/** 型の文に名前と数字を入れる（数字は四捨五入した整数。3 桁ごとに区切る） */
export function fill(text: string, values: Partial<Record<NewsSlot, string | number>>): string {
  return text.replace(/\{([a-z]+)\}/g, (all, name: string) => {
    const v = values[name as NewsSlot];
    if (v === undefined) return all;
    return typeof v === 'number' ? Math.round(v).toLocaleString('ja-JP') : v;
  });
}

/** 1 任期より前の記事は、本文を空にして見出しだけ残す（docs/data-model.md 9 章） */
function thinNews(news: readonly Article[], week: number): Article[] {
  return news.map((a) => (a.week <= week - WEEKS_PER_TERM && a.body !== '' ? { ...a, body: '' } : a));
}

/**
 * 前と後の世界を比べ、出来事を記事にして新聞に足す。不祥事の記事が出たら、関係する層の信頼 −1。
 * 新聞の型の文が無ければ（rules.news が無い）、何もしない
 */
export function withNews(before: World, after: World, rules: PoliticsRules): World {
  const news = rules.news;
  if (!news || after === before) return after;
  const events: Event[] = [];
  if (after.history.news.length === 0) events.push({ kind: 'start', values: {} });
  events.push(...applicationEvents(before, after, rules), ...electionEvents(before, after, rules), ...petitionEvents(before, after, rules), ...cityEvents(before, after, rules));
  if (events.length === 0) return after;
  const day = Math.floor(after.city.day);
  const { year, week } = dateOf(day);
  const common = { city: after.city.name, mayor: '市長', year, week };
  const articles: Article[] = [];
  let trust = after.sim.trust;
  for (const e of events) {
    const index = after.history.news.length + articles.length;
    const count = [...after.history.news, ...articles].filter((a) => a.kind === e.kind).length;
    const t = templateFor(news.templates, e, after.city.seed, count);
    if (!t) continue;
    const values = { ...common, ...e.values };
    articles.push({
      id: `n${String(index + 1)}`,
      week: after.sim.week,
      day,
      kind: e.kind,
      headline: fill(t.headline, values),
      body: fill(t.body, values),
      ...(e.at ? { at: e.at } : {}),
    });
    if (e.kind === 'scandal' && e.trust) trust = moveTrust(trust, e.trust, SCANDAL_TRUST);
  }
  if (articles.length === 0) return after;
  return {
    ...after,
    sim: trust === after.sim.trust ? after.sim : { ...after.sim, trust },
    history: { ...after.history, news: thinNews([...after.history.news, ...articles], after.sim.week) },
  };
}

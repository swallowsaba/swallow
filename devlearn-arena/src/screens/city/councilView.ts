import type { Terrain } from '@/city/terrain';
import { COUNCIL, EXPLAIN, POLITICS_RULES, REASONS } from '@/content/politics';
import { APPEAL_BORDER, openIssues, SUPPRESS } from '@/sim/appeal';
import { judgeAll, PASS_VOTES } from '@/sim/council';
import { persuadeCostOf } from '@/sim/awards';
import type { SkillValues } from '@/sim/hearing';
import { COUNCIL_EVERY, applicationName, daysLeft, isConsent, nextCouncilDay } from '@/sim/permits';
import type { Application, CouncilMember, IssueId, MemberLineKey, World } from '@/sim/types';
import { handsModel } from './hearingView';
import { groupName, placeOf } from './permitView';

/**
 * 議会の採決の画面（docs/ui-design.md 10.4）に出す中身。規則は src/sim/council.ts にあり、ここは文に直すだけ。
 * 採決の前は「見込み」（各人の向きと効いている項・議員を説得する）、採決の後は「結果」（賛否と 1 行）
 */

/** 論点の名前（docs/game-design.md 18.1） */
export const ISSUE_NAMES: Record<IssueId, string> = {
  afford: '手頃さ', environment: '環境', jobs: '雇用', finance: '財政', safety: '安全', traffic: '交通', tech: '技術と教育',
};

/** 議員の 1 行（点に最も効いた項を、その議員の口ぶりで。無い鍵は共通の型の文。docs/decisions.md C-10） */
export function memberLine(member: CouncilMember, reasonKey: string): string {
  const [kind, ref = '', value = ''] = reasonKey.split(':') as [MemberLineKey, string?, string?];
  const template = member.lines?.[kind] ?? EXPLAIN.member[kind] ?? '';
  // 理由の題は「」で囲む（「雇用が少ない」のように、題が言い切りの形でも文が続くように）
  const title = REASONS.find((r) => r.id === ref)?.title;
  const reason = title ? `「${title}」` : '';
  const issue = kind === 'gain' ? (ref as IssueId) : undefined;
  const gain = issue ? EXPLAIN.gains[issue].replace('{value}', Number(value).toLocaleString('ja-JP')) : '';
  return template
    .replaceAll('{reason}', reason)
    .replaceAll('{issue}', issue ? ISSUE_NAMES[issue] : '')
    .replaceAll('{gain}', gain)
    .replaceAll('{rate}', kind === 'approval' ? ref : '')
    .replaceAll('{dir}', member.stance >= 0 ? '賛成' : '反対');
}

export interface SeatModel {
  id: string;
  name: string;
  profile: string;
  icon: string;
  main: IssueId;
  mainName: string;
  /** 採決の後は賛否。前は見込みの向き */
  yes: boolean;
  line: string;
  persuaded: boolean;
}

export interface CouncilModel {
  id: string;
  title: string;
  /** 採決の前（見込み）か後（結果） */
  mode: 'outlook' | 'result';
  seats: SeatModel[];
  yes: number;
  no: number;
  /** 「可決（賛成 4 以上）」「否決」/ 見込みの時は「このままなら否決」 */
  verdict: string;
  passed: boolean;
  /** 見込みの時の、議会の日までの日数 */
  daysLeft: number;
  /** 議員を説得する（見込みの時だけ）。説得した議員がいれば used */
  persuade: { cost: number; ok: boolean; used: string | null } | null;
}

/** terrain: 公共サービスと発電所の得（行き届きの見込み）を数えるために渡す */
export function councilModel(world: World, id: string, terrain?: Terrain): CouncilModel | null {
  const app = world.applications.find((a) => a.id === id);
  if (!app) return null;
  const day = Math.floor(world.city.day);
  const place = placeOf(app, world);
  const title = `${applicationName(app, world.city)}${place ? `（${place}）` : ''}の採決`;
  const byId = new Map(COUNCIL.map((m) => [m.id, m]));
  const vote = app.vote && !app.vote.consent ? app.vote : null;
  if (vote) {
    const seats = vote.members.flatMap((v): SeatModel[] => {
      const m = byId.get(v.memberId);
      return m ? [{ id: m.id, name: m.name, profile: m.profile, icon: m.icon, main: m.main, mainName: ISSUE_NAMES[m.main], yes: v.yes, line: memberLine(m, v.reasonKey), persuaded: v.persuaded }] : [];
    });
    const yes = seats.filter((s) => s.yes).length;
    return { id, title, mode: 'result', seats, yes, no: seats.length - yes, verdict: vote.passed ? `可決（賛成 ${String(PASS_VOTES)} 以上）` : '否決', passed: vote.passed, daysLeft: 0, persuade: null };
  }
  // 同意の案件は採決の画面を出さない（docs/ui-design.md 10.4）
  if (app.stage !== 'council' || isConsent(app)) return null;
  const seats = judgeAll(world, app, POLITICS_RULES, terrain).flatMap((j): SeatModel[] => {
    const m = byId.get(j.memberId);
    return m ? [{ id: m.id, name: m.name, profile: m.profile, icon: m.icon, main: m.main, mainName: ISSUE_NAMES[m.main], yes: j.yes, line: memberLine(m, j.reasonKey), persuaded: j.persuaded }] : [];
  });
  const yes = seats.filter((s) => s.yes).length;
  const passed = yes >= PASS_VOTES;
  return {
    id, title, mode: 'outlook', seats, yes, no: seats.length - yes,
    verdict: passed ? 'このままなら可決' : 'このままなら否決',
    passed,
    daysLeft: daysLeft(app, day),
    persuade: { cost: persuadeCostOf(world.city), ok: !app.persuaded && world.politics.capital >= persuadeCostOf(world.city), used: app.persuaded ?? null },
  };
}

/** 採決の画面を開けるか（議会の段の見込み・採決した後の結果） */
export const hasCouncil = (app: Pick<Application, 'stage' | 'vote'>): boolean => app.stage === 'council' || (app.vote !== undefined && !app.vote.consent);

/** 議会の日の言い方（「議会は 14 日ごと。次は 3 日後」） */
export function councilDayText(app: Application, day: number): string {
  const left = nextCouncilDay(app.stageDay) - day;
  return `議会は ${String(COUNCIL_EVERY)} 日ごと。次は ${left <= 0 ? '今日' : `${String(left)} 日後`}`;
}

/* ---------- 異議申し立て（docs/ui-design.md 10.5） ---------- */

export interface AppealModel {
  id: string;
  name: string;
  /** 申し立てた集団（「灯町の住民」） */
  group: string;
  /** 申し立ての元の論点（押し切った・答えなかった） */
  reasons: { title: string; share: number; how: string }[];
  opposition: number;
  border: number;
  /** 着工が止まる残りの日数 */
  daysLeft: number;
  resolved: 'conceded' | 'capital' | 'expired' | null;
  /** 追加の譲歩: 公聴会で譲歩しなかった論点ごとの候補（費用はすぐ取り分ける） */
  concessions: { reasonId: string; title: string; options: { id: string; label: string; effects: string[]; cost: number; ok: boolean; why?: string; tech?: string; loss?: string }[] }[];
  /** 政治資本で抑える */
  suppress: { cost: number; ok: boolean };
}

export function appealModel(world: World, id: string, skills: SkillValues): AppealModel | null {
  const app = world.applications.find((a) => a.id === id);
  if (!app?.appeal) return null;
  const day = Math.floor(world.city.day);
  let top: Application['objections'][number] | undefined;
  for (const o of app.objections) if (o.group === app.appeal.group && (!top || o.share > top.share)) top = o;
  const reasons = openIssues(app).map((o) => ({
    title: REASONS.find((r) => r.id === o.reasonId)?.title ?? '',
    share: Math.round(o.share),
    how: o.hand?.kind === 'push' ? '押し切った' : '答えなかった',
  }));
  const concessions = app.objections.filter((o) => o.issue === true && o.hand?.kind !== 'concede').flatMap((o) => {
    const h = handsModel(world, app, o.reasonId, skills);
    return h ? [{ reasonId: o.reasonId, title: h.title, options: h.concessions }] : [];
  });
  return {
    id,
    name: applicationName(app, world.city),
    group: top ? groupName(top, world) : '反対した人たち',
    reasons,
    opposition: Math.round(app.opposition),
    border: APPEAL_BORDER[world.politics.difficulty],
    daysLeft: app.stage === 'appeal' ? daysLeft(app, day) : 0,
    resolved: app.appeal.resolved ?? null,
    concessions,
    suppress: { cost: SUPPRESS.capital, ok: world.politics.capital >= SUPPRESS.capital },
  };
}

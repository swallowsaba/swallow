import { z } from 'zod';
import { FACILITY_TYPES } from '@/city/facilities';
import { DOMAIN_IDS } from '@/content/schema';
import { FACTORS } from '@/sim/layers';

/**
 * 版 4 で足した、都市の模擬と市政の形（docs/data-model.md 8〜12 章）。
 * 読み込み（ブラウザ内の保存と、書き出したファイル）の時に、この形で確かめる。
 */

const point = z.object({ x: z.number(), y: z.number() }).strict();
const num = z.number();
const layers = z.array(num).length(12);
const factorId = z.enum(FACTORS);

export const simStateSchema = z.object({
  week: z.number().int().min(0),
  districtNames: z.array(z.string().min(1)).length(144),
  households: z.record(z.string(), layers),
  businesses: z.record(z.string(), z.object({
    kind: z.enum(['shop', 'office', 'it', 'factory']),
    workers: z.array(num).length(3),
    profitWeeks: z.number().int(),
  }).strict()),
  vacant: z.record(z.string(), z.number().int()),
  rentFactor: num,
  support: z.array(z.array(num).length(12)).length(144),
  supportParts: z.record(z.string(), z.array(z.array(num).length(12)).length(12)),
  trust: layers,
  power: z.object({
    landing: point,
    externalCapMW: num,
    rotation: z.number().int().min(0),
    outageDays: z.array(num).length(144),
  }).strict(),
  employed: z.record(z.string(), num),
  lastWeek: z.object({ unemployedLowMid: num, approval: num, jobs: num, unemployment: num }).strict(),
}).strict();

const causeSchema = z.object({
  factor: factorId,
  source: z.object({ kind: z.enum(['facility', 'zone', 'road', 'building', 'decision', 'demand']), id: z.string(), at: point.optional() }).strict(),
  points: num,
}).strict();

export const historySchema = z.object({
  weekly: z.array(z.object({
    week: z.number().int(), population: num, funds: num, treasury: num, approval: num, jobs: num, unemployment: num, marks: z.array(z.string()),
  }).strict()),
  breakdown: z.array(z.object({ week: z.number().int(), factors: z.array(z.array(num).length(12)).length(12), causes: z.array(causeSchema), approval: num, layers: z.array(num).length(12).optional() }).strict()),
  news: z.array(z.object({
    id: z.string(), week: z.number().int(), day: num,
    kind: z.enum(['application', 'approved', 'rejected', 'appeal', 'completed', 'election', 'term-end', 'closure', 'outage', 'tax', 'petition', 'mission', 'reward', 'scandal', 'start']),
    headline: z.string(), body: z.string(), at: point.optional(),
  }).strict()),
}).strict();

const groupId = z.enum(['neighbors', 'merchants', 'environment', 'taxpayers', 'workers']);
const zoneKind = z.enum(['residential', 'commercial', 'office', 'industrial']);

export const applicationSchema = z.object({
  id: z.string(),
  kind: z.enum(['facility', 'upgrade', 'rezone', 'civic', 'power', 'reward']),
  target: z.object({
    type: z.enum(FACILITY_TYPES).optional(),
    facilityId: z.string().optional(),
    toLevel: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    zone: z.object({ kind: zoneKind, cells: z.array(point), from: zoneKind.optional() }).strict().optional(),
    origin: point.optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  }).strict(),
  stage: z.enum(['filed', 'zoning', 'objection', 'hearing', 'council', 'appeal', 'construction', 'done', 'rejected', 'withdrawn']),
  stageDay: num,
  filedDay: num,
  wallet: z.enum(['funds', 'treasury']),
  reserved: num,
  exception: z.boolean(),
  objections: z.array(z.object({
    reasonId: z.string(),
    group: groupId,
    district: z.number().int().optional(),
    strength: num,
    share: num,
    full: num,
    basis: z.object({ value: num, ref: num.optional() }).strict(),
    topLayer: z.number().int().min(0).max(11).optional(),
    layers: z.array(z.number().int().min(0).max(11)).optional(),
    issue: z.boolean().optional(),
    hand: z.union([
      z.object({ kind: z.literal('concede'), concessionId: z.string(), day: num }).strict(),
      z.object({ kind: z.literal('explain'), explanationId: z.string(), quality: z.enum(['sound', 'partial', 'wrong']), day: num }).strict(),
      z.object({ kind: z.literal('push'), capital: num, day: num }).strict(),
    ]).optional(),
  }).strict()),
  opposition: num,
  hearing: z.object({ heldDay: num, attended: z.boolean() }).strict().optional(),
  vote: z.object({
    day: num,
    consent: z.boolean(),
    members: z.array(z.object({ memberId: z.string(), score: num, yes: z.boolean(), reasonKey: z.string(), persuaded: z.boolean() }).strict()),
    passed: z.boolean(),
  }).strict().optional(),
  appeal: z.object({ day: num, group: groupId, resolved: z.enum(['conceded', 'capital', 'expired']).optional() }).strict().optional(),
  mods: z.record(z.string(), num),
  pendingCost: num.optional(),
}).strict();

const snapshot = z.object({ population: num, jobs: num, treasury: num, approval: num, lessonsDone: num }).strict();
const pair = z.tuple([num, num]);

export const politicsSchema = z.object({
  difficulty: z.enum(['gentle', 'normal', 'tough']),
  capital: num,
  capitalLog: z.array(z.object({ day: num, amount: num, why: z.string() }).strict()),
  term: z.object({
    no: z.number().int().min(1),
    startDay: num,
    pledges: z.array(z.object({ pledgeId: z.string(), startValue: num, doneDay: num.optional() }).strict()),
    startSnapshot: snapshot,
  }).strict(),
  pastTerms: z.array(z.object({
    no: z.number().int(), startDay: num, endDay: num, won: z.boolean(), voteShare: num,
    byLayer: z.array(z.object({ support: num, turnout: num }).strict()),
    causes: z.array(z.object({ layer: z.number().int(), factors: z.array(z.object({ factor: factorId, points: num }).strict()), decisions: z.array(z.string()) }).strict()).optional(),
    built: z.array(z.string()), approved: num, rejected: num, pledgesDone: z.array(z.string()), missionsDone: z.array(z.string()),
    lessonsDone: num, skillsUp: z.array(z.enum(DOMAIN_IDS)),
    population: pair, jobs: pair, treasury: pair, approval: pair,
  }).strict()),
  pushesThisTerm: z.number().int().min(0),
  wrongExplanations: z.number().int().min(0),
  expiredPetitions: z.number().int().min(0),
}).strict();

export const budgetSchema = z.object({
  treasury: num,
  taxRate: z.number().int().min(5).max(20),
  pendingTaxRate: z.number().int().min(5).max(20).optional(),
  ledger: z.array(z.object({
    week: z.number().int(),
    income: z.object({ residents: num, businesses: num }).strict(),
    spend: z.object({ services: num, power: num, external: num, petitions: num }).strict(),
  }).strict()),
  deficitWeeks: z.number().int().min(0),
}).strict();

export const petitionsSchema = z.object({
  inbox: z.array(z.object({ id: z.string(), petitionId: z.string(), arrivedWeek: z.number().int(), district: z.number().int().optional(), layer: z.number().int().optional(), value: num }).strict()),
  handled: z.record(z.string(), z.object({ week: z.number().int(), choice: z.enum(['accept', 'reject', 'expire']) }).strict()),
  effects: z.array(z.object({ petitionId: z.string(), untilWeek: z.number().int(), district: z.number().int().optional() }).strict()),
}).strict();

export const rewardsSchema = z.object({
  unlocked: z.record(z.string(), num),
  built: z.record(z.string(), z.string()),
  highApprovalWeeks: z.number().int().min(0),
}).strict();

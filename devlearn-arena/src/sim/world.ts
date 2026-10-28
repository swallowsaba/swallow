import { CAPACITY, constructionStage } from '@/city/rules';
import { growDay } from '@/city/growth';
import { newCity } from '@/city/newCity';
import { createRandom } from '@/city/random';
import { START_AREA, type Terrain } from '@/city/terrain';
import type { City } from '@/city/types';
import { LAYER_COUNT, LAYER_SHARE, MEAN_HOUSEHOLD_SIZE } from './layers';
import { DAYS_PER_WEEK, EXTERNAL_POWER_CAP, INITIAL_TAX_RATE, INITIAL_TREASURY } from './rules';
import { START_CAPITAL, stepPolitics } from './election';
import { settleWeek } from './budget';
import { withNews } from './news';
import { petitionSpend, stepPetitions } from './petitions';
import { DISTRICT_COUNT, landingOf, spaceOf } from './space';
import { NO_RULES, type Difficulty, type Politics, type PoliticsRules, type SimState, type World } from './types';
import { stepApplications } from './permits';
import { weekStep, type WeekView } from './week';

/**
 * 都市と模擬と市政の全体（docs/data-model.md 12 章の版 4）。
 * 1 日ずつ進める純粋な関数。同じ世界・同じ命令の列（docs/game-design.md 26 章）からは、同じ世界になる。
 */

export interface NameParts {
  prefixes: readonly string[];
  suffixes: readonly string[];
}

/** 地区の名前（seed で前と後ろの部品を組み合わせ、144 地区に重ならないように配る。docs/content-spec.md 7.8） */
export function districtNames(seed: number, parts: NameParts): string[] {
  const all: string[] = [];
  for (const p of parts.prefixes) for (const s of parts.suffixes) all.push(`${p}${s}`);
  const rand = createRandom(seed ^ 0x5eed);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j] as string, all[i] as string];
  }
  return Array.from({ length: DISTRICT_COUNT }, (_, i) => all[i % all.length] as string);
}

export { START_CAPITAL } from './election';

function emptySim(city: City, terrain: Terrain, names: NameParts): SimState {
  return {
    week: Math.floor(city.day / DAYS_PER_WEEK),
    districtNames: districtNames(city.seed, names),
    households: {},
    businesses: {},
    vacant: {},
    rentFactor: 1,
    support: Array.from({ length: DISTRICT_COUNT }, () => new Array<number>(LAYER_COUNT).fill(-1)),
    supportParts: {},
    trust: new Array<number>(LAYER_COUNT).fill(0),
    power: { landing: landingOf(terrain, START_AREA), externalCapMW: EXTERNAL_POWER_CAP, rotation: 0, outageDays: new Array<number>(DISTRICT_COUNT).fill(0) },
    employed: {},
    lastWeek: { unemployedLowMid: 0, approval: 50, jobs: 0, unemployment: 0 },
  };
}

function newPolitics(day: number, difficulty: Difficulty, snapshot: Politics['term']['startSnapshot']): Politics {
  return {
    difficulty,
    capital: START_CAPITAL[difficulty],
    capitalLog: [],
    term: { no: 1, startDay: Math.floor(day), pledges: [], startSnapshot: snapshot },
    pastTerms: [],
    pushesThisTerm: 0,
    wrongExplanations: 0,
    expiredPetitions: 0,
  };
}

function shell(city: City, terrain: Terrain, names: NameParts, difficulty: Difficulty): World {
  return {
    city,
    sim: emptySim(city, terrain, names),
    history: { weekly: [], breakdown: [], news: [] },
    applications: [],
    politics: newPolitics(city.day, difficulty, { population: city.population, jobs: 0, treasury: INITIAL_TREASURY, approval: 50, lessonsDone: 0 }),
    budget: { treasury: INITIAL_TREASURY, taxRate: INITIAL_TAX_RATE, ledger: [], deficitWeeks: 0 },
    petitions: { inbox: [], handled: {}, effects: [] },
    rewards: { unlocked: {}, built: {}, highApprovalWeeks: 0 },
  };
}

/** 新しい都市（中央 24×24 の空いた村。開発資金 1,500・財政 800。docs/game-design.md 27 章） */
export function newWorld(terrain: Terrain, names: NameParts, seed?: number, difficulty: Difficulty = 'normal'): World {
  return worldFromCity(newCity(seed ?? terrain.seed), terrain, names, difficulty);
}

/**
 * 今ある都市から、模擬を始める（docs/data-model.md 12 章の版 3 → 版 4 の移行と同じ決め方）。
 * - 住宅の建物ごとに、建物の大きさで住む人数を、初めの分布の世帯に分けて入れる（移行の前と後で都市規模が変わらない）
 * - 商業・オフィス・工業の建物に、働き口を埋めた事業者を入れる。工事中の施設は完成にする
 * - 支持は、始めの週の目標の値で埋める（1/4 ずつ近づけずに始める）。信頼は 0、需給の倍率は 1
 * - 電力: 外からの電気の上限を max(8, 今の使う量 × 1.2) にする（G10 で使う量を数える。今は 8）
 */
export function worldFromCity(city: City, terrain: Terrain, names: NameParts, difficulty: Difficulty = 'normal'): World {
  const day = Math.floor(city.day);
  const settled: City = { ...city, day, facilities: city.facilities.map((f) => (f.state === 'constructing' ? { ...f, state: 'active' as const } : f)) };
  const world = shell(settled, terrain, names, difficulty);
  const space = spaceOf(settled, terrain);
  const households: Record<string, number[]> = {};
  let people = 0;
  for (const zb of space.residential) {
    // 今の都市規模の計算（src/city/growth.ts の statsOf）と同じく、建ち終わった建物だけに住む
    if (constructionStage(zb.building.builtDay, day) !== 'done') continue;
    const persons = CAPACITY.residential[zb.building.level - 1] ?? 0;
    const count = persons / MEAN_HOUSEHOLD_SIZE;
    households[zb.building.id] = LAYER_SHARE.map((s) => count * s);
    people += persons;
  }
  const seeded: World = { ...world, city: { ...settled, population: Math.round(people) }, sim: { ...world.sim, households } };
  const { world: started } = weekStep(seeded, terrain, true);
  return {
    ...started,
    politics: {
      ...started.politics,
      term: {
        ...started.politics.term,
        startSnapshot: { population: started.city.population, jobs: started.sim.lastWeek.jobs, treasury: started.budget.treasury, approval: started.sim.lastWeek.approval, lessonsDone: 0 },
      },
    },
  };
}

/**
 * 都市を差し替える（撮影と確かめの道具が、見本の都市を置く時）。模擬の状態は保ち、
 * 世帯の無い建ち終わった住宅にだけ、移行と同じ決め方で世帯を入れる。都市の seed が変われば、模擬から作り直す
 */
export function withCity(world: World, city: City, terrain: Terrain, names: NameParts): World {
  if (city.seed !== world.city.seed) return worldFromCity(city, terrain, names, world.politics.difficulty);
  const day = Math.floor(city.day);
  const households = { ...world.sim.households };
  let added = false;
  for (const zb of spaceOf({ ...city, day }, terrain).residential) {
    if (households[zb.building.id] || constructionStage(zb.building.builtDay, day) !== 'done') continue;
    const count = (CAPACITY.residential[zb.building.level - 1] ?? 0) / MEAN_HOUSEHOLD_SIZE;
    households[zb.building.id] = LAYER_SHARE.map((s) => count * s);
    added = true;
  }
  return { ...world, city: { ...city, day }, sim: added ? { ...world.sim, households } : world.sim };
}

/**
 * 1 日進める（docs/game-design.md 13.1）。毎日: 区画の建物が建ち・育ち、施設の工事が進む。
 * 週の終わり（7 日ごと）: 毎週の計算（src/sim/week.ts）
 */
export function stepDay(world: World, terrain: Terrain, rules: PoliticsRules = NO_RULES): World {
  return stepDayView(world, terrain, rules).world;
}

/** 1 日進め、週の終わりなら、その週の計算の途中の値（ヒートマップに使う）も返す */
export function stepDayView(world: World, terrain: Terrain, rules: PoliticsRules = NO_RULES): { world: World; view: WeekView | null } {
  // 落選して、次の道を選ぶまでは都市の日を進めない（docs/game-design.md 21.2）
  if (world.politics.defeated) return { world, view: null };
  const day = Math.floor(world.city.day) + 1;
  // 申請の段階と工事（毎日。docs/game-design.md 13.1）
  const permitted = stepApplications(world, day, terrain, rules);
  const city = growDay(permitted.city, day, {
    unemployedLowMid: world.sim.lastWeek.unemployedLowMid,
    upgradeKinds: ['residential'],
    simPopulation: true,
  });
  const next: World = { ...permitted, city };
  const weekly = day % DAYS_PER_WEEK === 0 ? weekStep(next, terrain, false, rules) : null;
  // 週の終わりの払い（税収から支出を引いて財政に。待っている税率は次の週から。docs/game-design.md 22.2）と、請願（期限・届く。22.1）
  const stepped = weekly
    ? { world: stepPetitions(settleWeek(weekly.world, rules, petitionSpend(weekly.world, rules, weekly.world.sim.week)), terrain, weekly.view, rules), view: weekly.view }
    : { world: next, view: null };
  // 市政（週の終わりの公約と支持率の上昇・選挙の日。docs/game-design.md 21 章）。この日の出来事を新聞の記事に（22.3）
  return { world: withNews(world, stepPolitics(stepped.world, day, rules), rules), view: stepped.view };
}

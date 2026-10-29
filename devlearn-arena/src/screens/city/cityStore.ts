import { create } from 'zustand';
import { STAGE_NAMES } from '@/game/stage';
import { changesBetween, focusOf, type Change, type SkillValues, type Snapshot } from '@/city/changes';
import type { OverlayKind } from '@/city/overlay';
import type { DemolishTarget, Reason } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import type { BuildRoadKind } from '@/city/rules';
import type { Terrain } from '@/city/terrain';
import type { City, Facility, FacilityType, ZoneKind } from '@/city/types';
import { FACILITY_DEFS, type CoverageKind } from '@/city/facilities';
import { checkUpgrade } from '@/city/upgrade';
import { EXPLAIN, NAME_PARTS, POLITICS_RULES } from '@/content/politics';
import { explainApproval } from '@/sim/explain';
import type { Hand } from '@/sim/hearing';
import { newAnswerNotes, reactionLesson, reactionText } from './hearingView';
import { groupName } from './permitView';
import { applicationName, daysLeft, daysToComplete, isConsent, isReviewing } from '@/sim/permits';
import type { HeatFields, HeatKind } from '@/sim/heat';
import { applyOp, type Command, type Op } from '@/sim/commands';
import { electionDayOf, electionOf, WARN_DAYS } from '@/sim/election';
import { workerHost, type SimHost } from '@/sim/host';
import { dateOf, SECONDS_PER_DAY, type Speed } from '@/sim/rules';
import { terrainOf, type StateMessage } from '@/sim/runner';
import type { Application, Article, World } from '@/sim/types';
import { newWorld, withCity, worldFromCity } from '@/sim/world';

/**
 * 都市画面の状態（docs/ui-design.md 3・4 章）。
 * 規則は src/city と src/sim の純粋な関数にあり、ここはそれを呼んで結果を持つだけ。
 * 都市の模擬は Worker で動く（docs/architecture.md 9.1）。画面は操作を日付付きの命令にして送り、
 * 模擬が返した世界の写しを持つ。送ってまだ返事の無い命令は、写しの上にも当てておく（置いた物がすぐ見えるように）。
 */


export type Tool =
  | { kind: 'none' }
  | { kind: 'road'; road: BuildRoadKind; shape: 'straight' | 'curve' }
  | { kind: 'zone'; zone: ZoneKind }
  /** 施設・公園を置く。記念碑は、受け取った記念碑のどれか（landmark）を置く */
  | { kind: 'facility'; type: FacilityType; landmark?: string }
  | { kind: 'demolish' };

export type MenuGroup = 'road' | 'zone' | 'facility' | 'park' | 'civic' | 'demolish';

/** 表示切替で重ねる物（今ある 4 つと、模擬のヒートマップ。docs/ui-design.md 11.1） */
export type ViewKind = OverlayKind | HeatKind;

/** 都市の上に重ねる小さな窓（docs/ui-design.md 10.0）。表示切替・許認可の一覧・申請 1 件の詳細・異議申し立て・受信箱・予算・市内新聞 */
export type SmallWindowId = 'view' | 'permits' | 'permit' | 'appeal' | 'inbox' | 'budget' | 'news';

/** 知らせを押した時に開く窓（既定は申請の詳細。選挙・受信箱・新聞は申請を持たない） */
export type NoticeWindow = 'permit' | 'council' | 'appeal' | 'election' | 'inbox' | 'news';

/** 選挙の大きな窓に出す物（docs/ui-design.md 10.6・10.7）: 今の見込み・選挙の結果・任期の終わりの一覧と公約を選ぶ */
export type ElectionView = 'preview' | 'result' | 'term';
/** 同時に開ける小さな窓の数 */
export const MAX_SMALL_WINDOWS = 3;

/** 時間を止めている理由（docs/game-design.md 13.1: 都市画面が前に出ていない間・窓が隠れている間・大きな窓の間。21.2: 落選して道を選ぶまで） */
export type HoldReason = 'screen' | 'hidden' | 'window' | 'defeat';

/** カーソルの横に出す、置けるか・費用・理由 */
export interface Hint {
  x: number;
  y: number;
  ok: boolean;
  cost: number;
  /** 費用の財布（公共サービスと発電所は財政。無ければ開発資金） */
  wallet?: 'funds' | 'treasury';
  reasons: Reason[];
  /** 何を置こうとしているか（1 行） */
  title: string;
}

export interface CityGameState {
  /** 描く都市（日付は時計の小数のまま。車と人の動きと建設の段階に使う） */
  city: City;
  /** 模擬の世界の写し（日付は整数） */
  world: World;
  terrain: Terrain;
  /** 利用者が止めた（Space・止めるボタン） */
  paused: boolean;
  /** 速さ（1 倍・2 倍・3 倍） */
  speed: Speed;
  /** 止めている理由（利用者が止めたのとは別） */
  holds: HoldReason[];
  tool: Tool;
  /** 開いている建設メニューの引き出し */
  menu: MenuGroup | null;
  rotation: Facility['rotation'];
  hint: Hint | null;
  confirm: DemolishTarget | null;
  /** 上の帯の下に出す 1 行の知らせ。市政の知らせは、押すとその申請の詳細を開く（docs/ui-design.md 3 章） */
  notice: { text: string; until: number; permitId?: string; window?: NoticeWindow } | null;
  /** 選んでいる建物（情報パネルを出す） */
  selected: Selection | null;
  /** 表示の切り替え */
  overlay: ViewKind | null;
  /** 公共の道具を選んで自動で重ねたヒートマップと、その前に重ねていた物（道具を離すと戻す。docs/ui-design.md 11.5） */
  autoView: { before: ViewKind | null } | null;
  /** 模擬が週の終わりに返したヒートマップの値 */
  heat: HeatFields | null;
  /** 開いている小さな窓（前に開いた順。最後が一番上） */
  windows: SmallWindowId[];
  /** 出番を待つ知らせ（今の知らせが消えたら順に出す） */
  queue: QueuedNotice[];
  /** 申請の詳細の窓に出している申請 */
  permitId: string | null;
  /** 公聴会の窓に出している申請（大きな窓。開いている間、都市の時間は止まる。docs/ui-design.md 10.0・10.3） */
  hearingId: string | null;
  /** 議会の採決の画面に出している申請（大きな窓。docs/ui-design.md 10.4） */
  councilId: string | null;
  /** 異議申し立ての小さな窓に出している申請（docs/ui-design.md 10.5） */
  appealId: string | null;
  /** 選挙の大きな窓に出している物（開いている間、都市の時間は止まる） */
  election: ElectionView | null;
  /** 公約を選ぶ窓を自分から出した任期（閉じたら、その任期はもう自分からは出さない） */
  pledgeAsked: number;
  /** 最後に出した手の、住民と議員の受け取り方の 1 行 */
  reaction: { reasonId: string; text: string; lesson: { id: string; title: string } | null } | null;
  /** 学習に出た時の都市とスキル（戻った時に変化を比べる） */
  away: Snapshot | null;
  /** 変化のあった場所（カメラを寄せ、光の輪で示す）。seq が変わるたびに寄せる */
  focus: { at: { x: number; y: number }; size: { x: number; y: number }; seq: number } | null;

  /** 都市を差し替える（撮影と確かめの道具・見本の都市）。模擬の状態は保つ */
  setCity: (city: City) => void;
  /** 世界を丸ごと読み込む（保存データから戻す時） */
  load: (world: World) => void;
  /** 操作を命令にして模擬へ送る（写しにもすぐ当てる） */
  dispatch: (op: Op) => void;
  tick: (dtSeconds: number) => void;
  togglePause: () => void;
  /** 速さを変え、止めていれば動かす */
  setSpeed: (speed: Speed) => void;
  /** 理由ごとに、時間を止める・止めない */
  hold: (reason: HoldReason, on: boolean) => void;
  setTool: (tool: Tool) => void;
  openMenu: (group: MenuGroup | null) => void;
  rotate: () => void;
  setHint: (hint: Hint | null) => void;
  askDemolish: (target: DemolishTarget | null) => void;
  /** 知らせを出す。出ている知らせがあれば、その後に出す。permitId を付けると、押すとその申請の詳細を開く */
  notify: (text: string, now: number, permitId?: string, window?: NoticeWindow) => void;
  /** 時刻 now に、出ている知らせが消える時なら、次の知らせを出す */
  expireNotice: (now: number) => void;
  /** 学習に出る（都市とスキルを覚えておく） */
  leave: (skills: SkillValues) => void;
  /**
   * 学習から戻る。変化を比べ、いちばん大事な変化の場所へカメラを寄せ（施設ならそれを選び）、知らせを順に出す。
   * after は変化の知らせの後に出す知らせ（得た資金・次のおすすめ）
   */
  welcomeBack: (skills: SkillValues, after: readonly string[], now: number) => Change[];
  /**
   * 施設を次のレベルに上げる申請を出す（資金で買う。docs/game-design.md 2・5・15 章）。
   * 出したら、その場所を光の輪で示し、何が加わるかと完成までの見込みの日数を知らせる。出せなければ何もしない
   */
  upgrade: (facilityId: string, skills: SkillValues, now: number) => boolean;
  /** 選ぶ。申請中の敷地を選ぶと、申請の詳細の窓も開く（docs/city-design.md 9.1） */
  select: (selection: Selection | null) => void;
  /** 申請の詳細の窓を開く */
  openPermit: (id: string) => void;
  /** 申請を取り下げる（着工の前。費用は全て戻る） */
  withdraw: (id: string, now: number) => void;
  /** 公聴会の窓を開く（公聴会の段の申請。時間を止める） */
  openHearing: (id: string) => void;
  /** 公聴会の窓を閉じる（公聴会は終えずに待つ。14 日のうちにまた開ける） */
  leaveHearing: () => void;
  /** 公聴会を終える（議会の採決の段へ）。窓を閉じ、知らせる */
  endHearing: (id: string, now: number) => void;
  /**
   * 論点に手を出す（受付の間は先回りの譲歩だけ）。スキルの値は出した時の値を載せる。
   * 出せたら、住民と議員の受け取り方の 1 行を reaction に置く
   */
  playHand: (applicationId: string, reasonId: string, hand: Hand, skills: SkillValues) => boolean;
  /** 議会の採決の画面を開く（議会の段なら見込み、採決の後なら結果。時間を止める）。大きな窓は 1 つまで */
  openCouncil: (id: string) => void;
  leaveCouncil: () => void;
  /** 議員を説得する（採決の前。政治資本 3。1 件の申請で 1 人まで） */
  persuade: (applicationId: string, memberId: string) => boolean;
  /** 異議申し立ての小さな窓を開く */
  openAppeal: (id: string) => void;
  /** 申し立てに、追加の譲歩で答える。取り下げられたら知らせる */
  appealConcede: (applicationId: string, reasonId: string, concessionId: string, skills: SkillValues, now: number) => boolean;
  /** 政治資本 4 で申し立てを抑える */
  appealSuppress: (applicationId: string, now: number) => boolean;
  /** 選挙の窓を開く（大きな窓は 1 つまで。時間を止める）。結果は選挙の後だけ */
  openElection: (view: ElectionView) => void;
  leaveElection: () => void;
  /** 公約を選んでいない任期なら、公約を選ぶ窓を出す（任期の初めに 1 度。移行した都市の 1 期目も。docs/data-model.md 12 章） */
  askPledges: () => void;
  /** 公約を 2 つ選ぶ（任期の初めに 1 度。docs/game-design.md 21.4）。選べたら窓を閉じて知らせる */
  choosePledges: (ids: readonly string[], now: number) => boolean;
  /** 落選の後、同じ都市で再び立つ（21.2）。任期の一覧と、次の任期の公約を選ぶ窓へ */
  rerun: (now: number) => void;
  /** 請願を扱う（受理・拒否・保留。docs/game-design.md 22.1）。扱えたら、受け取られ方の 1 行を知らせる */
  handlePetition: (inboxId: string, choice: 'accept' | 'reject', now: number) => boolean;
  /** 税率を決める（次の週から効く。22.2） */
  setTaxRate: (rate: number, now: number) => void;
  /** その場所へカメラを寄せ、光の輪で示す（説明・記事・請願を押した時） */
  focusAt: (at: { x: number; y: number }, size?: { x: number; y: number }) => void;
  setOverlay: (overlay: ViewKind | null) => void;
  /** 小さな窓を開く（開いていれば一番上へ）。4 つ目を開くと、一番前に開いた窓を閉じる */
  openWindow: (id: SmallWindowId) => void;
  closeWindow: (id: SmallWindowId) => void;
  toggleWindow: (id: SmallWindowId) => void;
  /** 模擬を止める（画面を閉じる時） */
  stop: () => void;
}

/** 待っている知らせ（市政の知らせは、押すと開く申請か窓を持つ） */
export type QueuedNotice = string | { text: string; permitId?: string; window?: NoticeWindow };

/** 1 つの知らせを出しておく時間（docs/ui-design.md 3 章: 3 秒で消える） */
export const NOTICE_MS = 3000;

export interface CityStoreOptions {
  /** 保存データから戻す時の世界 */
  world?: World;
  /** 模擬を動かす口（既定は Web Worker。作れなければ画面と同じ流れ） */
  host?: SimHost;
}

/** 都市の状態を作る。保存から戻す時は、保存した世界（options.world）か都市（initial）から始める */
/** 公共の道具が自動で重ねるヒートマップ（公共サービスはその種類の行き届き、発電所は電力。docs/ui-design.md 11.5） */
export function toolView(tool: Tool): HeatKind | null {
  if (tool.kind !== 'facility') return null;
  const def = FACILITY_DEFS[tool.type];
  if (def.group === 'power') return 'power';
  return def.group === 'civic' && def.coverage ? (tool.type as CoverageKind) : null;
}

/** 道具を替えた時の重ねる物: 公共の道具なら重ね、離したら前の物に戻す */
function toolViewPatch(s: Pick<CityGameState, 'overlay' | 'autoView'>, tool: Tool): Partial<Pick<CityGameState, 'overlay' | 'autoView'>> {
  const view = toolView(tool);
  if (view) return { overlay: view, autoView: s.autoView ?? { before: s.overlay } };
  if (s.autoView) return { overlay: s.autoView.before, autoView: null };
  return {};
}

export function createCityStore(seed?: number, initial?: City, options: CityStoreOptions = {}) {
  const terrainSeed = options.world?.city.seed ?? initial?.seed ?? seed;
  const startWorld = options.world
    ?? (initial ? worldFromCity(initial, terrainOf(initial.seed), NAME_PARTS) : newWorld(terrainOf(terrainSeed ?? 20261002), NAME_PARTS, terrainSeed));
  const terrain = terrainOf(startWorld.city.seed);
  const host = options.host ?? workerHost();

  /** 模擬が返した世界（命令を当てる前） */
  let base: World = startWorld;
  /** 送って返事の無い命令 */
  let pending: Command[] = [];
  let seq = 0;
  /** 時計（都市の日。小数） */
  let clock = startWorld.city.day;
  /** 進めてと送った日・模擬が進めた日 */
  let requested = Math.floor(clock);
  let acked = requested;
  /** 支持率の動きを知らせた週（4 週は同じ知らせを出さない） */
  let toldWeek = -Infinity;

  const store = create<CityGameState>((set, get) => {
    /** 写しを作り直す: 模擬が返した世界に、返事の無い命令を当てる */
    const rebuild = (): void => {
      let w = base;
      for (const c of pending) w = applyOp(w, c.op, terrain, POLITICS_RULES);
      const prevStage = get().world.city.stage;
      set({ world: w, city: { ...w.city, day: Math.max(clock, w.city.day) } });
      if (w.city.stage > prevStage) get().notify(`都市が「${STAGE_NAMES[w.city.stage]}」に発展した。霧が晴れて、作れる物が増えた`, performance.now());
    };
    host.listen((m: StateMessage) => {
      const before = base.history.breakdown.at(-1)?.week;
      const prevApps = base.applications;
      const prevPolitics = base.politics;
      const prevDay = Math.floor(base.city.day);
      const prevPetitions = base.petitions;
      const prevNews = base.history.news;
      base = { ...base, ...m.patch };
      acked = Math.max(acked, m.day);
      pending = pending.filter((c) => c.seq > m.seq);
      rebuild();
      if (m.heat) set({ heat: m.heat });
      // 申請の段階が進んだら知らせる（押すと申請の詳細。docs/ui-design.md 3 章）
      if (base.applications !== prevApps) {
        for (const n of stageNotices(prevApps, base)) get().notify(n.text, performance.now(), n.permitId, n.window);
      }
      // 請願が届いた・不祥事の記事が出た（押すと受信箱・新聞。docs/ui-design.md 3 章）
      for (const n of civicNotices(prevPetitions, prevNews, base)) get().notify(n.text, performance.now(), undefined, n.window);
      // 選挙（docs/game-design.md 21.1）: 8 週前に知らせ、選挙の日に結果の窓を開く。落選したら道を選ぶまで時間を止める
      for (const n of electionNotices(prevPolitics, prevDay, base)) get().notify(n, performance.now(), undefined, 'election');
      if (base.politics !== prevPolitics) {
        if (base.politics.pastTerms.length > prevPolitics.pastTerms.length) get().openElection('result');
        get().hold('defeat', base.politics.defeated === true);
      }
      // 支持率が 4 週で 3 以上動いたら、説明の 1 行目を知らせにも出す（docs/ui-design.md 11.3）
      const last = base.history.breakdown.at(-1);
      if (last && last.week !== before && last.week - toldWeek >= 4) {
        const e = explainApproval(base.history.breakdown, { city: base.city, districtNames: base.sim.districtNames, taxRate: base.budget.taxRate }, EXPLAIN);
        if (e && e.weeks >= 4 && Math.abs(e.delta) >= 3) {
          toldWeek = last.week;
          get().notify(e.lines[0] as string, performance.now());
        }
      }
    });
    const loadWorld = (w: World): void => {
      base = w;
      pending = [];
      clock = w.city.day;
      requested = Math.floor(clock);
      acked = requested;
      set({ world: w, city: w.city });
      get().hold('defeat', w.politics.defeated === true);
      host.post({ type: 'load', world: w, seq, rules: POLITICS_RULES });
    };
    return {
      city: startWorld.city,
      world: startWorld,
      terrain,
      paused: false,
      speed: 1,
      holds: startWorld.politics.defeated ? ['defeat'] : [],
      tool: { kind: 'none' },
      menu: null,
      rotation: 0,
      hint: null,
      confirm: null,
      notice: null,
      selected: null,
      overlay: null,
      autoView: null,
      heat: null,
      windows: [],
      queue: [],
      permitId: null,
      hearingId: null,
      councilId: null,
      appealId: null,
      election: null,
      pledgeAsked: 0,
      reaction: null,
      away: null,
      focus: null,

      setCity: (next) => {
        const w = withCity(get().world, next, terrain, NAME_PARTS);
        loadWorld(w);
        set((s) => ({ selected: s.selected && stillThere(s.world, s.selected) ? s.selected : null }));
      },
      load: loadWorld,
      dispatch: (op) => {
        seq += 1;
        const cmd: Command = { seq, day: requested, op };
        pending.push(cmd);
        rebuild();
        set((s) => ({ selected: s.selected && stillThere(s.world, s.selected) ? s.selected : null }));
        host.post({ type: 'cmd', cmd });
      },
      tick: (dt) => {
        const s = get();
        if (s.paused || s.holds.length > 0 || dt <= 0) return;
        clock += (dt * s.speed) / SECONDS_PER_DAY;
        // 模擬が 2 日より遅れたら、追いつくまで時計を待たせる（命令の日がずれないように）
        if (requested - acked >= 2) clock = Math.min(clock, requested + 0.999);
        const want = Math.floor(clock);
        if (want > requested) {
          requested = want;
          host.post({ type: 'advance', day: want });
        }
        set({ city: { ...get().world.city, day: Math.max(clock, get().world.city.day) } });
      },
      togglePause: () => set((s) => ({ paused: !s.paused })),
      setSpeed: (speed) => set({ speed, paused: false }),
      hold: (reason, on) => set((s) => {
        const has = s.holds.includes(reason);
        if (on === has) return {};
        return { holds: on ? [...s.holds, reason] : s.holds.filter((r) => r !== reason) };
      }),
      setTool: (tool) => set((s) => ({ tool, hint: null, ...toolViewPatch(s, tool) })),
      openMenu: (menu) => set((s) => {
        const tool: Tool = menu === 'demolish' ? { kind: 'demolish' } : menu === null || menu !== s.menu ? { kind: 'none' } : s.tool;
        return { menu, tool, hint: null, ...toolViewPatch(s, tool) };
      }),
      rotate: () => set((s) => ({ rotation: ((s.rotation + 90) % 360) as Facility['rotation'] })),
      setHint: (hint) => set({ hint }),
      askDemolish: (confirm) => set({ confirm }),
      notify: (text, now, permitId, window) => {
        const s = get();
        const link = { ...(permitId ? { permitId } : {}), ...(window ? { window } : {}) };
        if (s.notice && now < s.notice.until) set({ queue: [...s.queue, permitId || window ? { text, ...link } : text] });
        else set({ notice: { text, until: now + NOTICE_MS, ...link } });
      },
      expireNotice: (now) => {
        const s = get();
        if (!s.notice || now < s.notice.until) return;
        const [next, ...rest] = s.queue;
        if (next === undefined) set({ notice: null });
        else set({ notice: typeof next === 'string' ? { text: next, until: now + NOTICE_MS } : { ...next, until: now + NOTICE_MS }, queue: rest });
      },
      leave: (skills) => {
        if (get().away) return;
        set({ away: { city: get().city, skills } });
      },
      welcomeBack: (skills, after, now) => {
        const s = get();
        if (!s.away) return [];
        const changes = changesBetween(s.away, { city: s.city, skills });
        const focus = focusOf(changes);
        set({
          away: null,
          focus: focus ? { at: focus.at, size: focus.size, seq: (s.focus?.seq ?? 0) + 1 } : s.focus,
          ...(focus?.facilityId ? { selected: { kind: 'facility' as const, id: focus.facilityId } } : {}),
          notice: null,
          queue: [],
        });
        // スキル段階が上がっていれば、公聴会を待つ論点に新しく出せる説明を添える（docs/learning-design.md 12.3）
        const answers = newAnswerNotes(s.world, s.away.skills, skills);
        for (const text of [...changes.slice(0, 2).map((c) => c.text), ...answers, ...after]) get().notify(text, now);
        return changes;
      },
      upgrade: (facilityId, skills, now) => {
        const s = get();
        const check = checkUpgrade(s.world.city, facilityId, skills);
        if (!check?.ok) return false;
        const before = get().world.applications.length;
        get().dispatch({ kind: 'upgrade', facilityId, skills: { ...skills } });
        const app = get().world.applications[before];
        const f = get().city.facilities.find((x) => x.id === facilityId);
        if (!f || !app) return false;
        const def = FACILITY_DEFS[f.type];
        const adds = def.looks?.[check.level - 1];
        const days = daysToComplete(app, Math.floor(get().world.city.day));
        // 自分の操作の結果は、並んでいる知らせを待たせずにすぐ出す（並んでいた知らせは、その後に出す）
        set({
          focus: { at: { x: f.origin.x + def.w / 2, y: f.origin.y + def.d / 2 }, size: { x: def.w, y: def.d }, seq: (s.focus?.seq ?? 0) + 1 },
          notice: { text: `${def.name}の Lv${String(check.level)} へのアップグレードを申請した（完成まで約 ${String(days)} 日${adds ? `。${adds}が加わる` : ''}）`, until: now + NOTICE_MS },
        });
        return true;
      },
      select: (selected) => {
        set({ selected });
        if (selected?.kind === 'application') get().openPermit(selected.id);
      },
      openPermit: (id) => {
        set({ permitId: id });
        get().openWindow('permit');
      },
      openHearing: (id) => {
        const app = get().world.applications.find((a) => a.id === id);
        if (app?.stage !== 'hearing') return;
        set({ hearingId: id, councilId: null, election: null, reaction: null });
        get().hold('window', true);
      },
      leaveHearing: () => {
        set({ hearingId: null, reaction: null });
        get().hold('window', false);
      },
      endHearing: (id, now) => {
        const app = get().world.applications.find((a) => a.id === id);
        if (app?.stage !== 'hearing') return;
        get().dispatch({ kind: 'closeHearing', applicationId: id });
        get().leaveHearing();
        get().notify(`${applicationName(app, get().world.city)}の公聴会を終えた。反対率 ${String(Math.round(app.opposition))}% で議会の採決へ`, now, id);
      },
      playHand: (applicationId, reasonId, hand, skills) => {
        const before = get().world.applications.find((a) => a.id === applicationId);
        if (!before) return false;
        get().dispatch({ kind: 'hand', applicationId, reasonId, hand, skills: { ...skills } });
        const after = get().world.applications.find((a) => a.id === applicationId);
        if (!after || after.objections.find((o) => o.reasonId === reasonId)?.hand === undefined) return false;
        set({ reaction: { reasonId, text: reactionText(before, after, reasonId), lesson: reactionLesson(after, reasonId) } });
        return true;
      },
      openCouncil: (id) => {
        const app = get().world.applications.find((a) => a.id === id);
        if (!app || !((app.stage === 'council' && !isConsent(app)) || (app.vote && !app.vote.consent))) return;
        set({ councilId: id, hearingId: null, election: null, reaction: null });
        get().hold('window', true);
      },
      leaveCouncil: () => {
        set({ councilId: null });
        get().hold('window', false);
      },
      persuade: (applicationId, memberId) => {
        const before = get().world.applications.find((a) => a.id === applicationId);
        if (!before || before.persuaded) return false;
        get().dispatch({ kind: 'persuade', applicationId, memberId });
        return get().world.applications.find((a) => a.id === applicationId)?.persuaded === memberId;
      },
      openAppeal: (id) => {
        set({ appealId: id });
        get().openWindow('appeal');
      },
      appealConcede: (applicationId, reasonId, concessionId, skills, now) => {
        get().dispatch({ kind: 'appealConcede', applicationId, reasonId, concessionId, skills: { ...skills } });
        const after = get().world.applications.find((a) => a.id === applicationId);
        const done = after?.objections.find((o) => o.reasonId === reasonId)?.hand?.kind === 'concede';
        if (done && after.appeal?.resolved === 'conceded') get().notify(`追加の譲歩で、反対率が ${String(Math.round(after.opposition))}% に下がった。申し立ては取り下げられる`, now, applicationId);
        return done;
      },
      appealSuppress: (applicationId, now) => {
        get().dispatch({ kind: 'appealSuppress', applicationId });
        const ok = get().world.applications.find((a) => a.id === applicationId)?.appeal?.resolved === 'capital';
        if (ok) get().notify('政治資本を使って申し立てを抑えた。申し立てた人たちの市政への信頼が下がった', now, applicationId);
        return ok;
      },
      openElection: (view) => {
        if (view === 'result' && get().world.politics.pastTerms.length === 0) return;
        set({ election: view, hearingId: null, councilId: null, reaction: null });
        get().hold('window', true);
      },
      leaveElection: () => {
        set({ election: null });
        get().hold('window', false);
      },
      askPledges: () => {
        const s = get();
        const p = s.world.politics;
        if (p.defeated || p.term.pledges.length > 0 || s.pledgeAsked === p.term.no || s.election || s.hearingId || s.councilId) return;
        set({ pledgeAsked: p.term.no });
        get().openElection('term');
      },
      choosePledges: (ids, now) => {
        if (get().world.politics.term.pledges.length > 0) return false;
        get().dispatch({ kind: 'pledges', ids: [...ids] });
        const chosen = get().world.politics.term.pledges;
        if (chosen.length === 0) return false;
        const titles = chosen.map((p) => POLITICS_RULES.pledges?.find((x) => x.id === p.pledgeId)?.title ?? p.pledgeId);
        get().leaveElection();
        get().notify(`${String(get().world.politics.term.no)} 期目の公約を立てた: 「${titles.join('」「')}」。果たすと政治資本 +5`, now, undefined, 'election');
        return true;
      },
      handlePetition: (inboxId, choice, now) => {
        const entry = get().world.petitions.inbox.find((i) => i.id === inboxId);
        const p = entry ? POLITICS_RULES.petitions?.find((x) => x.id === entry.petitionId) : undefined;
        if (!entry || !p) return false;
        get().dispatch({ kind: 'petition', inboxId, choice });
        if (get().world.petitions.inbox.some((i) => i.id === inboxId)) return false;
        get().notify(choice === 'accept' ? `受理した: ${p.accept.why}` : `拒否した: ${p.reject.why}`, now);
        return true;
      },
      setTaxRate: (rate, now) => {
        const before = get().world.budget;
        get().dispatch({ kind: 'taxRate', rate });
        const after = get().world.budget;
        if (after.pendingTaxRate !== undefined && after.pendingTaxRate !== before.pendingTaxRate) {
          get().notify(`税率を ${String(after.pendingTaxRate)}% に決めた。次の週から効く（今週は ${String(after.taxRate)}% のまま）`, now);
        }
      },
      rerun: (now) => {
        const before = get().world;
        if (!before.politics.defeated) return;
        const withdrawn = before.applications.filter(isReviewing);
        get().dispatch({ kind: 'rerun' });
        if (get().world.politics.defeated) return;
        get().hold('defeat', false);
        set({ pledgeAsked: get().world.politics.term.no });
        get().openElection('term');
        get().notify(`同じ都市で、${String(get().world.politics.term.no)} 期目に再び立った。政治資本は ${String(get().world.politics.capital)} に戻った${withdrawn.length > 0 ? `。審議中の申請 ${String(withdrawn.length)} 件は取り下げ、費用は戻った` : ''}`, now);
      },
      withdraw: (id, now) => {
        const app = get().world.applications.find((a) => a.id === id);
        if (!app || !isReviewing(app)) return;
        const name = applicationName(app, get().world.city);
        get().dispatch({ kind: 'withdraw', applicationId: id });
        set((s) => ({ selected: s.selected?.id === id ? null : s.selected }));
        get().notify(`${name}の申請を取り下げた。取り分けた ${app.reserved.toLocaleString('ja-JP')} 資金が戻った`, now);
      },
      focusAt: (at, size = { x: 1, y: 1 }) => set((s) => ({ focus: { at, size, seq: (s.focus?.seq ?? 0) + 1 } })),
      setOverlay: (overlay) => set({ overlay, autoView: null }),
      openWindow: (id) => set((s) => {
        const rest = s.windows.filter((w) => w !== id);
        return { windows: [...rest.slice(Math.max(0, rest.length - (MAX_SMALL_WINDOWS - 1))), id] };
      }),
      closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w !== id) })),
      toggleWindow: (id) => (get().windows.includes(id) ? get().closeWindow(id) : get().openWindow(id)),
      stop: () => host.stop(),
    };
  });
  host.post({ type: 'load', world: startWorld, seq: 0, rules: POLITICS_RULES });
  return store;
}

function stillThere(world: World, sel: Selection): boolean {
  if (sel.kind === 'application') return world.applications.some((a) => a.id === sel.id && isReviewing(a));
  return sel.kind === 'facility' ? world.city.facilities.some((f) => f.id === sel.id) : world.city.buildings.some((b) => b.id === sel.id);
}

/**
 * 申請の段階が進んだ時の知らせ（公聴会の段に入った・可決して着工した・完成した・否決された）。
 * 用途地域の審査と反対の受付に入った事は、看板で見えるので知らせない
 */
export function stageNotices(before: readonly Application[], after: World): { text: string; permitId: string; window?: NoticeWindow }[] {
  const was = new Map(before.map((a) => [a.id, a.stage]));
  const out: { text: string; permitId: string; window?: NoticeWindow }[] = [];
  const day = Math.floor(after.city.day);
  for (const a of after.applications) {
    const prev = was.get(a.id);
    if (prev === undefined || prev === a.stage) continue;
    const name = applicationName(a, after.city);
    const voted = a.vote && !a.vote.consent ? a.vote : null;
    const count = voted ? `（賛成 ${String(voted.members.filter((m) => m.yes).length)}・反対 ${String(voted.members.filter((m) => !m.yes).length)}）` : '';
    if (a.stage === 'hearing') out.push({ text: `${name}の申請が公聴会の段に入った。14 日のうちに開ける`, permitId: a.id });
    else if (a.stage === 'appeal') out.push({ text: `${name}の申請を議会が可決した${count}が、${appealGroupName(a, after)}が異議を申し立てた。28 日、着工が止まる`, permitId: a.id, window: 'appeal' });
    else if (a.stage === 'construction' && prev === 'appeal') {
      const how = a.appeal?.resolved === 'conceded' ? '申し立ては取り下げられた' : a.appeal?.resolved === 'capital' ? '申し立てを抑えた' : '28 日が過ぎ、申し立ては退けられた';
      out.push({ text: `${how}。${name}を着工した（完成まで ${String(daysLeft(a, day))} 日）`, permitId: a.id });
    } else if (a.stage === 'construction' && voted) out.push({ text: `${name}の申請を議会が可決した${count}。着工した（完成まで ${String(daysLeft(a, day))} 日）`, permitId: a.id, window: 'council' });
    else if (a.stage === 'construction') out.push({ text: `${name}の申請が可決された。着工した（完成まで ${String(daysLeft(a, day))} 日）`, permitId: a.id });
    else if (a.stage === 'done' && a.kind === 'rezone') out.push({ text: `${name}の申請が可決された。区画を塗った`, permitId: a.id });
    else if (a.stage === 'done') out.push({ text: `${name}が完成した`, permitId: a.id });
    else if (a.stage === 'rejected' && voted) out.push({ text: `${name}の申請を議会が否決した${count}。取り分けた費用は戻った`, permitId: a.id, window: 'council' });
    else if (a.stage === 'rejected') out.push({ text: `${name}の申請が否決された。取り分けた費用は戻った`, permitId: a.id });
  }
  return out;
}

/**
 * 選挙の知らせ（docs/game-design.md 21.1）: 選挙の 8 週前（今の見込みの得票率を添える）と、選挙の日の結果。
 * 押すと選挙の窓（見込みか結果）が開く
 */
export function electionNotices(before: World['politics'], prevDay: number, after: World): string[] {
  const out: string[] = [];
  const day = Math.floor(after.city.day);
  const term = after.politics.term;
  const warn = electionDayOf(term) - WARN_DAYS;
  if (term.no === before.term.no && prevDay < warn && day >= warn) {
    const e = electionOf(after);
    const { year, week } = dateOf(electionDayOf(term));
    out.push(`選挙まで 8 週（${String(year)} 年目 ${String(week)} 週）。今の見込みは得票率 ${String(Math.round(e.voteShare))}%。押すと層ごとの見込み`);
  }
  if (after.politics.pastTerms.length > before.pastTerms.length) {
    const t = after.politics.pastTerms.at(-1);
    if (t) out.push(`${String(t.no)} 期目の選挙: 得票率 ${String(Math.round(t.voteShare))}%で${t.won ? '当選した' : '落選した'}。押すと結果`);
  }
  return out;
}

/** 申し立てた集団の呼び名（「灯町の住民」「環境の会」） */
function appealGroupName(a: Application, world: World): string {
  let top: Application['objections'][number] | undefined;
  for (const o of a.objections) if (o.group === a.appeal?.group && (!top || o.share > top.share)) top = o;
  return top ? groupName(top, world) : '反対した人たち';
}

/**
 * 請願が届いた知らせ（押すと受信箱）と、不祥事の記事が出た知らせ（押すと新聞）。docs/ui-design.md 3 章・10.8・10.10
 */
export function civicNotices(before: World['petitions'], beforeNews: readonly Article[], after: World): { text: string; window: NoticeWindow }[] {
  const out: { text: string; window: NoticeWindow }[] = [];
  const had = new Set(before.inbox.map((i) => i.id));
  for (const i of after.petitions.inbox) {
    if (had.has(i.id)) continue;
    const p = POLITICS_RULES.petitions?.find((x) => x.id === i.petitionId);
    const place = i.district !== undefined ? after.sim.districtNames[i.district] : undefined;
    if (p) out.push({ text: `請願が届いた: 「${p.title}」${place ? `（${place}）` : ''}。押すと受信箱`, window: 'inbox' });
  }
  if (after.history.news !== beforeNews) {
    const seen = new Set(beforeNews.map((a) => a.id));
    for (const a of after.history.news) if (!seen.has(a.id) && a.kind === 'scandal') out.push({ text: `${POLITICS_RULES.news?.title ?? '新聞'}: ${a.headline}。押すと記事`, window: 'news' });
  }
  return out;
}

export type CityStore = ReturnType<typeof createCityStore>;

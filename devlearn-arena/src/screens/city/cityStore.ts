import { create } from 'zustand';
import { STAGE_NAMES } from '@/game/stage';
import { changesBetween, focusOf, type Change, type SkillValues, type Snapshot } from '@/city/changes';
import type { OverlayKind } from '@/city/overlay';
import type { DemolishTarget, Reason } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import type { BuildRoadKind } from '@/city/rules';
import type { Terrain } from '@/city/terrain';
import type { City, Facility, FacilityType, ZoneKind } from '@/city/types';
import { FACILITY_DEFS } from '@/city/facilities';
import { checkUpgrade } from '@/city/upgrade';
import { EXPLAIN, NAME_PARTS } from '@/content/politics';
import { explainApproval } from '@/sim/explain';
import type { HeatFields, HeatKind } from '@/sim/heat';
import { applyOp, type Command, type Op } from '@/sim/commands';
import { workerHost, type SimHost } from '@/sim/host';
import { SECONDS_PER_DAY, type Speed } from '@/sim/rules';
import { terrainOf, type StateMessage } from '@/sim/runner';
import type { World } from '@/sim/types';
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

export type MenuGroup = 'road' | 'zone' | 'facility' | 'park' | 'demolish';

/** 表示切替で重ねる物（今ある 4 つと、模擬のヒートマップ。docs/ui-design.md 11.1） */
export type ViewKind = OverlayKind | HeatKind;

/** 都市の上に重ねる小さな窓（docs/ui-design.md 10.0）。表示切替の窓は G2、市政の窓は G3 から */
export type SmallWindowId = 'view';
/** 同時に開ける小さな窓の数 */
export const MAX_SMALL_WINDOWS = 3;

/** 時間を止めている理由（docs/game-design.md 13.1: 都市画面が前に出ていない間・窓が隠れている間・大きな窓の間） */
export type HoldReason = 'screen' | 'hidden' | 'window';

/** カーソルの横に出す、置けるか・費用・理由 */
export interface Hint {
  x: number;
  y: number;
  ok: boolean;
  cost: number;
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
  /** 上の帯の下に出す 1 行の知らせ */
  notice: { text: string; until: number } | null;
  /** 選んでいる建物（情報パネルを出す） */
  selected: Selection | null;
  /** 表示の切り替え */
  overlay: ViewKind | null;
  /** 模擬が週の終わりに返したヒートマップの値 */
  heat: HeatFields | null;
  /** 開いている小さな窓（前に開いた順。最後が一番上） */
  windows: SmallWindowId[];
  /** 出番を待つ知らせ（今の知らせが消えたら順に出す） */
  queue: string[];
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
  /** 知らせを出す。出ている知らせがあれば、その後に出す */
  notify: (text: string, now: number) => void;
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
   * 施設を次のレベルに上げる（資金で買う。docs/game-design.md 2・5 章）。
   * 上げたら、その場所を光の輪で示し、何が加わったかを知らせる。上げられなければ何もしない
   */
  upgrade: (facilityId: string, skills: SkillValues, now: number) => boolean;
  select: (selection: Selection | null) => void;
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

/** 1 つの知らせを出しておく時間（docs/ui-design.md 3 章: 3 秒で消える） */
export const NOTICE_MS = 3000;

export interface CityStoreOptions {
  /** 保存データから戻す時の世界 */
  world?: World;
  /** 模擬を動かす口（既定は Web Worker。作れなければ画面と同じ流れ） */
  host?: SimHost;
}

/** 都市の状態を作る。保存から戻す時は、保存した世界（options.world）か都市（initial）から始める */
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
      for (const c of pending) w = applyOp(w, c.op, terrain);
      const prevStage = get().world.city.stage;
      set({ world: w, city: { ...w.city, day: Math.max(clock, w.city.day) } });
      if (w.city.stage > prevStage) get().notify(`都市が「${STAGE_NAMES[w.city.stage]}」に発展した。霧が晴れて、作れる物が増えた`, performance.now());
    };
    host.listen((m: StateMessage) => {
      const before = base.history.breakdown.at(-1)?.week;
      base = { ...base, ...m.patch };
      acked = Math.max(acked, m.day);
      pending = pending.filter((c) => c.seq > m.seq);
      rebuild();
      if (m.heat) set({ heat: m.heat });
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
      host.post({ type: 'load', world: w, seq });
    };
    return {
      city: startWorld.city,
      world: startWorld,
      terrain,
      paused: false,
      speed: 1,
      holds: [],
      tool: { kind: 'none' },
      menu: null,
      rotation: 0,
      hint: null,
      confirm: null,
      notice: null,
      selected: null,
      overlay: null,
      heat: null,
      windows: [],
      queue: [],
      away: null,
      focus: null,

      setCity: (next) => {
        const w = withCity(get().world, next, terrain, NAME_PARTS);
        loadWorld(w);
        set((s) => ({ selected: s.selected && stillThere(next, s.selected) ? s.selected : null }));
      },
      load: loadWorld,
      dispatch: (op) => {
        seq += 1;
        const cmd: Command = { seq, day: requested, op };
        pending.push(cmd);
        rebuild();
        set((s) => ({ selected: s.selected && stillThere(s.city, s.selected) ? s.selected : null }));
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
      setTool: (tool) => set({ tool, hint: null }),
      openMenu: (menu) => set((s) => ({ menu, tool: menu === 'demolish' ? { kind: 'demolish' } : menu === null || menu !== s.menu ? { kind: 'none' } : s.tool, hint: null })),
      rotate: () => set((s) => ({ rotation: ((s.rotation + 90) % 360) as Facility['rotation'] })),
      setHint: (hint) => set({ hint }),
      askDemolish: (confirm) => set({ confirm }),
      notify: (text, now) => {
        const s = get();
        if (s.notice && now < s.notice.until) set({ queue: [...s.queue, text] });
        else set({ notice: { text, until: now + NOTICE_MS } });
      },
      expireNotice: (now) => {
        const s = get();
        if (!s.notice || now < s.notice.until) return;
        const [next, ...rest] = s.queue;
        set(next === undefined ? { notice: null } : { notice: { text: next, until: now + NOTICE_MS }, queue: rest });
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
        for (const text of [...changes.slice(0, 2).map((c) => c.text), ...after]) get().notify(text, now);
        return changes;
      },
      upgrade: (facilityId, skills, now) => {
        const s = get();
        const check = checkUpgrade(s.world.city, facilityId, skills);
        if (!check?.ok) return false;
        get().dispatch({ kind: 'upgrade', facilityId, skills: { ...skills } });
        const f = get().city.facilities.find((x) => x.id === facilityId);
        if (!f) return false;
        const def = FACILITY_DEFS[f.type];
        const adds = def.looks?.[check.level - 1];
        // 自分の操作の結果は、並んでいる知らせを待たせずにすぐ出す（並んでいた知らせは、その後に出す）
        set({
          focus: { at: { x: f.origin.x + def.w / 2, y: f.origin.y + def.d / 2 }, size: { x: def.w, y: def.d }, seq: (s.focus?.seq ?? 0) + 1 },
          notice: { text: `${def.name}を Lv${String(check.level)} に上げた${adds ? `。${adds}が加わった` : ''}`, until: now + NOTICE_MS },
        });
        return true;
      },
      select: (selected) => set({ selected }),
      focusAt: (at, size = { x: 1, y: 1 }) => set((s) => ({ focus: { at, size, seq: (s.focus?.seq ?? 0) + 1 } })),
      setOverlay: (overlay) => set({ overlay }),
      openWindow: (id) => set((s) => {
        const rest = s.windows.filter((w) => w !== id);
        return { windows: [...rest.slice(Math.max(0, rest.length - (MAX_SMALL_WINDOWS - 1))), id] };
      }),
      closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w !== id) })),
      toggleWindow: (id) => (get().windows.includes(id) ? get().closeWindow(id) : get().openWindow(id)),
      stop: () => host.stop(),
    };
  });
  host.post({ type: 'load', world: startWorld, seq: 0 });
  return store;
}

function stillThere(city: City, sel: Selection): boolean {
  return sel.kind === 'facility' ? city.facilities.some((f) => f.id === sel.id) : city.buildings.some((b) => b.id === sel.id);
}

export type CityStore = ReturnType<typeof createCityStore>;

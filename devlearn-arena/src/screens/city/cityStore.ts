import { create } from 'zustand';
import { STAGE_NAMES } from '@/game/stage';
import { changesBetween, focusOf, type Change, type SkillValues, type Snapshot } from '@/city/changes';
import { advance } from '@/city/growth';
import { newCity } from '@/city/newCity';
import type { OverlayKind } from '@/city/overlay';
import type { DemolishTarget, Reason } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import { SECONDS_PER_DAY, type BuildRoadKind } from '@/city/rules';
import { generateTerrain, type Terrain } from '@/city/terrain';
import type { City, Facility, FacilityType, ZoneKind } from '@/city/types';
import { FACILITY_DEFS } from '@/city/facilities';
import { checkUpgrade, upgradeFacility } from '@/city/upgrade';

/**
 * 都市画面の状態（docs/ui-design.md 3・4 章）。
 * 規則は src/city の純粋な関数にあり、ここはそれを呼んで結果を持つだけ。
 */


export type Tool =
  | { kind: 'none' }
  | { kind: 'road'; road: BuildRoadKind; shape: 'straight' | 'curve' }
  | { kind: 'zone'; zone: ZoneKind }
  /** 施設・公園を置く。記念碑は、受け取った記念碑のどれか（landmark）を置く */
  | { kind: 'facility'; type: FacilityType; landmark?: string }
  | { kind: 'demolish' };

export type MenuGroup = 'road' | 'zone' | 'facility' | 'park' | 'demolish';

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
  city: City;
  terrain: Terrain;
  paused: boolean;
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
  overlay: OverlayKind | null;
  /** 出番を待つ知らせ（今の知らせが消えたら順に出す） */
  queue: string[];
  /** 学習に出た時の都市とスキル（戻った時に変化を比べる） */
  away: Snapshot | null;
  /** 変化のあった場所（カメラを寄せ、光の輪で示す）。seq が変わるたびに寄せる */
  focus: { at: { x: number; y: number }; size: { x: number; y: number }; seq: number } | null;

  setCity: (city: City) => void;
  tick: (dtSeconds: number) => void;
  togglePause: () => void;
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
  setOverlay: (overlay: OverlayKind | null) => void;
}

/** 1 つの知らせを出しておく時間（docs/ui-design.md 3 章: 3 秒で消える） */
export const NOTICE_MS = 3000;

/** 都市の状態を作る。保存から戻す時は、保存した都市（initial）から始める */
export function createCityStore(seed?: number, initial?: City) {
  const city = initial ?? newCity(seed);
  const terrain = generateTerrain(city.seed);
  return create<CityGameState>((set, get) => ({
    city,
    terrain,
    paused: false,
    tool: { kind: 'none' },
    menu: null,
    rotation: 0,
    hint: null,
    confirm: null,
    notice: null,
    selected: null,
    overlay: null,
    queue: [],
    away: null,
    focus: null,

    setCity: (next) => set((s) => ({ city: next, selected: s.selected && stillThere(next, s.selected) ? s.selected : null })),
    tick: (dt) => {
      const s = get();
      if (s.paused || dt <= 0) return;
      const before = s.city;
      const after = advance(before, before.day + dt / SECONDS_PER_DAY);
      set({ city: after });
      if (after.stage > before.stage) get().notify(`都市が「${STAGE_NAMES[after.stage]}」に発展した。霧が晴れて、作れる物が増えた`, performance.now());
    },
    togglePause: () => set((s) => ({ paused: !s.paused })),
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
      const check = checkUpgrade(s.city, facilityId, skills);
      if (!check?.ok) return false;
      const city = upgradeFacility(s.city, check);
      const f = city.facilities.find((x) => x.id === facilityId);
      if (!f) return false;
      const def = FACILITY_DEFS[f.type];
      const adds = def.looks?.[check.level - 1];
      // 自分の操作の結果は、並んでいる知らせを待たせずにすぐ出す（並んでいた知らせは、その後に出す）
      set({
        city,
        focus: { at: { x: f.origin.x + def.w / 2, y: f.origin.y + def.d / 2 }, size: { x: def.w, y: def.d }, seq: (s.focus?.seq ?? 0) + 1 },
        notice: { text: `${def.name}を Lv${String(check.level)} に上げた${adds ? `。${adds}が加わった` : ''}`, until: now + NOTICE_MS },
      });
      return true;
    },
    select: (selected) => set({ selected }),
    setOverlay: (overlay) => set({ overlay }),
  }));
}

function stillThere(city: City, sel: Selection): boolean {
  return sel.kind === 'facility' ? city.facilities.some((f) => f.id === sel.id) : city.buildings.some((b) => b.id === sel.id);
}

export type CityStore = ReturnType<typeof createCityStore>;

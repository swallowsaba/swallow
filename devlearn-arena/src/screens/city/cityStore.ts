import { create } from 'zustand';
import { STAGE_NAMES } from '@/game/stage';
import { advance } from '@/city/growth';
import { newCity } from '@/city/newCity';
import type { OverlayKind } from '@/city/overlay';
import type { DemolishTarget, Reason } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import { SECONDS_PER_DAY, type BuildRoadKind } from '@/city/rules';
import { generateTerrain, type Terrain } from '@/city/terrain';
import type { City, Facility, FacilityType, ZoneKind } from '@/city/types';

/**
 * 都市画面の状態（docs/ui-design.md 3・4 章）。
 * 規則は src/city の純粋な関数にあり、ここはそれを呼んで結果を持つだけ。
 */


export type Tool =
  | { kind: 'none' }
  | { kind: 'road'; road: BuildRoadKind; shape: 'straight' | 'curve' }
  | { kind: 'zone'; zone: ZoneKind }
  | { kind: 'facility'; type: FacilityType }
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

  setCity: (city: City) => void;
  tick: (dtSeconds: number) => void;
  togglePause: () => void;
  setTool: (tool: Tool) => void;
  openMenu: (group: MenuGroup | null) => void;
  rotate: () => void;
  setHint: (hint: Hint | null) => void;
  askDemolish: (target: DemolishTarget | null) => void;
  notify: (text: string, now: number) => void;
  select: (selection: Selection | null) => void;
  setOverlay: (overlay: OverlayKind | null) => void;
}

export function createCityStore(seed?: number) {
  const city = newCity(seed);
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
    notify: (text, now) => set({ notice: { text, until: now + 3000 } }),
    select: (selected) => set({ selected }),
    setOverlay: (overlay) => set({ overlay }),
  }));
}

function stillThere(city: City, sel: Selection): boolean {
  return sel.kind === 'facility' ? city.facilities.some((f) => f.id === sel.id) : city.buildings.some((b) => b.id === sel.id);
}

export type CityStore = ReturnType<typeof createCityStore>;

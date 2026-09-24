import type { DesignKind } from '@/city/model';
import type { TKey } from '@/i18n';
import type { IconName } from '@/ui/Icon';

/**
 * 建設メニューの中身。React に触れない純粋なデータと関数。
 *
 * どれが解放されているかは、いま取り組んでいる段（マイルストーン）から導く。
 * 一覧を書き換えても、解放の条件はここ 1 か所だけを見れば分かる。
 */

export interface BuildTool {
  kind: DesignKind;
  label: TKey;
  icon: IconName;
  /** 解放される段。ここに届くまでは暗いまま */
  needs: number;
}

/** 下の帯に並ぶ道具。`docs/design/hud-mockup.html` と同じ順 */
export const BUILD_TOOLS: readonly BuildTool[] = [
  { kind: 'road', label: 'hud.build.road', icon: 'route', needs: 1 },
  { kind: 'zone', label: 'hud.build.zone', icon: 'board', needs: 1 },
  { kind: 'house', label: 'hud.build.house', icon: 'city', needs: 1 },
  { kind: 'office', label: 'hud.build.office', icon: 'build', needs: 2 },
  { kind: 'monument', label: 'hud.build.monument', icon: 'star', needs: 2 },
  { kind: 'depot', label: 'hud.build.depot', icon: 'board', needs: 3 },
  { kind: 'hall', label: 'hud.build.hall', icon: 'plan', needs: 4 },
  { kind: 'relay', label: 'hud.build.relay', icon: 'target', needs: 4 },
];

/** 引き出しに並ぶ種類。規模が違うと、街に建つ姿も変わる */
export interface BuildVariant {
  id: string;
  kind: DesignKind;
  /** 規模。1 が小さく、3 が大きい */
  level: number;
  name: TKey;
  note: TKey;
  needs: number;
}

const VARIANTS: readonly BuildVariant[] = [
  { id: 'road', kind: 'road', level: 1, name: 'hud.variant.road', note: 'hud.note.road', needs: 1 },
  { id: 'zone', kind: 'zone', level: 1, name: 'hud.variant.zone', note: 'hud.note.zone', needs: 1 },
  { id: 'hut', kind: 'house', level: 1, name: 'hud.variant.hut', note: 'hud.note.hut', needs: 1 },
  { id: 'house2', kind: 'house', level: 2, name: 'hud.variant.house2', note: 'hud.note.house2', needs: 2 },
  { id: 'office1', kind: 'office', level: 1, name: 'hud.variant.office1', note: 'hud.note.office1', needs: 2 },
  { id: 'office2', kind: 'office', level: 2, name: 'hud.variant.office2', note: 'hud.note.office2', needs: 3 },
  { id: 'tower', kind: 'office', level: 4, name: 'hud.variant.tower', note: 'hud.note.tower', needs: 4 },
  { id: 'stone', kind: 'monument', level: 1, name: 'hud.variant.stone', note: 'hud.note.stone', needs: 2 },
  { id: 'pillar', kind: 'monument', level: 3, name: 'hud.variant.pillar', note: 'hud.note.pillar', needs: 3 },
  { id: 'depot', kind: 'depot', level: 1, name: 'hud.variant.depot', note: 'hud.note.depot', needs: 3 },
  { id: 'hall', kind: 'hall', level: 2, name: 'hud.variant.hall', note: 'hud.note.hall', needs: 4 },
  { id: 'relay', kind: 'relay', level: 1, name: 'hud.variant.relay', note: 'hud.note.relay', needs: 4 },
];

/** その道具で建てられるもの。並びは規模の小さい順 */
export function variantsOf(kind: DesignKind): readonly BuildVariant[] {
  return VARIANTS.filter((v) => v.kind === kind);
}

export function variantById(id: string): BuildVariant | undefined {
  return VARIANTS.find((v) => v.id === id);
}

/** いまの段では、まだ使えないか */
export function isLocked(needs: number, milestone: number): boolean {
  return milestone < needs;
}

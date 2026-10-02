import { FACILITY_DEFS, footprintOf } from '@/city/facilities';
import {
  checkFacility, checkRoad, checkZone, demolishTargetAt, placeFacility, placeRoad, placeZone, type PlanCheck,
} from '@/city/place';
import type { CityRenderer } from '@/city/render/CityRenderer';
import type { RoadPlan } from '@/city/roads';
import { ROAD_RULES, ZONE_RULES } from '@/city/rules';
import type { City, Point } from '@/city/types';
import type { CityStore, Tool } from './cityStore';

/**
 * 建設の操作（docs/ui-design.md 4 章・docs/city-design.md 8 章）。
 * 建設メニューで選んだ物を、左クリックで置く（道路と区画はドラッグ）。
 * 曲線の道路は、始点から終点へドラッグした後、マウスで曲がり具合（制御点）を決めてクリックする。
 * R で 90 度回す。Esc か右クリックで取り消す。Space で時間を止める。B で建設メニュー。
 */

type Drag =
  | { kind: 'line'; start: Point; end: Point }
  | { kind: 'bend'; start: Point; end: Point; ctrl: Point }
  | { kind: 'rect'; start: Point; end: Point };

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

export function attachBuildControls(canvas: HTMLCanvasElement, renderer: CityRenderer, store: CityStore, isActive: () => boolean = () => true): () => void {
  let drag: Drag | null = null;
  let pointer: { sx: number; sy: number; cx: number; cy: number } | null = null;
  let rightDown: { x: number; y: number } | null = null;
  let leftDown: { x: number; y: number } | null = null;

  const local = (e: { clientX: number; clientY: number }): { sx: number; sy: number } => {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  /** 今の道具と位置で、置けるかを確かめ、予告と理由を出す。置く時はその判定を返す */
  const evaluate = (): { apply: (() => City) | null } => {
    const { tool, city, terrain, rotation } = store.getState();
    if (!pointer || tool.kind === 'none') {
      renderer.setPreview(null);
      store.getState().setHint(null);
      return { apply: null };
    }
    const cell = renderer.cellAt(pointer.sx, pointer.sy);
    const at = { x: pointer.cx + 18, y: pointer.cy + 20 };
    const show = (check: PlanCheck, title: string, extra: Parameters<CityRenderer['setPreview']>[0] = null): void => {
      renderer.setPreview(extra ?? { cells: check.cells, ok: check.ok });
      store.getState().setHint({ ...at, ok: check.ok, cost: check.cost, reasons: check.reasons, title });
    };

    if (tool.kind === 'road') {
      const name = `${ROAD_RULES[tool.road].name}${tool.road === 'roundabout' ? '' : tool.shape === 'curve' ? '（曲線）' : '（直線）'}`;
      let plan: RoadPlan;
      if (tool.road === 'roundabout') plan = { kind: 'roundabout', center: cell };
      else if (drag?.kind === 'bend') plan = { kind: tool.road, shape: 'curve', from: drag.start, ctrl: drag.ctrl, to: drag.end };
      else if (drag?.kind === 'line') plan = { kind: tool.road, shape: 'straight', from: drag.start, to: drag.end };
      else {
        // まだ引き始めていない: 始点のマスだけを判定する
        const check = checkRoad(city, terrain, { kind: tool.road, shape: 'straight', from: cell, to: cell });
        const reasons = check.reasons.filter((r) => r.code !== 'short' && r.code !== 'road-overlap');
        const marks = check.cells.map((c) => ({ ...c, ok: reasons.length === 0 }));
        renderer.setPreview({ cells: marks, ok: reasons.length === 0 });
        store.getState().setHint({ ...at, ok: reasons.length === 0, cost: check.cost, reasons, title: `${name}: ドラッグで引く` });
        return { apply: null };
      }
      const check = checkRoad(city, terrain, plan);
      show(check, drag?.kind === 'line' && tool.shape === 'curve' ? `${name}: 終点を決めて離す` : drag?.kind === 'bend' ? `${name}: 曲がりを決めてクリック` : name, { cells: check.cells, roads: check.roads, ok: check.ok });
      return { apply: check.ok ? () => placeRoad(store.getState().city, check) : null };
    }

    if (tool.kind === 'zone') {
      const a = drag?.kind === 'rect' ? drag.start : cell;
      const b = drag?.kind === 'rect' ? drag.end : cell;
      const check = checkZone(city, terrain, tool.zone, a, b);
      show(check, `${ZONE_RULES[tool.zone].name}の区画${check.paint.length > 0 ? ` ${String(check.paint.length)} マス` : ''}`);
      return { apply: check.ok ? () => placeZone(store.getState().city, tool.zone, check) : null };
    }

    if (tool.kind === 'facility') {
      const size = footprintOf(tool.type, rotation);
      const origin = { x: cell.x - Math.floor((size.w - 1) / 2), y: cell.y - Math.floor((size.d - 1) / 2) };
      const check = checkFacility(city, terrain, tool.type, origin, rotation);
      show(check, `${FACILITY_DEFS[tool.type].name}（R で回す）`, { cells: check.cells, ghost: { type: tool.type, origin, rotation }, ok: check.ok });
      return { apply: check.ok ? () => placeFacility(store.getState().city, tool.type, origin, rotation, check) : null };
    }

    // 取り壊し
    const target = demolishTargetAt(city, cell);
    if (!target) {
      renderer.setPreview(null);
      store.getState().setHint({ ...at, ok: false, cost: 0, reasons: [], title: '取り壊す物を選ぶ' });
      return { apply: null };
    }
    renderer.setPreview({ cells: target.cells.map((c) => ({ ...c, ok: false })), ok: false });
    store.getState().setHint({ ...at, ok: true, cost: 0, reasons: [], title: `取り壊す: ${target.name}` });
    return { apply: null };
  };

  const cancel = (): void => {
    if (drag) {
      drag = null;
      evaluate();
      return;
    }
    const s = store.getState();
    if (s.confirm) s.askDemolish(null);
    else if (s.tool.kind !== 'none') s.setTool({ kind: 'none' });
    else if (s.selected) s.select(null);
    else s.openMenu(null);
  };

  /** Tab で施設を順に選び、その施設を画面の中央に持ってくる（docs/ui-design.md 4 章） */
  const cycle = (dir: 1 | -1): void => {
    const s = store.getState();
    const list = [...s.city.facilities].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    if (list.length === 0) return;
    const now = s.selected?.kind === 'facility' ? list.findIndex((f) => f.id === s.selected?.id) : -1;
    const next = list[(now + dir + list.length) % list.length];
    if (!next) return;
    s.select({ kind: 'facility', id: next.id });
    const size = footprintOf(next.type, next.rotation);
    renderer.focusOn(next.origin.x + size.w / 2, next.origin.y + size.d / 2);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      rightDown = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    const { tool } = store.getState();
    if (tool.kind === 'none') {
      leftDown = { x: e.clientX, y: e.clientY };
      return;
    }
    const p = local(e);
    pointer = { ...p, cx: e.clientX, cy: e.clientY };
    const cell = renderer.cellAt(p.sx, p.sy);
    if (tool.kind === 'road' && tool.road !== 'roundabout') {
      if (drag?.kind === 'bend') return; // 曲線の確定は離した時
      drag = { kind: 'line', start: cell, end: cell };
    } else if (tool.kind === 'zone') {
      drag = { kind: 'rect', start: cell, end: cell };
    }
    canvas.setPointerCapture(e.pointerId);
    evaluate();
  };

  const onPointerMove = (e: PointerEvent): void => {
    const p = local(e);
    pointer = { ...p, cx: e.clientX, cy: e.clientY };
    const cell = renderer.cellAt(p.sx, p.sy);
    if (drag?.kind === 'line' || drag?.kind === 'rect') drag = { ...drag, end: cell };
    else if (drag?.kind === 'bend') drag = { ...drag, ctrl: renderer.pointAt(p.sx, p.sy) };
    evaluate();
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) {
      if (rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) < 5) cancel();
      rightDown = null;
      return;
    }
    if (e.button !== 0) return;
    const { tool } = store.getState();
    const p = local(e);
    if (tool.kind === 'none') {
      // 建物を選ぶ（押して動かさずに離した時）。何も無い所なら選択を外す
      if (leftDown && Math.hypot(e.clientX - leftDown.x, e.clientY - leftDown.y) < 5) store.getState().select(renderer.objectAt(p.sx, p.sy));
      leftDown = null;
      return;
    }
    pointer = { ...p, cx: e.clientX, cy: e.clientY };
    if (tool.kind === 'road' && tool.shape === 'curve' && drag?.kind === 'line') {
      // 曲線: 始点と終点が決まったら、曲がり具合を決める段に移る
      if (same(drag.start, drag.end)) {
        drag = null;
        evaluate();
        return;
      }
      const mid = { x: (drag.start.x + drag.end.x) / 2 + 0.5, y: (drag.start.y + drag.end.y) / 2 + 0.5 };
      drag = { kind: 'bend', start: drag.start, end: drag.end, ctrl: mid };
      evaluate();
      return;
    }
    if (tool.kind === 'demolish') {
      const target = demolishTargetAt(store.getState().city, renderer.cellAt(p.sx, p.sy));
      if (target) store.getState().askDemolish(target);
      return;
    }
    const { apply } = evaluate();
    if (apply) store.getState().setCity(apply());
    drag = null;
    evaluate();
  };

  const onPointerLeave = (): void => {
    if (drag) return;
    pointer = null;
    renderer.setPreview(null);
    store.getState().setHint(null);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isActive()) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const s = store.getState();
    if (s.confirm) return; // 確認の窓が開いている間は、窓の操作だけ
    const k = e.key.toLowerCase();
    if (k === 'escape') cancel();
    else if (k === 'r') {
      s.rotate();
      evaluate();
    } else if (k === ' ') {
      e.preventDefault();
      s.togglePause();
    } else if (k === 'b') {
      s.openMenu(s.menu ? null : 'road');
    } else if (k === 'tab' && !(e.target instanceof HTMLElement && /^(BUTTON|A)$/.test(e.target.tagName))) {
      // ボタンにいる時の Tab は、画面の部品を順にたどる（キーボードの操作を奪わない）
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    }
  };

  // 都市が変わったら（建物が建つ・置いた）、予告を作り直す
  let last: City = store.getState().city;
  let lastTool: Tool = store.getState().tool;
  let lastRotation = store.getState().rotation;
  const unsubscribe = store.subscribe((s) => {
    const c = s.city;
    const changed = c.roads !== last.roads || c.zones !== last.zones || c.facilities !== last.facilities || c.buildings !== last.buildings || c.stage !== last.stage;
    if (s.tool !== lastTool) drag = null;
    if (changed || s.tool !== lastTool || s.rotation !== lastRotation) {
      last = c;
      lastTool = s.tool;
      lastRotation = s.rotation;
      evaluate();
    }
  });

  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  return () => {
    unsubscribe();
    window.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
  };
}

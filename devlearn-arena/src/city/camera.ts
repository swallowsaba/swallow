import { project, rotate, unproject, unrotate, type P2, type P3, type Rotation, type Screen } from './projection';

/**
 * カメラ（docs/ui-design.md 4 章の移動・拡大縮小・90 度回転）。
 * 画面の部品から切り離した純粋な計算。描画と操作はこれを呼ぶだけ。
 */
export interface Camera {
  /** 画面の中央に来る地図の点（回す前の座標） */
  focus: P2;
  /** 拡大率。ZOOM_LEVELS のどれか */
  zoom: number;
  rotation: Rotation;
}

export interface Viewport {
  width: number;
  height: number;
}

/** 拡大率の段。描画の使い回し（画像化）が段ごとに効くように、連続にしない */
export const ZOOM_LEVELS = [0.4, 0.5, 0.63, 0.8, 1, 1.25, 1.6, 2, 2.5] as const;

export function createCamera(focus: P2, zoom = 1, rotation: Rotation = 0): Camera {
  return { focus, zoom: nearestZoom(zoom), rotation };
}

export function nearestZoom(zoom: number): number {
  let best: number = ZOOM_LEVELS[0];
  for (const level of ZOOM_LEVELS) if (Math.abs(level - zoom) < Math.abs(best - zoom)) best = level;
  return best;
}

/** 地図の点を画面の点へ */
export function worldToScreen(cam: Camera, vp: Viewport, p: P3, size: number): Screen {
  const v = rotate(p, cam.rotation, size);
  const f = rotate(cam.focus, cam.rotation, size);
  const a = project({ x: v.x, y: v.y, z: p.z });
  const b = project({ x: f.x, y: f.y, z: 0 });
  return {
    sx: (a.sx - b.sx) * cam.zoom + vp.width / 2,
    sy: (a.sy - b.sy) * cam.zoom + vp.height / 2,
  };
}

/** 画面の点を、高さ 0 の地面の上の地図の点へ */
export function screenToWorld(cam: Camera, vp: Viewport, s: Screen, size: number): P2 {
  const f = rotate(cam.focus, cam.rotation, size);
  const b = project({ x: f.x, y: f.y, z: 0 });
  const view = unproject({
    sx: (s.sx - vp.width / 2) / cam.zoom + b.sx,
    sy: (s.sy - vp.height / 2) / cam.zoom + b.sy,
  });
  return unrotate(view, cam.rotation, size);
}

/** 焦点を地図の中に収める */
function clampFocus(p: P2, size: number): P2 {
  return { x: Math.max(0, Math.min(size, p.x)), y: Math.max(0, Math.min(size, p.y)) };
}

/** 画面の上で (dx, dy) 画素だけ引きずる。地図は指に付いて動く */
export function pan(cam: Camera, vp: Viewport, dx: number, dy: number, size: number): Camera {
  const center = { sx: vp.width / 2 - dx, sy: vp.height / 2 - dy };
  return { ...cam, focus: clampFocus(screenToWorld(cam, vp, center, size), size) };
}

/**
 * 拡大率を steps 段だけ変える。(at) の下にある地図の点は動かない。
 * 段の端では何もしない。
 */
export function zoomAt(cam: Camera, vp: Viewport, steps: number, at: Screen, size: number): Camera {
  const index = ZOOM_LEVELS.indexOf(cam.zoom as (typeof ZOOM_LEVELS)[number]);
  const nextIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (index < 0 ? 4 : index) + steps));
  const zoom = ZOOM_LEVELS[nextIndex] ?? cam.zoom;
  if (zoom === cam.zoom) return cam;
  const anchor = screenToWorld(cam, vp, at, size);
  const zoomed = { ...cam, zoom };
  // 拡大した後、anchor が at に来るように焦点をずらす
  const moved = worldToScreen(zoomed, vp, { ...anchor, z: 0 }, size);
  return pan(zoomed, vp, at.sx - moved.sx, at.sy - moved.sy, size);
}

/** 90 度回す。dir は +1（時計回り）か -1 */
export function rotateCamera(cam: Camera, dir: 1 | -1): Camera {
  return { ...cam, rotation: ((cam.rotation + dir + 4) % 4) as Rotation };
}

import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec2 } from './model';

/**
 * 帯（リボン）の形を作る道具。
 *
 * 道路・川・橋は、どれも「中心線に幅を持たせた帯」でできている。
 * three の `TubeGeometry` は筒になってしまうので、地面に貼る帯はここで組む。
 */

/** 中心線を横へずらした線を作る */
export function offsetPath(points: readonly Vec2[], distance: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const here = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    if (here === undefined || prev === undefined || next === undefined) continue;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x: here.x + (-dz / len) * distance, z: here.z + (dx / len) * distance });
  }
  return out;
}

/** 平らな帯。地面に貼る（道路の舗装、川の水面、横断歩道の下地） */
export function ribbon(points: readonly Vec2[], width: number, y: number): BufferGeometry | null {
  if (points.length < 2) return null;
  const left = offsetPath(points, width / 2);
  const right = offsetPath(points, -width / 2);
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === undefined || b === undefined) continue;
    position.push(a.x, y, a.z, b.x, y, b.z);
    normal.push(0, 1, 0, 0, 1, 0);
    const v = i / (left.length - 1);
    uv.push(0, v, 1, v);
  }
  const rows = position.length / 6;
  for (let i = 0; i + 1 < rows; i += 1) {
    const base = i * 2;
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  if (index.length === 0) return null;
  return assemble(position, normal, uv, index);
}

/**
 * 高さのある帯。上の面と、両側の立ち上がりを持つ。
 * 縁石や橋の欄干のように、厚みが見えるものに使う。
 */
export function raisedRibbon(points: readonly Vec2[], width: number, bottom: number, top: number): BufferGeometry | null {
  if (points.length < 2) return null;
  const left = offsetPath(points, width / 2);
  const right = offsetPath(points, -width / 2);
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];

  const strip = (a: readonly Vec2[], b: readonly Vec2[], ya: number, yb: number, up: [number, number, number]): void => {
    const start = position.length / 3;
    for (let i = 0; i < a.length; i += 1) {
      const p = a[i];
      const q = b[i];
      if (p === undefined || q === undefined) continue;
      position.push(p.x, ya, p.z, q.x, yb, q.z);
      normal.push(...up, ...up);
      const v = i / Math.max(1, a.length - 1);
      uv.push(0, v, 1, v);
    }
    const rows = (position.length / 3 - start) / 2;
    for (let i = 0; i + 1 < rows; i += 1) {
      const base = start + i * 2;
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  };

  strip(left, right, top, top, [0, 1, 0]);
  strip(left, left, bottom, top, [0, 0, 1]);
  strip(right, right, top, bottom, [0, 0, -1]);
  if (index.length === 0) return null;
  return assemble(position, normal, uv, index);
}

function assemble(position: number[], normal: number[], uv: number[], index: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(index);
  return geometry;
}

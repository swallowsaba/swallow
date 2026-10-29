import type { Road, Zone } from '../types';

/**
 * 道路・区画の中身が同じか（docs/architecture.md 9.1: 模擬の Worker から届く都市は、毎日新しい写し）。
 * 同じ配列ならすぐ true。違う配列なら中身を比べる
 */
export function sameRoads(a: readonly Road[], b: readonly Road[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function sameZones(a: readonly Zone[], b: readonly Zone[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

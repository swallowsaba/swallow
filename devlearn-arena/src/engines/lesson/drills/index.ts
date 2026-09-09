import type { MissionSource } from '../authoring/mission';
import { kernel01 } from './kernel01';
import { kernel02 } from './kernel02';

let cache: MissionSource[] | null = null;

/**
 * 生成した任務。
 * ここは一覧を作るだけで、初期状態は開いたときに組み立てる。
 */
export function drillSources(): readonly MissionSource[] {
  cache ??= [...kernel01(), ...kernel02()];
  return cache;
}

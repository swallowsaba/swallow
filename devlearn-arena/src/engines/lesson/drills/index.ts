import type { MissionSource } from '../authoring/mission';
import { kernel00 } from './kernel00';
import { kernel01 } from './kernel01';
import { kernel02 } from './kernel02';
import { kernel03 } from './kernel03';
import { kernel04 } from './kernel04';
import { kernel05 } from './kernel05';
import { kernel06 } from './kernel06';
import { kernel07 } from './kernel07';
import { kernel08 } from './kernel08';
import { kernel09 } from './kernel09';
import { k8s01 } from './k8s01';
import { k8s02 } from './k8s02';
import { k8s03 } from './k8s03';
import { kernel10 } from './kernel10';

let cache: MissionSource[] | null = null;

/**
 * 生成した任務。
 * ここは一覧を作るだけで、初期状態は開いたときに組み立てる。
 */
export function drillSources(): readonly MissionSource[] {
  cache ??= [...kernel00(), ...kernel01(), ...kernel02(), ...kernel03(), ...kernel04(), ...kernel05(), ...kernel06(), ...kernel07(), ...kernel08(), ...kernel09(), ...kernel10(), ...k8s01(), ...k8s02(), ...k8s03()];
  return cache;
}

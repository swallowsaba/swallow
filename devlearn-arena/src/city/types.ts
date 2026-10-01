/**
 * 都市の型（docs/data-model.md 5 章）。
 * 都市の見た目は、この状態と seed から計算で決まる。描画用のデータを保存しない。
 */
import type { P2 } from './projection';

export type Point = P2;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoadKind = 'lane' | 'street' | 'avenue' | 'bridge' | 'roundabout';
export interface Road {
  id: string;
  kind: RoadKind;
  /** マスの中心を通る折れ線（曲線は細かい折れ線で持つ） */
  path: Point[];
}

export type ZoneKind = 'residential' | 'commercial' | 'office';
export interface Zone {
  id: string;
  kind: ZoneKind;
  cells: Point[];
}

export interface Building {
  id: string;
  zoneId: string;
  cell: Point;
  variant: string;
  level: number;
  builtDay: number;
}

/** 施設の種類（docs/city-design.md 4 章の 15 施設と、公園・記念碑） */
export type FacilityType =
  | 'academy' | 'server' | 'network' | 'web' | 'security' | 'devoffice' | 'deploy' | 'container'
  | 'cluster' | 'datacenter' | 'cloud' | 'monitor' | 'devops' | 'incident' | 'research'
  | 'park' | 'monument';

export type DomainId =
  | 'found' | 'linux' | 'net' | 'web' | 'sec' | 'git' | 'cicd' | 'ctr' | 'docker' | 'k8s'
  | 'db' | 'cloud' | 'mon' | 'devops' | 'trouble' | 'lab';

export interface Facility {
  id: string;
  type: FacilityType;
  domain?: DomainId;
  origin: Point;
  rotation: 0 | 90 | 180 | 270;
  level: 1 | 2 | 3 | 4 | 5;
  state: 'constructing' | 'active';
  builtDay: number;
}

export interface City {
  seed: number;
  name: string;
  day: number;
  funds: number;
  stage: 1 | 2 | 3 | 4 | 5;
  population: number;
  techPower: number;
  revealed: Rect[];
  roads: Road[];
  zones: Zone[];
  buildings: Building[];
  facilities: Facility[];
}

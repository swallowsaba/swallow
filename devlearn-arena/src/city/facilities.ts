import type { DomainId, FacilityType } from './types';

/**
 * 施設の大きさと対応する分野（docs/city-design.md 4 章）。
 * 対応は学習の入口を示すだけで、学習を制限しない（docs/decisions.md D-02）。
 */
export interface FacilityDef {
  type: FacilityType;
  name: string;
  domain?: DomainId;
  /** 回す前の敷地の大きさ（マス） */
  w: number;
  d: number;
}

export const FACILITY_DEFS: Record<FacilityType, FacilityDef> = {
  academy: { type: 'academy', name: '市立 IT 学院', domain: 'found', w: 3, d: 3 },
  server: { type: 'server', name: 'サーバ施設', domain: 'linux', w: 2, d: 2 },
  network: { type: 'network', name: 'ネットワークセンター', domain: 'net', w: 2, d: 2 },
  web: { type: 'web', name: 'Web 施設', domain: 'web', w: 2, d: 2 },
  security: { type: 'security', name: 'セキュリティセンター', domain: 'sec', w: 2, d: 2 },
  devoffice: { type: 'devoffice', name: '開発オフィス', domain: 'git', w: 2, d: 2 },
  deploy: { type: 'deploy', name: 'デプロイセンター', domain: 'cicd', w: 3, d: 2 },
  container: { type: 'container', name: 'コンテナ施設', domain: 'ctr', w: 3, d: 3 },
  cluster: { type: 'cluster', name: 'クラスタ施設', domain: 'k8s', w: 3, d: 3 },
  datacenter: { type: 'datacenter', name: 'データセンター', domain: 'db', w: 3, d: 2 },
  cloud: { type: 'cloud', name: 'クラウドセンター', domain: 'cloud', w: 3, d: 3 },
  monitor: { type: 'monitor', name: '監視・運用センター', domain: 'mon', w: 2, d: 2 },
  devops: { type: 'devops', name: 'DevOps 推進本部', domain: 'devops', w: 2, d: 2 },
  incident: { type: 'incident', name: 'インシデント対応本部', domain: 'trouble', w: 2, d: 2 },
  research: { type: 'research', name: '研究施設', domain: 'lab', w: 3, d: 3 },
  park: { type: 'park', name: '公園', w: 2, d: 2 },
  monument: { type: 'monument', name: '記念碑', w: 1, d: 1 },
};

/** 回した後の敷地の大きさ */
export function footprintOf(type: FacilityType, rotation: 0 | 90 | 180 | 270): { w: number; d: number } {
  const def = FACILITY_DEFS[type];
  return rotation % 180 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

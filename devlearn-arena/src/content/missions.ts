import { missionSchema, type Mission } from './schema';

/**
 * ミッション（content/missions/<ID>.json。docs/content-spec.md 4 章・docs/game-design.md 8 章）。
 * 小さく、ミッション一覧と情報パネルとおすすめの欄から引くので、最初にまとめて読む。
 * 並びは報酬の XP の小さい順（同じなら ID の順）。報酬の XP は手応えの目安なので、取り組みやすい順になる。
 */

const files = import.meta.glob<unknown>('../../content/missions/*.json', { eager: true, import: 'default' });

const fileName = (path: string): string => path.replace(/^.*\//, '').replace(/\.json$/, '');

export function parseMissions(entries: readonly [string, unknown][]): Mission[] {
  return entries
    .map(([path, data]) => {
      const m = missionSchema.parse(data);
      if (m.id !== fileName(path)) throw new Error(`${path}: ID ${m.id} がファイル名と違う`);
      return m;
    })
    .sort((a, b) => a.rewards.xp - b.rewards.xp || a.id.localeCompare(b.id));
}

export const MISSIONS: readonly Mission[] = parseMissions(Object.entries(files));

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

export function missionOf(id: string): Mission | undefined {
  return BY_ID.get(id);
}

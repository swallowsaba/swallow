import type { City } from '@/city/model';
import type { ClusterState } from '@/engines/k8s/types';

/**
 * 住人の声。街で起きたことを、住人のつぶやきとして流す。
 *
 * 街の状態から導く純粋関数。台帳に貯めず、いまの街から毎回読み直す。
 * 文体は落ち着いたものにする。感嘆符は使わない（`src/__tests__/banned.test.ts` が見張る）。
 */

export type VoiceEvent = 'movedIn' | 'running' | 'moving' | 'ailing';

export interface Voice {
  /** 住人の id。同じ人の声を重ねて出さない */
  id: string;
  /** 住人の名前 */
  who: string;
  event: VoiceEvent;
  /** 住んでいる建物の名前 */
  place: string;
  /** 起動できない理由。分かるときだけ添える */
  reason?: string;
}

/** 一度に流す声の数。多すぎると読めない */
export const VOICE_LIMIT = 4;

/** 先に出す順。困っている声から拾う */
const ORDER: Readonly<Record<VoiceEvent, number>> = { ailing: 0, moving: 1, movedIn: 2, running: 3 };

/**
 * いまの街から声を拾う。
 * 困っている人を先に、次に動いている人を出し、残りを落ち着いている人で埋める。
 * 並びは出来事の重さと id で決まるので、同じ街からは必ず同じ順になる。
 */
export function voicesOf(city: City, cluster: ClusterState | null, limit = VOICE_LIMIT): Voice[] {
  const all: Voice[] = [];
  for (const building of city.buildings) {
    for (const occupant of building.occupants) {
      if (occupant.state === 'gone') continue;
      const pod = cluster?.pods.get(occupant.id);
      const event: VoiceEvent =
        occupant.state === 'sick' ? 'ailing'
        : occupant.state === 'moving' ? 'moving'
        : pod?.status.startedAt === null ? 'movedIn'
        : 'running';
      const reason = pod?.status.message ?? null;
      all.push({
        id: occupant.id,
        who: occupant.label,
        event,
        place: building.label,
        ...(event === 'ailing' && reason !== null && reason !== '' ? { reason } : {}),
      });
    }
  }
  all.sort((a, b) => ORDER[a.event] - ORDER[b.event] || a.id.localeCompare(b.id));
  return all.slice(0, Math.max(0, limit));
}

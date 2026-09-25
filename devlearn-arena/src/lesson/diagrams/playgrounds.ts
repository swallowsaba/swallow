import type { DiagramId } from '@/engines/lesson/diagramIds';
import { desiredVsActual } from './desiredVsActual';
import { fileTree } from './fileTree';
import { gitThreeAreas } from './gitThreeAreas';
import { packetHops } from './packetHops';
import { podInNode } from './podInNode';
import { podLifecycle } from './podLifecycle';
import { serviceEndpoints } from './serviceEndpoints';
import type { Playground, Sim } from './sim';

/** 遊べる図解の模型すべて。識別子から引く */
export const PLAYGROUNDS = {
  'pod-in-node': podInNode,
  'desired-vs-actual': desiredVsActual,
  'pod-lifecycle': podLifecycle,
  'service-endpoints': serviceEndpoints,
  'git-three-areas': gitThreeAreas,
  'packet-hops': packetHops,
  'file-tree': fileTree,
} as const satisfies Record<DiagramId, Playground<unknown>>;

/** 落ち着くまで時間を進める。図の画面は同じことを少しずつ見せる */
export function settleAll<V>(playground: Playground<V>, sim: Sim, limit = 40): Sim {
  let current = sim;
  for (let i = 0; i < limit; i += 1) {
    const next = playground.settle?.(current) ?? null;
    if (next === null) return current;
    current = next;
  }
  return current;
}

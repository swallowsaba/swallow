import { missions } from './missions';

/**
 * 任務として実装済みのレッスン id。
 * 目次（src/content）は、この集合に載っているものだけを `ready` として扱う。
 * 目次側に手で印を付けると実装とずれるため、実装から引く。
 */
export function implementedLessonIds(): ReadonlySet<string> {
  return new Set(missions.map((m) => m.id));
}

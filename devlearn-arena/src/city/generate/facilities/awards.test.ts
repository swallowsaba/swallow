import { describe, expect, it } from 'vitest';
import { city } from '@/ui/tokens';
import type { Rotation } from '@/city/projection';
import { facesViewer, normalOf, rotateLocal } from '../mesh';
import { stadium } from './awards';

describe('競技場の照明の塔（docs/city-design.md 9.5「試合の日は照明が灯る」）', () => {
  it('4 つの向きのどれから見ても、照明の塔 4 本の灯りの面が見える側を向く（裏向きで描かれない灯りは灯らない）', () => {
    const model = stadium();
    const lamps = model.parts.flatMap((p) => p.shapes).filter((s) => s.kind === 'poly' && s.lit === true && s.color === city.windowLit && s.pts.every((q) => q[2] > 1.2));
    for (const rotation of [0, 1, 2, 3] as Rotation[]) {
      const seen = lamps.filter((s) => s.kind === 'poly' && facesViewer(normalOf(s.pts.map((q) => rotateLocal(q, rotation, model.w, model.d)))));
      expect(seen, `向き ${String(rotation)}`).toHaveLength(4);
    }
  });
});

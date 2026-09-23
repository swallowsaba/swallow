import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { layoutCity } from './model';
import { COLORS, LIGHT } from './palette';
import {
  CAMERA_FOV,
  CAMERA_PITCH,
  FOCUS_SECONDS,
  POLAR_ANGLE,
  cameraPosition,
  easeFocus,
  fitDistance,
  fogRange,
  glowStrength,
  lerpPoint,
  moveAlong,
  pickTargets,
  sunAt,
} from './sky';

describe('太陽と時間帯', () => {
  it('正午はいちばん高く、明るい', () => {
    const noon = sunAt(0.5, 400);
    const dawn = sunAt(0.25, 400);
    expect(noon.position[1]).toBeGreaterThan(dawn.position[1]);
    expect(noon.intensity).toBeGreaterThan(dawn.intensity);
    expect(noon.night).toBe(0);
  });

  it('真夜中は暗く、夜の深さが 1 になる', () => {
    const night = sunAt(0, 400);
    expect(night.intensity).toBe(0);
    expect(night.night).toBe(1);
    expect(night.daylight).toBe(0);
  });

  it('太陽は地面の下へ潜らない（影の向きが裏返らない）', () => {
    for (let i = 0; i <= 20; i += 1) {
      expect(sunAt(i / 20, 400).position[1]).toBeGreaterThan(0);
    }
  });

  it('低い太陽は赤みがかる', () => {
    expect(sunAt(0.27, 400).color).toBe(LIGHT.sunset);
    expect(sunAt(0.5, 400).color).toBe(LIGHT.sun);
  });

  it('夜は窓が灯る。昼は灯らない', () => {
    expect(glowStrength(0)).toBeGreaterThan(1);
    expect(glowStrength(0.5)).toBe(0);
  });

  it('時間帯は 1 を超えても回り続ける', () => {
    expect(sunAt(1.5, 400)).toEqual(sunAt(0.5, 400));
    expect(sunAt(-0.5, 400)).toEqual(sunAt(0.5, 400));
  });

  it('灯りの色は palette から来る', () => {
    expect(LIGHT.window).toBe(COLORS.light);
  });
});

describe('カメラ', () => {
  it('水平から 35 度の固定角。視野角 45', () => {
    expect((CAMERA_PITCH * 180) / Math.PI).toBeCloseTo(35);
    expect(CAMERA_FOV).toBe(45);
    expect(POLAR_ANGLE).toBeCloseTo(Math.PI / 2 - CAMERA_PITCH);
  });

  it('どの向きから見ても伏せ角は変わらない（真下や真横を向かない）', () => {
    for (const azimuth of [0, 1, 2, 3, 4, 5, 6]) {
      const [x, y, z] = cameraPosition({ x: 0, z: 0 }, 300, azimuth);
      const flat = Math.hypot(x, z);
      expect(Math.atan2(y, flat)).toBeCloseTo(CAMERA_PITCH);
    }
  });

  it('注目点のまわりを回る', () => {
    const [x, , z] = cameraPosition({ x: 50, z: -20 }, 300, 0);
    expect(Math.hypot(x - 50, z + 20)).toBeCloseTo(Math.cos(CAMERA_PITCH) * 300);
  });

  it('街全体が入る距離を出せる', () => {
    const near = fitDistance({ w: 100, d: 100 });
    const far = fitDistance({ w: 400, d: 400 });
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(100);
  });

  it('寄る動きは 0.6 秒で終わる', () => {
    expect(FOCUS_SECONDS).toBe(0.6);
    expect(easeFocus(0)).toBe(0);
    expect(easeFocus(0.3)).toBeCloseTo(0.5);
    expect(easeFocus(0.6)).toBe(1);
    expect(easeFocus(10)).toBe(1);
  });

  it('点を補間できる', () => {
    expect(lerpPoint({ x: 0, z: 0 }, { x: 10, z: -10 }, 0.5)).toEqual({ x: 5, z: -5 });
  });

  it('fog は遠景を沈ませる', () => {
    const [near, far] = fogRange({ w: 600, d: 400 });
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThan(0);
  });
});

describe('動くもの', () => {
  const path = {
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 100 },
    ],
    offset: 4,
    speed: 10,
    start: 0,
  };

  it('時が進むと道に沿って進む', () => {
    const a = moveAlong(path, 0);
    const b = moveAlong(path, 2);
    expect(b.at.z).toBeGreaterThan(a.at.z);
  });

  it('中心線から車線ぶんずれる', () => {
    expect(moveAlong(path, 0).at.x).toBeCloseTo(4);
    expect(moveAlong({ ...path, offset: -4 }, 0).at.x).toBeCloseTo(-4);
  });

  it('端まで行くと先頭へ戻る（消えない）', () => {
    for (const seconds of [0, 5, 11, 40, 500]) {
      const spot = moveAlong(path, seconds);
      expect(spot.at.z).toBeGreaterThanOrEqual(-1);
      expect(spot.at.z).toBeLessThanOrEqual(101);
    }
  });

  it('逆向きに走るものは向きも裏返る', () => {
    expect(moveAlong({ ...path, speed: -10 }, 0).angle).toBeCloseTo(Math.PI);
  });

  it('同じ時刻からは必ず同じ場所になる', () => {
    expect(moveAlong(path, 3.5)).toEqual(moveAlong(path, 3.5));
  });
});

describe('押せる的', () => {
  const layout = layoutCity(
    buildCity({ cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 9 }, unlocked: DISTRICT_IDS }),
  );

  it('押せるコマンドを持つ建物だけが的になる', () => {
    const targets = pickTargets(layout.buildings);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.command !== '')).toBe(true);
    const tower = targets.find((t) => t.id === 'node:n1');
    expect(tower?.command).toBe('kubectl describe node n1');
    expect(tower?.why).not.toBe('');
  });

  it('当たり判定は建物より少し大きい', () => {
    const tower = pickTargets(layout.buildings).find((t) => t.id === 'node:n1');
    const building = layout.buildings.find((b) => b.id === 'node:n1');
    expect(tower?.size.w).toBeGreaterThan(building?.params.footprint.w ?? 0);
    expect(tower?.size.h).toBeGreaterThan(6);
  });

  it('押せない建物は的にならない', () => {
    expect(pickTargets([])).toEqual([]);
  });
});

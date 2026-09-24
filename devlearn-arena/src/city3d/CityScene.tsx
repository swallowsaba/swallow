import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import {
  Color,
  Fog,
  Matrix4,
  Quaternion,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import { MARK, NOTE, PARTS, SKY } from './palette';
import { buildCityScene, type BuiltScene } from './scene';
import {
  CAMERA_FOV,
  POLAR_ANGLE,
  cameraPosition,
  easeFocus,
  fitDistance,
  fogRange,
  glowStrength,
  openingView,
  lerpPoint,
  moveAlong,
  pickTargets,
  sunAt,
  type PickTarget,
} from './sky';
import type { CityLayout, Vec2 } from './model';
import { overlayFor, type InfoView } from './overlay';

/**
 * 街を WebGL で描く。データを受け取って描くだけ。
 *
 * カメラは水平から 35 度の固定角で、回転は水平方向のみ。
 * 太陽は 1 つで影を落とし、空の色が回り込む。時間帯が回り、夜は窓が灯る。
 * `prefers-reduced-motion` のときは、車も時間帯も止める。
 */

interface Props {
  layout: CityLayout;
  /** 押したときに端末へ送る */
  onCommand?: ((line: string) => void) | undefined;
  /** 建物を選んだとき。右の情報パネルを開くのに使う */
  onSelect?: ((id: string) => void) | undefined;
  /** いま選んでいる建物 */
  selected?: string | null;
  /** 動かしてよいか。false なら車も時間帯も止める */
  animate?: boolean;
  /** 進む速さの倍率。早送りのときは 1 より大きい */
  rate?: number;
  /** 街の上に色で重ねる情報表示。null なら重ねない */
  view?: InfoView | null;
  /** 開いたときに寄せる区域。いま学んでいる所を見せる */
  district?: string | null;
  /** 時間帯を外から決める（0 と 1 が真夜中、0.5 が正午） */
  time?: number;
}

/** 時間帯が一周する秒数 */
const DAY_SECONDS = 200;

/** 動かさないときの時間帯。影が出て、街の色が分かる明るさ */
const STILL_TIME = 0.42;

function timeAt(elapsed: number, animate: boolean, time: number | undefined): number {
  if (time !== undefined) return time;
  return animate ? (elapsed / DAY_SECONDS) % 1 : STILL_TIME;
}

/**
 * 太陽と空。時間帯に合わせて、向き・色・明るさ・fog・窓の灯りを動かす。
 * 毎フレーム React を描き直さないよう、three の持ち物を直に書き換える。
 */
function Daylight({
  layout,
  animate,
  rate,
  time,
  glow,
}: {
  layout: CityLayout;
  animate: boolean;
  rate: number;
  time: number | undefined;
  glow: MeshStandardMaterial;
}) {
  const sun = useRef<DirectionalLight>(null);
  const sky = useRef<HemisphereLight>(null);
  const span = Math.max(layout.terrain.size.w, layout.terrain.size.d);
  const [fogNear, fogFar] = fogRange(layout.terrain.size);
  const { scene } = useThree();
  const tint = useRef(new Color(SKY.color));
  const night = useRef(new Color(PARTS.locked));

  useEffect(() => {
    scene.fog = new Fog(new Color(SKY.color).getHex(), fogNear, fogFar);
    scene.background = new Color(SKY.color);
  }, [scene, fogNear, fogFar]);

  useFrame((state) => {
    const at = timeAt(state.clock.elapsedTime * rate, animate, time);
    const now = sunAt(at, span * 0.8);
    const light = sun.current;
    if (light !== null) {
      light.position.set(...now.position);
      light.color.set(now.color);
      light.intensity = now.intensity;
    }
    if (sky.current !== null) sky.current.intensity = now.ambient;
    // 夜は窓が灯る
    glow.emissiveIntensity = glowStrength(at);
    // 空と fog は夜に沈む
    tint.current.set(SKY.color).lerp(night.current, 1 - now.daylight);
    if (scene.background instanceof Color) scene.background.copy(tint.current);
    if (scene.fog !== null) scene.fog.color.copy(tint.current);
  });

  return (
    <>
      <hemisphereLight ref={sky} args={[SKY.color, PARTS.hedge, 0.6]} />
      <directionalLight
        ref={sun}
        castShadow
        position={[span * 0.4, span * 0.5, span * 0.3]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-span / 2}
        shadow-camera-right={span / 2}
        shadow-camera-top={span / 2}
        shadow-camera-bottom={-span / 2}
        shadow-camera-near={1}
        shadow-camera-far={span * 2.5}
        shadow-bias={-0.0006}
      />
    </>
  );
}

/** 街そのもの。形は `scene.ts` が組んだものをそのまま置く */
function City({
  layout,
  animate,
  rate,
  time,
  onPick,
}: {
  layout: CityLayout;
  animate: boolean;
  rate: number;
  time: number | undefined;
  onPick: (id: string) => void;
}) {
  const built = useMemo<BuiltScene>(() => buildCityScene(layout), [layout]);
  useEffect(
    () => () => {
      built.dispose();
    },
    [built],
  );

  const matrix = useRef(new Matrix4());
  const spin = useRef(new Quaternion());
  const up = useRef(new Vector3(0, 1, 0));
  const at = useRef(new Vector3());
  const size = useRef(new Vector3());

  useFrame((state) => {
    if (!animate) return;
    // 車と人を進める。部品の位置は形に焼き込んであるので、どれも同じ行列で動く
    for (const mover of built.movers) {
      mover.items.forEach((item, i) => {
        const spot = moveAlong(item.path, state.clock.elapsedTime * rate);
        matrix.current.compose(
          at.current.set(spot.at.x, mover.lift, spot.at.z),
          spin.current.setFromAxisAngle(up.current, spot.angle),
          size.current.set(item.scale, item.scale, item.scale),
        );
        for (const mesh of mover.meshes) mesh.setMatrixAt(i, matrix.current);
      });
      for (const mesh of mover.meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const targets = useMemo(() => pickTargets(layout.buildings), [layout]);

  return (
    <group>
      <Daylight layout={layout} animate={animate} rate={rate} time={time} glow={built.glow} />
      <primitive object={built.group} />
      {/* 押せる的。材質を描かないので、絵の重さは変わらない */}
      {targets.map((target) => (
        <mesh
          key={target.id}
          position={[target.at.x, target.size.h / 2, target.at.z]}
          rotation={[0, target.rotation, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onPick(target.id);
          }}
        >
          <boxGeometry args={[target.size.w, target.size.h, target.size.d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}

/** 見る向き。注目点へ 0.6 秒で寄る。回転は水平方向のみ */
function Look({ target, animate, distance }: { target: Vec2; animate: boolean; distance: number }) {
  const controls = useRef<{ target: Vector3; update: () => void } | null>(null);
  const trip = useRef<{ from: Vec2; to: Vec2; at: number } | null>(null);
  const shown = useRef<Vec2>(target);

  useEffect(() => {
    if (shown.current.x === target.x && shown.current.z === target.z) return;
    const view = controls.current;
    // 動かさない設定のときは、瞬間で移す
    if (!animate) {
      shown.current = target;
      trip.current = null;
      if (view !== null) {
        view.target.set(target.x, 0, target.z);
        view.update();
      }
      return;
    }
    trip.current = { from: shown.current, to: target, at: -1 };
  }, [target, animate]);

  useFrame((state) => {
    const trek = trip.current;
    const view = controls.current;
    if (trek === null || view === null) return;
    if (trek.at < 0) trek.at = state.clock.elapsedTime;
    const t = easeFocus(state.clock.elapsedTime - trek.at);
    const where = lerpPoint(trek.from, trek.to, t);
    view.target.set(where.x, 0, where.z);
    view.update();
    shown.current = where;
    if (t >= 1) trip.current = null;
  });

  return (
    <OrbitControls
      ref={controls as never}
      // 伏せ角を固定して、真下や真横を向かせない
      minPolarAngle={POLAR_ANGLE}
      maxPolarAngle={POLAR_ANGLE}
      enablePan
      enableZoom
      enableDamping={animate}
      minDistance={distance * 0.12}
      maxDistance={distance * 1.6}
    />
  );
}

/**
 * 選んだ建物の上に立てる印。光る輪と名札（DESIGN の 1-6）。
 * 街のどこを見ているのかが、視線を外さずに分かるようにする。
 */
function Marker({ target, animate }: { target: PickTarget; animate: boolean }) {
  const ring = useRef<Mesh>(null);
  const radius = Math.max(target.size.w, target.size.d) * 0.72;
  useFrame((state) => {
    const mesh = ring.current;
    if (mesh === null) return;
    const pulse = animate ? 1 + 0.16 * Math.sin(state.clock.elapsedTime * 2.4) : 1;
    mesh.scale.set(pulse, pulse, 1);
  });
  return (
    <group position={[target.at.x, 0, target.at.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <ringGeometry args={[radius, radius + 1.4, 48]} />
        <meshBasicMaterial color={MARK.ring} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh position={[0, target.size.h / 2, 0]}>
        <cylinderGeometry args={[0.14, 0.14, target.size.h, 8]} />
        <meshBasicMaterial color={MARK.ring} transparent opacity={0.6} />
      </mesh>
      <Html position={[0, target.size.h + 3, 0]} center distanceFactor={120} zIndexRange={[30, 0]}>
        <div
          data-testid="city-3d-nameplate"
          style={{
            whiteSpace: 'nowrap',
            padding: '5px 10px',
            borderRadius: 5,
            background: MARK.plate,
            border: `1px solid ${MARK.plateEdge}`,
            color: MARK.plateText,
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 700 }}>{target.label}</span>
          <span style={{ color: MARK.plateSub }}>{` 住人 ${String(target.residents)}`}</span>
        </div>
      </Html>
    </group>
  );
}

/**
 * 情報表示の重ね。選んだ見方に応じて、建物の足元に色の円を敷き、
 * 結び付きを線で結ぶ。街の絵そのものは書き換えない（上に薄く置くだけ）。
 */
function Overlay({ layout, view }: { layout: CityLayout; view: InfoView | null }) {
  const { discs, links } = useMemo(() => overlayFor(view, layout), [view, layout]);
  if (discs.length === 0 && links.length === 0) return null;
  return (
    <group data-testid="city-3d-overlay">
      {discs.map((disc) => (
        <mesh key={disc.id} rotation={[-Math.PI / 2, 0, 0]} position={[disc.at.x, 0.5, disc.at.z]}>
          <circleGeometry args={[disc.radius, 24]} />
          <meshBasicMaterial color={disc.color} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
      {links.map((link) => {
        const dx = link.b.x - link.a.x;
        const dz = link.b.z - link.a.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) return null;
        return (
          <mesh
            key={link.id}
            rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]}
            position={[(link.a.x + link.b.x) / 2, 0.6, (link.a.z + link.b.z) / 2]}
          >
            <planeGeometry args={[length, 2.4]} />
            <meshBasicMaterial color={link.color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function CityScene({
  layout, onCommand, onSelect, selected = null, animate = true, rate = 1, view = null, district = null, time,
}: Props) {
  const [why, setWhy] = useState<string | null>(null);
  // 開いた瞬間は、いま学んでいる区域に寄る。島全体を遠くから見下ろさない
  const opening = useMemo(() => openingView(layout, district), [layout, district]);
  const [focus, setFocus] = useState<Vec2>(opening.at);
  const distance = fitDistance(layout.terrain.size);
  const targets = useMemo(() => pickTargets(layout.buildings), [layout]);

  /** 押されたら、寄って、右に情報を開く。コマンドを持つ建物は端末へも送る */
  const pick = (id: string): void => {
    const target = targets.find((t) => t.id === id);
    if (target === undefined) return;
    setWhy(target.why === '' ? null : target.why);
    setFocus(target.at);
    onSelect?.(id);
    if (target.command !== '') onCommand?.(target.command);
  };

  const marked = targets.find((t) => t.id === selected) ?? null;

  return (
    <div className="relative h-full w-full" data-testid="city-3d">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: CAMERA_FOV, near: 1, far: distance * 4, position: cameraPosition(opening.at, opening.distance, 0.6) }}
        onDoubleClick={() => {
          setFocus({ x: 0, z: 0 });
        }}
      >
        <City layout={layout} animate={animate} rate={rate} time={time} onPick={pick} />
        <Overlay layout={layout} view={view} />
        {marked === null ? null : <Marker target={marked} animate={animate} />}
        <Look target={focus} animate={animate} distance={distance} />
      </Canvas>
      {why === null ? null : (
        <p
          data-testid="city-3d-why"
          className="pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1 text-[11px]"
          style={{ background: NOTE.fill, color: NOTE.text }}
        >
          {why}
        </p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import {
  Color,
  Fog,
  Matrix4,
  Quaternion,
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import { MARK, NOTE, PARTS, SITE, SKY, SPARK } from './palette';
import { buildCityScene, type BuiltScene } from './scene';
import { cutsOf, type Cut } from './cuts';
import {
  CAMERA_FOV,
  POLAR_ANGLE,
  aside,
  azimuthOf,
  cameraPosition,
  distanceOf,
  easeFocus,
  fitDistance,
  fogRange,
  windowGlow,
  openingView,
  lerpPoint,
  moveAlong,
  pickTargets,
  sunAt,
  TOUR_DISTANCE,
  TOUR_SECONDS,
  TOUR_SIDE,
  type PickTarget,
} from './sky';
import type { CityLayout, Vec2 } from './model';
import { overlayFor, type InfoView } from './overlay';
import {
  CART_LIFT, cartAt, reachedStop, routeOf, routeSeconds, stepTo, type CartRoute, type JourneyPlay,
} from './journey';
import type { Answer, Journey } from '@/city/journey';
import { paceAfter } from './traffic';

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
  /**
   * 模型の時間の目盛り（Kubernetes なら tick）。増えた直後だけ車と人が速く動く。
   * 時間を進めたことを、街の動きで見せるため
   */
  rush?: number;
  /** 街の上に色で重ねる情報表示。null なら重ねない */
  view?: InfoView | null;
  /** 開いたときに寄せる区域。いま学んでいる所を見せる */
  district?: string | null;
  /** 空いている区画を光らせるか。建設メニューで道具を選んでいる間は光らせる */
  showSites?: boolean;
  /** 空いている区画を押したとき */
  onSite?: ((id: string) => void) | undefined;
  /** 時間帯を外から決める（0 と 1 が真夜中、0.5 が正午） */
  time?: number;
  /** いま街を旅しているコマンド。荷車が停留所を巡る */
  journey?: Journey | null;
  /** 案内ツアーでいま停まっている施設の id。カメラが寄り、その施設が光る */
  tour?: string | null;
  /** いま止まっている所の id。赤い光が立つだけでなく、カメラもそこへ寄る */
  trouble?: string | null;
  /** 旅の進み方。止める・速さ・1 段ずつ */
  journeyPlay?: JourneyPlay;
  /** 粒が次の停留所に着いたとき。帯の印を動かすのに使う */
  onJourneyStop?: ((index: number) => void) | undefined;
}

/** 時間帯が一周する秒数 */
const DAY_SECONDS = 200;

/** 街を開いたときの時間帯。影が出て、街の色が分かる明るさ。真夜中から始めない */
const STILL_TIME = 0.42;

function timeAt(elapsed: number, animate: boolean, time: number | undefined): number {
  if (time !== undefined) return time;
  return animate ? (STILL_TIME + elapsed / DAY_SECONDS) % 1 : STILL_TIME;
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
    // 住人が暮らしている窓は灯る。夜はいっそう明るい
    glow.emissiveIntensity = windowGlow(at);
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
  rush,
  time,
  onPick,
}: {
  layout: CityLayout;
  animate: boolean;
  rate: number;
  rush: number;
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

  // 車と人の時計。止めている間は進めない。止めた所から、また動き出す
  const travelled = useRef(0);
  // 模型の時間が進んだ時刻。その直後だけ速く動かす
  const rushedAt = useRef<number | null>(null);
  const lastRush = useRef(rush);
  useFrame((state, delta) => {
    if (rush > lastRush.current) rushedAt.current = state.clock.elapsedTime;
    lastRush.current = rush;
    if (!animate) return;
    const since = rushedAt.current === null ? null : state.clock.elapsedTime - rushedAt.current;
    travelled.current += Math.min(delta, 0.1) * rate * paceAfter(since);
    // 車と人を進める。部品の位置は形に焼き込んであるので、どれも同じ行列で動く
    for (const mover of built.movers) {
      mover.items.forEach((item, i) => {
        const spot = moveAlong(item.path, travelled.current);
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

/**
 * 見る向き。注目点へ寄る。回転は水平方向のみ。
 *
 * 注目点だけを動かしてもカメラは動かない（`OrbitControls` は注目点との隔たりを保つ）。
 * そこでカメラの位置も自分で運ぶ。街の上を滑っていく様子が見えるようにするため。
 *
 * `closeUp` に距離を渡すと、寄りながらその距離まで近づく。ツアーで使う。
 */
function Look({
  target,
  animate,
  distance,
  seconds,
  closeUp = null,
  chase = null,
}: {
  target: Vec2;
  animate: boolean;
  distance: number;
  seconds?: number;
  closeUp?: number | null;
  /** 光の粒がここに書かれている間は、カメラがそれを追う */
  chase?: MutableRefObject<Vec2 | null> | null;
}) {
  const controls = useRef<{ target: Vector3; update: () => void } | null>(null);
  const trip = useRef<{ from: Vec2; to: Vec2; fromDistance: number; toDistance: number; azimuth: number; at: number } | null>(null);
  /** 頼まれた寄り先。板に隠れないようずらす前の、施設そのものの場所 */
  const asked = useRef<Vec2>(target);
  /** いまカメラが向いている所。ずらしたあとの点 */
  const aimed = useRef<Vec2>(target);
  const { camera } = useThree();

  /** カメラを、向く先から見て同じ向き・その距離の所に置く */
  const place = (at: Vec2, span: number, azimuth: number): void => {
    const [x, y, z] = cameraPosition(at, span, azimuth);
    camera.position.set(x, y, z);
  };

  useEffect(() => {
    if (asked.current.x === target.x && asked.current.z === target.z) return;
    asked.current = target;
    const view = controls.current;
    const here = { x: camera.position.x, z: camera.position.z };
    const azimuth = azimuthOf(here, aimed.current);
    const span = distanceOf(here, aimed.current);
    const toDistance = closeUp ?? span;
    // 寄るときは、施設が左の板に隠れないよう、向く先を少しずらす
    const to = closeUp === null ? target : aside(target, azimuth, toDistance * TOUR_SIDE);
    // 動かさない設定のときは、瞬間で移す
    if (!animate) {
      aimed.current = to;
      trip.current = null;
      place(to, toDistance, azimuth);
      if (view !== null) {
        view.target.set(to.x, 0, to.z);
        view.update();
      }
      return;
    }
    trip.current = { from: aimed.current, to, fromDistance: span, toDistance, azimuth, at: -1 };
    // 依存に place を入れると毎描画で作り直される。寄る先が変わったときだけ動く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, animate, closeUp]);

  useFrame((state, delta) => {
    const view = controls.current;
    const mote = chase?.current ?? null;
    if (mote !== null && view !== null) {
      // 旅の間はカメラが粒を追う。少し遅れて付いていくので、動きが目で追える
      trip.current = null;
      const here = { x: camera.position.x, z: camera.position.z };
      const azimuth = azimuthOf(here, aimed.current);
      const span = distanceOf(here, aimed.current);
      const pull = Math.min(1, delta * 2.2);
      const near = span + (CHASE_DISTANCE - span) * Math.min(1, delta * 1.1);
      const where = lerpPoint(aimed.current, aside(mote, azimuth, near * TOUR_SIDE), pull);
      place(where, near, azimuth);
      view.target.set(where.x, 0, where.z);
      view.update();
      aimed.current = where;
      asked.current = where;
      return;
    }
    const trek = trip.current;
    if (trek === null || view === null) return;
    if (trek.at < 0) trek.at = state.clock.elapsedTime;
    const t = easeFocus(state.clock.elapsedTime - trek.at, seconds);
    const where = lerpPoint(trek.from, trek.to, t);
    place(where, trek.fromDistance + (trek.toDistance - trek.fromDistance) * t, trek.azimuth);
    view.target.set(where.x, 0, where.z);
    view.update();
    aimed.current = where;
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

/** 屋根の上に立てる光の柱の高さ（メートル） */
const BEACON = 46;

/**
 * 光の粒を道から浮かせる高さ（メートル）。
 * 地面すれすれだと建物や木の裏に隠れて見えない。屋根より少し低い所を漂わせる。
 */
const MOTE_LIFT = 13;

/** 旅を見せている間の、粒とカメラの隔たり（メートル） */
const CHASE_DISTANCE = 190;

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
      {/*
        屋根の上に立てる光の柱。足元の輪は他の建物や木に隠れることがあるので、
        どこから見ても「いまここを見ている」と分かる印を空に出す。
      */}
      <mesh position={[0, target.size.h + BEACON / 2, 0]}>
        <cylinderGeometry args={[2.8, 4.6, BEACON, 16, 1, true]} />
        <meshBasicMaterial color={MARK.ring} transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh position={[0, target.size.h + BEACON / 2, 0]}>
        <cylinderGeometry args={[5.4, 8.2, BEACON, 16, 1, true]} />
        <meshBasicMaterial color={MARK.ring} transparent opacity={0.18} depthWrite={false} />
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
          {/* 住人のいない施設に「住人 0」と出さない。数はいる所にだけ添える */}
          {target.residents === 0 ? null : (
            <span style={{ color: MARK.plateSub }}>{` 住人 ${String(target.residents)}`}</span>
          )}
        </div>
      </Html>
    </group>
  );
}

/**
 * 台帳が読み上げた答えにあたる建物を、その場で光らせる。
 *
 * `kubectl get nodes` のような問い合わせは、窓口と台帳までしか行かない。
 * それでも「いま読み上げたのはこれのこと」が分かるよう、答えの中身にあたる建物を
 * 青い輪で囲む。粒をそこまで走らせると、行っていない道を通ったことになるのでしない。
 */
function Answered({
  targets,
  answer,
  animate,
}: {
  targets: readonly PickTarget[];
  answer: Answer | null;
  animate: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    const here = group.current;
    if (here === null) return;
    const pulse = animate ? 0.5 + 0.3 * (1 + Math.sin(state.clock.elapsedTime * 1.6)) / 2 : 0.7;
    here.traverse((item) => {
      const mesh = item as Mesh;
      const material = mesh.material as MeshBasicMaterial | undefined;
      if (material !== undefined && (mesh.userData as { base?: number }).base !== undefined) {
        material.opacity = pulse;
      }
    });
  });
  return (
    <group ref={group}>
      {targets.map((target) => {
        const radius = Math.max(target.size.w, target.size.d) * 0.72;
        return (
          <group key={target.id} position={[target.at.x, 0, target.at.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]} userData={{ base: 0.7 }}>
              <ringGeometry args={[radius, radius + 1.8, 40]} />
              <meshBasicMaterial color={MARK.ring} transparent depthWrite={false} />
            </mesh>
            {/* 「これが何か」の札。答えの中身が、街のどの建物のことかを言葉でも示す */}
            {answer === null ? null : (
              <Html position={[0, target.size.h + 3, 0]} center distanceFactor={120} zIndexRange={[30, 0]}>
                <div
                  data-testid="city-3d-answer"
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
                  <span style={{ fontWeight: 700 }}>{`${answer.title}（${target.label}）`}</span>
                  <span style={{ display: 'block', color: MARK.plateSub }}>{answer.plain}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 塞がれた道に立てる柵。赤は障害だけに使う色なので、ここが通れない原因だと分かる。
 *
 * 道（ケーブル）の大半は建物の足元に隠れるので、柵は 2 つの建物の外壁の間に立てる。
 * 柵の左右に赤い帯を地面に敷き、どちらへも渡れないことを示す。
 */
function Barricades({ cuts, animate }: { cuts: readonly Cut[]; animate: boolean }) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    const here = group.current;
    if (here === null) return;
    const pulse = animate ? 0.6 + 0.3 * (1 + Math.sin(state.clock.elapsedTime * 2.2)) / 2 : 0.8;
    here.traverse((item) => {
      const mesh = item as Mesh;
      const material = mesh.material as MeshBasicMaterial | undefined;
      const base = (mesh.userData as { base?: number }).base;
      if (material !== undefined && base !== undefined) material.opacity = base * pulse;
    });
  });
  return (
    <group ref={group}>
      {cuts.map((cut) => (
        <group key={cut.id} position={[cut.at.x, 0, cut.at.z]} rotation={[0, cut.angle, 0]}>
          {/* 横木 2 本と支柱 2 本。道を横切って立つ */}
          {[2, 4.2].map((y) => (
            <mesh key={y} position={[0, y, 0]} userData={{ base: 1 }}>
              <boxGeometry args={[cut.width, 0.9, 0.7]} />
              <meshBasicMaterial color={MARK.alarm} transparent depthWrite={false} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[(side * cut.width) / 2, 2.6, 0]} userData={{ base: 1 }}>
              <boxGeometry args={[0.8, 5.2, 0.8]} />
              <meshBasicMaterial color={MARK.alarm} transparent depthWrite={false} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.72, 0]} userData={{ base: 0.55 }}>
            <planeGeometry args={[cut.width, 8]} />
            <meshBasicMaterial color={MARK.alarm} transparent depthWrite={false} />
          </mesh>
          <pointLight color={MARK.alarm} intensity={40} distance={30} position={[0, 4, 0]} />
        </group>
      ))}
    </group>
  );
}

/**
 * 壊れている所に立てる赤い光。
 *
 * 街のどこが止まっているのかを、探さずに見つけられるようにする。
 * この赤は障害だけに使う。光っている所では必ず何かが起きている。
 * どの建物が壊れているかは模型が決める。ここでは描くだけ。
 */
function Trouble({ targets, animate }: { targets: readonly PickTarget[]; animate: boolean }) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    const here = group.current;
    if (here === null) return;
    // ゆっくり明滅させる。騒がしくはしないが、静止した街の中で必ず目に留まる
    const pulse = animate ? 0.55 + 0.35 * (1 + Math.sin(state.clock.elapsedTime * 2.2)) / 2 : 0.75;
    here.traverse((item) => {
      const mesh = item as Mesh;
      const material = mesh.material as MeshBasicMaterial | undefined;
      const base = (mesh.userData as { base?: number }).base;
      if (material !== undefined && base !== undefined) material.opacity = base * pulse;
    });
  });

  return (
    <group ref={group}>
      {targets.map((target) => {
        const radius = Math.max(target.size.w, target.size.d) * 0.78;
        return (
          <group key={target.id} position={[target.at.x, 0, target.at.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]} userData={{ base: 0.85 }}>
              <ringGeometry args={[radius, radius + 2.2, 40]} />
              <meshBasicMaterial color={MARK.alarm} transparent depthWrite={false} />
            </mesh>
            <mesh position={[0, target.size.h + BEACON / 2, 0]} renderOrder={7} userData={{ base: 0.7 }}>
              <cylinderGeometry args={[2.8, 4.6, BEACON, 16, 1, true]} />
              <meshBasicMaterial color={MARK.alarm} transparent depthTest={false} depthWrite={false} />
            </mesh>
            <pointLight color={MARK.alarm} intensity={70} distance={70} position={[0, target.size.h * 0.6, 0]} />
          </group>
        );
      })}
    </group>
  );
}

/**
 * 建てられる区画の光。更地でも、何をすればよいかが街の上で分かるようにする。
 *
 * 縁だけを光らせて、街の絵を隠さない。息をするようにゆっくり明滅させる。
 */
function Sites({
  layout,
  animate,
  onPick,
}: {
  layout: CityLayout;
  animate: boolean;
  onPick: ((id: string) => void) | undefined;
}) {
  const glow = useRef<Group>(null);
  useFrame((state) => {
    const group = glow.current;
    if (group === null) return;
    const pulse = animate ? 0.4 + 0.24 * (1 + Math.sin(state.clock.elapsedTime * 1.6)) : 0.6;
    for (const child of group.children) {
      const mesh = child as Mesh;
      const material = mesh.material as MeshBasicMaterial | undefined;
      if (material !== undefined) material.opacity = pulse * (mesh.userData.dim === true ? 0.5 : 1);
    }
  });

  return (
    <group ref={glow} userData={{ name: 'sites' }}>
      {layout.sites.map((site) => (
        <mesh
          key={site.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[site.at.x, 0.7, site.at.z]}
          userData={{ dim: !site.buildable }}
          onClick={(event) => {
            if (!site.buildable) return;
            event.stopPropagation();
            onPick?.(site.id);
          }}
        >
          <planeGeometry args={[site.w * 0.9, site.d * 0.9]} />
          <meshBasicMaterial
            color={site.buildable ? SITE.glow : SITE.idle}
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      ))}
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
    <group userData={{ name: 'overlay' }}>
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

/**
 * コマンドの旅を走る光の粒。
 *
 * 打った 1 行が街のどこに効いたのかを、道の上を走る光で見せる。
 * 停留所に着くたびに粒の色が変わり、札に「ここで何が起きたか」を 1 行で出す。
 * 位置は経った秒数だけで決まる（`journey.ts` の純粋関数）。ここは描くだけ。
 *
 * 進み方は外から渡される（止める・速さ・1 段ずつ）。
 * 着いた停留所が変わるたびに `onStop` で知らせる。帯の印はそれで動く。
 */
function Spark({
  route,
  play,
  animate,
  chase,
  onStop,
  onDone,
}: {
  route: CartRoute;
  play: JourneyPlay;
  animate: boolean;
  /** カメラが追う点。毎フレームここに粒の場所を書く */
  chase: MutableRefObject<Vec2 | null>;
  onStop: (index: number) => void;
  /** 粒が終点に着いたとき */
  onDone?: () => void;
}) {
  const mote = useRef<Group>(null);
  const tail = useRef<Group>(null);
  /** 旅が始まってから経った秒数 */
  const at = useRef(0);
  const stepped = useRef(play.step);
  const shown = useRef(-1);
  /** 終点に着いたことを、もう知らせたか */
  const finished = useRef(false);
  const total = routeSeconds(route);
  const first = route.stops[0];
  const [load, setLoad] = useState(() => ({
    cargo: first?.cargo ?? 'sheet',
    cargoLabel: first?.cargoLabel ?? '',
    stop: first?.label ?? '',
  }));
  const held = useRef(load);

  useEffect(() => {
    at.current = 0;
    shown.current = -1;
    finished.current = false;
    held.current = { cargo: first?.cargo ?? 'sheet', cargoLabel: first?.cargoLabel ?? '', stop: first?.label ?? '' };
    setLoad(held.current);
    // 旅が変われば最初から走り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  // 旅が終わったらカメラを放す。粒が消えたあとも街が固まらないようにする
  useEffect(
    () => () => {
      chase.current = null;
    },
    [chase],
  );

  useFrame((_state, delta) => {
    const group = mote.current;
    if (group === null) return;
    if (play.step !== stepped.current) {
      // 1 段ずつ進める。次の停留所に着いた所で止める
      stepped.current = play.step;
      at.current = stepTo(at.current, route.stops.length);
    } else if (play.playing && animate) {
      at.current = Math.min(total, at.current + delta * play.rate);
    } else if (!animate) {
      at.current = total;
    }
    const spot = cartAt(route, at.current);
    group.position.set(spot.at.x, CART_LIFT + MOTE_LIFT, spot.at.z);
    // 旅の間だけカメラを連れて行く。着いてしまえば放し、街を自由に見られるようにする
    chase.current = spot.done ? null : spot.at;
    if (spot.done && !finished.current) {
      finished.current = true;
      onDone?.();
    }
    // 尾。少し前の位置をなぞる
    const trail = tail.current;
    if (trail !== null) {
      trail.children.forEach((child, i) => {
        const back = cartAt(route, Math.max(0, at.current - (i + 1) * 0.09));
        child.position.set(back.at.x - spot.at.x, 0, back.at.z - spot.at.z);
      });
    }
    const here = spot.done
      ? route.stops[route.stops.length - 1]
      : route.stops[spot.loading ? spot.leg + 1 : spot.leg];
    const next = { cargo: spot.cargo, cargoLabel: spot.cargoLabel, stop: here?.label ?? '' };
    if (held.current.cargo !== next.cargo || held.current.stop !== next.stop) {
      held.current = next;
      setLoad(next);
    }
    const reached = reachedStop(at.current, route.stops.length);
    if (reached !== shown.current) {
      shown.current = reached;
      onStop(reached);
    }
  });

  const color = SPARK[load.cargo];
  return (
    <group ref={mote} userData={{ name: 'spark' }}>
      {/*
        芯。いちばん明るい所。
        建物の陰に入っても見えるようにする。いまどこを通っているのかを見失うと、
        旅路そのものが伝わらないため。
      */}
      <mesh renderOrder={10}>
        <sphereGeometry args={[2.6, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      {/* 光の被り。周りへにじむ */}
      <mesh renderOrder={9}>
        <sphereGeometry args={[6.5, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthTest={false} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={90} distance={60} />
      <group ref={tail}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} renderOrder={8}>
            <sphereGeometry args={[2 - i * 0.35, 10, 8]} />
            <meshBasicMaterial
              color={SPARK.trail}
              transparent
              opacity={0.5 - i * 0.1}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <Html position={[0, 5.2, 0]} center distanceFactor={140} zIndexRange={[28, 0]}>
        <div
          data-testid="city-3d-cargo"
          style={{
            whiteSpace: 'nowrap',
            padding: '4px 9px',
            borderRadius: 5,
            background: MARK.plate,
            border: `1px solid ${MARK.plateEdge}`,
            color: MARK.plateText,
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 700, color }}>{load.cargoLabel}</span>
          <span style={{ color: MARK.plateSub }}>{` ${load.stop}`}</span>
        </div>
      </Html>
    </group>
  );
}

export default function CityScene({
  layout, onCommand, onSelect, onSite, selected = null, animate = true, rate = 1, rush = 0, view = null, district = null,
  showSites = true, time, journey = null, tour = null, trouble = null,
  journeyPlay = { playing: true, rate: 1, step: 0 }, onJourneyStop,
}: Props) {
  // 光の粒のいる場所。毎フレーム書き換わるので、React の状態にはしない
  const chase = useRef<Vec2 | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  // 粒が終点まで着いた旅。着いたらカメラを粒から放し、障害の所へ戻せる
  const [landed, setLanded] = useState<string | null>(null);
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

  // ツアー中は、いま案内している施設に寄って光らせる。選んでいる建物より案内を優先する
  useEffect(() => {
    if (tour === null) return;
    const at = targets.find((t) => t.id === tour)?.at;
    if (at !== undefined) setFocus(at);
  }, [tour, targets]);


  const marked = targets.find((t) => t.id === (tour ?? selected)) ?? null;
  // 止まっている建物。模型が壊れていると言った所だけが赤く光る
  // 障害として見つかった所（壊れた荷物を抱えたビルなど）も、原因の場所として赤く光らせる
  const hurt = useMemo(() => {
    const ill = new Set(layout.buildings.filter((b) => b.state === 'broken').map((b) => b.id));
    if (trouble !== null) ill.add(trouble);
    return targets.filter((t) => ill.has(t.id));
  }, [targets, layout, trouble]);
  // 塞がれた道。建物の間に柵を立てる
  const cuts = useMemo(() => cutsOf(layout), [layout]);
  // 打ったコマンドの旅。停留所が街に揃っていなければ道のりにならない
  const route = useMemo(() => (journey === null ? null : routeOf(journey, layout.buildings)), [journey, layout]);
  // 障害が起きたら、そこへ寄る。赤い光がどこに立ったかを、街の中から探させない。
  // コマンドの旅でカメラが粒を追っていった後も、旅が終われば原因の所へ戻る。
  // 時間が進むたびに寄り直すと、学習者が自分で見に行った所から引き戻してしまうので、
  // 寄るのは「障害が変わったとき」と「旅が終わったとき」だけにする
  const targetsNow = useRef(targets);
  targetsNow.current = targets;
  const traveling = route !== null && landed !== route.id;
  useEffect(() => {
    if (trouble === null || traveling) return;
    const at = targetsNow.current.find((t) => t.id === trouble)?.at;
    // 同じ場所でも寄り直せるよう、新しい点として渡す
    if (at !== undefined) setFocus({ x: at.x, z: at.z });
  }, [trouble, traveling]);

  // 台帳が読み上げた答えにあたる建物。旅を見せている間だけ光らせる
  const answered = useMemo(() => {
    const asked = new Set(journey?.highlight ?? []);
    return asked.size === 0 ? [] : targets.filter((t) => asked.has(t.id));
  }, [journey, targets]);

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
        <City layout={layout} animate={animate} rate={rate} rush={rush} time={time} onPick={pick} />
        <Overlay layout={layout} view={view} />
        {showSites ? <Sites layout={layout} animate={animate} onPick={onSite} /> : null}
        {answered.length === 0 ? null : <Answered targets={answered} answer={journey?.answer ?? null} animate={animate} />}
        {hurt.length === 0 ? null : <Trouble targets={hurt} animate={animate} />}
        {cuts.length === 0 ? null : <Barricades cuts={cuts} animate={animate} />}
        {marked === null ? null : <Marker target={marked} animate={animate} />}
        {route === null ? null : (
          <Spark
            key={route.id}
            route={route}
            play={journeyPlay}
            animate={animate}
            chase={chase}
            onStop={(index) => {
              onJourneyStop?.(index);
            }}
            onDone={() => {
              setLanded(route.id);
            }}
          />
        )}
        <Look
          target={focus}
          animate={animate}
          distance={distance}
          chase={chase}
          {...(tour === null && trouble === null ? {} : { closeUp: TOUR_DISTANCE, seconds: TOUR_SECONDS })}
        />
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

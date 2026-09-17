import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildingKind } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import {
  applyTool, facilityRadius, hash, HIGHWAY_ROW, idx, SIZE, toolArea,
  type CityAnalysis, type CitySave, type FacilityInfo, type Point, type Tool, type ToolResult,
} from '@/engines/city/sim';

/**
 * 市長の街の 3D 表示（three.js）。React から切り離した描画だけの層。
 * 地面・水・林・道路・区画・建物・施設・車・昼夜・影を描き、ドラッグで道具を使う。
 */

export interface FacilityView {
  id: string;
  name: string;
  kind: BuildingKind;
  ratio: number;
}

export interface WorldInput {
  track: MissionTrack;
  terrain: string;
  save: CitySave;
  analysis: CityAnalysis;
  facilities: readonly FacilityView[];
  infos: readonly FacilityInfo[];
}

export interface WorldCallbacks {
  onApply: (from: Point, to: Point) => void;
  onInspect: (point: Point) => void;
  /** 下見の結果を、カーソルの横に出す短い文にする */
  describe: (result: ToolResult, tool: Tool) => string;
}

export interface World {
  update: (input: WorldInput) => void;
  setTool: (tool: Tool, placing: string | null) => void;
  setSelected: (facilityId: string | null) => void;
  /** 施設のある場所へカメラを向ける */
  lookAt: (facilityId: string) => void;
  dispose: () => void;
}

export const TRACK_ACCENT: Record<MissionTrack, string> = {
  kernel: '#3f9a6e',
  git: '#e0703a',
  github: '#7a63d6',
  k8s: '#2f82d6',
  net: '#d9a52b',
};

const TILE_PX = 16;
const MAX_TILES = SIZE * SIZE;
const DAY_MS = 180_000;

const toWorld = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x - SIZE / 2 + 0.5, 0, y - SIZE / 2 + 0.5);

const R_COLORS = ['#f3e7d3', '#e9cfa9', '#dcae86', '#cfd8de', '#f6f2ea', '#e3d5c3'];
const C_COLORS = ['#9cc2dc', '#7ea9cb', '#b9d5e5', '#6f96b8', '#a7b7c9'];
const I_COLORS = ['#bdb4a2', '#a9a69c', '#cdbb8e', '#9fa7a9'];
const CAR_COLORS = ['#d94f3d', '#f2f2f2', '#2f5d9a', '#232323', '#e3b33b', '#7a8c99', '#3e8c5a'];

const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length] as T;

/** 段階ごとの高さ */
const HEIGHT: Record<'R' | 'C' | 'I', readonly number[]> = {
  R: [0, 0.45, 1.0, 2.6, 5.2],
  C: [0, 0.7, 1.5, 3.6, 7.4],
  I: [0, 0.7, 1.0, 1.4, 1.9],
};

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** 底面が y=0 に来る箱 */
function baseBox(w = 1, h = 1, d = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

interface Car {
  from: number;
  to: number;
  t: number;
  speed: number;
  step: number;
  color: THREE.Color;
}

export function createWorld(host: HTMLElement, callbacks: WorldCallbacks): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);

  const labels = document.createElement('div');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  host.appendChild(labels);
  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;pointer-events:none;padding:2px 8px;border-radius:4px;background:rgba(20,28,36,.85);color:#fff;font:600 12px system-ui;white-space:nowrap;display:none';
  host.appendChild(tooltip);

  const scene = new THREE.Scene();
  const sky = new THREE.Color('#bfdcef');
  scene.background = sky.clone();
  scene.fog = new THREE.Fog(sky.clone(), 120, 260);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(-12, 26, 30);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 6;
  controls.maxDistance = 110;
  controls.maxPolarAngle = 1.32;
  controls.screenSpacePanning = false;
  controls.target.set(-2, 0, 1);
  // 触られるまでは、枠の縦横に合わせて街全体が収まる距離に置く
  let userMoved = false;
  controls.addEventListener('start', () => {
    userMoved = true;
  });
  const viewDirection = new THREE.Vector3(-5, 26, 27).normalize();
  const fitCamera = (): void => {
    if (userMoved) return;
    const aspect = camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // 縦に収める距離と、横に収める距離の大きい方
    const distance = Math.min(controls.maxDistance, Math.max((SIZE * 0.62) / tan, (SIZE * 0.56) / (tan * aspect)));
    camera.position.copy(controls.target).addScaledVector(viewDirection, distance);
  };
  controls.listenToKeyEvents(renderer.domElement);
  controls.keyPanSpeed = 20;
  renderer.domElement.tabIndex = 0;

  const hemi = new THREE.HemisphereLight('#dfefff', '#6c7a4a', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // 地面：街の外の野山と、街の土地（マスごとに色を塗った絵）
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#7c9a5a', roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.04;
  outer.receiveShadow = true;
  scene.add(outer);
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = SIZE * TILE_PX;
  groundCanvas.height = SIZE * TILE_PX;
  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // 街の外から入ってくる幹線道路
  const highway = new THREE.Mesh(baseBox(60, 0.05, 1.4), new THREE.MeshStandardMaterial({ color: '#3f4348', roughness: 0.9 }));
  highway.position.copy(toWorld(-30.5, HIGHWAY_ROW));
  highway.receiveShadow = true;
  const highwayLine = new THREE.Mesh(baseBox(60, 0.01, 0.06), new THREE.MeshStandardMaterial({ color: '#e8c547' }));
  highwayLine.position.copy(toWorld(-30.5, HIGHWAY_ROW)).setY(0.05);
  scene.add(highway, highwayLine);
  // 川の水面
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#3f86b8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
  const water = instanced(new THREE.BoxGeometry(1, 0.02, 1), waterMaterial, MAX_TILES, false);
  scene.add(water);

  const white = (color: string, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
  const colored = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });

  const roads = instanced(baseBox(1, 0.05, 1), white('#4a4f55', 0.9), MAX_TILES, false);
  const marks = instanced(baseBox(0.34, 0.01, 0.05), white('#f1efe6'), MAX_TILES * 2, false);
  const pillars = instanced(baseBox(0.18, 1, 0.18), white('#9a9a94'), MAX_TILES);
  const bodies = instanced(baseBox(), colored(), MAX_TILES);
  const roofGeometry = new THREE.ConeGeometry(0.62, 0.42, 4);
  roofGeometry.rotateY(Math.PI / 4);
  roofGeometry.translate(0, 0.21, 0);
  const roofs = instanced(roofGeometry, colored(), MAX_TILES);
  const windowMaterial = new THREE.MeshStandardMaterial({ color: '#2d3d4d', roughness: 0.3, metalness: 0.4, emissive: '#ffcf7a', emissiveIntensity: 0 });
  const windows = instanced(baseBox(1, 0.12, 1), windowMaterial, 14000, false);
  const chimneys = instanced(new THREE.CylinderGeometry(0.08, 0.11, 1, 8).translate(0, 0.5, 0), white('#8d8a84'), MAX_TILES);
  const trunks = instanced(new THREE.CylinderGeometry(0.03, 0.05, 0.3, 5).translate(0, 0.15, 0), white('#6b4a2f'), 4000);
  const crowns = instanced(new THREE.IcosahedronGeometry(0.26, 0).translate(0, 0.45, 0), colored(), 4000);
  const lots = instanced(baseBox(0.94, 0.02, 0.94), colored(), MAX_TILES, false);
  scene.add(roads, marks, pillars, bodies, roofs, windows, chimneys, trunks, crowns, lots);

  const carMesh = instanced(baseBox(0.2, 0.13, 0.36), colored(), 80);
  scene.add(carMesh);

  const previewMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
  const preview = instanced(baseBox(0.96, 0.1, 0.96), previewMaterial, MAX_TILES, false);
  preview.renderOrder = 2;
  scene.add(preview);

  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.CircleGeometry(1, 64), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.visible = false;
  scene.add(ring);

  const facilityGroup = new THREE.Group();
  scene.add(facilityGroup);

  let input: WorldInput | null = null;
  let tool: Tool = 'inspect';
  let placing: string | null = null;
  let selected: string | null = null;
  let cars: Car[] = [];
  let connectedRoads: number[] = [];
  const labelEls = new Map<string, { el: HTMLDivElement; pos: THREE.Vector3 }>();

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  const put = (mesh: THREE.InstancedMesh, i: number, p: THREE.Vector3, s: THREE.Vector3, c?: string | THREE.Color, rotY = 0): void => {
    quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
    matrix.compose(p, quat, s);
    mesh.setMatrixAt(i, matrix);
    if (c !== undefined) mesh.setColorAt(i, typeof c === 'string' ? color.set(c) : c);
  };
  const finish = (mesh: THREE.InstancedMesh, count: number): void => {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  /* ---------- 地面の絵 ---------- */
  function paintGround(): void {
    if (!input) return;
    const ctx = groundCanvas.getContext('2d');
    if (!ctx) return;
    const { terrain, save, analysis } = input;
    const zoneTool = tool === 'res' || tool === 'com' || tool === 'ind';
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const i = idx(x, y);
        const tile = save.tiles[i];
        const h = hash(7, x, y) % 12;
        let fill = `hsl(${String(92 + (h % 6))}, ${String(34 + (h % 5))}%, ${String(44 + (h % 4))}%)`;
        if (terrain[i] === 'w') fill = '#2f6f9c';
        else if (tile === 'r') fill = '#6b6e70';
        else if (tile === 'p') fill = '#6fb556';
        else if (tile === 'F') fill = '#cfc6b4';
        else if (tile === 'R' || tile === 'C' || tile === 'I') {
          const built = Number(save.levels[i]) > 0;
          const tint = tile === 'R' ? '#8fd17a' : tile === 'C' ? '#7fb6e6' : '#e6cf6a';
          fill = built ? '#bdb7a8' : tint;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
        if (tile === 'R' || tile === 'C' || tile === 'I') {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.strokeRect(x * TILE_PX + 0.5, y * TILE_PX + 0.5, TILE_PX - 1, TILE_PX - 1);
        }
        // 区画を塗る道具のときは、塗れる範囲を明るくする
        if (zoneTool && analysis.access[i] === 1 && tile === '.' && terrain[i] !== 'w') {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
        }
      }
    }
    groundTexture.needsUpdate = true;
  }

  /* ---------- 街を組み立てる ---------- */
  function rebuild(): void {
    if (!input) return;
    const { terrain, save, analysis } = input;
    let nRoad = 0;
    let nMark = 0;
    let nPillar = 0;
    let nBody = 0;
    let nRoof = 0;
    let nWin = 0;
    let nChim = 0;
    let nTree = 0;
    let nLot = 0;
    let nWater = 0;
    const isRoad = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SIZE && y < SIZE && save.tiles[idx(x, y)] === 'r';
    const tree = (x: number, y: number, seed: number, size = 1): void => {
      if (nTree >= 3990) return;
      const p = toWorld(x, y);
      p.x += ((seed % 60) - 30) / 100;
      p.z += (((seed >>> 6) % 60) - 30) / 100;
      const s = size * (0.8 + ((seed >>> 12) % 50) / 100);
      put(trunks, nTree, p, scale.set(s, s, s));
      put(crowns, nTree, p, scale.set(s, s, s), `hsl(${String(100 + ((seed >>> 3) % 30))}, 40%, ${String(28 + ((seed >>> 9) % 12))}%)`);
      nTree += 1;
    };

    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const i = idx(x, y);
        const tile = save.tiles[i];
        const seed = hash(11, x, y);
        const wet = terrain[i] === 'w';
        if (wet) {
          put(water, nWater, toWorld(x, y).setY(-0.02), scale.set(1, 1, 1));
          nWater += 1;
        }
        if (tile === 'r') {
          const lift = wet ? 0.28 : 0;
          put(roads, nRoad, toWorld(x, y).setY(lift), scale.set(1, 1, 1));
          nRoad += 1;
          if (wet) {
            put(pillars, nPillar, toWorld(x, y).setY(-0.3), scale.set(1, 0.6, 1));
            nPillar += 1;
          }
          const h = isRoad(x - 1, y) || isRoad(x + 1, y);
          const v = isRoad(x, y - 1) || isRoad(x, y + 1);
          if (h !== v || (!h && !v)) {
            put(marks, nMark, toWorld(x, y).setY(lift + 0.05), scale.set(1, 1, 1), undefined, v ? Math.PI / 2 : 0);
            nMark += 1;
          }
          continue;
        }
        if (tile === '.' && terrain[i] === 't') {
          const count = 1 + (seed % 3);
          for (let k = 0; k < count; k += 1) tree(x, y, hash(seed, k));
          continue;
        }
        if (tile === 'p') {
          for (let k = 0; k < 3; k += 1) tree(x, y, hash(seed, k), 1.1);
          continue;
        }
        if (tile !== 'R' && tile !== 'C' && tile !== 'I') continue;
        const level = Number(save.levels[i]);
        if (level === 0) continue;
        put(lots, nLot, toWorld(x, y).setY(0.005), scale.set(1, 1, 1), tile === 'R' ? '#c9c2b0' : tile === 'C' ? '#b7b9bb' : '#aaa497');
        nLot += 1;
        const jitter = 0.85 + (seed % 30) / 100;
        const height = (HEIGHT[tile][level] ?? 1) * jitter;
        const foot = tile === 'I' ? 0.86 : level === 1 ? 0.58 : level === 2 ? 0.7 : 0.78;
        const bodyColor = tile === 'R' ? pick(R_COLORS, seed) : tile === 'C' ? pick(C_COLORS, seed) : pick(I_COLORS, seed);
        const p = toWorld(x, y);
        // 道路のある側に寄せて建てる
        if (tile !== 'I' && level <= 2) {
          if (isRoad(x, y + 1)) p.z += 0.12;
          else if (isRoad(x, y - 1)) p.z -= 0.12;
          else if (isRoad(x + 1, y)) p.x += 0.12;
          else if (isRoad(x - 1, y)) p.x -= 0.12;
        }
        put(bodies, nBody, p, scale.set(foot, height, foot), bodyColor);
        nBody += 1;
        if (tile === 'R' && level <= 2) {
          put(roofs, nRoof, p.clone().setY(height), scale.set(foot * 1.25, 1, foot * 1.25), pick(['#a3503a', '#6d4c3d', '#4d5a6a', '#8a3b2f'], seed >>> 4));
          nRoof += 1;
          if (level === 1 && seed % 3 === 0) tree(x, y, hash(seed, 99), 0.7);
        } else if (tile === 'I') {
          if (level >= 2) {
            put(chimneys, nChim, p.clone().add(new THREE.Vector3(0.22, height, 0.22)), scale.set(1, 0.6 + level * 0.25, 1));
            nChim += 1;
          }
        } else {
          // 窓の帯（夜は明かりがつく）
          const floors = Math.floor(height / 0.42);
          for (let f = 1; f < floors && nWin < 13990; f += 1) {
            put(windows, nWin, p.clone().setY(f * 0.42 - 0.06), scale.set(foot + 0.02, 1, foot + 0.02));
            nWin += 1;
          }
        }
      }
    }
    finish(roads, nRoad);
    finish(marks, nMark);
    finish(pillars, nPillar);
    finish(bodies, nBody);
    finish(roofs, nRoof);
    finish(windows, nWin);
    finish(chimneys, nChim);
    finish(trunks, nTree);
    finish(crowns, nTree);
    finish(lots, nLot);
    finish(water, nWater);

    rebuildFacilities();
    resetCars(analysis);
    paintGround();
    updateRing();
  }

  function rebuildFacilities(): void {
    if (!input) return;
    for (const child of [...facilityGroup.children]) {
      facilityGroup.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
      });
    }
    for (const { el } of labelEls.values()) el.remove();
    labelEls.clear();
    const accent = TRACK_ACCENT[input.track];
    for (const placed of input.save.facilities) {
      const view = input.facilities.find((f) => f.id === placed.id);
      if (!view) continue;
      const group = facilityModel(view.kind, accent, view.ratio);
      const center = toWorld(placed.x, placed.y).add(new THREE.Vector3(0.5, 0, 0.5));
      group.position.copy(center);
      group.userData = { id: placed.id };
      facilityGroup.add(group);
      const el = document.createElement('div');
      el.textContent = `${view.ratio >= 1 ? '★ ' : ''}${view.name}`;
      el.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:1px 7px;border-radius:9px;background:rgba(255,255,255,.9);border:2px solid ${accent};color:#1d252c;font:700 11px system-ui;white-space:nowrap`;
      labels.appendChild(el);
      labelEls.set(placed.id, { el, pos: center.clone().setY(2.6 + view.ratio * 1.2) });
    }
  }

  function updateRing(): void {
    const id = placing ?? selected;
    if (!input || id === null) {
      ring.visible = false;
      return;
    }
    const placed = input.save.facilities.find((f) => f.id === id);
    const view = input.facilities.find((f) => f.id === id);
    if (!placed || !view) {
      ring.visible = false;
      return;
    }
    const r = facilityRadius(view.ratio);
    ring.visible = true;
    ring.scale.set(r, r, 1);
    ring.position.copy(toWorld(placed.x, placed.y).add(new THREE.Vector3(0.5, 0.08, 0.5)));
  }

  /* ---------- 車 ---------- */
  function resetCars(analysis: CityAnalysis): void {
    if (!input) return;
    const save = input.save;
    connectedRoads = [];
    for (let i = 0; i < MAX_TILES; i += 1) if (analysis.connected[i] === 1) connectedRoads.push(i);
    const want = Math.min(80, Math.floor(connectedRoads.length / 2), 3 + Math.floor(analysis.population / 12));
    const next: Car[] = [];
    for (let k = 0; k < want; k += 1) {
      const existing = cars[k];
      if (existing && save.tiles[existing.from] === 'r' && save.tiles[existing.to] === 'r') {
        next.push(existing);
        continue;
      }
      const from = connectedRoads[hash(k, 5) % connectedRoads.length] ?? idx(0, HIGHWAY_ROW);
      next.push({ from, to: from, t: 1, speed: 1.2 + (hash(k, 9) % 100) / 100, step: k * 31, color: new THREE.Color(pick(CAR_COLORS, hash(k, 3))) });
    }
    cars = next;
  }

  function moveCars(dt: number): void {
    if (!input) return;
    const tiles = input.save.tiles;
    const terrain = input.terrain;
    let n = 0;
    for (const car of cars) {
      car.t += dt * car.speed;
      if (car.t >= 1) {
        const x = car.to % SIZE;
        const y = Math.floor(car.to / SIZE);
        const options = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
          .map(([dx = 0, dy = 0]) => ({ x: x + dx, y: y + dy }))
          .filter((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && tiles[idx(p.x, p.y)] === 'r')
          .map((p) => idx(p.x, p.y));
        const forward = options.filter((o) => o !== car.from);
        const choices = forward.length > 0 ? forward : options;
        car.step += 1;
        const nextTile = choices[hash(car.step, car.to) % Math.max(1, choices.length)];
        car.from = car.to;
        car.to = nextTile ?? car.to;
        car.t = 0;
      }
      const ax = car.from % SIZE;
      const ay = Math.floor(car.from / SIZE);
      const bx = car.to % SIZE;
      const by = Math.floor(car.to / SIZE);
      const dx = bx - ax;
      const dy = by - ay;
      const a = toWorld(ax, ay);
      const b = toWorld(bx, by);
      pos.lerpVectors(a, b, car.t);
      // 左側通行
      pos.x += dy * 0.2;
      pos.z -= dx * 0.2;
      const onBridge = terrain[car.t < 0.5 ? car.from : car.to] === 'w';
      pos.y = 0.05 + (onBridge ? 0.28 : 0);
      const rot = dx === 0 && dy === 0 ? 0 : Math.atan2(dx, dy);
      put(carMesh, n, pos, scale.set(1, 1, 1), car.color, rot);
      n += 1;
    }
    finish(carMesh, n);
  }

  /* ---------- 道具（ドラッグ） ---------- */
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let dragFrom: Point | null = null;
  let downAt: { x: number; y: number } | null = null;

  function tileAt(event: PointerEvent): Point | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const x = Math.floor(hit.x + SIZE / 2);
    const y = Math.floor(hit.z + SIZE / 2);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return { x, y };
  }

  function showPreview(from: Point, to: Point, event: PointerEvent): void {
    if (!input) return;
    const area = toolArea(tool, from, to);
    const result = applyTool(input.save, input.terrain, tool, from, to, input.infos, placing ?? undefined);
    const bad = result.error !== undefined && result.error !== 'nothing';
    const tint =
      bad ? '#e0483a'
      : tool === 'road' ? '#dfe6ee'
      : tool === 'res' ? '#5fd35a'
      : tool === 'com' ? '#4aa3f0'
      : tool === 'ind' ? '#f0c53a'
      : tool === 'bulldoze' ? '#ff6b4a'
      : '#7ee37a';
    previewMaterial.color.set(tint);
    area.forEach((p, k) => {
      put(preview, k, toWorld(p.x, p.y).setY(0.03), scale.set(1, tool === 'facility' ? 8 : 1, 1));
    });
    finish(preview, area.length);
    const text = callbacks.describe(result, tool);
    const rect = renderer.domElement.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.style.display = text === '' ? 'none' : 'block';
    tooltip.style.left = `${String(event.clientX - rect.left + 14)}px`;
    tooltip.style.top = `${String(event.clientY - rect.top + 14)}px`;
    if (tool === 'facility' && placing !== null) {
      const view = input.facilities.find((f) => f.id === placing);
      const r = facilityRadius(view?.ratio ?? 0);
      ring.visible = true;
      ring.scale.set(r, r, 1);
      ring.position.copy(toWorld(to.x, to.y).add(new THREE.Vector3(0.5, 0.08, 0.5)));
    }
  }

  function clearPreview(): void {
    finish(preview, 0);
    tooltip.style.display = 'none';
    updateRing();
  }

  const onDown = (event: PointerEvent): void => {
    downAt = { x: event.clientX, y: event.clientY };
    if (event.button !== 0 || tool === 'inspect') return;
    const p = tileAt(event);
    if (!p) return;
    dragFrom = p;
    renderer.domElement.setPointerCapture(event.pointerId);
    showPreview(p, p, event);
  };
  const onMove = (event: PointerEvent): void => {
    if (tool === 'inspect') return;
    const p = tileAt(event);
    if (!p) {
      if (!dragFrom) clearPreview();
      return;
    }
    showPreview(dragFrom ?? p, p, event);
  };
  const onUp = (event: PointerEvent): void => {
    const moved = downAt !== null && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5;
    downAt = null;
    if (event.button !== 0) return;
    const p = tileAt(event);
    if (tool === 'inspect') {
      if (!moved && p) callbacks.onInspect(p);
      return;
    }
    if (dragFrom && p) callbacks.onApply(dragFrom, p);
    dragFrom = null;
    if (p) showPreview(p, p, event);
  };
  const onLeave = (): void => {
    if (!dragFrom) clearPreview();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  function applyControls(): void {
    controls.mouseButtons = {
      LEFT: tool === 'inspect' ? THREE.MOUSE.PAN : null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }
  applyControls();

  /* ---------- 大きさと描画 ---------- */
  const resize = (): void => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  };
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(host);

  const daySky = new THREE.Color('#bfdcef');
  const duskSky = new THREE.Color('#f0b48a');
  const nightSky = new THREE.Color('#16223a');
  let last = performance.now();
  let frame = 0;
  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    controls.update();
    // 見ている先が街から離れすぎないように
    controls.target.x = Math.max(-SIZE / 2, Math.min(SIZE / 2, controls.target.x));
    controls.target.z = Math.max(-SIZE / 2, Math.min(SIZE / 2, controls.target.z));
    controls.target.y = 0;

    // 昼と夜（0.0 = 朝、0.5 = 夕方、0.75 = 真夜中）
    const phase = (now % DAY_MS) / DAY_MS;
    const elevation = Math.sin(phase * Math.PI * 2 + 0.35);
    const daylight = Math.max(0, Math.min(1, elevation * 2 + 0.35));
    const angle = phase * Math.PI * 2;
    sun.position.set(Math.cos(angle) * 40, 12 + Math.max(0.1, elevation) * 40, Math.sin(angle) * 22 + 12);
    sun.intensity = 0.25 + 2.1 * daylight;
    hemi.intensity = 0.35 + 0.6 * daylight;
    const skyNow = daylight > 0.5 ? duskSky.clone().lerp(daySky, (daylight - 0.5) * 2) : nightSky.clone().lerp(duskSky, daylight * 2);
    (scene.background as THREE.Color).copy(skyNow);
    (scene.fog as THREE.Fog).color.copy(skyNow);
    windowMaterial.emissiveIntensity = (1 - daylight) * 1.4;

    moveCars(dt);
    for (const { el, pos: at } of labelEls.values()) {
      const v = at.clone().project(camera);
      const visible = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      el.style.display = visible ? 'block' : 'none';
      if (visible) {
        el.style.transform = `translate(${String(((v.x + 1) / 2) * host.clientWidth)}px, ${String(((1 - v.y) / 2) * host.clientHeight)}px) translate(-50%, -100%)`;
      }
    }
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return {
    update(next) {
      input = next;
      rebuild();
    },
    setTool(nextTool, nextPlacing) {
      tool = nextTool;
      placing = nextPlacing;
      dragFrom = null;
      applyControls();
      clearPreview();
      paintGround();
      renderer.domElement.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair';
    },
    setSelected(id) {
      selected = id;
      updateRing();
    },
    lookAt(id) {
      const placed = input?.save.facilities.find((f) => f.id === id);
      if (!placed) return;
      const target = toWorld(placed.x, placed.y).add(new THREE.Vector3(0.5, 0, 0.5));
      const offset = camera.position.clone().sub(controls.target);
      controls.target.copy(target);
      camera.position.copy(target).add(offset);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          (o.geometry as THREE.BufferGeometry).dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((mat) => {
            mat.dispose();
          });
        }
      });
      groundTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
      tooltip.remove();
    },
  };
}

/* ---------- 施設の建物 ---------- */

function mesh(geometry: THREE.BufferGeometry, color: string, opts: { rough?: number; metal?: number; y?: number } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0 }));
  m.castShadow = true;
  m.receiveShadow = true;
  if (opts.y !== undefined) m.position.y = opts.y;
  return m;
}

/**
 * 施設の建物。2×2 マスの広場の上に、種類ごとの形で建つ。
 * 稼働率が上がると大きく立派になり、まだ稼働していなければ足場とクレーンが立つ。
 */
export function facilityModel(kind: BuildingKind, accent: string, ratio: number): THREE.Group {
  const g = new THREE.Group();
  const plaza = mesh(baseBox(1.9, 0.06, 1.9), '#d8d0bf', { rough: 1 });
  g.add(plaza);
  const s = 0.8 + 0.35 * Math.min(1, ratio);
  const body = new THREE.Group();
  body.scale.set(s, s, s);
  g.add(body);
  const add = (m: THREE.Mesh, x = 0, z = 0): void => {
    m.position.x += x;
    m.position.z += z;
    body.add(m);
  };
  const glass = '#8fb3cc';
  const wall = '#efe9dc';
  switch (kind) {
    case 'hall':
      add(mesh(baseBox(1.5, 0.9, 1.0), wall));
      add(mesh(new THREE.SphereGeometry(0.38, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), accent, { y: 0.9 }));
      for (let k = -2; k <= 2; k += 1) add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8).translate(0, 0.4, 0), '#ffffff'), k * 0.3, 0.58);
      break;
    case 'office':
      add(mesh(baseBox(0.9, 2.6, 0.9), glass, { rough: 0.2, metal: 0.5 }));
      add(mesh(baseBox(0.95, 0.12, 0.95), accent, { y: 2.6 }));
      break;
    case 'castle':
      add(mesh(baseBox(1.4, 1.0, 1.4), wall));
      add(mesh(baseBox(1.0, 1.4, 1.0), glass, { rough: 0.2, metal: 0.5, y: 1.0 }));
      add(mesh(baseBox(0.6, 1.2, 0.6), accent, { y: 2.4 }));
      break;
    case 'house':
      add(mesh(baseBox(1.2, 0.8, 1.0), wall));
      add(mesh(new THREE.ConeGeometry(0.9, 0.6, 4).rotateY(Math.PI / 4).translate(0, 0.3, 0), accent, { y: 0.8 }));
      break;
    case 'warehouse':
      add(mesh(baseBox(1.7, 0.8, 1.1), '#c9c1ae'));
      add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), accent, { y: 0.8 }));
      break;
    case 'workshop':
    case 'factory':
      add(mesh(baseBox(1.6, 0.8, 1.2), '#bdb6a6'));
      add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.6, 10).translate(0, 0.8, 0), '#8b8780'), 0.5, -0.3);
      if (kind === 'factory') add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.9, 10).translate(0, 0.95, 0), accent), 0.2, -0.3);
      add(mesh(baseBox(1.6, 0.1, 0.2), accent, { y: 0.8 }), 0, 0.5);
      break;
    case 'station':
      add(mesh(baseBox(1.8, 0.25, 0.8), '#b9b4aa'));
      add(mesh(baseBox(1.8, 0.08, 1.0), accent, { y: 0.95 }));
      for (const x of [-0.8, 0, 0.8]) add(mesh(baseBox(0.08, 0.7, 0.08), '#666666', { y: 0.25 }), x, 0);
      add(mesh(baseBox(0.6, 0.9, 0.5), wall), 0, -0.6);
      break;
    case 'bridge':
      add(mesh(baseBox(1.8, 0.12, 0.6), '#9c9a94', { y: 0.5 }));
      add(mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 24, Math.PI), accent, { y: 0.5 }));
      break;
    case 'tower':
      add(mesh(new THREE.CylinderGeometry(0.1, 0.35, 3.2, 6).translate(0, 1.6, 0), '#d8dde2', { metal: 0.4 }));
      add(mesh(new THREE.SphereGeometry(0.22, 12, 8), accent, { y: 3.3 }));
      add(mesh(baseBox(0.8, 0.5, 0.6), wall), 0.5, 0.5);
      break;
    case 'post':
      add(mesh(baseBox(1.3, 0.9, 1.0), wall));
      add(mesh(baseBox(1.4, 0.15, 1.1), '#c8453a', { y: 0.9 }));
      add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6).translate(0, 0.6, 0), '#888888', { y: 1.05 }), 0.5, 0.3);
      add(mesh(baseBox(0.3, 0.18, 0.02), accent, { y: 2.0 }), 0.65, 0.3);
      break;
    case 'library':
      add(mesh(baseBox(1.5, 0.9, 1.1), '#e9e1cf'));
      add(mesh(new THREE.CylinderGeometry(0.01, 1.0, 0.35, 4).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 0.17, 0), accent, { y: 0.9 }));
      for (let k = -2; k <= 2; k += 1) add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8).translate(0, 0.4, 0), '#ffffff'), k * 0.3, 0.6);
      break;
    case 'gate':
      add(mesh(baseBox(0.25, 1.4, 0.4), wall), -0.7, 0);
      add(mesh(baseBox(0.25, 1.4, 0.4), wall), 0.7, 0);
      add(mesh(baseBox(1.7, 0.25, 0.5), accent, { y: 1.4 }));
      add(mesh(baseBox(0.6, 0.6, 0.6), glass, { rough: 0.2 }), 0, -0.6);
      break;
    case 'farm':
      add(mesh(baseBox(1.1, 0.05, 1.6), '#8fbf4a', { rough: 1 }), -0.3, 0);
      add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.3, 16).translate(0, 0.65, 0), wall), 0.6, -0.4);
      add(mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent, { y: 1.3 }), 0.6, -0.4);
      break;
    case 'lab':
      add(mesh(baseBox(1.4, 0.9, 1.1), '#f4f4f2'));
      add(mesh(new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, { rough: 0.15, metal: 0.4, y: 0.9 }));
      add(mesh(baseBox(1.45, 0.1, 1.15), accent, { y: 0.45 }));
      break;
  }
  if (ratio === 0) {
    // まだ稼働していない：足場とクレーン
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.8, 1.8).translate(0, 0.9, 0),
      new THREE.MeshBasicMaterial({ color: '#e0a526', wireframe: true }),
    );
    g.add(frame);
    const mast = mesh(baseBox(0.08, 3.2, 0.08), '#e0a526');
    mast.position.set(0.85, 0, -0.85);
    const jib = mesh(baseBox(1.8, 0.07, 0.07), '#e0a526', { y: 3.2 });
    jib.position.set(0.3, 3.2, -0.85);
    g.add(mast, jib);
  } else if (ratio >= 1) {
    const star = mesh(new THREE.OctahedronGeometry(0.16), '#ffd24a', { metal: 0.6, rough: 0.3 });
    star.position.y = 3.6;
    g.add(star);
  }
  return g;
}

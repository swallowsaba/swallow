import { generateTerrain, type Terrain } from '@/city/terrain';
import { applyOp, type Command } from './commands';
import { heatOf, type HeatFields } from './heat';
import type { World } from './types';
import { weekStep } from './week';
import { stepDayView } from './world';

/**
 * 模擬を動かす入れ物（docs/architecture.md 9.1）。Worker の中と、Worker を作れない時の画面の流れの、両方が同じ物を使う。
 * 命令は受け取った順に当て、日付は画面が「ここまで進める」と言った日まで 1 日ずつ進める。
 */

/** 前に送った物から変わった所だけを送る（世界は書き換えずに作り直すので、変わった所は別の物になる） */
export type WorldPatch = Partial<World>;

export interface StateMessage {
  type: 'state';
  /** 当てた命令の最後の番号 */
  seq: number;
  /** 世界の日付（整数） */
  day: number;
  patch: WorldPatch;
  /** 新しい週の終わりか読み込みの後に、その週のヒートマップの値（docs/ui-design.md 11.1） */
  heat?: HeatFields;
}

const terrains = new Map<number, Terrain>();
export function terrainOf(seed: number): Terrain {
  let t = terrains.get(seed);
  if (!t) {
    t = generateTerrain(seed);
    terrains.clear();
    terrains.set(seed, t);
  }
  return t;
}

export class SimRunner {
  private world: World;
  private seq = 0;
  private sent: Partial<World> = {};
  /** まだ送っていないヒートマップの値 */
  private heat: HeatFields | null = null;

  constructor(world: World) {
    this.world = world;
  }

  get current(): World {
    return this.world;
  }

  get lastSeq(): number {
    return this.seq;
  }

  load(world: World, seq: number): void {
    this.world = world;
    this.seq = seq;
    this.sent = {};
    // 読み込んだ都市のヒートマップは、今の状態から 1 週分の途中の値を計算して作る（世界は変えない）
    this.heat = heatOf(world, weekStep(world, terrainOf(world.city.seed), true).view);
  }

  apply(cmd: Command): void {
    this.world = applyOp(this.world, cmd.op, terrainOf(this.world.city.seed));
    this.seq = cmd.seq;
  }

  /** day まで 1 日ずつ進める（戻すことはしない） */
  advance(day: number): void {
    const terrain = terrainOf(this.world.city.seed);
    while (Math.floor(this.world.city.day) < day) {
      const r = stepDayView(this.world, terrain);
      this.world = r.world;
      if (r.view) this.heat = heatOf(this.world, r.view);
    }
  }

  /** 前に送った時から変わった所 */
  patch(): WorldPatch {
    const out: WorldPatch = {};
    const w = this.world;
    for (const key of Object.keys(w) as (keyof World)[]) {
      if (this.sent[key] !== w[key]) {
        (out as Record<string, unknown>)[key] = w[key];
        (this.sent as Record<string, unknown>)[key] = w[key];
      }
    }
    return out;
  }

  state(): StateMessage {
    const heat = this.heat;
    this.heat = null;
    return { type: 'state', seq: this.seq, day: Math.floor(this.world.city.day), patch: this.patch(), ...(heat ? { heat } : {}) };
  }
}

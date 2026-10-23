import type { Command } from './commands';
import { SimRunner, type StateMessage } from './runner';
import type { World } from './types';

/**
 * 画面から模擬を動かす口（docs/architecture.md 9.1）。
 * 画面は命令と「この日まで進める」を送り、模擬は当てた所までの変わった所（StateMessage）を返す。
 * ブラウザでは Web Worker の中で動かす。Worker を作れない時（テスト・古いブラウザ）は、同じ入れ物を画面と同じ流れで動かす。
 */

export type HostMessage =
  | { type: 'load'; world: World; seq: number }
  | { type: 'cmd'; cmd: Command }
  | { type: 'advance'; day: number };

export interface SimHost {
  /** Worker で動いているか（計測と確かめに使う） */
  readonly inWorker: boolean;
  post: (m: HostMessage) => void;
  /** 模擬からの知らせを受ける。止める関数を返す */
  listen: (fn: (m: StateMessage) => void) => () => void;
  stop: () => void;
}

/** 画面と同じ流れで動かす（受け取ったその場で計算し、その場で知らせる） */
export function directHost(): SimHost {
  let runner: SimRunner | null = null;
  const listeners = new Set<(m: StateMessage) => void>();
  return {
    inWorker: false,
    post: (m) => {
      if (m.type === 'load') {
        runner ??= new SimRunner(m.world);
        runner.load(m.world, m.seq);
      }
      if (!runner) return;
      if (m.type === 'cmd') runner.apply(m.cmd);
      else if (m.type === 'advance') runner.advance(m.day);
      const state = runner.state();
      for (const fn of listeners) fn(state);
    },
    listen: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop: () => listeners.clear(),
  };
}

/** Web Worker で動かす。作れなければ画面と同じ流れで動かす */
export function workerHost(): SimHost {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return directHost();
  }
  const listeners = new Set<(m: StateMessage) => void>();
  worker.onmessage = (e: MessageEvent<StateMessage>) => {
    for (const fn of listeners) fn(e.data);
  };
  return {
    inWorker: true,
    post: (m) => worker.postMessage(m),
    listen: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop: () => {
      listeners.clear();
      worker.terminate();
    },
  };
}

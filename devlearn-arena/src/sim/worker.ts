/// <reference lib="webworker" />
import type { HostMessage } from './host';
import { heatBuffers } from './heat';
import { SimRunner } from './runner';

/**
 * 模擬を Web Worker で動かす入口（docs/architecture.md 9.1）。ここはメッセージを受け渡すだけで、計算は持たない。
 * 受け取った順に、読み込み・命令・日を進めるを当て、変わった所を返す。
 */
declare const self: DedicatedWorkerGlobalScope;

let runner: SimRunner | null = null;

self.onmessage = (e: MessageEvent<HostMessage>) => {
  const m = e.data;
  if (m.type === 'load') runner = new SimRunner(m.world);
  if (!runner) return;
  if (m.type === 'load') runner.load(m.world, m.seq);
  else if (m.type === 'cmd') runner.apply(m.cmd);
  else runner.advance(m.day);
  const state = runner.state();
  // ヒートマップの値は写さずに移す
  self.postMessage(state, state.heat ? heatBuffers(state.heat) : []);
};

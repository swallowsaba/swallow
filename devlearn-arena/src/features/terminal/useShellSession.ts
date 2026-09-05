import { useCallback, useMemo, useReducer } from 'react';
import { createClock, type MutableClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import {
  createJournal, current, isAtLatest, push, seek, type Journal,
} from '@/engines/kernel/journal';
import type { CommandRegistry, ShellState } from '@/engines/kernel/registry';
import { createShellState, type SessionOptions } from '@/engines/kernel/session';
import { execute, type OutputChunk } from '@/engines/kernel/shell';
import { useConst } from './useConst';

export interface ShellSession {
  state: ShellState;
  registry: CommandRegistry;
  clock: MutableClock;
  journal: Journal<ShellState>;
  atLatest: boolean;
  /** 1行実行して出力を返す。状態はジャーナルに積まれる。 */
  run: (line: string) => OutputChunk[];
  /** 現在の状態を同期で取り出す（xterm のコールバックから使う） */
  getState: () => ShellState;
  /** 最新のスナップショット列。再描画を待たずに読める */
  getTimeline: () => ShellState[];
  seekTo: (index: number) => void;
  reset: () => void;
}

/**
 * シェルの実体はミュータブルな ref に持ち、React には再描画の合図だけを送る。
 * xterm のイベントハンドラは長寿命なので、state を閉じ込めると古い値を掴むため。
 */
export function useShellSession(options: SessionOptions = {}): ShellSession {
  const registry = useMemo(() => options.registry ?? createDefaultRegistry(), [options.registry]);
  const clock = useConst<MutableClock>(() => createClock(options.tickDurationMs ?? 500));
  // 初回だけ生成する可変ホルダ。毎レンダーで初期状態を作り直さない
  const journalRef = useConst(() => ({
    current: createJournal(createShellState(options), 'initial'),
  }));
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const getState = useCallback(() => current(journalRef.current), [journalRef]);
  const getTimeline = useCallback(
    () => journalRef.current.entries.map((e) => e.state),
    [journalRef],
  );

  const run = useCallback(
    (line: string): OutputChunk[] => {
      const journal = journalRef.current;
      const outcome = execute(current(journal), line, registry, clock);
      journalRef.current = push(journal, outcome.state, line.split('\n')[0] ?? line);
      bump();
      return outcome.chunks;
    },
    [registry, clock, journalRef],
  );

  const seekTo = useCallback(
    (index: number) => {
      journalRef.current = seek(journalRef.current, index);
      bump();
    },
    [journalRef],
  );

  const reset = useCallback(() => {
    journalRef.current = createJournal(createShellState(options), 'initial');
    clock.reset();
    bump();
  }, [options, clock, journalRef]);

  const journal = journalRef.current;
  return {
    state: current(journal),
    registry,
    clock,
    journal,
    atLatest: isAtLatest(journal),
    run,
    getState,
    getTimeline,
    seekTo,
    reset,
  };
}

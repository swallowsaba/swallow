import { useCallback, useMemo, useReducer, useRef } from 'react';
import { createClock, type MutableClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import {
  createJournal, current, isAtLatest, push, seek, type Journal,
} from '@/engines/kernel/journal';
import type { CommandRegistry, ShellState } from '@/engines/kernel/registry';
import { createShellState, type SessionOptions } from '@/engines/kernel/session';
import { execute, type OutputChunk } from '@/engines/kernel/shell';

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
  const clockRef = useRef<MutableClock | null>(null);
  clockRef.current ??= createClock(options.tickDurationMs ?? 500);

  const initial = useRef<ShellState | null>(null);
  initial.current ??= createShellState(options);

  const journalRef = useRef<Journal<ShellState> | null>(null);
  journalRef.current ??= createJournal(initial.current, 'initial');

  const [, bump] = useReducer((n: number) => n + 1, 0);

  const getState = useCallback(() => current(journalRef.current ?? createJournal(createShellState())), []);

  const getTimeline = useCallback(
    () => (journalRef.current?.entries ?? []).map((e) => e.state),
    [],
  );

  const run = useCallback(
    (line: string): OutputChunk[] => {
      const journal = journalRef.current;
      const clock = clockRef.current;
      if (!journal || !clock) return [];
      const outcome = execute(current(journal), line, registry, clock);
      journalRef.current = push(journal, outcome.state, line.split('\n')[0] ?? line);
      bump();
      return outcome.chunks;
    },
    [registry],
  );

  const seekTo = useCallback((index: number) => {
    const journal = journalRef.current;
    if (!journal) return;
    journalRef.current = seek(journal, index);
    bump();
  }, []);

  const reset = useCallback(() => {
    const fresh = createShellState(options);
    journalRef.current = createJournal(fresh, 'initial');
    clockRef.current?.reset();
    bump();
  }, [options]);

  const journal = journalRef.current;
  return {
    state: current(journal),
    registry,
    clock: clockRef.current,
    journal,
    atLatest: isAtLatest(journal),
    run,
    getState,
    getTimeline,
    seekTo,
    reset,
  };
}

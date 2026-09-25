import type { DragEvent } from 'react';
import type { PodPhase } from '@/engines/k8s/types';
import { HUD } from '@/features/park/hud/theme';
import type { Move } from '../sim';

/** 図 1 枚が受け取るもの */
export interface ViewProps<V> {
  view: V;
  moves: readonly Move[];
  /** 操作を模型に渡す */
  act: (moveId: string) => void;
  /** 仕組みがまだ動いている途中（歯車が回っている） */
  busy: boolean;
  /** 直前に断られた操作。そこを赤く揺らす */
  refused: { moveId: string; reason: string; key: number } | null;
}

/** 状態の色。街と同じ意味で使う（稼働中は緑、待機は黄、失敗は赤） */
export function phaseColor(phase: PodPhase | 'failing'): string {
  if (phase === 'Running' || phase === 'Succeeded') return HUD.ok;
  if (phase === 'failing' || phase === 'Failed') return HUD.bad;
  return HUD.warn;
}

/** ドラッグで運ぶ札の中身。受け取り側は `dropTarget` で読む */
const DRAG_TYPE = 'text/plain';

export function dragSource(value: string) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, value);
      event.dataTransfer.effectAllowed = 'move';
    },
  };
}

export function dropTarget(onDrop: (value: string) => void) {
  return {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const value = event.dataTransfer.getData(DRAG_TYPE);
      if (value !== '') onDrop(value);
    },
  };
}

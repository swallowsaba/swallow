import { useEffect, useRef, useState } from 'react';
import type { Point, Tool, ToolResult } from '@/engines/city/sim';
import { createWorld, type World, type WorldInput } from './world3d';

interface Props {
  input: WorldInput;
  tool: Tool;
  placing: string | null;
  selected: string | null;
  /** この施設へカメラを向ける（変わったときだけ） */
  focusId: string | null;
  onApply: (from: Point, to: Point) => void;
  onInspect: (point: Point) => void;
  describe: (result: ToolResult, tool: Tool) => string;
  label: string;
  fallback: string;
}

function webglAvailable(): boolean {
  if (/jsdom/i.test(navigator.userAgent)) return false;
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

/** 3D の街。three.js の世界を 1 つ持ち、入力が変わるたびに組み直す */
export default function CityCanvas({ input, tool, placing, selected, focusId, onApply, onInspect, describe, label, fallback }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const [failed, setFailed] = useState(false);
  // 世界からの呼び出しは、いつも最新の関数へ
  const handlers = useRef({ onApply, onInspect, describe });
  handlers.current = { onApply, onInspect, describe };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) {
      setFailed(true);
      return;
    }
    try {
      worldRef.current = createWorld(host, {
        onApply: (from, to) => {
          handlers.current.onApply(from, to);
        },
        onInspect: (p) => {
          handlers.current.onInspect(p);
        },
        describe: (result, t) => handlers.current.describe(result, t),
      });
    } catch {
      setFailed(true);
    }
    return () => {
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.update(input);
  }, [input]);
  useEffect(() => {
    worldRef.current?.setTool(tool, placing);
  }, [tool, placing]);
  useEffect(() => {
    worldRef.current?.setSelected(selected);
  }, [selected, input]);
  useEffect(() => {
    if (focusId !== null) worldRef.current?.lookAt(focusId);
  }, [focusId]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      data-testid="city-canvas"
      data-webgl={failed ? 'off' : 'on'}
      className="relative h-full w-full overflow-hidden"
    >
      {failed ? (
        <div className="grid h-full place-items-center bg-[#9fbf7a] p-6 text-center text-sm font-bold text-[#1d2a1a]">{fallback}</div>
      ) : null}
    </div>
  );
}

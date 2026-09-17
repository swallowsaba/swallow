import { useEffect, useRef, useState } from 'react';
import { createSceneMap, type SceneMap, type SceneMapInput } from './isoScene';

/** 地図に出す出来事（正解・対応・完了など）。id が増えるたびに 1 回だけ出す */
export interface CityEvent {
  id: number;
  facilityId: string | null;
  text: string;
  color: string;
}

interface Props {
  input: SceneMapInput;
  selected: string | null;
  events: readonly CityEvent[];
  onSelect: (id: string | null) => void;
  label: string;
  fallback: string;
  zoomLabels: { in: string; out: string; fit: string };
}

function canvasAvailable(): boolean {
  if (/jsdom/i.test(navigator.userAgent)) return false;
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

/** 斜め見下ろしの街。canvas の地図を 1 つ持ち、状態が変わるたびに描き直す */
export function CityMapView({ input, selected, events, onSelect, label, fallback, zoomLabels }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SceneMap | null>(null);
  const [failed, setFailed] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const shown = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!canvasAvailable()) {
      setFailed(true);
      return;
    }
    try {
      mapRef.current = createSceneMap(host, {
        onSelect: (id) => {
          selectRef.current(id);
        },
      });
    } catch {
      setFailed(true);
    }
    return () => {
      mapRef.current?.dispose();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.update(input);
  }, [input]);
  useEffect(() => {
    mapRef.current?.setSelected(selected);
  }, [selected]);
  useEffect(() => {
    for (const event of events) {
      if (event.id <= shown.current) continue;
      mapRef.current?.effect(event.facilityId, event.text, event.color);
      shown.current = event.id;
    }
  }, [events]);

  return (
    <div ref={hostRef} role="img" aria-label={label} data-testid="city-canvas" data-canvas={failed ? 'off' : 'on'} className="relative h-full w-full overflow-hidden">
      {failed ? (
        <div className="grid h-full place-items-center bg-[#6fab49] p-6 text-center text-sm font-bold text-[#1d2a1a]">{fallback}</div>
      ) : (
        <div className="absolute bottom-24 left-2 flex flex-col gap-1">
          {(
            [
              ['+', zoomLabels.in, () => mapRef.current?.zoomBy(1.25)],
              ['−', zoomLabels.out, () => mapRef.current?.zoomBy(0.8)],
              ['⤢', zoomLabels.fit, () => mapRef.current?.fit()],
            ] as const
          ).map(([text, title, action]) => (
            <button
              key={text}
              type="button"
              title={title}
              aria-label={title}
              onClick={() => {
                action();
              }}
              className="h-8 w-8 rounded border-2 border-[#3b2a1a] bg-[#f3e6c8] text-base font-extrabold text-[#2b2118] shadow"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

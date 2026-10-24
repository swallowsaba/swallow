/**
 * 議員の人の影（docs/ui-design.md 10.4「自作 SVG の人の影」）。**顔を描かない**（V4・V11）。
 * 頭と肩の影に、髪・帽子の形だけで 7 人を見分ける。色は CSS の currentColor（生の色を書かない）
 */
const SHOULDERS = 'M8 72C8 53 18 45 30 45s22 8 22 27Z';

const FIGURES: Record<string, { body?: string; head?: { cy: number; r: number }; extra: string }> = {
  // 頭の上にまとめた髪
  'figure-bun': { extra: 'M30 5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z' },
  // つばの広い帽子
  'figure-hat': { extra: 'M11 19.5c0-2.2 8.5-4 19-4s19 1.8 19 4-8.5 3.5-19 3.5-19-1.3-19-3.5Z M19.5 17c0-9 21-9 21 0Z' },
  // つばのある作業帽
  'figure-cap': { extra: 'M17.5 22c0-12.5 25-12.5 25 0Z M41 20.5l11 2.5-11 2Z' },
  // 肩まで下ろした髪
  'figure-long': { extra: 'M16.5 27c0-17 27-17 27 0l2 19-7-2V31h-17v13l-7 2Z' },
  // 広い肩
  'figure-broad': { body: 'M2 72C2 51 16 43 30 43s28 8 28 29Z', head: { cy: 25, r: 11.5 }, extra: '' },
  // 小柄
  'figure-short': { body: 'M12 72C12 57 20 51 30 51s18 6 18 21Z', head: { cy: 32, r: 11 }, extra: '' },
  // 横に束ねた髪
  'figure-ponytail': { extra: 'M40 19c10 2 13 13.5 7 23 1.5-9-2.5-15-8.5-16.5Z' },
};

export function CouncilFigure({ icon, size = 56 }: { icon: string; size?: number }) {
  const f = FIGURES[icon] ?? { extra: '' };
  const head = f.head ?? { cy: 27, r: 12 };
  return (
    <svg className="council-figure" width={size} height={(size * 72) / 60} viewBox="0 0 60 72" fill="currentColor" aria-hidden="true" data-figure={icon}>
      <path d={f.body ?? SHOULDERS} />
      <circle cx={30} cy={head.cy} r={head.r} />
      {f.extra ? <path d={f.extra} /> : null}
    </svg>
  );
}

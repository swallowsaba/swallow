/**
 * 模擬環境（つなぐ）の部品の記号（docs/visual-design.md 4 章: 自作 SVG、線 1.6〜2px、角は丸く。絵文字は使わない）。色は currentColor。
 */
export type SimIconName = 'box' | 'pc' | 'server' | 'router' | 'switch' | 'cloud' | 'db' | 'cpu' | 'memory' | 'disk' | 'keyboard' | 'screen' | 'app' | 'user' | 'net';

const PATHS: Record<SimIconName, string> = {
  // 角の丸い箱
  box: 'M4 6.5 12 3l8 3.5v11L12 21l-8-3.5Z M4 6.5 12 10l8-3.5 M12 10v11',
  // 画面と台
  pc: 'M3.5 4.5h17v11h-17Z M9 19.5h6 M12 15.5v4',
  // 積んだ 3 段と灯り
  server: 'M5 3.5h14v5H5Z M5 9.5h14v5H5Z M5 15.5h14v5H5Z M8 6h.5 M8 12h.5 M8 18h.5 M12 6h4 M12 12h4 M12 18h4',
  // 円筒と 4 方向の矢印
  router: 'M4 10c0-1.7 3.6-3 8-3s8 1.3 8 3v4c0 1.7-3.6 3-8 3s-8-1.3-8-3Z M4 10c0 1.7 3.6 3 8 3s8-1.3 8-3 M9 3.5l3-1.5 3 1.5 M9 20.5l3 1.5 3-1.5',
  // 平たい箱と並んだ口
  switch: 'M3 8.5h18v7H3Z M6.5 12h1 M9.5 12h1 M12.5 12h1 M15.5 12h1 M6 5.5h12',
  // 雲
  cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-9 5.5 5.5 0 0 1 10.6 1.2A3.9 3.9 0 0 1 17 18.5Z',
  // 円筒
  db: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3Z M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  // 足の付いた四角い部品
  cpu: 'M7 7h10v10H7Z M10 10h4v4h-4Z M9.5 3.5V7 M14.5 3.5V7 M9.5 17v3.5 M14.5 17v3.5 M3.5 9.5H7 M3.5 14.5H7 M17 9.5h3.5 M17 14.5h3.5',
  // 細長い板と端子
  memory: 'M3 8h18v7H3Z M6 10.5h2v2H6Z M11 10.5h2v2h-2Z M16 10.5h2v2h-2Z M5 15v2.5 M9 15v2.5 M13 15v2.5 M17 15v2.5',
  // 円盤の入った箱
  disk: 'M4 4.5h16v15H4Z M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M12 12.5v-.5 M7 7h.5',
  // 鍵盤
  keyboard: 'M2.5 7h19v10h-19Z M5.5 10h1 M8.5 10h1 M11.5 10h1 M14.5 10h1 M17.5 10h1 M7.5 14h9',
  // 画面
  screen: 'M3 4.5h18v12H3Z M8 20h8 M6 8l3 3 M6 12.5h5',
  // 窓の重なり
  app: 'M4 6.5h12v11H4Z M8 3.5h12v11 M4 9.5h12',
  // 人の影（顔を描かない）
  user: 'M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.5c.8-4 3.5-6.2 7-6.2s6.2 2.2 7 6.2',
  // 網（つながった 3 点）
  net: 'M12 5.5a2 2 0 1 0 0 .01 M5 18a2 2 0 1 0 0 .01 M19 18a2 2 0 1 0 0 .01 M11 7.3 6 16.3 M13 7.3l5 9 M7 18h10',
};

export function SimIcon({ name, size = 28 }: { name: SimIconName; size?: number }) {
  return (
    <svg className="sim-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

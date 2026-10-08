/**
 * 自作のアイコン（docs/visual-design.md 4 章・6.1）。線 1.8px、角は丸く。色は currentColor。
 * 絵文字は使わない。
 */
export type IconName =
  | 'learn' | 'mission' | 'glossary' | 'settings' | 'funds' | 'xp' | 'people' | 'stage' | 'emblem'
  | 'road' | 'zone' | 'facility' | 'park' | 'demolish' | 'rotate' | 'pause' | 'curve' | 'straight' | 'alert'
  | 'graph' | 'list' | 'search' | 'close' | 'start' | 'check' | 'hint' | 'terminal' | 'upgrade' | 'down' | 'database'
  | 'export' | 'import' | 'restart' | 'save';

const PATHS: Record<IconName, string> = {
  // 開いた本
  learn: 'M3 6.5c3-1.4 6-1.4 9 .6 3-2 6-2 9-.6V19c-3-1.4-6-1.4-9 .6-3-2-6-2-9-.6Z M12 7.1v12.5',
  // 旗
  mission: 'M5 21V4 M5 4.5h11l-2.2 3.7L16 12H5',
  // 辞書（ABC のしおり）
  glossary: 'M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15H7.5A2 2 0 0 1 5.5 18V5 M5.5 18a2 2 0 0 1 2-2h11 M9 7.5h6 M9 10.5h4',
  // 歯車
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M12 2.8v2.4 M12 18.8v2.4 M2.8 12h2.4 M18.8 12h2.4 M5.5 5.5l1.7 1.7 M16.8 16.8l1.7 1.7 M5.5 18.5l1.7-1.7 M16.8 7.2l1.7-1.7',
  // 積んだ硬貨
  funds: 'M4 8c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z M4 8v4c0 1.7 3.6 3 8 3s8-1.3 8-3V8 M4 12v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4',
  // 上向きの階段の矢印
  xp: 'M4 19h4v-4h4v-4h4V7h4 M15 3.5h5v5',
  // 2 人の影
  people: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Z M3 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6 M16 10.6a2.8 2.8 0 1 0-.6-5.5 M17.5 14.6c2 .5 3.2 2.4 3.5 5.4',
  // 3 本の高さの違うビル
  stage: 'M3 21h18 M5 21V12h4v9 M10 21V6h4v15 M15 21v-6h4v6',
  // 都市の紋章（盾と塔）
  emblem: 'M12 2.5 20 6v6c0 4.6-3.4 8.2-8 9.5C7.4 20.2 4 16.6 4 12V6Z M9 16v-4.5l3-2.5 3 2.5V16 M12 16v-2.5',
  // 遠くへ伸びる道路と中央線
  road: 'M9 3 4 21 M15 3l5 18 M12 4v2.5 M12 9.5v3 M12 15.5v4',
  // 菱形の区画と、中の小さな家
  zone: 'M12 3 21 8.5 12 14 3 8.5Z M3 12.5 12 18l9-5.5 M9.5 9.5V7.6L12 6l2.5 1.6v1.9',
  // 塔のある施設
  facility: 'M3 21h18 M5 21v-8l5-3v11 M10 21V5h5v16 M15 21v-6h4v6 M12.5 5V2.5',
  // 2 本の木
  park: 'M8 21v-5 M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M16.5 21v-4 M16.5 17l-3.5-1 3.5-9 3.5 9Z',
  // 壊す槌
  demolish: 'M14.5 4.5l5 5-3 3-5-5Z M12.5 9.5 4 18l2 2 8.5-8.5 M17.5 3l3.5 3.5',
  // 回す矢印
  rotate: 'M20 12a8 8 0 1 1-2.4-5.7 M20 4v5h-5',
  // 一時停止
  pause: 'M8 5v14 M16 5v14',
  // 曲線の道
  curve: 'M4 20c0-9 7-16 16-16 M4 14c0-5 4-10 10-10',
  // 直線の道
  straight: 'M6 20 18 4 M10 20 20 7',
  // 注意（三角と感嘆）
  alert: 'M12 3.5 21.5 20h-19Z M12 10v4.5 M12 17.2v.3',
  // 点と辺（知識グラフ）
  graph: 'M6 6.5a2.5 2.5 0 1 0 0 .01 M18 5a2 2 0 1 0 0 .01 M17 18a3 3 0 1 0 0 .01 M6.5 18.5a2 2 0 1 0 0 .01 M8.2 7.6l7.2 8.6 M8.4 6.2l7.6-1 M6.3 9v7.5 M8.5 18.3H14',
  // 並んだ行（一覧）
  list: 'M9 6h11 M9 12h11 M9 18h11 M4 6h.5 M4 12h.5 M4 18h.5',
  // 虫眼鏡
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M15.5 15.5 20.5 20.5',
  // 閉じる
  close: 'M6 6l12 12 M18 6 6 18',
  // 始める（右向きの三角）
  start: 'M8 5.5v13l10.5-6.5Z',
  // 修了の印
  check: 'M4.5 12.5l4.5 4.5 10.5-10.5',
  // 灯った電球（ヒント）
  hint: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z',
  // 端末の窓とプロンプト
  terminal: 'M3.5 5h17v14h-17Z M7 10l3 2.5L7 15 M12 15.5h5',
  // 建物の上に重なる上向きの矢印（施設を上げる）
  upgrade: 'M4 21h16 M6 21v-6h12v6 M12 12V3 M8 7l4-4 4 4',
  // 下向きの山（選ぶ欄を開く）
  down: 'M6 9.5l6 6 6-6',
  // 積んだ円盤（データベース）
  // 箱から上へ出す（書き出す）
  export: 'M4 14v5.5h16V14 M12 15V3.5 M7.5 8 12 3.5 16.5 8',
  // 箱へ下ろす（読み込む）
  import: 'M4 14v5.5h16V14 M12 3.5V15 M7.5 10.5 12 15l4.5-4.5',
  // 輪を戻る（最初からやり直す）
  restart: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v5h5',
  // 保存（角の欠けた記録の板）
  save: 'M5 3.5h11.5L19 6v14.5H5Z M8 3.5v5h7v-5 M8 20.5v-6h8v6',
  database: 'M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 7.4 5 6Z M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6 M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

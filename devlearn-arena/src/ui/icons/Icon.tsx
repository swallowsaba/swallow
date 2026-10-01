/**
 * 自作のアイコン（docs/visual-design.md 4 章・6.1）。線 1.8px、角は丸く。色は currentColor。
 * 絵文字は使わない。
 */
export type IconName = 'learn' | 'mission' | 'glossary' | 'settings' | 'funds' | 'xp' | 'people' | 'stage' | 'emblem';

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
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

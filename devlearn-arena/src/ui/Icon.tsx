/**
 * 学習面で使う線のアイコン。
 *
 * 絵文字は環境ごとに絵が変わり、大きさもそろわないので使わない。
 * すべて 24 の枠・線幅 1.75・角丸で描き、文字の高さに合わせて並ぶようにする。
 */

export type IconName =
  | 'request'
  | 'quiz'
  | 'tool'
  | 'plan'
  | 'build'
  | 'check'
  | 'close'
  | 'next'
  | 'back'
  | 'idea'
  | 'skip'
  | 'play'
  | 'pause'
  | 'replay'
  | 'terminal'
  | 'flag'
  | 'city'
  | 'book'
  | 'alert'
  | 'search'
  | 'sparkle'
  | 'target'
  | 'route'
  | 'board'
  | 'settings'
  | 'map';

const PATHS: Record<IconName, React.ReactNode> = {
  // 住民の要望（吹き出し）
  request: <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />,
  // 理解度チェック（？）
  quiz: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
      <path d="M12 17.1v.01" />
    </>
  ),
  // 道具（レンチ）
  tool: <path d="M15.4 4.6a4.5 4.5 0 0 0-5.9 5.6L4 15.7V20h4.3l5.5-5.5a4.5 4.5 0 0 0 5.6-5.9l-2.8 2.8-2.2-.6-.6-2.2z" />,
  // 段取り（手順の一覧）
  plan: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
  // 建設（クレーン）
  build: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20V5h11" />
      <path d="M7 8.5h7" />
      <path d="M14 5v4.5" />
      <path d="M11.5 12.5h5V16h-5z" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  next: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  back: <path d="M15 5.5L8.5 12l6.5 6.5" />,
  // ヒント（電球）
  idea: (
    <>
      <path d="M9.5 16.5a5.5 5.5 0 1 1 5 0v1.5h-5z" />
      <path d="M10 20.5h4" />
    </>
  ),
  // 飛ばす
  skip: (
    <>
      <path d="M5.5 6.5l7 5.5-7 5.5z" />
      <path d="M16 6v12" />
    </>
  ),
  play: <path d="M7.5 5.5l10 6.5-10 6.5z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  replay: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" />
      <path d="M19.8 4.5v4.2h-4.2" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 9.5l3 2.5-3 2.5M13 15h4" />
    </>
  ),
  flag: (
    <>
      <path d="M6 20V4.5" />
      <path d="M6 5.5h11l-2 3 2 3H6z" />
    </>
  ),
  // 街
  city: (
    <>
      <path d="M3.5 20h17" />
      <path d="M5.5 20V9.5l5-3v13.5" />
      <path d="M10.5 12.5h8V20" />
      <path d="M13.5 15.5h.01M16 15.5h.01M13.5 18h.01M16 18h.01M8 10.5h.01M8 13.5h.01M8 16.5h.01" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5.5A2 2 0 0 1 6.5 4H19v14.5H6.5a2 2 0 0 0-2 2z" />
      <path d="M4.5 5.5v14.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20 20" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4l1.7 4.6L18.5 10l-4.8 1.4L12 16l-1.7-4.6L5.5 10l4.8-1.4z" />
      <path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M6 9v5a3.5 3.5 0 0 0 3.5 3.5h6" />
    </>
  ),
  board: (
    <>
      <rect x="3.5" y="5" width="17" height="13" rx="2" />
      <path d="M7 9h6M7 13h10" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6L6 18M18 18l-1.4-1.4M7.4 7.4L6 6" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
};

export function Icon({ name, size = 18, className, strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: 'none' }}
    >
      {PATHS[name]}
    </svg>
  );
}

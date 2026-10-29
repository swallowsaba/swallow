/** 初回の操作説明の 3 回（src/screens/city/Intro.tsx。docs/ui-design.md 9 章） */
export interface IntroStep {
  title: string;
  /** 示す所（CSS のセレクタ。見つかった物を全て囲む） */
  targets: string[];
  lines: string[];
}

export const INTRO_STEPS: readonly IntroStep[] = [
  {
    title: '都市を作る',
    targets: ['[data-testid="build-menu"] .build-bar'],
    lines: [
      'ここはあなたの都市。右ドラッグか W A S D で動かし、ホイールで寄る。Q と E で回す。',
      '下の建設メニューから、道路・区画・施設を置いて街を作る。',
      '施設はすぐには建たない。申請になり、敷地の看板が審議の段（反対の受付・公聴会・議会・工事）を示す。看板を押すと申請の詳細が開く。',
    ],
  },
  {
    title: '施設で学ぶ',
    targets: ['[data-testid="recommend"]'],
    lines: [
      '施設を選ぶと、その施設に関係する学習が出る。左上のおすすめからも、すぐ始められる。',
      'どのレッスンからでも始めてよい。おすすめの順は道しるべで、決まりではない。',
      '公聴会で反対に答える時、学んだ分野の「説明する」の手が増える。学ばなくても、譲歩と政治資本で通せる。',
    ],
  },
  {
    title: '学ぶと都市が育つ',
    targets: ['[data-testid="topbar-xp"]', '[data-testid="topbar"] .topbar-entries', '[data-testid="topbar-approval"]', '[data-testid="topbar-civic"]'],
    lines: [
      '学ぶと XP と開発資金が増え、施設が育ち、街が広がる。',
      '上の帯の「学ぶ」（L キー）で全てのレッスンを、XP を押すと自分の成長を見られる。',
      '支持率は住民の暮らし（家賃・仕事・通勤・騒音など）から決まり、押すと理由が出る。「市政」（P キー）から申請・受信箱・予算・新聞を開ける。4 年ごとに選挙がある。',
    ],
  },
];

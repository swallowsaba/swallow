/** 日本語が既定。文言はコンポーネントに直書きしない。 */
export const ja = {
  'app.name': 'DevLearn Arena',
  'app.tagline': 'コマンドを打つ。状態が変わる。図が動く。',

  'nav.map': 'ワールドマップ',
  'nav.sandbox': 'サンドボックス',
  'nav.dashboard': '記録',
  'nav.settings': '設定',
  'nav.skip': '本文へ移動',

  'map.title': 'ワールドマップ',
  'map.lead': '4 つのトラックを、章ごとに進めます。各章の最後にはインシデント対応が待っています。',
  'map.chapters': '章',
  'map.lessons': 'レッスン',
  'map.bosses': 'インシデント',
  'map.ready': '遊べる',
  'map.planned': '準備中',
  'map.phase': '実装フェーズ',
  'map.openTrack': 'このトラックを開く',

  'track.goal': '到達目標',
  'track.back': 'ワールドマップへ戻る',
  'track.chapter': '第 {n} 章',
  'track.minutes': '約 {n} 分',

  'lesson.back': '章の一覧へ戻る',
  'lesson.terminal': 'ターミナル',
  'lesson.visualizer': 'ライブ図解',
  'lesson.plannedTitle': 'このレッスンはまだ動きません',
  'lesson.plannedBody':
    'シミュレータの実装フェーズ {phase} で有効になります。今は目次として全体像を示しています。',
  'lesson.docs': '出典',
  'lesson.kind.concept': '解説',
  'lesson.kind.drill': '反復',
  'lesson.kind.challenge': '課題',
  'lesson.kind.boss': 'インシデント',

  'dash.title': '記録',
  'dash.level': 'レベル {n}',
  'dash.rank': 'ランク',
  'dash.xp': '{a} / {b} XP',
  'dash.streak': '連続 {n} 日',
  'dash.cleared': 'クリア済み {n} レッスン',
  'dash.recent': '最近の動き',
  'dash.empty': 'まだ記録がありません。ワールドマップから 1 つ目の章を開いてください。',

  'settings.title': '設定',
  'settings.motion': 'アニメーション',
  'settings.motion.system': 'OS の設定に従う',
  'settings.motion.reduced': '常に控えめにする',
  'settings.tick': '仮想時計の速さ',
  'settings.data': '学習データ',
  'settings.export': '進捗を書き出す',
  'settings.import': '進捗を読み込む',
  'settings.reset': '進捗を消去する',
  'settings.resetConfirm': '進捗をすべて消去します。取り消せません。',
  'settings.imported': '進捗を読み込みました。',
  'settings.importFailed': '読み込めませんでした。書き出した JSON か確認してください。',
  'settings.storageNote': '進捗はこの端末のブラウザにだけ保存されます。',

  'notfound.title': 'そのページはありません',
  'notfound.body': 'URL が変わったか、まだ存在しないページです。',
  'notfound.cta': 'ワールドマップへ',

  'common.loading': '読み込み中',
} as const;

export type TKey = keyof typeof ja;

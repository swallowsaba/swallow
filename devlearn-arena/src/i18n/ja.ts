/** 日本語が既定。文言はコンポーネントに直書きしない。 */
export const ja = {
  'app.name': 'DevLearn Arena',
  'app.tagline': 'コマンドを打つ。状態が変わる。図が動く。',

  'nav.home': 'ホーム',
  'nav.map': '冒険の地図',
  'nav.sandbox': 'サンドボックス',
  'nav.dashboard': '記録',
  'nav.settings': '設定',
  'nav.skip': '本文へ移動',

  'home.next': '次にやること',
  'home.warmupLead':
    'まずはターミナルに慣れるところから。コマンドを打つと画面の図がその場で変わります。3つの手順を達成すればクリアです。',
  'home.start': '訓練場ではじめる',
  'home.clearedLead': 'クリアしたレッスンの数です。',
  'home.buildStatus': '実装フェーズ',
  'home.buildLead': 'シェルと仮想ファイルシステムが動きます。Git / Kubernetes / Network は準備中です。',
  'home.worlds': '4つの世界',
  'home.worldsLead': '進めたい分野を選んで、章ごとに攻略していきます。',

  'sandbox.title': '訓練場',
  'sandbox.lead':
    'カリキュラム外で自由に試せる場所です。コマンドを打つと右のファイルツリーが変わり、下の「時間」を動かすと過去の状態に戻れます。',
  'sandbox.fileTree': 'ファイルツリー',
  'sandbox.snapshots': 'スナップショット {n} 件 / 仮想時計 tick {tick}',

  'map.title': '冒険の地図',
  'map.lead': '4 つの世界を、章ごとに進めます。各章の最後にはインシデント対応が待っています。',
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
  'error.title': '画面の描画に失敗しました',
} as const;

export type TKey = keyof typeof ja;

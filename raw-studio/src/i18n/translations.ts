/**
 * Translation dictionary. Keys are stable identifiers (not English text) so
 * renaming display text never breaks a lookup. Covers menus, tabs, and the
 * most common buttons — the "menu" surface the person asked to be bilingual.
 * Panels with many one-off labels (e.g. individual slider names) stay in
 * English for now; the dictionary is additive, so more keys can be added
 * without touching call sites that don't use them yet.
 */

export type TranslationKey = keyof typeof DICT;

const DICT = {
  // App / toolbar
  'app.title': { ja: 'RAW Studio', en: 'RAW Studio' },
  'toolbar.export': { ja: '書き出し', en: 'Export' },
  'toolbar.undo': { ja: '元に戻す', en: 'Undo' },
  'toolbar.redo': { ja: 'やり直す', en: 'Redo' },
  'toolbar.theme': { ja: '表示テーマ切替', en: 'Toggle theme' },
  'toolbar.language': { ja: '言語切替', en: 'Switch language' },

  // Left panel tabs
  'tab.library': { ja: 'ライブラリ', en: 'Library' },
  'tab.history': { ja: '履歴', en: 'History' },

  // Right panel tabs
  'tab.presets': { ja: 'プリセット', en: 'Presets' },
  'tab.basic': { ja: '基本', en: 'Basic' },
  'tab.tone': { ja: 'トーン', en: 'Tone' },
  'tab.color': { ja: 'カラー', en: 'Color' },
  'tab.detail': { ja: 'ディテール', en: 'Detail' },
  'tab.lens': { ja: 'レンズ', en: 'Lens' },
  'tab.ai': { ja: 'AI', en: 'AI' },

  // Common
  'common.openImagePrompt': { ja: '画像を開いて編集を開始', en: 'Open an image to start editing.' },
  'common.reset': { ja: 'リセット', en: 'Reset' },
  'common.cancel': { ja: 'キャンセル', en: 'Cancel' },
  'common.apply': { ja: '適用', en: 'Apply' },
  'common.search': { ja: '検索', en: 'Search' },
  'common.add': { ja: '追加', en: 'Add' },

  // Basic panel
  'basic.groupLight': { ja: 'ライト', en: 'Light' },
  'basic.groupColor': { ja: 'カラー', en: 'Color' },
  'basic.exposure': { ja: '露出', en: 'Exposure' },
  'basic.contrast': { ja: 'コントラスト', en: 'Contrast' },
  'basic.highlights': { ja: 'ハイライト', en: 'Highlights' },
  'basic.shadows': { ja: 'シャドウ', en: 'Shadows' },
  'basic.whites': { ja: '白レベル', en: 'Whites' },
  'basic.blacks': { ja: '黒レベル', en: 'Blacks' },
  'basic.brightness': { ja: '明るさ', en: 'Brightness' },
  'basic.gamma': { ja: 'ガンマ', en: 'Gamma' },
  'basic.temperature': { ja: '色温度', en: 'Temperature' },
  'basic.tint': { ja: '色かぶり補正', en: 'Tint' },
  'basic.vibrance': { ja: '自然な彩度', en: 'Vibrance' },
  'basic.saturation': { ja: '彩度', en: 'Saturation' },

  // Auto bar
  'auto.all': { ja: '自動補正', en: 'Auto' },
  'auto.tone': { ja: 'トーン', en: 'Tone' },
  'auto.wb': { ja: 'ホワイトバランス', en: 'WB' },
  'auto.color': { ja: 'カラー', en: 'Color' },

  // Tone panel
  'tone.title': { ja: 'トーンカーブ', en: 'Tone Curve' },
  'tone.shadows': { ja: 'シャドウ', en: 'Shadows' },
  'tone.midtones': { ja: '中間調', en: 'Midtones' },
  'tone.highlights': { ja: 'ハイライト', en: 'Highlights' },

  // Color panel (HSL)
  'color.mixerTitle': { ja: 'カラーミキサー', en: 'Color Mixer' },
  'color.hue': { ja: '色相', en: 'Hue' },
  'color.saturation': { ja: '彩度', en: 'Saturation' },
  'color.luminance': { ja: '輝度', en: 'Luminance' },
  'color.band.red': { ja: '赤', en: 'Red' },
  'color.band.orange': { ja: 'オレンジ', en: 'Orange' },
  'color.band.yellow': { ja: '黄', en: 'Yellow' },
  'color.band.green': { ja: '緑', en: 'Green' },
  'color.band.aqua': { ja: '水色', en: 'Aqua' },
  'color.band.blue': { ja: '青', en: 'Blue' },
  'color.band.purple': { ja: '紫', en: 'Purple' },
  'color.band.magenta': { ja: 'マゼンタ', en: 'Magenta' },
  'color.mixerHelp': {
    ja: '画像全体ではなく、特定の色（赤や青など）だけを調整します。',
    en: 'Adjust individual color bands (like the reds or the blues) instead of the whole image at once.',
  },
  'color.hueHelp': {
    ja: 'この色を隣の色相へ少しずらします。',
    en: 'Shifts this color band toward a neighboring hue.',
  },
  'color.saturationHelp': {
    ja: 'この色の鮮やかさを上げ下げします。',
    en: 'Makes this color band more or less vivid.',
  },
  'color.luminanceHelp': {
    ja: 'この色の明るさを上げ下げします。',
    en: 'Makes this color band lighter or darker.',
  },

  // Detail panel
  'detail.presence': { ja: '質感', en: 'Presence' },
  'detail.sharpening': { ja: 'シャープ', en: 'Sharpening' },
  'detail.noiseReduction': { ja: 'ノイズ低減', en: 'Noise Reduction' },
  'detail.clarity': { ja: '明瞭度', en: 'Clarity' },
  'detail.texture': { ja: 'テクスチャ', en: 'Texture' },
  'detail.dehaze': { ja: 'かすみの除去', en: 'Dehaze' },
  'detail.amount': { ja: '量', en: 'Amount' },
  'detail.radius': { ja: '半径', en: 'Radius' },
  'detail.luminanceNr': { ja: '輝度', en: 'Luminance' },
  'detail.colorNr': { ja: 'カラー', en: 'Color' },
  'detail.clarityHelp': {
    ja: '中間調の局所コントラストを強めて（または弱めて）、力強い、または柔らかい印象にします。',
    en: 'Boosts (or softens) local contrast in the midtones for a punchier or dreamier look.',
  },
  'detail.textureHelp': {
    ja: 'クラリティほど全体のコントラストに影響を与えず、細部の質感を強調します。',
    en: 'Enhances fine surface detail without affecting overall contrast as much as Clarity.',
  },
  'detail.dehazeHelp': {
    ja: 'コントラストを上げることで、かすみを軽減します（簡易的な近似で、本格的なdark-channel方式ではありません）。',
    en: 'Cuts through atmospheric haze by boosting contrast — a simplified approximation, not a full dark-channel dehaze.',
  },
  'detail.amountHelp': { ja: 'シャープの強さです。', en: 'How strongly edges are sharpened.' },
  'detail.radiusHelp': {
    ja: 'シャープ処理を行う際に、輪郭の周囲をどれくらいの範囲まで考慮するかです。',
    en: 'How wide an area around each edge is considered when sharpening.',
  },
  'detail.luminanceNrHelp': {
    ja: '明るさのノイズ（粒状感）を滑らかにします。値を上げすぎると細部がぼやけることがあります。',
    en: 'Smooths brightness noise (grain). Higher values can soften fine detail.',
  },
  'detail.colorNrHelp': {
    ja: '明るさの細部に影響を与えず、色のちらつき（カラーノイズ）を滑らかにします。',
    en: 'Smooths color speckling (chroma noise) without affecting brightness detail.',
  },

  // Lens panel
  'lens.title': { ja: 'レンズ補正', en: 'Lens Corrections' },
  'lens.distortion': { ja: '歪み補正', en: 'Distortion' },
  'lens.vignetting': { ja: '周辺光量', en: 'Vignetting' },
  'lens.chromaticAberration': { ja: '色収差', en: 'Chromatic Aberration' },
  'lens.distortionHelp': {
    ja: 'レンズの樽型（膨らみ）または糸巻き型（へこみ）の歪みを補正します。プラスで外側に押し出し、マイナスで内側に引き込みます。',
    en: 'Corrects barrel (bulging) or pincushion (pinched) lens distortion. Positive pushes edges outward, negative pulls them inward.',
  },
  'lens.vignettingHelp': {
    ja: '画像の四隅を中心に対して暗く、または明るくします。',
    en: 'Darkens or brightens the corners relative to the center.',
  },
  'lens.chromaticAberrationHelp': {
    ja: 'コントラストの高い輪郭付近に出る色にじみを軽減します（逆方向にすると、あえて色にじみを追加できます）。',
    en: 'Reduces (or, if pushed the other way, adds) color fringing near high-contrast edges.',
  },
  'lens.fisheye': { ja: '魚眼レンズ風', en: 'Fisheye' },
  'lens.fisheyeHelp': {
    ja: 'オンにすると、歪み補正スライダーが魚眼レンズのような強い球面歪みになります。',
    en: 'When on, the Distortion slider produces a strong spherical fisheye-style bulge instead of a subtle correction curve.',
  },

  // Export dialog
  'export.title': { ja: '画像を書き出し', en: 'Export image' },
  'export.format': { ja: '形式', en: 'Format' },
  'export.quality': { ja: '画質', en: 'Quality' },
  'export.resize': { ja: 'リサイズ', en: 'Resize' },
  'export.filenameTemplate': { ja: 'ファイル名テンプレート', en: 'Filename template' },
  'export.watermark': { ja: '透かし', en: 'Watermark' },
  'export.button': { ja: '書き出す', en: 'Export' },

  // Presets panel
  'presets.searchPlaceholder': { ja: 'プリセットを検索', en: 'Search presets' },
  'presets.createFromCurrent': { ja: '現在の設定からプリセット作成', en: 'Create preset from current' },
  'presets.import': { ja: 'プリセットを読み込み', en: 'Import presets' },
  'presets.export': { ja: 'プリセットを書き出し', en: 'Export presets' },
  'presets.favorites': { ja: 'お気に入り', en: 'Favorites' },
  'presets.myPresets': { ja: 'マイプリセット', en: 'My Presets' },
  'presets.noMatch': { ja: '該当するプリセットがありません', en: 'No presets match.' },
  'presets.createDialogTitle': {
    ja: '現在の設定からプリセットを作成',
    en: 'Create preset from current settings',
  },
  'presets.namePlaceholder': { ja: 'プリセット名', en: 'Preset name' },
  'presets.create': { ja: '作成', en: 'Create' },
  'presets.category.user': { ja: 'マイプリセット', en: 'My Presets' },
  'presets.category.portrait': { ja: 'ポートレート', en: 'Portrait' },
  'presets.category.landscape': { ja: '風景', en: 'Landscape' },
  'presets.category.night': { ja: '夜景', en: 'Night' },
  'presets.category.vintage': { ja: 'ビンテージ', en: 'Vintage' },
  'presets.category.film': { ja: 'フィルム', en: 'Film' },
  'presets.category.cinematic': { ja: 'シネマティック', en: 'Cinematic' },
  'presets.category.street': { ja: 'ストリート', en: 'Street' },
  'presets.category.wedding': { ja: 'ウェディング', en: 'Wedding' },
  'presets.category.travel': { ja: '旅行', en: 'Travel' },
  'presets.category.bw': { ja: '白黒', en: 'Black & White' },

  // History panel
  'history.snapshots': { ja: 'スナップショット', en: 'Snapshots' },
  'history.title': { ja: '履歴', en: 'History' },
  'history.noSnapshots': { ja: 'スナップショットはまだありません', en: 'No snapshots yet.' },
  'history.openImagePrompt': {
    ja: '画像を開くと履歴が表示されます',
    en: 'Open an image to see its history.',
  },
  'history.deleteSnapshot': { ja: 'スナップショットを削除', en: 'Delete snapshot' },

  // AI panel
  'ai.detectSubject': { ja: '被写体・背景を検出', en: 'Detect subject / background' },

  // Info popover
  'info.title': { ja: '写真の情報', en: 'Photo Info' },
  'info.noCameraData': {
    ja: 'カメラ情報はRAWファイルでのみ表示されます',
    en: 'Camera data is only available for RAW files.',
  },

  // Reset
  'toolbar.reset': { ja: '編集をリセット', en: 'Reset edits' },

  // Beginner mode
  'mode.beginner': { ja: 'かんたんモード', en: 'Beginner Mode' },
  'mode.pro': { ja: 'プロモード', en: 'Pro Mode' },
  'beginner.brighten': { ja: '明るく', en: 'Brighten' },
  'beginner.vivid': { ja: '鮮やかに', en: 'Vivid' },
  'beginner.softBackground': { ja: '背景をぼかす', en: 'Blur Background' },
  'beginner.softBackgroundHelp': {
    ja: 'AIで被写体を検出し、背景だけをぼかします（初回はモデルのダウンロードが必要です）。',
    en: 'Uses AI to detect the subject and blur only the background (downloads a model on first use).',
  },

  // Crop / aspect presets
  'crop.title': { ja: 'トリミング', en: 'Crop' },
  'crop.free': { ja: '自由', en: 'Free' },
  'crop.original': { ja: '元の比率', en: 'Original' },

  // Remove Object (AI inpainting)
  'remove.title': { ja: 'オブジェクトを消去', en: 'Remove Object' },
  'remove.brush': { ja: 'ブラシ', en: 'Brush' },
  'remove.help': {
    ja: '消したい部分を塗って「適用」を押してください',
    en: 'Paint over what you want to remove, then Apply',
  },
  'remove.apply': { ja: '適用', en: 'Apply' },
} as const;

export function translate(locale: 'ja' | 'en', key: TranslationKey): string {
  return DICT[key][locale];
}

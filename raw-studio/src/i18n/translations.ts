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

  // Lens panel
  'lens.title': { ja: 'レンズ補正', en: 'Lens Corrections' },
  'lens.distortion': { ja: '歪み補正', en: 'Distortion' },
  'lens.vignetting': { ja: '周辺光量', en: 'Vignetting' },
  'lens.chromaticAberration': { ja: '色収差', en: 'Chromatic Aberration' },

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

  // History panel
  'history.snapshots': { ja: 'スナップショット', en: 'Snapshots' },
  'history.title': { ja: '履歴', en: 'History' },
  'history.noSnapshots': { ja: 'スナップショットはまだありません', en: 'No snapshots yet.' },

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
} as const;

export function translate(locale: 'ja' | 'en', key: TranslationKey): string {
  return DICT[key][locale];
}

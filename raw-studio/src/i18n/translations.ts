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
  'tab.masks': { ja: 'マスク', en: 'Masks' },
  'tab.mix': { ja: 'ミックス', en: 'Mix' },
  'tab.ai': { ja: 'AI', en: 'AI' },

  // Look Mixer
  'mix.intro': {
    ja: '2つ〜4つのルック（スナップショット／プリセット／現在／ニュートラル）の間を、現像全体で連続的にブレンドします。気に入った配合を「適用」で確定できます。',
    en: 'Blend continuously across the whole develop between two to four looks (snapshots, presets, current, neutral). Apply the mix you like.',
  },
  'mix.blend2': { ja: '2つ', en: '2-way' },
  'mix.blend4': { ja: '4つ', en: '4-way' },
  'mix.apply': { ja: '適用', en: 'Apply' },
  'mix.applyLabel': { ja: 'ルックをミックス', en: 'Mix looks' },
  'mix.reset': { ja: 'リセット', en: 'Reset' },
  'mix.compare': { ja: 'A/B比較', en: 'Compare A/B' },
  'mix.same': { ja: 'AとBは同じ現像です', en: 'A and B are identical' },
  'mix.diffTitle': { ja: 'A → B の差分', en: 'A → B differences' },

  // Masks
  'masks.intro': {
    ja: '画像の一部にだけ効く補正を作れます。ブラシで塗る／円形／グラデーションでマスクを作り、そのマスク内だけに露出や色を効かせます。',
    en: 'Apply adjustments to just part of the image. Paint a brush mask, or drop a radial or graduated mask, then tune light and color inside it only.',
  },
  'masks.addLabel': { ja: 'マスクを追加', en: 'Add mask' },
  'masks.brush': { ja: 'ブラシ', en: 'Brush' },
  'masks.radial': { ja: '円形', en: 'Radial' },
  'masks.linear': { ja: 'グラデ', en: 'Linear' },
  'masks.aiSubjectBtn': { ja: 'AIで被写体を選択', en: 'Select subject with AI' },
  'masks.aiSubject': { ja: 'AI被写体', en: 'AI Subject' },
  'masks.aiSubjectLabel': { ja: 'AI被写体マスクを追加', en: 'Add AI subject mask' },
  'masks.aiWorking': { ja: '解析中…', en: 'Analyzing…' },
  'masks.autoLocalBtn': { ja: 'Auto Local（自動で領域補正）', en: 'Auto Local (region masks)' },
  'masks.autoLabel': { ja: 'Auto Localマスクを追加', en: 'Add Auto Local mask' },
  'masks.autoNone': {
    ja: '自動補正できる領域が見つかりませんでした。',
    en: 'No regions to auto-correct were found.',
  },
  'masks.regionSky': { ja: '空', en: 'Sky' },
  'masks.regionShadows': { ja: 'シャドウ', en: 'Shadows' },
  'masks.regionHighlights': { ja: 'ハイライト', en: 'Highlights' },
  'masks.aiSubjectHint': {
    ja: 'AIが検出した被写体の範囲です。ぼかしや反転で調整し、下のスライダーでこの範囲だけを補正できます。',
    en: 'The subject AI detected. Feather or invert it, then use the sliders below to adjust just this area.',
  },
  'masks.empty': {
    ja: 'まだマスクはありません。上のボタンから追加してください。',
    en: 'No masks yet. Add one with the buttons above.',
  },
  'masks.toggleLabel': { ja: 'マスクの表示切替', en: 'Toggle mask' },
  'masks.noEffect': { ja: '（効果なし）', en: '(no effect)' },
  'masks.moveUp': { ja: '上へ', en: 'Move up' },
  'masks.moveDown': { ja: '下へ', en: 'Move down' },
  'masks.reorderLabel': { ja: 'マスクを並べ替え', en: 'Reorder mask' },
  'masks.delete': { ja: '削除', en: 'Delete' },
  'masks.deleteLabel': { ja: 'マスクを削除', en: 'Delete mask' },
  'masks.renameLabel': { ja: 'マスク名を変更', en: 'Rename mask' },
  'masks.invert': { ja: '反転', en: 'Invert' },
  'masks.invertLabel': { ja: '補正値を反転', en: 'Invert adjustments' },
  'masks.invertHelp': {
    ja: 'このマスクの補正値の符号をすべて反転します（例：明るくを暗くに）。',
    en: 'Flips the sign of every adjustment in this mask (e.g. brighten becomes darken).',
  },
  'masks.editShapeLabel': { ja: 'マスク形状を編集', en: 'Edit mask shape' },
  'masks.localAdjustments': { ja: 'このマスク内の補正', en: 'Adjustments in this mask' },
  'masks.localHelp': {
    ja: 'ここでの補正はマスクのかかった範囲だけに、カバレッジの濃さに応じて適用されます。',
    en: 'These adjustments apply only within the mask, scaled by how strongly each pixel is covered.',
  },
  'masks.paint': { ja: '塗る', en: 'Paint' },
  'masks.erase': { ja: '消す', en: 'Erase' },
  'masks.size': { ja: 'サイズ', en: 'Size' },
  'masks.feather': { ja: 'ぼかし', en: 'Feather' },
  'masks.flow': { ja: '流量', en: 'Flow' },
  'masks.brushSettingsLabel': { ja: 'ブラシ設定', en: 'Brush settings' },
  'masks.invertArea': { ja: '範囲を反転', en: 'Invert area' },
  'masks.invertAreaHelp': {
    ja: '楕円の内側ではなく外側に効果をかけます。',
    en: 'Affect outside the ellipse instead of inside.',
  },

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
  'detail.colorNr': { ja: 'カラーノイズ', en: 'Color Noise' },
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
    ja: '暗い部分などに出る、赤や緑の細かい色ムラ（カラーノイズ）を滑らかにします。明るさの細かい模様（輝度のディテール）はそのまま保ちます。「輝度」スライダーとは別に、色のにじみだけを狙って抑えます。',
    en: 'Smooths the small red/green/blue color speckles that show up in noisy areas (e.g. shadows on a high-ISO photo), without softening brightness detail. This targets color blotches specifically — separate from the Luminance slider above.',
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
  'export.share': { ja: '共有', en: 'Share' },

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
  'ai.title': { ja: 'AI機能', en: 'AI Tools' },
  'ai.intro': {
    ja: '写真の内容をAIが自動で認識するツール群です。モデルは初回のみダウンロードし、以降はブラウザ内で動作します（外部サーバーには送信されません）。',
    en: 'AI tools that automatically recognize what\u2019s in your photo. Models download once and then run entirely in your browser \u2014 nothing is sent to a server.',
  },
  'ai.detectSubjectHelp': {
    ja: '写真のどこが被写体で、どこが背景かをAIが判定します。判定結果（マスク）は「かんたんモード」の背景ぼかし機能などで使われます。単体では画像は変化しません。',
    en: 'Judges which part of the photo is the subject vs. the background. The result (a mask) is used by features like Beginner Mode\u2019s Blur Background \u2014 running it here by itself doesn\u2019t change the photo.',
  },
  'ai.maskReady': { ja: '判定完了', en: 'Ready' },
  'ai.removeObjectTitle': { ja: 'オブジェクト除去', en: 'Remove Object' },
  'ai.removeObjectHelp': {
    ja: 'ネットや通行人など、消したい部分をブラシで塗って自動で埋める機能です。ビューア下部のツールバーにある消しゴムアイコンから使えます。',
    en: 'Paint over anything you want removed (a net, a passerby) and the AI fills it in. Available from the eraser icon in the viewer\u2019s toolbar.',
  },
  'ai.openRemoveObject': { ja: 'オブジェクト除去を開く', en: 'Open Remove Object' },
  'ai.roadmap': {
    ja: '今後追加予定：目・歯だけを狙った補正など、より高精度な顔認識AI機能（現状は被写体全体への穏やかな効果にとどめています）。',
    en: 'Coming next: more precise face-aware tools (like eyes/teeth-only adjustments) using a dedicated face landmark model \u2014 today\u2019s tools apply gentle, whole-subject effects rather than targeting individual features.',
  },
  'ai.portraitSmoothTitle': { ja: 'ポートレート肌なめらか', en: 'Portrait Smooth' },
  'ai.portraitSmoothHelp': {
    ja: '被写体だけを検出し、その範囲の質感を穏やかに滑らかにします（背景はそのまま）。顔の形や目・鼻・口の位置を変える機能ではありません。',
    en: 'Detects the subject and gently softens texture within it only \u2014 the background stays untouched. This does not reshape any facial features or change identity.',
  },
  'ai.strength': { ja: '強さ', en: 'Strength' },
  'ai.done': { ja: '完成しました', en: 'Done.' },
  'ai.autoGradeTitle': { ja: 'AIオートグレード', en: 'AI Auto Grade' },
  'ai.autoGradeHelp': {
    ja: '露出・ホワイトバランス・コントラストを自動補正した上で、写真集などで見られる落ち着いた発色（マット気味の階調・穏やかなハイライト）を1クリックで適用します。編集内容は他の調整と同じく後から取り消せます。',
    en: 'Auto-corrects exposure/white balance/contrast, then applies a restrained, editorial-style grade (a touch of matte tonality, soft highlights) in one click. Fully undoable, like any other adjustment.',
  },

  // Info popover
  'info.title': { ja: '写真の情報', en: 'Photo Info' },
  'info.noCameraData': {
    ja: 'この写真にはカメラ情報が含まれていません',
    en: 'This photo doesn\u2019t have camera metadata.',
  },
  'info.viewOnMap': { ja: '地図で見る', en: 'View on map' },
  'info.lookUpPlace': { ja: '地名を調べる', en: 'Look up place name' },
  'info.lookingUp': { ja: '調べています…', en: 'Looking up…' },
  'info.placeLookupNote': {
    ja: '外部サービス（OpenStreetMap）に座標を送信して調べます。',
    en: 'This sends the coordinates to an external service (OpenStreetMap).',
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
  'remove.suggest': { ja: '候補を提案', en: 'Suggest area' },

  // White balance eyedropper
  'wb.pickerLabel': { ja: 'ホワイトバランス（スポイト）', en: 'White Balance (Picker)' },
  'wb.pickerHelp': {
    ja: '本来グレーや白であるはずの場所をクリックしてください',
    en: 'Click a spot that should be neutral gray or white',
  },
  'remove.download': { ja: 'ダウンロード', en: 'Download' },
  'remove.redo': { ja: 'やり直す', en: 'Redo' },
  'remove.previewReady': {
    ja: '完成しました。問題なければダウンロードしてください。',
    en: 'Ready. Download it if it looks good.',
  },
  // GIF panel
  'tab.gif': { ja: 'GIF', en: 'GIF' },
  'gif.title': { ja: 'GIFアニメーションを作成', en: 'Create an animated GIF' },
  'gif.intro': {
    ja: '複数の写真を選んで、順番に切り替わるGIFアニメーションを作ります。',
    en: 'Pick several photos to create a GIF that plays through them in order.',
  },
  'gif.pickImages': { ja: '画像を選択（2枚以上）', en: 'Pick images (2 or more)' },
  'gif.pickImagesHelp': {
    ja: 'ライブラリに読み込んだ画像から選びます。タップした順に番号が付き、その順番で再生されます。',
    en: 'Choose from the images you\u2019ve loaded into the library. They\u2019re numbered in the order you tap them, and play back in that order.',
  },
  'gif.noImages': {
    ja: '先にライブラリへ画像を読み込んでください',
    en: 'Load some images into the library first.',
  },
  'gif.order': { ja: '再生順', en: 'Playback order' },
  'gif.delay': { ja: '表示時間', en: 'Frame delay' },
  'gif.size': { ja: 'サイズ', en: 'Size' },
  'gif.generate': { ja: 'GIFを生成', en: 'Generate GIF' },
  'gif.done': { ja: '完成しました', en: 'Done.' },

  // Collage panel
  'tab.collage': { ja: 'コラージュ', en: 'Collage' },
  'collage.title': { ja: 'コラージュを作成', en: 'Create a collage' },
  'collage.intro': {
    ja: '複数の写真を1枚にまとめ、文字を入れることもできます。',
    en: 'Combine several photos into one image, with an optional caption.',
  },
  'collage.pickImages': { ja: '画像を選択（2枚以上）', en: 'Pick images (2 or more)' },
  'collage.pickImagesHelp': {
    ja: 'タップした枚数に応じて自動的にグリッド配置されます（2枚は横並び、4枚は2×2など）。',
    en: 'Automatically arranged into a grid based on how many you pick (2 side by side, 4 in a 2\u00d72 grid, etc).',
  },
  'collage.noImages': {
    ja: '先にライブラリへ画像を読み込んでください',
    en: 'Load some images into the library first.',
  },
  'collage.gap': { ja: '画像の間隔', en: 'Gap' },
  'collage.addText': { ja: '文字を入れる', en: 'Add text' },
  'collage.textPlaceholder': { ja: '文字を入力', en: 'Enter text' },
  'collage.textSize': { ja: '文字サイズ', en: 'Text size' },
  'collage.generate': { ja: 'コラージュを生成', en: 'Generate collage' },
  'collage.done': { ja: '完成しました', en: 'Done.' },
  'collage.needTwo': { ja: 'あと1枚以上選んでください', en: 'Pick at least one more image.' },
} as const;

export function translate(locale: 'ja' | 'en', key: TranslationKey): string {
  return DICT[key][locale];
}

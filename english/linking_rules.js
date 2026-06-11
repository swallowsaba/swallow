/* ============================================================
   data/linking_rules.js — アメリカ英語の音声変化ルール（教材）
   実際の検出ロジックは js/linking.js の analyzeLinking() が担う。
   ここでは各ルールの説明と練習例を提供する。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.linkingRules = [
  {
    id: "link", name: "連結（リエゾン）", color: "link",
    ja: "子音で終わる語の直後に母音で始まる語が来ると、音がつながって一語のように聞こえます。",
    examples: [
      { text: "check it out", sound: "チェッキラゥ" },
      { text: "an apple", sound: "アナポゥ" },
      { text: "pick it up", sound: "ピッキラップ" }
    ]
  },
  {
    id: "flap", name: "フラップ T", color: "flap",
    ja: "母音と母音にはさまれた t / tt は、日本語のラ行に近い軽い音（ɾ）になります。",
    examples: [
      { text: "water", sound: "ワラー" },
      { text: "get it", sound: "ゲリッ" },
      { text: "a lot of", sound: "アララヴ" }
    ]
  },
  {
    id: "drop", name: "脱落（ストップ）", color: "drop",
    ja: "子音が連続すると、前の破裂音（t, d, p, k など）が飲み込まれてほとんど聞こえなくなります。",
    examples: [
      { text: "next day", sound: "ネクスデイ" },
      { text: "good night", sound: "グッナイ" },
      { text: "old man", sound: "オウルマン" }
    ]
  },
  {
    id: "assim", name: "同化", color: "assim",
    ja: "隣り合う音が影響し合って別の音に変わります。d + you → ヂュ、t + you → チュ が代表例です。",
    examples: [
      { text: "did you", sound: "ディジュ" },
      { text: "don't you", sound: "ドンチュ" },
      { text: "would you", sound: "ウヂュ" }
    ]
  },
  {
    id: "weak", name: "弱形", color: "weak",
    ja: "can, to, for, of, and などの機能語は、文中で弱く短く曖昧な音（シュワー）になります。",
    examples: [
      { text: "a cup of tea", sound: "アカッパティー" },
      { text: "fish and chips", sound: "フィッシュンチップス" },
      { text: "I can do it", sound: "アイクンドゥイッ" }
    ]
  },
  {
    id: "contract", name: "縮約（wanna・gonna）", color: "assim",
    ja: "want to → wanna、going to → gonna、got to → gotta のように、くだけた会話で縮約されます。",
    examples: [
      { text: "I want to go", sound: "アイワナゴウ" },
      { text: "I'm going to call", sound: "アイムガナコーォ" },
      { text: "I've got to leave", sound: "アイヴガラリーヴ" }
    ]
  }
];

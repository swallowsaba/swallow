/* ============================================================
   katakana.js — カタカナ変換エンジン toKatakana() ＋ 変換画面
   - 既知語は発音辞書(pron_dict)で正確に、未知語はルールベースで近似変換。
   - カタカナは「補助輪」。IPA併記し、設定で非表示にしていける思想（READMEで明記）。
   window.Katakana として公開し、#/katakana に画面を登録する。
   ============================================================ */
(function () {
  "use strict";

  var VOWELS = { a: 0, i: 1, u: 2, e: 3, o: 4 };

  // 子音＋母音（CV）表：[ア段, イ段, ウ段, エ段, オ段]
  var CV = {
    k: ["カ", "キ", "ク", "ケ", "コ"], g: ["ガ", "ギ", "グ", "ゲ", "ゴ"],
    s: ["サ", "シ", "ス", "セ", "ソ"], z: ["ザ", "ジ", "ズ", "ゼ", "ゾ"],
    t: ["タ", "ティ", "トゥ", "テ", "ト"], d: ["ダ", "ディ", "ドゥ", "デ", "ド"],
    n: ["ナ", "ニ", "ヌ", "ネ", "ノ"], h: ["ハ", "ヒ", "フ", "ヘ", "ホ"],
    b: ["バ", "ビ", "ブ", "ベ", "ボ"], p: ["パ", "ピ", "プ", "ペ", "ポ"],
    m: ["マ", "ミ", "ム", "メ", "モ"], r: ["ラ", "リ", "ル", "レ", "ロ"],
    l: ["ラ", "リ", "ル", "レ", "ロ"], y: ["ヤ", "イ", "ユ", "イェ", "ヨ"],
    w: ["ワ", "ウィ", "ウ", "ウェ", "ウォ"], f: ["ファ", "フィ", "フ", "フェ", "フォ"],
    v: ["ヴァ", "ヴィ", "ヴ", "ヴェ", "ヴォ"], j: ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"],
    c: ["カ", "シ", "ク", "セ", "コ"]
  };

  // 単独・語末の子音
  var STANDALONE = {
    b: "ブ", c: "ク", d: "ド", f: "フ", g: "グ", h: "", j: "ジ", k: "ク",
    l: "ル", m: "ム", n: "ン", p: "プ", q: "ク", r: "ル", s: "ス", t: "ト",
    v: "ヴ", w: "ウ", x: "クス", y: "イ", z: "ズ"
  };

  // 連字（長いものから順に照合）
  var DIGRAPHS = [
    ["tion", "ション"], ["sion", "ジョン"], ["igh", "アイ"], ["ough", "オー"],
    ["sh", "シュ"], ["ch", "チ"], ["th", "ス"], ["ph", "フ"], ["ck", "ック"],
    ["ng", "ング"], ["qu", "クワ"], ["oo", "ウー"], ["ee", "イー"], ["ea", "イー"],
    ["ai", "エイ"], ["ay", "エイ"], ["oa", "オウ"], ["ow", "オウ"], ["ou", "アウ"],
    ["oi", "オイ"], ["oy", "オイ"], ["ar", "アー"], ["or", "オー"], ["er", "アー"],
    ["ir", "アー"], ["ur", "アー"]
  ];

  function isVowel(ch) { return VOWELS.hasOwnProperty(ch); }
  function vowelKana(ch) { return ["ア", "イ", "ウ", "エ", "オ"][VOWELS[ch]]; }

  // 1語をルールベースでカタカナに（近似）
  function ruleKatakana(raw) {
    var word = String(raw).toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return "";
    // 語末の黙字 e を落とす（make, name など）
    if (word.length > 2 && word.endsWith("e") && !isVowel(word[word.length - 2])) {
      word = word.slice(0, -1);
    }
    var out = "";
    var i = 0;
    while (i < word.length) {
      // 連字照合
      var matched = false;
      for (var d = 0; d < DIGRAPHS.length; d++) {
        var seq = DIGRAPHS[d][0];
        if (word.substr(i, seq.length) === seq) { out += DIGRAPHS[d][1]; i += seq.length; matched = true; break; }
      }
      if (matched) continue;

      var c = word[i];
      var next = word[i + 1];

      if (isVowel(c)) { out += vowelKana(c); i += 1; continue; }

      // 同じ子音の連続 → 促音「ッ」
      if (next === c && CV[c]) { out += "ッ"; i += 1; continue; }

      if (CV[c] && next && isVowel(next)) { out += CV[c][VOWELS[next]]; i += 2; continue; }

      out += (STANDALONE[c] != null ? STANDALONE[c] : "");
      i += 1;
    }
    return out;
  }

  // 1語をカタカナに（辞書優先）
  function wordToKatakana(word) {
    var dict = (window.EigoData && window.EigoData.pronDict) || {};
    var key = String(word).toLowerCase().replace(/[^a-z']/g, "");
    if (dict[key] && dict[key].kata) return dict[key].kata;
    return ruleKatakana(word);
  }

  // 文章をカタカナに（語ごとに変換し、区切りはそのまま）
  function toKatakana(text) {
    if (!text) return "";
    return String(text).split(/(\s+)/).map(function (tok) {
      if (/^\s+$/.test(tok) || tok === "") return tok;
      // 前後の句読点を保持
      var m = tok.match(/^([^A-Za-z']*)([A-Za-z']+)([^A-Za-z']*)$/);
      if (!m) return tok;
      return m[1] + wordToKatakana(m[2]) + m[3];
    }).join("");
  }

  window.Katakana = { toKatakana: toKatakana, wordToKatakana: wordToKatakana };

  /* ---------- 画面：カタカナ変換ツール ---------- */
  function render() {
    var html =
      '<section class="view-enter">' +
        EM.backLink("#/pron", "発音メニュー") +
        '<p class="section-title">カタカナ変換</p>' +
        '<div class="notice notice--info"><span class="notice__icon">i</span>' +
          '<span>カタカナは発音の<strong>補助輪</strong>です。慣れてきたらIPAと音だけで聞き取れるよう、徐々に頼らないのが上達のゴールです。</span></div>' +
        '<div class="field mt-4">' +
          '<label class="field__label" for="kata-in">英文を入力</label>' +
          '<textarea class="textarea" id="kata-in" placeholder="例：Could you send me the file?">Could you send me the file?</textarea>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" id="kata-go" type="button">カタカナに変換</button>' +
        '<div id="kata-out" class="mt-5"></div>' +
      '</section>';
    return { html: html, onMount: bind };
  }

  function bind() {
    var input = document.getElementById("kata-in");
    var out = document.getElementById("kata-out");
    function run() {
      var text = (input.value || "").trim();
      if (!text) { out.innerHTML = ""; return; }
      var kata = toKatakana(text);
      out.innerHTML =
        '<div class="card">' +
          '<p class="section-eyebrow">参考カタカナ</p>' +
          '<p class="linking-out">' + EM.escapeHtml(kata) + '</p>' +
          '<div class="row-between mt-4">' +
            '<span class="text-soft" style="font-size:var(--fs-small)">辞書にある語は正確に、未知語はルールで近似します</span>' +
            '<button class="audio-btn audio-btn--wide" id="kata-play" type="button">▶ 音声</button>' +
          '</div>' +
        '</div>';
      var play = document.getElementById("kata-play");
      if (play) play.addEventListener("click", function () { EM.speak(text); });
    }
    document.getElementById("kata-go").addEventListener("click", run);
    run(); // 初期表示
  }

  EM.registerView("#/katakana", { title: "カタカナ変換", tab: "pron", render: render });
})();

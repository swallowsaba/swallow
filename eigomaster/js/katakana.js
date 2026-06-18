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

  // 語末パターン（発音に沿った定型。長いものから照合）
  var ENDINGS = [
    ["tional", "ショナル"], ["tion", "ション"], ["sion", "ション"], ["cion", "ション"],
    ["tious", "シャス"], ["cious", "シャス"], ["geous", "ジャス"], ["gious", "ジャス"],
    ["cial", "シャル"], ["tial", "シャル"], ["cture", "クチャー"], ["sure", "シャー"],
    ["ture", "チャー"], ["dure", "ジャー"], ["able", "アボー"], ["ible", "イボー"],
    // 接尾辞（長いものから先に。派生語に多い）
    ["ization", "イゼイション"], ["isation", "イゼイション"],
    ["bility", "ビリティ"], ["ility", "イリティ"],
    ["ative", "アティヴ"], ["itive", "イティヴ"], ["tive", "ティヴ"], ["sive", "シヴ"],
    ["ology", "オロジー"], ["ography", "オグラフィー"],
    ["tory", "トリー"], ["tary", "テリー"], ["sory", "ソリー"],
    ["ously", "アスリー"], ["iously", "イアスリー"], ["ious", "イアス"],
    ["ize", "アイズ"], ["ise", "アイズ"], ["yze", "アイズ"],
    ["ism", "イズム"], ["ist", "イスト"],
    ["ial", "イアル"], ["ian", "イアン"], ["eous", "イアス"],
    ["ance", "アンス"], ["ence", "エンス"], ["ancy", "アンシー"], ["ency", "エンシー"],
    ["ment", "メント"], ["ness", "ネス"], ["less", "レス"],
    ["stle", "ソー"], ["ckle", "コー"], ["ngle", "ンゴー"], ["nkle", "ンコー"],
    ["ttle", "トー"], ["ddle", "ドー"], ["ssle", "ソー"], ["zzle", "ゾー"], ["ffle", "フォー"],
    ["ggle", "ゴー"], [" pple", "ポー"], ["mble", "ンボー"], ["nble", "ンボー"],
    ["ble", "ボー"], ["ple", "ポー"], ["dle", "ドー"],
    ["tle", "トー"], ["gle", "ゴー"], ["kle", "コー"], ["zle", "ゾー"], ["fle", "フォー"],
    ["cle", "コー"], ["sle", "ソー"], ["ought", "オート"], ["aught", "オート"],
    ["ous", "アス"], ["ful", "フォー"],
    ["ing", "イング"],
    ["ity", "イティ"], [" ", " "]
  ];
  // 子音二重音字（母音が続く場合は別途CV結合）
  var CDI = [
    ["tch", "チ"], ["dge", "ジ"], ["sch", "スク"], ["shr", "シュル"], ["thr", "スル"],
    ["chr", "クル"], ["sh", "シュ"], ["ch", "チ"], ["th", "ス"], ["ph", "フ"], ["wh", "ホ"],
    ["ck", "ック"], ["ng", "ング"], ["nk", "ンク"], ["gh", "グ"], ["wr", "ル"],
    ["kn", "ヌ"], ["gn", "ヌ"], ["ps", "ス"], ["rh", "ル"]
  ];
  var SH5 = ["シャ", "シ", "シュ", "シェ", "ショ"];
  var CH5 = ["チャ", "チ", "チュ", "チェ", "チョ"];
  var TH5 = ["サ", "スィ", "ス", "セ", "ソ"];
  var QU5 = ["クワ", "クウィ", "ク", "クウェ", "クウォ"];

  // 1語をルールベースでカタカナに（音声準拠・近似）
  function ruleKatakana(raw) {
    var word = String(raw).toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return "";

    // 語末の定型パターンを先に切り出す
    var suffix = "";
    for (var e = 0; e < ENDINGS.length; e++) {
      var es = ENDINGS[e][0];
      if (es === " ") continue;
      if (word.length > es.length && word.slice(-es.length) === es) {
        suffix = ENDINGS[e][1];
        word = word.slice(0, -es.length);
        break;
      }
    }

    // magic-e（CVCe）：語末の黙字 e を落とす（make, name など）
    if (word.length > 2 && word.endsWith("e") && !isVowel(word[word.length - 2])) {
      word = word.slice(0, -1);
    }

    var out = "";
    var i = 0;
    // 語頭 wa + 子音 → ウォ（water, want, watch, wash, wall）。was/wagは除外したいが近似。
    if (/^wa[^aeiou]/.test(word) && word.slice(0,3) !== "was" && word.slice(0,3) !== "wag") { out = "ウォ"; i = 2; }
    while (i < word.length) {
      var rest = word.slice(i);
      var matched = false;

      // 母音連字（DIGRAPHS の母音系）
      for (var d = 0; d < DIGRAPHS.length; d++) {
        var seq = DIGRAPHS[d][0];
        // 子音二重音字はこの後で母音結合を試すため、母音系のみここで処理
        if (rest.indexOf(seq) === 0 && "aeiou".indexOf(seq[0]) >= 0) {
          out += DIGRAPHS[d][1]; i += seq.length; matched = true; break;
        }
      }
      if (matched) continue;

      // r制御母音：子音 + 母音 + r（後ろが母音でない）→ 長音化（water→ウォーター, bird→バード）
      var cR = word[i], vR = word[i+1], rR = word[i+2], aftR = word[i+3];
      if (CV[cR] && vR && isVowel(vR) && rR === "r" && (!aftR || !isVowel(aftR))) {
        // o+r が語末→アー段(doctor,actor)、o+r+子音→オ段(order,corn)
        var oEnd = (vR === "o" && !aftR);
        var idxR = (vR === "o" && !oEnd) ? 4 : 0;
        var ccR = cR;
        if (cR === "c") ccR = "k"; else if (cR === "g") ccR = "g"; else if (cR === "q") ccR = "k";
        if (CV[ccR]) { out += CV[ccR][idxR] + "ー"; i += 3; continue; }
      }
      // 語頭・子音後の r制御母音（ar/er/ir/or/ur 単独）
      if (isVowel(word[i]) && word[i+1] === "r" && (!word[i+2] || !isVowel(word[i+2]))) {
        out += (word[i] === "o") ? "オー" : "アー"; i += 2; continue;
      }

      // 子音二重音字（母音が続けば結合、そうでなければ単独）
      for (var k = 0; k < CDI.length; k++) {
        var cs = CDI[k][0];
        if (rest.indexOf(cs) === 0) {
          var af = word[i + cs.length];
          if (cs === "sh" && af && isVowel(af)) { out += SH5[VOWELS[af]]; i += cs.length + 1; matched = true; break; }
          if (cs === "ch" && af && isVowel(af)) { out += CH5[VOWELS[af]]; i += cs.length + 1; matched = true; break; }
          if (cs === "th" && af && isVowel(af)) { out += TH5[VOWELS[af]]; i += cs.length + 1; matched = true; break; }
          if (cs === "ph" && af && isVowel(af)) { out += CV.f[VOWELS[af]]; i += cs.length + 1; matched = true; break; }
          if (cs === "wh" && af && isVowel(af)) { out += (af === "o" ? "ホ" : CV.w[VOWELS[af]]); i += cs.length + 1; matched = true; break; }
          out += CDI[k][1]; i += cs.length; matched = true; break;
        }
      }
      if (matched) continue;

      var c = word[i];
      var next = word[i + 1];

      if (isVowel(c)) { out += vowelKana(c); i += 1; continue; }

      // 同じ子音の連続 → 促音「ッ」
      if (next === c && c !== "h") { out += "ッ"; i += 1; continue; }

      // soft c / soft g（e, i, y の前）
      var cc = c;
      if (c === "c") { cc = (next && "eiy".indexOf(next) >= 0) ? "s" : "k"; }
      else if (c === "g") { cc = (next && "eiy".indexOf(next) >= 0) ? "j" : "g"; }
      else if (c === "q") { cc = "k"; }
      else if (c === "x") { out += "クス"; i += 1; continue; }

      if (CV[cc] && next && isVowel(next)) { out += CV[cc][VOWELS[next]]; i += 2; continue; }

      out += (STANDALONE[cc] != null ? STANDALONE[cc] : (STANDALONE[c] != null ? STANDALONE[c] : ""));
      i += 1;
    }
    return out + suffix;
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
    return String(text).split(/(\s+|-)/).map(function (tok) {
      if (tok === "-") return "-";
      if (/^\s+$/.test(tok) || tok === "") return tok;
      // 前後の句読点を保持
      var m = tok.match(/^([^A-Za-z']*)([A-Za-z']+)([^A-Za-z']*)$/);
      if (!m) return tok;
      return m[1] + wordToKatakana(m[2]) + m[3];
    }).join("");
  }

  /* ============================================================
     連結発音（つながった話し言葉）のカタカナ
     - 単独語の発音(wordToKatakana)は丁寧形（could→クッド）になりがちだが、
       文中ではアメリカ英語特有の弱化・脱促音・脱長音が起きる（could→クド）。
     - ここでは 1語ずつ「脱日本語化」した token カタカナを作り（reduceTokenKana）、
       文単位では弱形機能語の置換・短縮を行う（toKatakanaConnected / connectedTokens）。
     - 語境界をまたぐ連結(∪)・脱落の結合は linking.js が tags/links を使って組み立てる。
       （ここで Linking を呼ぶと相互再帰になるため呼ばない）
     ============================================================ */

  // 機能語の弱形（文中では内容語より弱く短く発音される）。小文字・記号除去後のキー。
  // 値が "" のものは「文の連結表記では脱落」（冠詞 a など）。token 表記では括弧で薄く出す。
  var WEAK_FORMS = {
    a: "",        an: "アン",   the: "ザ",    to: "トゥ",   of: "アヴ",
    "for": "ファ", and: "アン",  or: "ア",     your: "ヤ",   you: "ユー",
    can: "クン",  at: "アト",   from: "フラム", as: "アズ",   but: "バッ",
    that: "ザッ", them: "エム",  than: "ザン",  was: "ワズ",  were: "ワ",
    are: "ア",    is: "イズ",   has: "ハズ",   have: "ハヴ",  had: "ハド",
    "do": "ドゥ",  does: "ダズ",  he: "ヒ",      him: "イム",  his: "イズ",
    she: "シ",    we: "ウィ",   our: "アワ",   us: "アス",   will: "ウル",
    would: "ウド", could: "クド", should: "シュド", must: "マス", just: "ジャス",
    "in": "イン", on: "オン",   am: "アム",    me: "ミ",     my: "マイ"
  };

  function cleanWord(w) { return String(w).toLowerCase().replace(/[^a-z']/g, ""); }

  // 末尾の不要な促音(ッ)・長音(ー)を取り除いて、アメリカ英語の聞こえに近づける。
  function deJapanize(kana, eng) {
    if (!kana) return kana;
    // (1) 語末が単一の破裂音(b d g k p t / ck)で終わる語は、最後のモーラ直前の
    //     促音ッを取り除く（クッド→クド, チェック→チェク, ビッグ→ビグ）。
    if (/(ck|[bdgkpt])$/.test(eng)) {
      kana = kana.replace(/ッ(?=[ァ-ヴ][ャュョ]?ー?$)/, "");
    }
    // (2) 弱い -er/-or/-ar（あいまい母音＋R）で終わる多音節語は、末尾の長音ーを外す
    //     （bigger ビガー→ビガ, teacher ティーチャー→ティーチャ, doctor ダクター→ダクタ）。
    if (eng.length >= 4 && /[bcdfghjklmnpqrstvwxyz](er|or|ar)$/.test(eng)) {
      kana = kana.replace(/ー$/, "");
    }
    return kana;
  }

  // 1語の「文中での聞こえ方」カタカナ（1:1 で語数を保つ＝ハイライト整合用）。
  // forStr=true のとき、脱落する冠詞 a を空文字で返す（連結文字列用）。
  function reduceTokenKana(word, forStr) {
    var key = cleanWord(word);
    if (!key) return "";
    if (Object.prototype.hasOwnProperty.call(WEAK_FORMS, key)) {
      var wf = WEAK_FORMS[key];
      if (wf === "") return forStr ? "" : "（ア）"; // a：文連結では脱落、token表記は薄く
      return wf;
    }
    return deJapanize(wordToKatakana(word), key);
  }

  // 文 → 語ごとの reduced カタカナ配列（英語トークンと1:1対応）。
  function connectedTokens(text) {
    if (!text) return [];
    return String(text).trim().split(/\s+/).map(function (w) { return reduceTokenKana(w, false); });
  }

  /* ---------- 語境界のマージ（実際のアメリカ英語の連結発音）----------
     linking.js が検出した規則(rule)に従い、前後の語のカタカナを実際に結合する。
     - assim（同化）: d/t/s/z + you/your → ジュ/チュ/シュ など（could you→クッジュー）
     - link （連結）: 子音終わり + 母音始まり → 1音にまとめる（check it→チェキッ）
     - flap （境界フラップ）: 母音+t + 母音始まり → ラ行で弾く（get it→ゲリッ）
     - drop （脱落）: t/d + 子音始まり → 破裂させず詰める（good bye→グッバイ）
     戻り値 { prev, cur }（結合後の前語・現語カタカナ）。適用不可なら null。
  */
  var FINAL_CONS = { "ク": "k", "グ": "g", "ト": "t", "ド": "d", "ス": "s", "ズ": "z",
    "プ": "p", "ブ": "b", "フ": "f", "ヴ": "v", "ム": "m", "ン": "n", "ル": "r" };
  var LEAD_V = { "ア": 0, "イ": 1, "ウ": 2, "エ": 3, "オ": 4 };
  var VOICED_S = { was: 1, is: 1, his: 1, has: 1, as: 1, does: 1, goes: 1, these: 1, those: 1, whose: 1 };
  function combineCV(consLetter, vowelKana) {
    var idx = LEAD_V[vowelKana]; var row = CV[consLetter];
    if (!row || idx == null) return null;
    return row[idx];
  }
  // 英語綴りの語末子音（連結で次の母音に渡す音）。ck→k など。
  function engFinalCons(eng) {
    if (/ck$/.test(eng)) return "k";
    var ch = eng.slice(-1);
    if (/[bcdfghjklmnpqrstvwxz]/.test(ch)) return ({ c: "k", q: "k", x: "k" })[ch] || ch;
    return null;
  }
  // 前語カタカナの「語末子音・閉鎖の有無・子音を除いた本体」を求める。
  // 辞書が get→ゲッ / what→ワッ のように閉鎖をッで持つ形にも対応。
  function prevFinal(prevKana, prevEng) {
    if (/ッ$/.test(prevKana)) return { cons: engFinalCons(prevEng), stop: true, core: prevKana.slice(0, -1) };
    var tail = prevKana.slice(-1);
    if (FINAL_CONS[tail]) {
      var c = FINAL_CONS[tail];
      return { cons: c, stop: /[ktpbdg]/.test(c), core: prevKana.slice(0, -1) };
    }
    return { cons: null, stop: false, core: prevKana };
  }
  function mergeBoundary(prevKana, prevEng, nextKana, nextEng, rule) {
    prevEng = String(prevEng).replace(/[^a-z]/g, "");
    nextEng = String(nextEng).replace(/[^a-z]/g, "");
    var pf = prevFinal(prevKana, prevEng);
    if (rule === "assim") {
      var last = pf.cons || prevEng.slice(-1);     // d / t / s / z
      if (last === "s" && VOICED_S[prevEng]) last = "z";
      var isYour = /^your$/.test(nextEng);
      var p = pf.core;
      if ((last === "d" || last === "t") && !/ン$/.test(p)) p += "ッ"; // 破裂音は閉鎖（ッ）を残す
      var head;
      if (last === "t") head = isYour ? "チャ" : "チュー";         // t + y → /tʃ/
      else if (last === "s") head = isYour ? "シャ" : "シュー";    // s + y → /ʃ/
      else head = isYour ? "ジャ" : "ジュー";                      // d/z + y → /dʒ,ʒ/
      return { prev: p, cur: head };
    }
    if (rule === "drop") {
      var pd = pf.core;
      if (pf.stop && /[ァ-ヴ]$/.test(pd) && !/[スズンッー]$/.test(pd)) pd += "ッ"; // 未開放の閉鎖
      else if (pf.stop && /ッ$/.test(prevKana)) pd = prevKana;       // 既に閉鎖を持つ形はそのまま
      return { prev: pd, cur: nextKana };
    }
    if (rule === "flap") {
      var lv = nextKana.charAt(0);
      if (LEAD_V[lv] == null) return null;
      var sylF = combineCV("r", lv);                // 母音間 t/d は弾き音（ラ行）
      if (!sylF) return null;
      return { prev: pf.core, cur: sylF + nextKana.slice(1) };
    }
    if (rule === "link") {
      var lv2 = nextKana.charAt(0);
      if (!pf.cons || LEAD_V[lv2] == null) return null;
      var syl = combineCV(pf.cons, lv2);
      if (!syl) return null;
      return { prev: pf.core, cur: syl + nextKana.slice(1) };
    }
    return null;
  }

  // 文 → 連結発音カタカナ。Linking が使えれば規則に基づく結合（実際のアメリカ英語）を返す。
  // 使えない場合は弱化・脱促音/脱長音のみ反映したスペース区切りにフォールバック。
  function toKatakanaConnected(text) {
    if (!text) return "";
    if (window.Linking && window.Linking.analyzeLinking) {
      try { var r = window.Linking.analyzeLinking(text); if (r && typeof r.soundKata === "string") return r.soundKata; }
      catch (e) {}
    }
    return String(text).trim().split(/\s+/).map(function (w) {
      return reduceTokenKana(w, true);
    }).filter(function (s) { return s !== ""; }).join(" ");
  }

  window.Katakana = {
    toKatakana: toKatakana, wordToKatakana: wordToKatakana,
    reduceTokenKana: reduceTokenKana, connectedTokens: connectedTokens,
    toKatakanaConnected: toKatakanaConnected, mergeBoundary: mergeBoundary
  };

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

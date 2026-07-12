/* ============================================================
   etymology.js — 単語の語源・成り立ち（v93〜）
   1) 厳選データ（data/packs/etymology_*.json → EigoData.etymology）を優先
   2) 無ければ接頭辞・接尾辞・語根の形態素分析で自動生成
   UI からは EM.etymHtml(word) を呼ぶだけ（該当なしなら "" を返す）。
   ============================================================ */
(function () {
  "use strict";

  /* ---- 接頭辞（意味つき） ---- */
  var PREFIX = {
    "anti": "反対・対抗", "auto": "自分自身", "bi": "2つの", "bio": "生命",
    "co": "共に", "com": "共に・完全に", "con": "共に・完全に", "contra": "反対",
    "counter": "対抗", "de": "下へ・離れて・逆", "dis": "否定・分離", "e": "外へ",
    "eco": "環境・家", "em": "中に・〜にする", "en": "中に・〜にする", "ex": "外へ・前の",
    "extra": "外の・超えた", "fore": "前もって", "geo": "地球・土地", "hyper": "過度の",
    "hypo": "下の・不足", "il": "否定", "im": "否定／中へ", "in": "否定／中へ",
    "inter": "間の・相互", "intra": "内部の", "ir": "否定", "macro": "大きい",
    "mal": "悪い", "micro": "小さい", "mid": "中間", "mis": "誤って",
    "mono": "1つの", "multi": "多くの", "non": "否定", "ob": "〜に向かって・逆らって",
    "out": "外へ・超えて", "over": "過度に・上に", "para": "側の・準",
    "per": "通して・完全に", "poly": "多くの", "post": "後の", "pre": "前の",
    "pro": "前へ・賛成", "pseudo": "偽の", "re": "再び・後ろへ", "semi": "半分",
    "sub": "下の", "super": "上の・超えた", "sur": "上に・超えて", "sym": "共に",
    "syn": "共に", "tele": "遠くの", "trans": "越えて・別の状態へ", "tri": "3つの",
    "ultra": "極端な", "un": "否定", "under": "下に・不足", "uni": "1つの"
  };

  /* ---- 接尾辞（品詞・意味つき） ---- */
  var SUFFIX = {
    "ability": "〜できること（名詞）", "ibility": "〜できること（名詞）",
    "able": "〜できる（形容詞）", "ible": "〜できる（形容詞）",
    "al": "〜の（形容詞）／こと（名詞）", "ance": "状態・こと（名詞）", "ence": "状態・こと（名詞）",
    "ant": "〜する人・もの", "ent": "〜する人・もの",
    "ary": "〜に関する", "ate": "〜にする（動詞）", "ation": "すること・結果（名詞）",
    "cy": "状態（名詞）", "dom": "状態・領域（名詞）",
    "ee": "〜される人", "eer": "〜に従事する人", "er": "〜する人・もの", "or": "〜する人・もの",
    "ful": "〜に満ちた", "fy": "〜にする（動詞）", "ify": "〜にする（動詞）",
    "hood": "状態・時期（名詞）", "ian": "〜の人・専門家", "ic": "〜の（形容詞）",
    "ical": "〜の（形容詞）", "ish": "〜っぽい", "ism": "主義・状態（名詞）",
    "ist": "〜主義者・専門家", "ity": "性質（名詞）", "ive": "〜の性質を持つ（形容詞）",
    "ize": "〜にする（動詞）", "less": "〜のない", "let": "小さい〜",
    "like": "〜のような", "logy": "〜学", "ly": "〜のように（副詞）",
    "ment": "すること・結果（名詞）", "ness": "性質・状態（名詞）",
    "ology": "〜学", "ory": "〜の場所／〜の性質", "ous": "〜に満ちた（形容詞）",
    "ship": "状態・関係（名詞）", "sion": "すること・状態（名詞）", "tion": "すること・状態（名詞）",
    "tude": "状態（名詞）", "ty": "性質（名詞）", "ward": "〜の方向へ", "wise": "〜に関して",
    "y": "〜の性質の"
  };

  /* ---- 語根（ラテン語・ギリシャ語） ---- */
  var ROOT = {
    "act": "行う", "aud": "聞く", "bene": "良い", "cap": "つかむ・頭",
    "capt": "つかむ", "ced": "行く・譲る", "ceed": "行く", "cess": "行く・譲る",
    "ceive": "取る", "cept": "取る", "chron": "時間", "cid": "落ちる・切る",
    "cis": "切る", "claim": "叫ぶ", "clud": "閉じる", "clus": "閉じる",
    "cogn": "知る", "cord": "心", "corp": "体", "cred": "信じる",
    "cur": "走る・気にかける", "curs": "走る", "dict": "言う", "duc": "導く",
    "duct": "導く", "fac": "作る・行う", "fact": "作る・行う", "fect": "作る・行う",
    "fer": "運ぶ", "fid": "信頼", "fin": "終わり・境界", "flect": "曲げる",
    "flex": "曲げる", "flu": "流れる", "form": "形", "fort": "強い",
    "fract": "壊す", "frag": "壊す", "fund": "基礎・注ぐ", "fus": "注ぐ・溶ける",
    "gen": "生む・種類", "grad": "歩む・段階", "graph": "書く", "gram": "書かれたもの",
    "grat": "喜び・感謝", "gress": "歩む", "ject": "投げる", "join": "つなぐ",
    "junct": "つなぐ", "jud": "判断する", "jur": "法・誓う", "just": "正しい",
    "labor": "働く", "lect": "選ぶ・読む", "leg": "法・選ぶ・読む", "liber": "自由",
    "loc": "場所", "log": "言葉・論理", "loqu": "話す", "luc": "光",
    "lud": "遊ぶ", "man": "手", "mand": "命じる", "medi": "中間",
    "memor": "記憶", "merg": "沈む", "meter": "測る", "migr": "移動する",
    "min": "小さい・突き出る", "mit": "送る", "miss": "送る", "mob": "動く",
    "mot": "動く", "mov": "動く", "mut": "変わる", "nat": "生まれる",
    "nav": "船", "nect": "結ぶ", "neg": "否定する", "nom": "名前・法則",
    "nov": "新しい", "numer": "数", "onym": "名前", "oper": "働く",
    "opt": "選ぶ・見る", "ord": "順序", "pat": "苦しむ・耐える", "path": "感情・苦しみ",
    "ped": "足・子ども", "pel": "押す・駆る", "pend": "ぶら下がる・支払う", "pens": "支払う・重さを量る",
    "phon": "音", "photo": "光", "plic": "折る・重ねる", "ply": "折る",
    "pon": "置く", "port": "運ぶ", "pos": "置く", "prehend": "つかむ",
    "press": "押す", "prim": "最初の", "pris": "つかむ", "priv": "個人の・奪う",
    "prob": "試す・証明する", "prov": "試す・証明する", "puls": "押す・打つ", "put": "考える",
    "quir": "求める・尋ねる", "quest": "求める", "quis": "求める", "rect": "まっすぐ・正しい",
    "reg": "支配する・規則", "rupt": "破る", "scend": "登る", "sci": "知る",
    "scop": "見る", "scrib": "書く", "script": "書く", "sect": "切る",
    "sed": "座る", "sens": "感じる", "sent": "感じる", "sequ": "続く",
    "sert": "つなぐ・置く", "serv": "仕える・保つ", "sess": "座る", "sid": "座る",
    "sign": "印", "sist": "立つ", "soci": "仲間", "solv": "解く",
    "son": "音", "spec": "見る", "spect": "見る", "spir": "呼吸する",
    "sta": "立つ", "stat": "立つ", "stitut": "立てる・置く", "strain": "締める",
    "strict": "締める", "struct": "組み立てる", "sum": "取る・合計", "sumpt": "取る",
    "tact": "触れる", "tain": "保つ", "tang": "触れる", "tect": "覆う",
    "tempor": "時間", "ten": "保つ", "tend": "伸ばす", "tens": "伸ばす",
    "tent": "保つ・伸ばす", "termin": "終わり・境界", "terr": "土地・恐れ", "test": "証言する",
    "text": "織る", "the": "神", "therm": "熱", "tort": "ねじる",
    "tract": "引く", "trib": "与える", "trud": "押し出す", "vac": "空の",
    "val": "強い・価値", "ven": "来る", "vent": "来る", "ver": "真実",
    "vers": "回す・向ける", "vert": "回す・向ける", "vid": "見る", "vis": "見る",
    "vit": "生命", "viv": "生きる", "voc": "声・呼ぶ", "vok": "呼ぶ",
    "vol": "意志・回る", "volv": "回る"
  };

  function clean(word) {
    return String(word || "").toLowerCase().replace(/\(.*?\)/g, "").trim().split(/\s+/)[0].replace(/[^a-z-]/g, "");
  }

  /* 形態素分析：接頭辞（最長一致）→ 接尾辞（最長一致）→ 残りを語根照合 */
  function analyze(word) {
    var w = clean(word);
    if (!w || w.length < 5 || w.indexOf("-") >= 0) return null;
    var parts = [], rest = w, pre = null, suf = null;

    var preKeys = Object.keys(PREFIX).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < preKeys.length; i++) {
      var p = preKeys[i];
      if (rest.length - p.length >= 3 && rest.indexOf(p) === 0) { pre = p; rest = rest.slice(p.length); break; }
    }
    var sufKeys = Object.keys(SUFFIX).sort(function (a, b) { return b.length - a.length; });
    for (var j = 0; j < sufKeys.length; j++) {
      var s = sufKeys[j];
      if (rest.length - s.length >= 3 && rest.slice(-s.length) === s) { suf = s; rest = rest.slice(0, rest.length - s.length); break; }
    }
    // 残り（語幹）から語根を検索：先頭一致を優先、なければ包含
    var root = null;
    var rootKeys = Object.keys(ROOT).sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < rootKeys.length; k++) {
      if (rest.indexOf(rootKeys[k]) === 0) { root = rootKeys[k]; break; }
    }
    if (!root) {
      for (var k2 = 0; k2 < rootKeys.length; k2++) {
        if (rootKeys[k2].length >= 4 && rest.indexOf(rootKeys[k2]) >= 0) { root = rootKeys[k2]; break; }
      }
    }

    // 語根が見つからず、接頭辞+接尾辞も揃わないなら「分析なし」
    if (!root && !(pre && suf)) return null;

    if (pre) parts.push({ piece: pre + "-", ja: PREFIX[pre], type: "接頭辞" });
    if (root) parts.push({ piece: root, ja: ROOT[root], type: "語根" });
    else if (rest) parts.push({ piece: rest, ja: "", type: "語幹" });
    if (suf) parts.push({ piece: "-" + suf, ja: SUFFIX[suf], type: "接尾辞" });
    if (parts.length < 2) return null;

    var story = parts.filter(function (p) { return p.ja; }).map(function (p) {
      return "「" + p.piece + "」（" + p.ja + "）";
    }).join(" ＋ ");
    return { parts: parts, story: story ? story + " という成り立ち。" : "" };
  }

  /* 厳選データ優先で語源HTMLを返す（該当なしは ""） */
  EM.etymHtml = function (word) {
    var w = clean(word);
    if (!w) return "";
    var curated = (window.EigoData && window.EigoData.etymology) || {};
    var hit = curated[w];
    var inner = "";
    if (hit) {
      inner = (hit.origin ? '<p class="etym__origin">' + EM.escapeHtml(hit.origin) + "</p>" : "") +
              (hit.story ? '<p class="etym__story">' + EM.escapeHtml(hit.story) + "</p>" : "");
    } else {
      var a = analyze(w);
      if (!a) return "";
      var chips = a.parts.map(function (p) {
        return '<span class="etym__chip"><strong>' + EM.escapeHtml(p.piece) + "</strong>" +
               (p.ja ? "<small>" + EM.escapeHtml(p.ja) + "</small>" : "") + "</span>";
      }).join('<span class="etym__plus">+</span>');
      inner = '<div class="etym__parts">' + chips + "</div>" +
              (a.story ? '<p class="etym__story">' + EM.escapeHtml(a.story) + "</p>" : "");
    }
    if (!inner) return "";
    return '<div class="etym card mt-4"><p class="etym__head">語源・成り立ち</p>' + inner + "</div>";
  };
})();

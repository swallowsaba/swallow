/* ============================================================
   data/phonics.js — フォニックス（44音素）とミニマルペア
   phonemes: IPA / 種別 / つづりパターン / 口の形(ja) / 例語3つ
   minimalPairs: 日本人が混同しやすいペア（R/L, B/V, S/TH, 語末子音, シュワー 等）
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.phonics = {
  phonemes: [
    // ---- 子音 ----
    { ipa: "/p/", type: "子音", spell: "p, pp", mouth: "両唇を閉じて勢いよく開く（息を強く）", ex: ["pen", "happy", "stop"] },
    { ipa: "/b/", type: "子音", spell: "b, bb", mouth: "両唇を閉じ、声を出しながら開く", ex: ["book", "rabbit", "job"] },
    { ipa: "/t/", type: "子音", spell: "t, tt", mouth: "舌先を歯ぐきにつけ、息で弾く", ex: ["time", "letter", "cat"] },
    { ipa: "/d/", type: "子音", spell: "d, dd", mouth: "舌先を歯ぐきにつけ、声を出して弾く", ex: ["day", "ladder", "bed"] },
    { ipa: "/k/", type: "子音", spell: "c, k, ck", mouth: "舌の奥を上げて息で弾く", ex: ["call", "back", "make"] },
    { ipa: "/g/", type: "子音", spell: "g, gg", mouth: "舌の奥を上げ、声を出して弾く", ex: ["go", "bigger", "bag"] },
    { ipa: "/f/", type: "子音", spell: "f, ph", mouth: "上の歯を下唇に当て、息を擦り出す", ex: ["file", "phone", "off"] },
    { ipa: "/v/", type: "子音", spell: "v", mouth: "上の歯を下唇に当て、声を出して震わせる（Bと混同注意）", ex: ["very", "value", "save"] },
    { ipa: "/θ/", type: "子音", spell: "th", mouth: "舌先を上下の歯で軽く挟み、息を出す（無声）", ex: ["think", "three", "month"] },
    { ipa: "/ð/", type: "子音", spell: "th", mouth: "舌先を歯で挟み、声を出す（有声）", ex: ["this", "they", "mother"] },
    { ipa: "/s/", type: "子音", spell: "s, ss, c", mouth: "舌先を歯ぐきに近づけ、息を細く出す", ex: ["see", "city", "pass"] },
    { ipa: "/z/", type: "子音", spell: "z, s", mouth: "/s/の口で声を出す", ex: ["zoo", "busy", "is"] },
    { ipa: "/ʃ/", type: "子音", spell: "sh, ti", mouth: "唇を丸めて『シュ』と息を出す", ex: ["she", "nation", "wish"] },
    { ipa: "/ʒ/", type: "子音", spell: "s, ge", mouth: "/ʃ/の口で声を出す", ex: ["measure", "vision", "garage"] },
    { ipa: "/tʃ/", type: "子音", spell: "ch, tch", mouth: "『チュ』と舌先を弾いて擦る", ex: ["check", "watch", "teach"] },
    { ipa: "/dʒ/", type: "子音", spell: "j, ge, dge", mouth: "『ヂュ』と声を出して弾き擦る", ex: ["job", "bridge", "age"] },
    { ipa: "/m/", type: "子音", spell: "m, mm", mouth: "両唇を閉じ、鼻から声を出す", ex: ["make", "summer", "team"] },
    { ipa: "/n/", type: "子音", spell: "n, nn", mouth: "舌先を歯ぐきにつけ、鼻から声を出す", ex: ["new", "dinner", "ten"] },
    { ipa: "/ŋ/", type: "子音", spell: "ng, n(k)", mouth: "舌の奥を上げ、鼻から声を出す（『ング』のグを言わない）", ex: ["sing", "long", "think"] },
    { ipa: "/l/", type: "子音", spell: "l, ll", mouth: "舌先を歯ぐきにしっかりつける（Rと混同注意）", ex: ["light", "yellow", "call"] },
    { ipa: "/r/", type: "子音", spell: "r, rr", mouth: "舌をどこにもつけず奥に丸める（Lと混同注意）", ex: ["right", "sorry", "car"] },
    { ipa: "/w/", type: "子音", spell: "w, wh", mouth: "唇を強く丸めてから開く", ex: ["work", "what", "away"] },
    { ipa: "/j/", type: "子音", spell: "y", mouth: "舌の前を上げて『ヤ』へ移る", ex: ["yes", "you", "year"] },
    { ipa: "/h/", type: "子音", spell: "h", mouth: "喉の奥から息だけを出す", ex: ["help", "behind", "hot"] },

    // ---- 母音・二重母音 ----
    { ipa: "/iː/", type: "母音", spell: "ee, ea, e", mouth: "口を横に強く引いて『イー』（長め）", ex: ["see", "team", "meet"] },
    { ipa: "/ɪ/", type: "母音", spell: "i", mouth: "力を抜いた短い『イ』（イとエの中間）", ex: ["sit", "big", "city"] },
    { ipa: "/e/", type: "母音", spell: "e, ea", mouth: "日本語のエに近い", ex: ["bed", "head", "ten"] },
    { ipa: "/æ/", type: "母音", spell: "a", mouth: "口を大きく横に開き『エァ』", ex: ["cat", "bad", "apple"] },
    { ipa: "/ɑː/", type: "母音", spell: "o, a", mouth: "口を大きく開けた『アー』", ex: ["hot", "father", "stop"] },
    { ipa: "/ɔː/", type: "母音", spell: "aw, au, or", mouth: "唇を丸めた『オー』", ex: ["call", "saw", "more"] },
    { ipa: "/ʊ/", type: "母音", spell: "oo, u", mouth: "力を抜いた短い『ウ』", ex: ["book", "put", "good"] },
    { ipa: "/uː/", type: "母音", spell: "oo, u, ew", mouth: "唇を強く丸めた『ウー』", ex: ["too", "blue", "food"] },
    { ipa: "/ʌ/", type: "母音", spell: "u, o", mouth: "短くあいまいな『ア』（喉の奥）", ex: ["cup", "love", "money"] },
    { ipa: "/ɜːr/", type: "母音", spell: "ir, ur, er", mouth: "舌を丸めた『アー』にR色を加える", ex: ["bird", "work", "her"] },
    { ipa: "/ə/", type: "母音", spell: "a, e, o (弱)", mouth: "シュワー。力を抜いた最弱の『ア』。弱形の核", ex: ["about", "support", "common"] },
    { ipa: "/eɪ/", type: "二重母音", spell: "a, ai, ay", mouth: "『エイ』と滑らかに動かす", ex: ["day", "name", "wait"] },
    { ipa: "/aɪ/", type: "二重母音", spell: "i, igh, y", mouth: "『アイ』", ex: ["time", "high", "my"] },
    { ipa: "/ɔɪ/", type: "二重母音", spell: "oi, oy", mouth: "『オイ』", ex: ["boy", "voice", "join"] },
    { ipa: "/aʊ/", type: "二重母音", spell: "ou, ow", mouth: "『アウ』", ex: ["out", "now", "house"] },
    { ipa: "/oʊ/", type: "二重母音", spell: "o, oa, ow", mouth: "『オウ』（オーではない）", ex: ["go", "boat", "show"] },
    { ipa: "/ɪr/", type: "R母音", spell: "ear, eer", mouth: "『イア』にR色", ex: ["near", "here", "year"] },
    { ipa: "/er/", type: "R母音", spell: "air, are", mouth: "『エア』にR色", ex: ["air", "care", "where"] },
    { ipa: "/ʊr/", type: "R母音", spell: "oor, ure", mouth: "『ウア』にR色", ex: ["sure", "tour", "poor"] },
    { ipa: "/ɚ/", type: "R母音", spell: "er (弱)", mouth: "弱いシュワー＋R（語末の-er）", ex: ["water", "teacher", "better"] }
  ],
  minimalPairs: [
    { focus: "R / L",   a: "right", b: "light", ipaA: "/raɪt/", ipaB: "/laɪt/" },
    { focus: "R / L",   a: "rice",  b: "lice",  ipaA: "/raɪs/", ipaB: "/laɪs/" },
    { focus: "R / L",   a: "fry",   b: "fly",   ipaA: "/fraɪ/", ipaB: "/flaɪ/" },
    { focus: "B / V",   a: "best",  b: "vest",  ipaA: "/best/", ipaB: "/vest/" },
    { focus: "B / V",   a: "berry", b: "very",  ipaA: "/ˈberi/", ipaB: "/ˈveri/" },
    { focus: "S / TH",  a: "sink",  b: "think", ipaA: "/sɪŋk/", ipaB: "/θɪŋk/" },
    { focus: "S / TH",  a: "sing",  b: "thing", ipaA: "/sɪŋ/",  ipaB: "/θɪŋ/" },
    { focus: "Z / TH",  a: "zen",   b: "then",  ipaA: "/zen/",  ipaB: "/ðen/" },
    { focus: "iː / ɪ",  a: "seat",  b: "sit",   ipaA: "/siːt/", ipaB: "/sɪt/" },
    { focus: "iː / ɪ",  a: "leave", b: "live",  ipaA: "/liːv/", ipaB: "/lɪv/" },
    { focus: "æ / ʌ",   a: "cat",   b: "cut",   ipaA: "/kæt/",  ipaB: "/kʌt/" },
    { focus: "語末子音", a: "cap",   b: "cab",   ipaA: "/kæp/",  ipaB: "/kæb/" },
    { focus: "語末子音", a: "back",  b: "bag",   ipaA: "/bæk/",  ipaB: "/bæɡ/" }
  ]
};

/* ---- ミニマルペア追加 ---- */
window.EigoData.phonics.minimalPairs = window.EigoData.phonics.minimalPairs.concat([
  { focus: "F / H",   a: "food",  b: "hood",  ipaA: "/fuːd/",  ipaB: "/hʊd/" },
  { focus: "æ / e",   a: "bad",   b: "bed",   ipaA: "/bæd/",  ipaB: "/bed/" },
  { focus: "oʊ / ɔː", a: "low",   b: "law",   ipaA: "/loʊ/",  ipaB: "/lɔː/" },
  { focus: "ʌ / ɑː",  a: "cup",   b: "cop",   ipaA: "/kʌp/",  ipaB: "/kɑːp/" },
  { focus: "R / L",   a: "correct", b: "collect", ipaA: "/kəˈrekt/", ipaB: "/kəˈlekt/" },
  { focus: "S / SH",  a: "see",   b: "she",   ipaA: "/siː/",  ipaB: "/ʃiː/" }
]);

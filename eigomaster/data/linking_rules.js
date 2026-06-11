/* ============================================================
   data/linking_rules.js — アメリカ英語の音声変化（詳細解説版）
   各ルール：name / short(一行) / ja(理屈) / how(対象の文字・音) / examples
   examples の breakdown は「どの文字がどう結合・変化するか」を文字単位で説明。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.linkingRules = [
  {
    id: "link", name: "連結（リンキング）", color: "link",
    short: "子音 + 母音 → くっつく",
    ja: "前の語が『子音』で終わり、次の語が『母音』で始まると、その子音が次の母音へ移ってくっつき、1語のように聞こえます。英語が速く聞こえる最大の理由のひとつです。",
    how: "［語末の子音字］＋［語頭の母音字 a/e/i/o/u］が境界にあるとき。",
    examples: [
      { text: "check it out", sound: "チェッキラウ",
        breakdown: "check の k が it の i にくっつき『チェッ-キッ』。さらに it の t が out の母音にくっつき母音間でフラップ化し『キラウ』。che-ckit-out → チェッキラウ。" },
      { text: "an apple", sound: "アナポー",
        breakdown: "an の n が apple の a にくっつく。a-n‿a-pple → 『ア-ナポー』。" },
      { text: "pick it up", sound: "ピッキラップ",
        breakdown: "pick の k＋it の i で『キッ』、it の t＋up の u が母音間でフラップ化し『ラ』。pi-ckit-up → ピッキラップ。" }
    ]
  },
  {
    id: "flap", name: "フラップ T（ラ行化）", color: "flap",
    short: "母音 + t/tt + 母音 → 軽い『ラ』",
    ja: "アメリカ英語では t / tt が『母音と母音にはさまれる』と、舌先を一瞬弾く軽い音 /ɾ/（日本語のラ行に近い）になります。語をまたいでも起こります。",
    how: "［母音字］＋ t または tt ＋［母音字］。water, better などの語中、get it などの語境界。",
    examples: [
      { text: "water", sound: "ワラー",
        breakdown: "wa-t-er の t が a と e（母音）にはさまれ /ɾ/ に。t→『ラ』で『ワラー』。" },
      { text: "get it", sound: "ゲリッ",
        breakdown: "get の t が get の e と it の i にはさまれフラップ化。t→『リ』で『ゲ-リッ』。" },
      { text: "a lot of", sound: "アラーラヴ",
        breakdown: "lot の t が o と of の o にはさまれフラップ化『ラ』、of は弱形で『ヴ』。a-lo-tof → アラーラヴ。" }
    ]
  },
  {
    id: "darkl", name: "ダーク L（暗いL）", color: "flap",
    short: "語末・子音前の L は『ウ／オ』っぽくこもる",
    ja: "L には2種類あります。母音の前の L（light L）は明るい『ラ行』ですが、語末や子音の前の L（dark L）は舌の奥が上がってこもり、『ウ』や『オ』に近い音になります。日本人が『ル』と発音しがちな所です。",
    how: "［語末の l / ll］や［子音の前の l］。call, full, milk, people など。",
    examples: [
      { text: "call", sound: "コーォ",
        breakdown: "ca-ll の ll は語末のダークL。『ル』ではなく舌奥をこもらせ『オ』寄りに →『コーォ』。" },
      { text: "milk", sound: "ミウク",
        breakdown: "mi-l-k の l は子音 k の前でダークL。『ル』ではなく『ウ』化し『ミウク』。" },
      { text: "people", sound: "ピーポー",
        breakdown: "peo-p-le の le が語末ダークL。『プル』ではなく『ポー』寄りで『ピーポー』。" }
    ]
  },
  {
    id: "drop", name: "脱落（ストップ）", color: "drop",
    short: "子音が連続 → 前の破裂音が消える",
    ja: "破裂音（t, d, p, k, b, g）の直後に別の子音が続くと、前の破裂音は『構えるだけ』で破裂せず、ほとんど聞こえなくなります（脱落・未開放）。",
    how: "［t/d/p/k/b/g］＋［次の語頭が子音字］。next day, good night, sit down など。",
    examples: [
      { text: "next day", sound: "ネクスデイ",
        breakdown: "next の t は次が day の子音 d なので脱落。nex(t)-day → 『ネクス-デイ』（t を言わない）。" },
      { text: "good night", sound: "グッナイ",
        breakdown: "good の d は次が night の n（子音）で脱落。goo(d)-night → 『グッ-ナイ』。" },
      { text: "sit down", sound: "シッダウン",
        breakdown: "sit の t は次が down の d（子音）で脱落し d が残る。si(t)-down → 『シッ-ダウン』。" }
    ]
  },
  {
    id: "assim", name: "同化（くっついて別の音に）", color: "assim",
    short: "t/d + you → チュ/ヂュ に変身",
    ja: "隣り合う音が影響し合い、別の音に変わります。代表は語末 t/d と次の you/your が混ざって /tʃ/（チュ）/dʒ/（ヂュ）になる現象です。",
    how: "［語末 t］＋ you → チュ、［語末 d］＋ you → ヂュ。",
    examples: [
      { text: "did you", sound: "ディヂュ",
        breakdown: "did の d ＋ you の y が溶け合い /dʒ/。di-dyou → 『ディ-ヂュ』。" },
      { text: "don't you", sound: "ドンチュ",
        breakdown: "don't の t ＋ you の y が /tʃ/ に。don-tyou → 『ドン-チュ』。" },
      { text: "would you", sound: "ウヂュ",
        breakdown: "would の d ＋ you で /dʒ/。woul-dyou → 『ウ-ヂュ』（ダークLも絡み『ウ』化）。" }
    ]
  },
  {
    id: "weak", name: "弱形（機能語が弱くなる）", color: "weak",
    short: "to/of/and/can 等は曖昧な『ア』に",
    ja: "意味の中心でない機能語（前置詞・接続詞・助動詞・冠詞）は強く読まれず、母音が曖昧母音 /ə/（シュワー）に弱まり短くなります。聞き取れないと文がつながって聞こえます。",
    how: "to /tə/, of /əv/, and /ən/, can /kən/, for /fər/, a /ə/, the /ðə/ など。",
    examples: [
      { text: "a cup of tea", sound: "アカッパティー",
        breakdown: "of が弱形 /əv/→/ə/ で cup とくっつき『カッパ』。a-cu-pof-tea → 『アカッパティー』。" },
      { text: "fish and chips", sound: "フィッシュンチップス",
        breakdown: "and が弱形 /ən/→/n/ に。fish-(a)n-chips → 『フィッシュン-チップス』。" },
      { text: "I can do it", sound: "アイクンドゥイッ",
        breakdown: "can は弱形 /kən/『クン』（強形『キャン』ではない）。do の後 it がくっつき『ドゥイッ』。" }
    ]
  },
  {
    id: "contract", name: "縮約（wanna・gonna）", color: "assim",
    short: "want to → wanna 等にくだける",
    ja: "口語では2語が縮まって1語のように発音されます。つづりは変わりませんが音が融合します。",
    how: "want to → wanna、going to → gonna、got to → gotta、have to → hafta、kind of → kinda。",
    examples: [
      { text: "I want to go", sound: "アイワナゴウ",
        breakdown: "want to の t が融合し wanna /ˈwɑːnə/ →『ワナ』。" },
      { text: "I'm going to call", sound: "アイムガナコーォ",
        breakdown: "going to → gonna /ˈɡɔːnə/。call は語末ダークLで『コーォ』。" },
      { text: "I've got to leave", sound: "アイヴガラリーヴ",
        breakdown: "got to → gotta、tt が母音間でフラップ化し『ガラ』。" }
    ]
  },
  {
    id: "aspiration", name: "帯気音（息のp/t/k）", color: "link",
    short: "語頭の p/t/k は強い息を伴う",
    ja: "強勢のある音節の頭の p/t/k は強い息（帯気）を伴い『プハ／トゥハ／クハ』のように出ます。一方 s の直後（spin, stop, sky）では帯気が消え、日本語の『パ・タ・カ』に近くなります。",
    how: "語頭・強勢頭の p/t/k は帯気、s の直後は無帯気。",
    examples: [
      { text: "pin / spin", sound: "ピン / スピン",
        breakdown: "pin の p は息を伴い『プハィン』寄り。spin は s の後で帯気が消え『スピン』。" },
      { text: "top", sound: "タップ",
        breakdown: "語頭 t は帯気して強く、語末 p は破裂を弱め（未開放）気味。" },
      { text: "key", sound: "キー",
        breakdown: "語頭 k は息を伴い『クヒー』寄りに出る。" }
    ]
  }
];

/* ---- 増量：各ルールに例を追加 ---- */
(function(){
  var add={
    link:[
      {text:"turn it off", sound:"ターニロフ", breakdown:"turn の n が it の i にくっつき『ターニッ』、it の t が off の o にくっつきフラップ化『ロフ』。"},
      {text:"come in", sound:"カミン", breakdown:"come の m が in の i にくっつき『カ-ミン』。"},
      {text:"far away", sound:"ファーラウェイ", breakdown:"far の r が away の a にくっつき『ファー-ラウェイ』。"}
    ],
    flap:[
      {text:"better", sound:"ベラー", breakdown:"be-tt-er の tt が母音間でフラップ化『ラ』→『ベラー』。"},
      {text:"city", sound:"シリー", breakdown:"ci-t-y の t が母音間でフラップ化『リ』→『シリー』。"},
      {text:"shut up", sound:"シャラップ", breakdown:"shut の t が up の母音とつながりフラップ化『ラ』→『シャラップ』。"}
    ],
    darkl:[
      {text:"feel", sound:"フィーォ", breakdown:"fee-l 語末ダークL。『ル』でなく『ォ』寄り→『フィーォ』。"},
      {text:"world", sound:"ワーォド", breakdown:"wor-l-d の l は子音dの前でダークL→『ワーォド』。"},
      {text:"table", sound:"テイボォ", breakdown:"ta-b-le 語末ダークL→『テイボォ』。"}
    ],
    drop:[
      {text:"big game", sound:"ビッゲイム", breakdown:"big の g は次が game の g（子音）で脱落気味→『ビッ-ゲイム』。"},
      {text:"hot dog", sound:"ハッドッグ", breakdown:"hot の t は次が dog の d（子音）で脱落→『ハッ-ドッグ』。"},
      {text:"first time", sound:"ファースタイム", breakdown:"first の t は次が time の t と重なり一度だけ→『ファース-タイム』。"}
    ],
    assim:[
      {text:"got you", sound:"ガッチュ", breakdown:"got の t ＋ you の y が /tʃ/→『ガッ-チュ』。"},
      {text:"miss you", sound:"ミシュー", breakdown:"miss の s ＋ you の y が /ʃ/→『ミ-シュー』。"},
      {text:"this year", sound:"ディシヤー", breakdown:"this の s ＋ year の y が同化し『シ』寄り→『ディ-シヤー』。"}
    ],
    weak:[
      {text:"a piece of cake", sound:"アピーソブケイク", breakdown:"of が弱形 /əv/ で piece とつながる→『ピーソブ』。"},
      {text:"out of", sound:"アウラ", breakdown:"out の t が of の母音とつながりフラップ化、of は弱形→『アウラ』。"},
      {text:"to the point", sound:"トゥザポイント", breakdown:"to /tə/, the /ðə/ が弱形で軽く→『トゥザ-ポイント』。"}
    ],
    contract:[
      {text:"got to go", sound:"ガラゴウ", breakdown:"got to → gotta、tt がフラップ化『ガラ』→『ガラ-ゴウ』。"},
      {text:"out of here", sound:"アウラヒア", breakdown:"out of → outta、フラップ化『アウラ』→『アウラ-ヒア』。"},
      {text:"let me", sound:"レンミー", breakdown:"let me → lemme、t が n に同化『レンミー』。"}
    ],
    aspiration:[
      {text:"task", sound:"タスク", breakdown:"s の後の k は帯気が消え『スク』、語頭 t は帯気して強い。"},
      {text:"speak", sound:"スピーク", breakdown:"s の直後の p は帯気なし→『スピーク』（pは『プハ』にならない）。"},
      {text:"car", sound:"カー", breakdown:"語頭 k は息を伴って強く『クハー』寄り→『カー』。"}
    ]
  };
  (window.EigoData.linkingRules||[]).forEach(function(r){
    if(add[r.id]) r.examples=r.examples.concat(add[r.id]);
  });
})();

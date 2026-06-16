window.EigoData = window.EigoData || {};
window.EigoData.linkingRules = [
  {
    "id": "link",
    "name": "連結（リンキング）",
    "color": "link",
    "short": "子音 + 母音 → くっつく",
    "ja": "前の語が『子音』で終わり、次の語が『母音』で始まると、その子音が次の母音へ移ってくっつき、1語のように聞こえます。英語が速く聞こえる最大の理由のひとつです。",
    "how": "［語末の子音字］＋［語頭の母音字 a/e/i/o/u］が境界にあるとき。",
    "examples": [
      {
        "text": "check it out",
        "sound": "チェッキラウ",
        "breakdown": "check の k が it の i にくっつき『チェッ-キッ』。さらに it の t が out の母音にくっつき母音間でフラップ化し『キラウ』。che-ckit-out → チェッキラウ。"
      },
      {
        "text": "an apple",
        "sound": "アナポー",
        "breakdown": "an の n が apple の a にくっつく。a-n‿a-pple → 『ア-ナポー』。"
      },
      {
        "text": "pick it up",
        "sound": "ピッキラップ",
        "breakdown": "pick の k＋it の i で『キッ』、it の t＋up の u が母音間でフラップ化し『ラ』。pi-ckit-up → ピッキラップ。"
      },
      {
        "text": "turn it off",
        "sound": "ターニロフ",
        "breakdown": "turn の n が it の i にくっつき『ターニッ』、it の t が off の o にくっつきフラップ化『ロフ』。"
      },
      {
        "text": "come in",
        "sound": "カミン",
        "breakdown": "come の m が in の i にくっつき『カ-ミン』。"
      },
      {
        "text": "far away",
        "sound": "ファーラウェイ",
        "breakdown": "far の r が away の a にくっつき『ファー-ラウェイ』。"
      },
      {
        "text": "an apple",
        "sound": "アナポォ",
        "breakdown": "an の n が apple の a にくっつき『ア-ナポォ』。語末ダークLも併発。"
      },
      {
        "text": "check it out",
        "sound": "チェッキラウト",
        "breakdown": "check の k が it に連結『キ』、it の t がフラップ化して out へ『ラウト』。"
      },
      {
        "text": "turn it off",
        "sound": "ターニロフ",
        "breakdown": "turn の n が it にくっつき『ターニッ』。さらに it の t が off の母音にくっつきフラップ化『ニロフ』。"
      },
      {
        "text": "hold on a second",
        "sound": "ホウルダナセカン",
        "breakdown": "hold の d が on にくっつき『ホウルダン』。on の n が a にくっつき『ナ』。"
      },
      {
        "text": "come in and sit",
        "sound": "カミナンスィッ",
        "breakdown": "come の m が in に、in の n が and にくっつき一気に『カミナン』。"
      },
      {
        "text": "pick it up",
        "sound": "ピッキラップ",
        "breakdown": "pick の k が it に連結『ピッキッ』、it の t が up にフラップ連結『キラップ』。"
      },
      {
        "text": "an apple a day",
        "sound": "アナポォアデイ",
        "breakdown": "an の n が apple に、apple の終わりが a に連結『アナポォア』。"
      },
      {
        "text": "find out",
        "sound": "ファインダウト",
        "breakdown": "find の d が out の母音に連結『ファインダウト』。"
      },
      {
        "text": "come over here",
        "sound": "カモウヴァヒア",
        "breakdown": "come の m が over に連結『カモウヴァ』。"
      },
      {
        "text": "turn around",
        "sound": "ターナラウンド",
        "breakdown": "turn の n が around に連結『ターナラウンド』。"
      },
      {
        "text": "wake up early",
        "sound": "ウェイカップアーリー",
        "breakdown": "wake の k が up に連結『ウェイカップ』。"
      },
      {
        "text": "put it away",
        "sound": "プリラウェイ",
        "breakdown": "put/it の t がフラップ化し連結『プリラウェイ』。"
      },
      {
        "text": "pick up on it",
        "sound": "ピッカポニッ",
        "breakdown": "pick up が連結『ピッカップ』、on it も連結。"
      },
      {
        "text": "give up on it",
        "sound": "ギヴァポニッ",
        "breakdown": "give up が連結『ギヴァップ』、on it も連結。"
      },
      {
        "text": "an hour or two",
        "sound": "アナワオアトゥ",
        "breakdown": "an/hour が連結『アナワ』、or と弱形連結。"
      },
      {
        "text": "check it out",
        "sound": "チェッキラウト",
        "breakdown": "check の k が it に連結『チェッキッ』、it の t がフラップ化。"
      },
      {
        "text": "fill it up",
        "sound": "フィリラップ",
        "breakdown": "fill の l が it に連結、it もフラップ連結『フィリラップ』。"
      },
      {
        "text": "hold on tight",
        "sound": "ホウルドンタイト",
        "breakdown": "hold の d が on に連結『ホウルドン』。"
      },
      {
        "text": "back it up",
        "sound": "バッキラップ",
        "breakdown": "back の k が it に連結、it もフラップ連結『バッキラップ』。"
      },
      {
        "text": "come and see",
        "sound": "カマンスィー",
        "breakdown": "come の m が and に連結『カマン』。"
      },
      {
        "text": "work it out",
        "sound": "ワーキラウト",
        "breakdown": "work の k が it に連結『ワーキッ』、out も連結。"
      },
      {
        "text": "turn it around",
        "sound": "ターニララウンド",
        "breakdown": "turn の n が it に連結、it もフラップ連結『ターニッ』。"
      },
      {
        "text": "pick up a pen",
        "sound": "ピッカパペン",
        "breakdown": "pick up a が連続連結『ピッカパ』。"
      },
      {
        "text": "an awful lot",
        "sound": "アナフルラット",
        "breakdown": "an/awful が連結『アナフル』、lot はフラップ。"
      },
      {
        "text": "half an hour",
        "sound": "ハーファナワー",
        "breakdown": "half/an/hour が連結『ハーファナワー』。"
      },
      {
        "text": "far away",
        "sound": "ファラウェイ",
        "breakdown": "far の r が away に連結『ファラ』。"
      },
      {
        "text": "more or less",
        "sound": "モアオアレス",
        "breakdown": "more/or が連結『モアオア』。"
      },
      {
        "text": "go away",
        "sound": "ゴウアウェイ",
        "breakdown": "go の母音と away が滑らかに連結。"
      },
      {
        "text": "see it again",
        "sound": "スィーイラゲン",
        "breakdown": "see/it/again が連結『スィーイラゲン』。"
      },
      {
        "text": "two of us",
        "sound": "トゥーオヴァス",
        "breakdown": "two/of/us が連結『トゥーオヴァス』。"
      },
      {
        "text": "lay it out",
        "sound": "レイイラウト",
        "breakdown": "lay/it/out が連結『レイイラウト』。"
      },
      {
        "text": "carry on",
        "sound": "キャリオン",
        "breakdown": "carry の y が on に連結『キャリオン』。"
      },
      {
        "text": "far enough",
        "sound": "ファリナフ",
        "breakdown": "far の r が enough に連結『ファリナフ』。"
      },
      {
        "text": "here and there",
        "sound": "ヒアランゼア",
        "breakdown": "here/and が連結『ヒアラン』。"
      },
      {
        "text": "four o'clock",
        "sound": "フォアオクロック",
        "breakdown": "four の r が o に連結『フォアオ』。"
      },
      {
        "text": "pour it out",
        "sound": "ポーリラウト",
        "breakdown": "pour/it/out が連結『ポーリラウト』。"
      },
      {
        "text": "pour it out",
        "sound": "ポーリラウト",
        "breakdown": "pour/it/out が連結『ポーリラウト』。"
      },
      {
        "text": "wear it out",
        "sound": "ウェアリラウト",
        "breakdown": "wear/it/out が連結『ウェアリラウト』。"
      },
      {
        "text": "tear it up",
        "sound": "テアリラップ",
        "breakdown": "tear/it/up が連結『テアリラップ』。"
      },
      {
        "text": "bear in mind",
        "sound": "ベアリンマインド",
        "breakdown": "bear/in が連結『ベアリン』。"
      },
      {
        "text": "far and wide",
        "sound": "ファランワイド",
        "breakdown": "far/and が連結『ファラン』。"
      },
      {
        "text": "over and over",
        "sound": "オウヴァランオウヴァ",
        "breakdown": "over/and が連結『オウヴァラン』。"
      },
      {
        "text": "year after year",
        "sound": "イアラフタイア",
        "breakdown": "year/after が連結『イアラフタ』。"
      },
      {
        "text": "four or five",
        "sound": "フォアオアファイヴ",
        "breakdown": "four/or が連結『フォアオア』。"
      },
      {
        "text": "door is open",
        "sound": "ドアリゾウプン",
        "breakdown": "door/is が連結『ドアリ』。"
      },
      {
        "text": "fewer options",
        "sound": "フューアオプションズ",
        "breakdown": "fewer/options が連結『フューアロプションズ』。"
      },
      {
        "text": "hour and a half",
        "sound": "アワランナハーフ",
        "breakdown": "hour/and/a が連結『アワランナ』。"
      },
      {
        "text": "clear it up",
        "sound": "クリアリラップ",
        "breakdown": "clear/it/up が連結『クリアリラップ』。"
      },
      {
        "text": "share it with",
        "sound": "シェアリットウィズ",
        "breakdown": "share/it が連結『シェアリッ』。"
      },
      {
        "text": "wear away",
        "sound": "ウェアラウェイ",
        "breakdown": "wear/away が連結『ウェアラウェイ』。"
      },
      {
        "text": "star is out",
        "sound": "スターリザウト",
        "breakdown": "star/is/out が連結『スターリザウト』。"
      },
      {
        "text": "far away",
        "sound": "ファラウェイ",
        "breakdown": "far/away が連結『ファラウェイ』。"
      },
      {
        "text": "more often",
        "sound": "モアロフン",
        "breakdown": "more/often が連結『モアロフン』。"
      },
      {
        "text": "after all",
        "sound": "アフタロール",
        "breakdown": "after/all が連結『アフタロール』。"
      },
      {
        "text": "over and over",
        "sound": "オウヴァランオウヴァ",
        "breakdown": "over/and が連結『オウヴァラン』。"
      },
      {
        "text": "here it is",
        "sound": "ヒアリティズ",
        "breakdown": "here/it/is が連結『ヒアリティズ』。"
      },
      {
        "text": "where is it",
        "sound": "ウェアリズィッ",
        "breakdown": "where/is/it が連結『ウェアリズィッ』。"
      },
      {
        "text": "pour out",
        "sound": "ポーラウト",
        "breakdown": "pour/out が連結『ポーラウト』。"
      },
      {
        "text": "four eggs",
        "sound": "フォアレッグズ",
        "breakdown": "four/eggs が連結『フォアレッグズ』。"
      },
      {
        "text": "your own",
        "sound": "ユアロウン",
        "breakdown": "your/own が連結『ユアロウン』。"
      },
      {
        "text": "we are out",
        "sound": "ウィアラウト",
        "breakdown": "are/out が連結『アラウト』。"
      },
      {
        "text": "go in",
        "sound": "ゴウィン",
        "breakdown": "go/in が連結『ゴウィン』。"
      },
      {
        "text": "so old",
        "sound": "ソウオウルド",
        "breakdown": "so/old が連結『ソウオウルド』。"
      },
      {
        "text": "two apples",
        "sound": "トゥーアポーズ",
        "breakdown": "two/apples が連結『トゥーアポーズ』。"
      },
      {
        "text": "go away",
        "sound": "ゴウアウェイ",
        "breakdown": "go/away が連結『ゴウアウェイ』。"
      },
      {
        "text": "see it",
        "sound": "スィーイッ",
        "breakdown": "see/it が連結『スィーイッ』。"
      },
      {
        "text": "play it",
        "sound": "プレイイッ",
        "breakdown": "play/it が連結『プレイイッ』。"
      },
      {
        "text": "my own",
        "sound": "マイオウン",
        "breakdown": "my/own が連結『マイオウン』。"
      },
      {
        "text": "try again",
        "sound": "トライアゲン",
        "breakdown": "try/again が連結『トライアゲン』。"
      },
      {
        "text": "who is",
        "sound": "フーイズ",
        "breakdown": "who/is が連結『フーイズ』。"
      },
      {
        "text": "do it",
        "sound": "ドゥーイッ",
        "breakdown": "do/it が連結『ドゥーイッ』。"
      },
      {
        "text": "now and again",
        "sound": "ナウアンアゲン",
        "breakdown": "now/and が連結『ナウアン』。"
      },
      {
        "text": "far off",
        "sound": "ファーロフ",
        "breakdown": "far/off が連結『ファーロフ』。"
      },
      {
        "text": "her own",
        "sound": "ハーロウン",
        "breakdown": "her/own が連結『ハーロウン』。"
      }
    ]
  },
  {
    "id": "flap",
    "name": "フラップ T（ラ行化）",
    "color": "flap",
    "short": "母音 + t/tt + 母音 → 軽い『ラ』",
    "ja": "アメリカ英語では t / tt が『母音と母音にはさまれる』と、舌先を一瞬弾く軽い音 /ɾ/（日本語のラ行に近い）になります。語をまたいでも起こります。",
    "how": "［母音字］＋ t または tt ＋［母音字］。water, better などの語中、get it などの語境界。",
    "examples": [
      {
        "text": "water",
        "sound": "ワラー",
        "breakdown": "wa-t-er の t が a と e（母音）にはさまれ /ɾ/ に。t→『ラ』で『ワラー』。"
      },
      {
        "text": "get it",
        "sound": "ゲリッ",
        "breakdown": "get の t が get の e と it の i にはさまれフラップ化。t→『リ』で『ゲ-リッ』。"
      },
      {
        "text": "a lot of",
        "sound": "アラーラヴ",
        "breakdown": "lot の t が o と of の o にはさまれフラップ化『ラ』、of は弱形で『ヴ』。a-lo-tof → アラーラヴ。"
      },
      {
        "text": "better",
        "sound": "ベラー",
        "breakdown": "be-tt-er の tt が母音間でフラップ化『ラ』→『ベラー』。"
      },
      {
        "text": "city",
        "sound": "シリー",
        "breakdown": "ci-t-y の t が母音間でフラップ化『リ』→『シリー』。"
      },
      {
        "text": "shut up",
        "sound": "シャラップ",
        "breakdown": "shut の t が up の母音とつながりフラップ化『ラ』→『シャラップ』。"
      },
      {
        "text": "a lot of",
        "sound": "アラロブ",
        "breakdown": "lot の t が of の母音とつながりフラップ化『ロ』、of は弱形『ブ』→『ア-ラ-ロブ』。"
      },
      {
        "text": "meeting",
        "sound": "ミーリン",
        "breakdown": "mee-t-ing の t が母音間でフラップ化『リ』→『ミーリン』。"
      },
      {
        "text": "a lot of it",
        "sound": "アララヴィッ",
        "breakdown": "lot の t が母音間でフラップ化『ラ』。of it も連結し『アヴィッ』。"
      },
      {
        "text": "get out of here",
        "sound": "ゲラウラヴヒア",
        "breakdown": "get/out の t がいずれも母音間でフラップ化『ゲラウラ』。"
      },
      {
        "text": "shut it down",
        "sound": "シャリッダウン",
        "breakdown": "shut の t が母音間でフラップ化『シャリッ』。it の t も d の前で詰まる。"
      },
      {
        "text": "put it on",
        "sound": "プリロン",
        "breakdown": "put/it の t がいずれもフラップ化し連結『プリロン』。"
      },
      {
        "text": "set it up",
        "sound": "セリラップ",
        "breakdown": "set/it の t がフラップ化し連結『セリラップ』。"
      },
      {
        "text": "not at all",
        "sound": "ナラロォ",
        "breakdown": "not/at の t がフラップ化『ナラ』、all はダークL『ロォ』。"
      },
      {
        "text": "better idea",
        "sound": "ベラアイディア",
        "breakdown": "better の tt がフラップ化『ベラ』。"
      },
      {
        "text": "sort it out",
        "sound": "ソーリラウト",
        "breakdown": "sort/it の t がフラップ化『ソーリラウト』。"
      },
      {
        "text": "water it down",
        "sound": "ワラリッダウン",
        "breakdown": "water の t がフラップ化『ワラ』、it も連結。"
      },
      {
        "text": "cut it out",
        "sound": "カリラウト",
        "breakdown": "cut/it の t がフラップ化『カリラウト』。"
      },
      {
        "text": "get out of here",
        "sound": "ゲラウロヴヒア",
        "breakdown": "get/out の t がフラップ化『ゲラウ』、of は弱形。"
      },
      {
        "text": "a lot of it",
        "sound": "アラロヴィッ",
        "breakdown": "lot の t がフラップ化『ラ』、of/it 連結。"
      },
      {
        "text": "a little bit",
        "sound": "アリロビッ",
        "breakdown": "little のttがフラップ化『リロ』、bit も。"
      },
      {
        "text": "got a minute",
        "sound": "ガラミニッ",
        "breakdown": "got/a の t がフラップ化『ガラ』、minute も。"
      },
      {
        "text": "put it back",
        "sound": "プリバック",
        "breakdown": "put/it の t がフラップ化し連結『プリ』。"
      },
      {
        "text": "shut up",
        "sound": "シャラップ",
        "breakdown": "shut の t がフラップ化『シャ』、up と連結。"
      },
      {
        "text": "whatever it takes",
        "sound": "ワレヴァリッテイクス",
        "breakdown": "whatever の t がフラップ化『ワレヴァ』、it も連結。"
      },
      {
        "text": "get it together",
        "sound": "ゲリットゥゲザ",
        "breakdown": "get/it の t がフラップ化『ゲリッ』。"
      },
      {
        "text": "out of order",
        "sound": "アウロヴオーダ",
        "breakdown": "out の t がフラップ化『アウロヴ』。"
      },
      {
        "text": "set it up",
        "sound": "セリラップ",
        "breakdown": "set/it の t がフラップ化『セリッ』、up と連結。"
      },
      {
        "text": "not at all",
        "sound": "ナラロール",
        "breakdown": "not/at の t がフラップ化『ナラ』、all はダークL。"
      },
      {
        "text": "better off",
        "sound": "ベラオフ",
        "breakdown": "better の tt がフラップ化『ベラ』。"
      },
      {
        "text": "water it down",
        "sound": "ワラリダウン",
        "breakdown": "water/it の t がフラップ化『ワラリッ』。"
      },
      {
        "text": "sort it out",
        "sound": "ソーリラウト",
        "breakdown": "sort/it の t がフラップ化『ソーリッ』。"
      },
      {
        "text": "a matter of time",
        "sound": "アマラオヴタイム",
        "breakdown": "matter の tt がフラップ化『マラ』、of は弱形。"
      },
      {
        "text": "shut it down",
        "sound": "シャリダウン",
        "breakdown": "shut/it の t がフラップ化『シャリッ』。"
      },
      {
        "text": "put it together",
        "sound": "プリトゥゲザ",
        "breakdown": "put/it の t がフラップ化『プリッ』。"
      },
      {
        "text": "get it right",
        "sound": "ゲリライト",
        "breakdown": "get/it の t がフラップ化『ゲリッ』。"
      },
      {
        "text": "cut it out",
        "sound": "カリラウト",
        "breakdown": "cut/it の t がフラップ化『カリッ』。"
      },
      {
        "text": "meet at noon",
        "sound": "ミーラトヌーン",
        "breakdown": "meet/at の t がフラップ化『ミーラッ』。"
      },
      {
        "text": "what a day",
        "sound": "ワラデイ",
        "breakdown": "what/a の t がフラップ化『ワラ』。"
      },
      {
        "text": "got it made",
        "sound": "ガリッメイド",
        "breakdown": "got/it の t がフラップ化『ガリッ』。"
      },
      {
        "text": "lit up",
        "sound": "リラップ",
        "breakdown": "lit の t がフラップ化『リ』、up と連結。"
      },
      {
        "text": "water it well",
        "sound": "ワラリウェル",
        "breakdown": "water/it の t がフラップ化『ワラリッ』。"
      },
      {
        "text": "rate it high",
        "sound": "レイリッハイ",
        "breakdown": "rate/it の t がフラップ化『レイリッ』。"
      },
      {
        "text": "heat it up",
        "sound": "ヒーリラップ",
        "breakdown": "heat/it/up の t がフラップ化『ヒーリッ』。"
      },
      {
        "text": "meet a friend",
        "sound": "ミーラフレンド",
        "breakdown": "meet/a の t がフラップ化『ミーラ』。"
      },
      {
        "text": "note it down",
        "sound": "ノウリッダウン",
        "breakdown": "note/it の t がフラップ化『ノウリッ』。"
      },
      {
        "text": "beat it out",
        "sound": "ビーリラウト",
        "breakdown": "beat/it/out の t がフラップ化『ビーリッ』。"
      },
      {
        "text": "set it aside",
        "sound": "セリッアサイド",
        "breakdown": "set/it の t がフラップ化『セリッ』。"
      },
      {
        "text": "put it away",
        "sound": "プリッアウェイ",
        "breakdown": "put/it の t がフラップ化『プリッ』。"
      },
      {
        "text": "cut it short",
        "sound": "カリッショート",
        "breakdown": "cut/it の t がフラップ化『カリッ』。"
      },
      {
        "text": "got a minute",
        "sound": "ガラミニッ",
        "breakdown": "got/a の t がフラップ化『ガラ』。"
      },
      {
        "text": "let it slide",
        "sound": "レリッスライド",
        "breakdown": "let/it の t がフラップ化『レリッ』。"
      },
      {
        "text": "eat it up",
        "sound": "イーリラップ",
        "breakdown": "eat/it/up の t がフラップ化『イーリッ』。"
      },
      {
        "text": "rate of return",
        "sound": "レイロヴリターン",
        "breakdown": "rate/of の t がフラップ化『レイロヴ』。"
      },
      {
        "text": "out of order",
        "sound": "アウロヴオーダ",
        "breakdown": "out/of の t がフラップ化『アウロヴ』。"
      },
      {
        "text": "shut it off",
        "sound": "シャリッオフ",
        "breakdown": "shut/it の t がフラップ化『シャリッ』。"
      },
      {
        "text": "shut it",
        "sound": "シャリッ",
        "breakdown": "shut/it の t がフラップ化『シャリッ』。"
      },
      {
        "text": "forgot about",
        "sound": "フォガラバウト",
        "breakdown": "forgot/about の t がフラップ化『フォガラ』。"
      },
      {
        "text": "thought of",
        "sound": "ソーロヴ",
        "breakdown": "thought/of の t がフラップ化『ソーロヴ』。"
      },
      {
        "text": "sort of",
        "sound": "ソーロヴ",
        "breakdown": "sort/of の t がフラップ化『ソーロヴ』。"
      },
      {
        "text": "lot of",
        "sound": "ロロヴ",
        "breakdown": "lot/of の t がフラップ化『ロロヴ』。"
      },
      {
        "text": "get over",
        "sound": "ゲロウヴァ",
        "breakdown": "get/over の t がフラップ化『ゲロウヴァ』。"
      },
      {
        "text": "put off",
        "sound": "プロフ",
        "breakdown": "put/off の t がフラップ化『プロフ』。"
      },
      {
        "text": "bit of",
        "sound": "ビロヴ",
        "breakdown": "bit/of の t がフラップ化『ビロヴ』。"
      },
      {
        "text": "set up",
        "sound": "セラップ",
        "breakdown": "set/up の t がフラップ化『セラップ』。"
      },
      {
        "text": "cut it out",
        "sound": "カリラウト",
        "breakdown": "cut/it/out の t がフラップ化『カリラウト』。"
      },
      {
        "text": "what about",
        "sound": "ワラバウト",
        "breakdown": "what/about の t がフラップ化『ワラバウト』。"
      },
      {
        "text": "got it",
        "sound": "ガリッ",
        "breakdown": "got/it の t がフラップ化『ガリッ』。"
      },
      {
        "text": "note it",
        "sound": "ノウリッ",
        "breakdown": "note/it の t がフラップ化『ノウリッ』。"
      },
      {
        "text": "wait a bit",
        "sound": "ウェイラビッ",
        "breakdown": "wait/a の t がフラップ化『ウェイラ』。"
      },
      {
        "text": "got a lot",
        "sound": "ガラロッ",
        "breakdown": "got/a の t がフラップ化『ガラ』。"
      },
      {
        "text": "hate it",
        "sound": "ヘイリッ",
        "breakdown": "hate/it の t がフラップ化『ヘイリッ』。"
      },
      {
        "text": "meet again",
        "sound": "ミーラゲン",
        "breakdown": "meet/again の t がフラップ化『ミーラゲン』。"
      },
      {
        "text": "sit on it",
        "sound": "シロニッ",
        "breakdown": "sit/on の t がフラップ化『シロン』。"
      },
      {
        "text": "water it",
        "sound": "ウォーラリッ",
        "breakdown": "water/it の t がフラップ化『ウォーラリッ』。"
      },
      {
        "text": "not a chance",
        "sound": "ナラチャンス",
        "breakdown": "not/a の t がフラップ化『ナラ』。"
      },
      {
        "text": "wrote a note",
        "sound": "ロウラノウト",
        "breakdown": "wrote/a の t がフラップ化『ロウラ』。"
      },
      {
        "text": "rate it",
        "sound": "レイリッ",
        "breakdown": "rate/it の t がフラップ化『レイリッ』。"
      },
      {
        "text": "beat it",
        "sound": "ビーリッ",
        "breakdown": "beat/it の t がフラップ化『ビーリッ』。"
      },
      {
        "text": "let it go",
        "sound": "レリッゴウ",
        "breakdown": "let/it の t がフラップ化『レリッ』。"
      }
    ]
  },
  {
    "id": "darkl",
    "name": "ダーク L（暗いL）",
    "color": "flap",
    "short": "語末・子音前の L は『ウ／オ』っぽくこもる",
    "ja": "L には2種類あります。母音の前の L（light L）は明るい『ラ行』ですが、語末や子音の前の L（dark L）は舌の奥が上がってこもり、『ウ』や『オ』に近い音になります。日本人が『ル』と発音しがちな所です。",
    "how": "［語末の l / ll］や［子音の前の l］。call, full, milk, people など。",
    "examples": [
      {
        "text": "call",
        "sound": "コーォ",
        "breakdown": "ca-ll の ll は語末のダークL。『ル』ではなく舌奥をこもらせ『オ』寄りに →『コーォ』。"
      },
      {
        "text": "milk",
        "sound": "ミウク",
        "breakdown": "mi-l-k の l は子音 k の前でダークL。『ル』ではなく『ウ』化し『ミウク』。"
      },
      {
        "text": "people",
        "sound": "ピーポー",
        "breakdown": "peo-p-le の le が語末ダークL。『プル』ではなく『ポー』寄りで『ピーポー』。"
      },
      {
        "text": "feel",
        "sound": "フィーォ",
        "breakdown": "fee-l 語末ダークL。『ル』でなく『ォ』寄り→『フィーォ』。"
      },
      {
        "text": "world",
        "sound": "ワーォド",
        "breakdown": "wor-l-d の l は子音dの前でダークL→『ワーォド』。"
      },
      {
        "text": "table",
        "sound": "テイボォ",
        "breakdown": "ta-b-le 語末ダークL→『テイボォ』。"
      },
      {
        "text": "people",
        "sound": "ピーポォ",
        "breakdown": "peo-p-le 語末ダークL。『プル』でなく『ポォ』→『ピーポォ』。"
      },
      {
        "text": "old",
        "sound": "オウォド",
        "breakdown": "o-l-d の l は子音 d の前でダークL→『オウォド』。"
      },
      {
        "text": "feel it",
        "sound": "フィーリッ",
        "breakdown": "feel の暗いL＋連結『フィーリッ』。"
      },
      {
        "text": "real apple",
        "sound": "リアラポー",
        "breakdown": "real/apple の暗いL＋連結『リアラポー』。"
      },
      {
        "text": "cool air",
        "sound": "クーレア",
        "breakdown": "cool/air の暗いL＋連結『クーレア』。"
      },
      {
        "text": "tell us",
        "sound": "テラス",
        "breakdown": "tell/us の暗いL＋連結『テラス』。"
      },
      {
        "text": "sell out",
        "sound": "セラウト",
        "breakdown": "sell/out の暗いL＋連結『セラウト』。"
      },
      {
        "text": "fill in",
        "sound": "フィリン",
        "breakdown": "fill/in の暗いL＋連結『フィリン』。"
      },
      {
        "text": "all of us",
        "sound": "オーロヴァス",
        "breakdown": "all/of の暗いL＋連結『オーロヴァス』。"
      },
      {
        "text": "call off",
        "sound": "コーロフ",
        "breakdown": "call/off の暗いL＋連結『コーロフ』。"
      },
      {
        "text": "will it",
        "sound": "ウィリッ",
        "breakdown": "will/it の暗いL＋連結『ウィリッ』。"
      },
      {
        "text": "mail it",
        "sound": "メイリッ",
        "breakdown": "mail/it の暗いL＋連結『メイリッ』。"
      },
      {
        "text": "pull over",
        "sound": "プロウヴァ",
        "breakdown": "pull/over の暗いL＋連結『プロウヴァ』。"
      },
      {
        "text": "school is",
        "sound": "スクーリズ",
        "breakdown": "school/is の暗いL＋連結『スクーリズ』。"
      },
      {
        "text": "sell it",
        "sound": "セリッ",
        "breakdown": "sell の暗いL＋連結『セリッ』。"
      },
      {
        "text": "cool off",
        "sound": "クーロフ",
        "breakdown": "cool/off の暗いL＋連結『クーロフ』。"
      },
      {
        "text": "pull it",
        "sound": "プリッ",
        "breakdown": "pull/it の暗いL＋連結『プリッ』。"
      },
      {
        "text": "tell him",
        "sound": "テリム",
        "breakdown": "tell/him の暗いL＋連結『テリム』。"
      },
      {
        "text": "fall apart",
        "sound": "フォーラパート",
        "breakdown": "fall/apart の暗いL＋連結『フォーラパート』。"
      },
      {
        "text": "feel it",
        "sound": "フィーリッ",
        "breakdown": "feel/it の暗いL＋連結『フィーリッ』。"
      },
      {
        "text": "cool it",
        "sound": "クーリッ",
        "breakdown": "cool/it の暗いL＋連結『クーリッ』。"
      },
      {
        "text": "still alive",
        "sound": "スティラライヴ",
        "breakdown": "still/alive の暗いL＋連結『スティラライヴ』。"
      },
      {
        "text": "will it",
        "sound": "ウィリッ",
        "breakdown": "will/it の暗いL＋連結『ウィリッ』。"
      },
      {
        "text": "all over",
        "sound": "オーロウヴァ",
        "breakdown": "all/over の暗いL＋連結『オーロウヴァ』。"
      },
      {
        "text": "fill up",
        "sound": "フィラップ",
        "breakdown": "fill/up の暗いL＋連結『フィラップ』。"
      },
      {
        "text": "call out",
        "sound": "コーラウト",
        "breakdown": "call/out の暗いL＋連結『コーラウト』。"
      }
    ]
  },
  {
    "id": "drop",
    "name": "脱落（ストップ）",
    "color": "drop",
    "short": "子音が連続 → 前の破裂音が消える",
    "ja": "破裂音（t, d, p, k, b, g）の直後に別の子音が続くと、前の破裂音は『構えるだけ』で破裂せず、ほとんど聞こえなくなります（脱落・未開放）。",
    "how": "［t/d/p/k/b/g］＋［次の語頭が子音字］。next day, good night, sit down など。",
    "examples": [
      {
        "text": "next day",
        "sound": "ネクスデイ",
        "breakdown": "next の t は次が day の子音 d なので脱落。nex(t)-day → 『ネクス-デイ』（t を言わない）。"
      },
      {
        "text": "good night",
        "sound": "グッナイ",
        "breakdown": "good の d は次が night の n（子音）で脱落。goo(d)-night → 『グッ-ナイ』。"
      },
      {
        "text": "sit down",
        "sound": "シッダウン",
        "breakdown": "sit の t は次が down の d（子音）で脱落し d が残る。si(t)-down → 『シッ-ダウン』。"
      },
      {
        "text": "big game",
        "sound": "ビッゲイム",
        "breakdown": "big の g は次が game の g（子音）で脱落気味→『ビッ-ゲイム』。"
      },
      {
        "text": "hot dog",
        "sound": "ハッドッグ",
        "breakdown": "hot の t は次が dog の d（子音）で脱落→『ハッ-ドッグ』。"
      },
      {
        "text": "first time",
        "sound": "ファースタイム",
        "breakdown": "first の t は次が time の t と重なり一度だけ→『ファース-タイム』。"
      },
      {
        "text": "next day",
        "sound": "ネクスデイ",
        "breakdown": "next の t は次が day の d（子音）で脱落→『ネクス-デイ』。"
      },
      {
        "text": "just because",
        "sound": "ジャスビコーズ",
        "breakdown": "just の t は次が b（子音）で脱落→『ジャス-ビコーズ』。"
      },
      {
        "text": "next day",
        "sound": "ネクスデイ",
        "breakdown": "next の t が次の d の前で脱落『ネクス』。"
      },
      {
        "text": "old man",
        "sound": "オウルマン",
        "breakdown": "old の d が m の前で脱落気味になり『オウルマン』。"
      },
      {
        "text": "first time",
        "sound": "ファースタイム",
        "breakdown": "first の t が次の t の前で脱落『ファース』。"
      },
      {
        "text": "best friend",
        "sound": "ベスフレンド",
        "breakdown": "best の t が f の前で脱落『ベス』。"
      },
      {
        "text": "last chance",
        "sound": "ラスチャンス",
        "breakdown": "last の t が ch の前で脱落『ラス』。"
      },
      {
        "text": "kept quiet",
        "sound": "ケップクワイエッ",
        "breakdown": "kept の t が k の前で脱落気味『ケップ』。"
      },
      {
        "text": "soft drink",
        "sound": "ソフドリンク",
        "breakdown": "soft の t が d の前で脱落『ソフ』。"
      },
      {
        "text": "most popular",
        "sound": "モウスポピュラー",
        "breakdown": "most の t が p の前で脱落『モウス』。"
      },
      {
        "text": "next week",
        "sound": "ネクスウィーク",
        "breakdown": "next の t が w の前で脱落『ネクス』。"
      },
      {
        "text": "old friend",
        "sound": "オウルフレンド",
        "breakdown": "old の d が f の前で脱落気味『オウル』。"
      },
      {
        "text": "must be",
        "sound": "マスビー",
        "breakdown": "must の t が b の前で脱落『マス』。"
      },
      {
        "text": "just now",
        "sound": "ジャスナウ",
        "breakdown": "just の t が n の前で脱落『ジャス』。"
      },
      {
        "text": "iced tea",
        "sound": "アイスティー",
        "breakdown": "iced の d が t の前で脱落『アイス』。"
      },
      {
        "text": "kept going",
        "sound": "ケップゴウイン",
        "breakdown": "kept の t が g の前で脱落『ケップ』。"
      },
      {
        "text": "left turn",
        "sound": "レフターン",
        "breakdown": "left の t が t の前で脱落『レフ』。"
      },
      {
        "text": "next time",
        "sound": "ネクスタイム",
        "breakdown": "next の t が t の前で脱落『ネクス』。"
      },
      {
        "text": "last night",
        "sound": "ラスナイト",
        "breakdown": "last の t が n の前で脱落『ラス』。"
      },
      {
        "text": "don't know",
        "sound": "ドンノウ",
        "breakdown": "don't の t が n の前で脱落『ドン』。"
      },
      {
        "text": "first time",
        "sound": "ファースタイム",
        "breakdown": "first の t が t の前で脱落『ファース』。"
      },
      {
        "text": "best friend",
        "sound": "ベスフレンド",
        "breakdown": "best の t が f の前で脱落『ベス』。"
      },
      {
        "text": "old man",
        "sound": "オウルマン",
        "breakdown": "old の d が m の前で脱落『オウル』。"
      },
      {
        "text": "cold day",
        "sound": "コウルデイ",
        "breakdown": "cold の d が d の前で脱落『コウル』。"
      },
      {
        "text": "kept quiet",
        "sound": "ケップクワイエット",
        "breakdown": "kept の t が q の前で脱落『ケップ』。"
      },
      {
        "text": "sit down",
        "sound": "シッダウン",
        "breakdown": "sit の t が d の前で脱落気味『シッ』。"
      },
      {
        "text": "good night",
        "sound": "グッナイト",
        "breakdown": "good の d が n の前で脱落『グッ』。"
      },
      {
        "text": "grand prize",
        "sound": "グランプライズ",
        "breakdown": "grand の d が p の前で脱落『グラン』。"
      },
      {
        "text": "left brain",
        "sound": "レフブレイン",
        "breakdown": "left の t が b の前で脱落『レフ』。"
      },
      {
        "text": "soft drink",
        "sound": "ソフドリンク",
        "breakdown": "soft の t が d の前で脱落『ソフ』。"
      },
      {
        "text": "next door",
        "sound": "ネクスドア",
        "breakdown": "next の t が d の前で脱落『ネクス』。"
      },
      {
        "text": "most people",
        "sound": "モウスピーポゥ",
        "breakdown": "most の t が p の前で脱落『モウス』。"
      },
      {
        "text": "last chance",
        "sound": "ラスチャンス",
        "breakdown": "last の t が ch の前で脱落『ラス』。"
      },
      {
        "text": "hand made",
        "sound": "ハンメイド",
        "breakdown": "hand の d が m の前で脱落『ハン』。"
      },
      {
        "text": "wild guess",
        "sound": "ワイルゲス",
        "breakdown": "wild の d が g の前で脱落『ワイル』。"
      },
      {
        "text": "East coast",
        "sound": "イースコウスト",
        "breakdown": "East の t が c の前で脱落『イース』。"
      },
      {
        "text": "must go",
        "sound": "マスゴウ",
        "breakdown": "must の t が g の前で脱落『マス』。"
      },
      {
        "text": "past due",
        "sound": "パスデュー",
        "breakdown": "past の t が d の前で脱落『パス』。"
      },
      {
        "text": "fast track",
        "sound": "ファストラック",
        "breakdown": "fast の t が tr の前で脱落気味『ファス』。"
      },
      {
        "text": "world tour",
        "sound": "ワールトゥア",
        "breakdown": "world の d が t の前で脱落『ワール』。"
      },
      {
        "text": "blind spot",
        "sound": "ブラインスポット",
        "breakdown": "blind の d が s の前で脱落『ブライン』。"
      },
      {
        "text": "gift card",
        "sound": "ギフカード",
        "breakdown": "gift の t が c の前で脱落『ギフ』。"
      },
      {
        "text": "old friend",
        "sound": "オウルフレンド",
        "breakdown": "old の d が f の前で脱落『オウル』。"
      },
      {
        "text": "kind gesture",
        "sound": "カインジェスチャ",
        "breakdown": "kind の d が g の前で脱落『カイン』。"
      },
      {
        "text": "find peace",
        "sound": "ファインピース",
        "breakdown": "find の d が p の前で脱落『ファイン』。"
      },
      {
        "text": "send mail",
        "sound": "センメイル",
        "breakdown": "send の d が m の前で脱落『セン』。"
      },
      {
        "text": "round table",
        "sound": "ラウンテイボル",
        "breakdown": "round の d が t の前で脱落『ラウン』。"
      },
      {
        "text": "mixed bag",
        "sound": "ミックスバッグ",
        "breakdown": "mixed の d が b の前で脱落『ミックス』。"
      },
      {
        "text": "just because",
        "sound": "ジャスビコーズ",
        "breakdown": "just の t が b の前で脱落『ジャス』。"
      },
      {
        "text": "most days",
        "sound": "モウスデイズ",
        "breakdown": "most の t が d の前で脱落『モウス』。"
      },
      {
        "text": "next day",
        "sound": "ネクスデイ",
        "breakdown": "next の t が d の前で脱落『ネクス』。"
      },
      {
        "text": "best friend",
        "sound": "ベスフレンド",
        "breakdown": "best の t が f の前で脱落『ベス』。"
      },
      {
        "text": "first place",
        "sound": "ファースプレイス",
        "breakdown": "first の t が p の前で脱落『ファース』。"
      },
      {
        "text": "left side",
        "sound": "レフサイド",
        "breakdown": "left の t が s の前で脱落『レフ』。"
      },
      {
        "text": "kept quiet",
        "sound": "ケプクワイエット",
        "breakdown": "kept の t が q の前で脱落『ケプ』。"
      },
      {
        "text": "cold cut",
        "sound": "コウルカット",
        "breakdown": "cold の d が c の前で脱落『コウル』。"
      },
      {
        "text": "hand made",
        "sound": "ハンメイド",
        "breakdown": "hand の d が m の前で脱落『ハン』。"
      },
      {
        "text": "grand piano",
        "sound": "グランピアノ",
        "breakdown": "grand の d が p の前で脱落『グラン』。"
      },
      {
        "text": "old man",
        "sound": "オウルマン",
        "breakdown": "old の d が m の前で脱落『オウル』。"
      },
      {
        "text": "background",
        "sound": "バックグラウン",
        "breakdown": "語尾 d が脱落気味『バックグラウン』。"
      },
      {
        "text": "asked them",
        "sound": "アスゼム",
        "breakdown": "asked の連続子音＋th『アスゼム』。"
      },
      {
        "text": "last chance",
        "sound": "ラスチャンス",
        "breakdown": "last の t が ch の前で脱落『ラス』。"
      },
      {
        "text": "soft drink",
        "sound": "ソフドリンク",
        "breakdown": "soft の t が d の前で脱落『ソフ』。"
      },
      {
        "text": "must go",
        "sound": "マスゴウ",
        "breakdown": "must の t が g の前で脱落『マス』。"
      },
      {
        "text": "old friend",
        "sound": "オウルフレンド",
        "breakdown": "old の d が f の前で脱落『オウル』。"
      },
      {
        "text": "kind gift",
        "sound": "カインギフト",
        "breakdown": "kind の d が g の前で脱落『カイン』。"
      },
      {
        "text": "world cup",
        "sound": "ワールカップ",
        "breakdown": "world の d が c の前で脱落『ワール』。"
      },
      {
        "text": "second chance",
        "sound": "セカンチャンス",
        "breakdown": "second の d が c の前で脱落『セカン』。"
      },
      {
        "text": "first time",
        "sound": "ファースタイム",
        "breakdown": "first の t が t の前で脱落気味『ファース』。"
      },
      {
        "text": "cold day",
        "sound": "コウルデイ",
        "breakdown": "cold の d が d の前で脱落『コウル』。"
      },
      {
        "text": "most people",
        "sound": "モウスピーポー",
        "breakdown": "most の t が p の前で脱落『モウス』。"
      },
      {
        "text": "kept quiet",
        "sound": "ケプクワイエット",
        "breakdown": "kept の t が q の前で脱落『ケプ』。"
      },
      {
        "text": "left turn",
        "sound": "レフターン",
        "breakdown": "left の t が t の前で脱落気味『レフ』。"
      },
      {
        "text": "last week",
        "sound": "ラスウィーク",
        "breakdown": "last の t が w の前で脱落『ラス』。"
      }
    ]
  },
  {
    "id": "assim",
    "name": "同化（くっついて別の音に）",
    "color": "assim",
    "short": "t/d + you → チュ/ヂュ に変身",
    "ja": "隣り合う音が影響し合い、別の音に変わります。代表は語末 t/d と次の you/your が混ざって /tʃ/（チュ）/dʒ/（ヂュ）になる現象です。",
    "how": "［語末 t］＋ you → チュ、［語末 d］＋ you → ヂュ。",
    "examples": [
      {
        "text": "did you",
        "sound": "ディヂュ",
        "breakdown": "did の d ＋ you の y が溶け合い /dʒ/。di-dyou → 『ディ-ヂュ』。"
      },
      {
        "text": "don't you",
        "sound": "ドンチュ",
        "breakdown": "don't の t ＋ you の y が /tʃ/ に。don-tyou → 『ドン-チュ』。"
      },
      {
        "text": "would you",
        "sound": "ウヂュ",
        "breakdown": "would の d ＋ you で /dʒ/。woul-dyou → 『ウ-ヂュ』（ダークLも絡み『ウ』化）。"
      },
      {
        "text": "got you",
        "sound": "ガッチュ",
        "breakdown": "got の t ＋ you の y が /tʃ/→『ガッ-チュ』。"
      },
      {
        "text": "miss you",
        "sound": "ミシュー",
        "breakdown": "miss の s ＋ you の y が /ʃ/→『ミ-シュー』。"
      },
      {
        "text": "this year",
        "sound": "ディシヤー",
        "breakdown": "this の s ＋ year の y が同化し『シ』寄り→『ディ-シヤー』。"
      },
      {
        "text": "would you",
        "sound": "ウッヂュ",
        "breakdown": "would の d ＋ you の y が /dʒ/ に同化→『ウッ-ヂュ』。"
      },
      {
        "text": "meet you",
        "sound": "ミーチュ",
        "breakdown": "meet の t ＋ you の y が /tʃ/ に同化→『ミー-チュ』。"
      },
      {
        "text": "would you",
        "sound": "ウッヂュ",
        "breakdown": "would の d と you の y が同化して『ヂュ』。"
      },
      {
        "text": "miss you",
        "sound": "ミシュ",
        "breakdown": "miss の s と you の y が同化して『シュ』。"
      },
      {
        "text": "don't you",
        "sound": "ドンチュ",
        "breakdown": "don't の t と you の y が同化『チュ』。"
      },
      {
        "text": "meet you",
        "sound": "ミーチュ",
        "breakdown": "meet の t と you の y が同化『チュ』。"
      },
      {
        "text": "as you know",
        "sound": "アジュノウ",
        "breakdown": "as の s と you の y が同化『ジュ』。"
      },
      {
        "text": "would you mind",
        "sound": "ウッヂュマインド",
        "breakdown": "would の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "did you see",
        "sound": "ディヂュスィー",
        "breakdown": "did の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "could you tell",
        "sound": "クッヂュテル",
        "breakdown": "could の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "why don't you",
        "sound": "ワイドンチュ",
        "breakdown": "don't の t と you の y が同化『チュ』。"
      },
      {
        "text": "bless you",
        "sound": "ブレシュ",
        "breakdown": "bless の s と you の y が同化『シュ』。"
      },
      {
        "text": "got you",
        "sound": "ガッチュ",
        "breakdown": "got の t と you の y が同化『チュ』。"
      },
      {
        "text": "need you",
        "sound": "ニーヂュ",
        "breakdown": "need の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "won't you",
        "sound": "ウォンチュ",
        "breakdown": "won't の t と you の y が同化『チュ』。"
      },
      {
        "text": "had you",
        "sound": "ハヂュ",
        "breakdown": "had の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "miss you",
        "sound": "ミシュ",
        "breakdown": "miss の s と you の y が同化『シュ』。"
      },
      {
        "text": "as usual",
        "sound": "アジュージュアル",
        "breakdown": "as の s と usual の y が同化『ジュ』。"
      },
      {
        "text": "this year",
        "sound": "ディシヤ",
        "breakdown": "this の s と year の y が同化『シ』。"
      },
      {
        "text": "where's your",
        "sound": "ウェアジョア",
        "breakdown": "where's の s と your の y が同化『ジョ』。"
      },
      {
        "text": "bet you",
        "sound": "ベチュ",
        "breakdown": "bet の t と you の y が同化『チュ』。"
      },
      {
        "text": "meet you",
        "sound": "ミーチュ",
        "breakdown": "meet の t と you の y が同化『チュ』。"
      },
      {
        "text": "told you",
        "sound": "トウルヂュ",
        "breakdown": "told の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "would you",
        "sound": "ウヂュ",
        "breakdown": "would の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "could you",
        "sound": "クヂュ",
        "breakdown": "could の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "did you",
        "sound": "ディヂュ",
        "breakdown": "did の d と you の y が同化『ヂュ』。"
      },
      {
        "text": "don't you",
        "sound": "ドンチュ",
        "breakdown": "don't の t と you の y が同化『チュ』。"
      },
      {
        "text": "can't you",
        "sound": "キャンチュ",
        "breakdown": "can't の t と you の y が同化『チュ』。"
      },
      {
        "text": "about you",
        "sound": "アバウチュ",
        "breakdown": "about の t と you の y が同化『チュ』。"
      },
      {
        "text": "last year",
        "sound": "ラスチヤ",
        "breakdown": "last の t と year の y が同化『チ』。"
      },
      {
        "text": "as you know",
        "sound": "アジュノウ",
        "breakdown": "as の s と you の y が同化『ジュ』。"
      },
      {
        "text": "press you",
        "sound": "プレシュ",
        "breakdown": "press の s と you の y が同化『シュ』。"
      },
      {
        "text": "raise your",
        "sound": "レイジョア",
        "breakdown": "raise の z と your の y が同化『ジョ』。"
      },
      {
        "text": "God bless you",
        "sound": "ガッブレシュ",
        "breakdown": "bless の s と you の y が同化『シュ』。"
      },
      {
        "text": "I'll get you",
        "sound": "アイルゲチュ",
        "breakdown": "get の t と you の y が同化『チュ』。"
      },
      {
        "text": "won't you",
        "sound": "ウォンチュ",
        "breakdown": "won't の t と you の y が同化『チュ』。"
      },
      {
        "text": "aren't you",
        "sound": "アーンチュ",
        "breakdown": "aren't の t と you の y が同化『チュ』。"
      },
      {
        "text": "haven't you",
        "sound": "ハヴンチュ",
        "breakdown": "haven't の t と you の y が同化『チュ』。"
      },
      {
        "text": "shouldn't you",
        "sound": "シュドゥンチュ",
        "breakdown": "shouldn't の t と you が同化『チュ』。"
      },
      {
        "text": "get your",
        "sound": "ゲチョア",
        "breakdown": "get の t と your の y が同化『チョ』。"
      },
      {
        "text": "put your",
        "sound": "プチョア",
        "breakdown": "put の t と your の y が同化『チョ』。"
      },
      {
        "text": "mind your",
        "sound": "マインヂョア",
        "breakdown": "mind の d と your の y が同化『ヂョ』。"
      },
      {
        "text": "need your",
        "sound": "ニーヂョア",
        "breakdown": "need の d と your の y が同化『ヂョ』。"
      },
      {
        "text": "would you mind",
        "sound": "ウヂュマインド",
        "breakdown": "would の d と you が同化『ヂュ』。"
      },
      {
        "text": "sent you",
        "sound": "センチュ",
        "breakdown": "sent の t と you の y が同化『チュ』。"
      },
      {
        "text": "next year",
        "sound": "ネクスチヤ",
        "breakdown": "next の t と year の y が同化『チ』。"
      },
      {
        "text": "this year",
        "sound": "ディシヤ",
        "breakdown": "this の s と year の y が同化『シ』。"
      },
      {
        "text": "miss you",
        "sound": "ミシュ",
        "breakdown": "miss の s と you の y が同化『シュ』。"
      },
      {
        "text": "bless you",
        "sound": "ブレシュ",
        "breakdown": "bless の s と you の y が同化『シュ』。"
      },
      {
        "text": "because you",
        "sound": "ビコージュ",
        "breakdown": "because の z と you の y が同化『ジュ』。"
      },
      {
        "text": "did you",
        "sound": "ディヂュ",
        "breakdown": "did の d と you の y が同化『ディヂュ』。"
      },
      {
        "text": "would you",
        "sound": "ウヂュ",
        "breakdown": "would の d と you の y が同化『ウヂュ』。"
      },
      {
        "text": "could you",
        "sound": "クヂュ",
        "breakdown": "could の d と you の y が同化『クヂュ』。"
      },
      {
        "text": "got you",
        "sound": "ガッチュ",
        "breakdown": "got の t と you の y が同化『ガッチュ』。"
      },
      {
        "text": "don't you",
        "sound": "ドンチュ",
        "breakdown": "don't の t と you の y が同化『ドンチュ』。"
      },
      {
        "text": "meet you",
        "sound": "ミーチュ",
        "breakdown": "meet の t と you の y が同化『ミーチュ』。"
      },
      {
        "text": "about you",
        "sound": "アバウチュ",
        "breakdown": "about の t と you の y が同化『アバウチュ』。"
      },
      {
        "text": "as you know",
        "sound": "アジュノウ",
        "breakdown": "as の z と you の y が同化『アジュ』。"
      },
      {
        "text": "is your",
        "sound": "イジョア",
        "breakdown": "is の z と your の y が同化『イジョア』。"
      },
      {
        "text": "where's your",
        "sound": "ウェアジョア",
        "breakdown": "where's の z と your が同化『ウェアジョア』。"
      },
      {
        "text": "tell you",
        "sound": "テリュ",
        "breakdown": "tell の l と you が滑らかに『テリュ』。"
      },
      {
        "text": "call you",
        "sound": "コーリュ",
        "breakdown": "call の l と you が滑らかに『コーリュ』。"
      },
      {
        "text": "won't you",
        "sound": "ウォウンチュ",
        "breakdown": "won't の t と you の y が同化『ウォウンチュ』。"
      },
      {
        "text": "can't you",
        "sound": "キャンチュ",
        "breakdown": "can't の t と you の y が同化『キャンチュ』。"
      },
      {
        "text": "need you",
        "sound": "ニーヂュ",
        "breakdown": "need の d と you の y が同化『ニーヂュ』。"
      },
      {
        "text": "told you",
        "sound": "トウルヂュ",
        "breakdown": "told の d と you の y が同化『トウルヂュ』。"
      },
      {
        "text": "set you up",
        "sound": "セッチュアップ",
        "breakdown": "set の t と you の y が同化『セッチュ』。"
      },
      {
        "text": "mind your",
        "sound": "マインヂョア",
        "breakdown": "mind の d と your の y が同化『マインヂョア』。"
      },
      {
        "text": "had your",
        "sound": "ハヂョア",
        "breakdown": "had の d と your の y が同化『ハヂョア』。"
      },
      {
        "text": "miss you",
        "sound": "ミシュ",
        "breakdown": "miss の s と you の y が同化『ミシュ』。"
      },
      {
        "text": "bless you",
        "sound": "ブレシュ",
        "breakdown": "bless の s と you の y が同化『ブレシュ』。"
      },
      {
        "text": "this year",
        "sound": "ディシュア",
        "breakdown": "this の s と year の y が同化『ディシュア』。"
      },
      {
        "text": "help you",
        "sound": "ヘルピュ",
        "breakdown": "help の p と you が滑らかに『ヘルピュ』。"
      },
      {
        "text": "find you",
        "sound": "ファインヂュ",
        "breakdown": "find の d と you の y が同化『ファインヂュ』。"
      }
    ]
  },
  {
    "id": "weak",
    "name": "弱形（機能語が弱くなる）",
    "color": "weak",
    "short": "to/of/and/can 等は曖昧な『ア』に",
    "ja": "意味の中心でない機能語（前置詞・接続詞・助動詞・冠詞）は強く読まれず、母音が曖昧母音 /ə/（シュワー）に弱まり短くなります。聞き取れないと文がつながって聞こえます。",
    "how": "to /tə/, of /əv/, and /ən/, can /kən/, for /fər/, a /ə/, the /ðə/ など。",
    "examples": [
      {
        "text": "a cup of tea",
        "sound": "アカッパティー",
        "breakdown": "of が弱形 /əv/→/ə/ で cup とくっつき『カッパ』。a-cu-pof-tea → 『アカッパティー』。"
      },
      {
        "text": "fish and chips",
        "sound": "フィッシュンチップス",
        "breakdown": "and が弱形 /ən/→/n/ に。fish-(a)n-chips → 『フィッシュン-チップス』。"
      },
      {
        "text": "I can do it",
        "sound": "アイクンドゥイッ",
        "breakdown": "can は弱形 /kən/『クン』（強形『キャン』ではない）。do の後 it がくっつき『ドゥイッ』。"
      },
      {
        "text": "a piece of cake",
        "sound": "アピーソブケイク",
        "breakdown": "of が弱形 /əv/ で piece とつながる→『ピーソブ』。"
      },
      {
        "text": "out of",
        "sound": "アウラ",
        "breakdown": "out の t が of の母音とつながりフラップ化、of は弱形→『アウラ』。"
      },
      {
        "text": "to the point",
        "sound": "トゥザポイント",
        "breakdown": "to /tə/, the /ðə/ が弱形で軽く→『トゥザ-ポイント』。"
      },
      {
        "text": "cup of tea",
        "sound": "カパヴティー",
        "breakdown": "of が弱形 /əv/ で cup と連結→『カ-パヴ』。"
      },
      {
        "text": "for a while",
        "sound": "フォラワイォ",
        "breakdown": "for /fər/ と a /ə/ が弱く連結→『フォラ-ワイォ』。"
      },
      {
        "text": "a cup of tea",
        "sound": "アカッパティー",
        "breakdown": "of が弱形『ァ』になり cup と結びつき『カッパ』。"
      },
      {
        "text": "fish and chips",
        "sound": "フィッシャンチップス",
        "breakdown": "and が弱形『ァン』になり『フィッシャン』。"
      },
      {
        "text": "a piece of cake",
        "sound": "アピーソヴケイク",
        "breakdown": "of が弱形『オヴ』→『ァヴ』、piece と連結『ピーソヴ』。"
      },
      {
        "text": "cup of coffee",
        "sound": "カッパコーフィ",
        "breakdown": "of が弱形になり cup と連結『カッパ』。"
      },
      {
        "text": "lots of them",
        "sound": "ロッツォヴェム",
        "breakdown": "of/them が弱形になり連結『ォヴェム』。"
      },
      {
        "text": "some of us",
        "sound": "サモヴァス",
        "breakdown": "of が弱形で some/us と連結『サモヴァス』。"
      },
      {
        "text": "a couple of days",
        "sound": "アカポォヴデイズ",
        "breakdown": "of が弱形で couple と連結『カポォヴ』。"
      },
      {
        "text": "most of the time",
        "sound": "モウスタヴァタイム",
        "breakdown": "of/the が弱形で連結『モウスタヴァ』。"
      },
      {
        "text": "plenty of time",
        "sound": "プレンティォヴタイム",
        "breakdown": "of が弱形で plenty と連結『プレンティォヴ』。"
      },
      {
        "text": "all of a sudden",
        "sound": "オーロヴァサドゥン",
        "breakdown": "all/of/a が連結『オーロヴァ』。"
      },
      {
        "text": "kind of busy",
        "sound": "カインダビズィ",
        "breakdown": "kind of が縮約 kinda『カインダ』。"
      },
      {
        "text": "a bunch of them",
        "sound": "アバンチョヴェム",
        "breakdown": "of/them が弱形連結『チョヴェム』。"
      },
      {
        "text": "a glass of water",
        "sound": "アグラソヴワラ",
        "breakdown": "of が弱形『ォヴ』、water はフラップ『ワラ』。"
      },
      {
        "text": "the best of luck",
        "sound": "ザベストヴラック",
        "breakdown": "of が弱形で best と連結『ベストヴ』。"
      },
      {
        "text": "for the most part",
        "sound": "ファザモウスパート",
        "breakdown": "for/the が弱形『ファザ』、most の t は脱落気味。"
      },
      {
        "text": "kind of late",
        "sound": "カインダレイト",
        "breakdown": "kind of が縮約 kinda『カインダ』。"
      },
      {
        "text": "sort of busy",
        "sound": "ソータビズィ",
        "breakdown": "sort of が縮約 sorta『ソータ』。"
      },
      {
        "text": "a lot of work",
        "sound": "アラロヴワーク",
        "breakdown": "lot の t がフラップ、of が弱形連結『ラロヴ』。"
      },
      {
        "text": "fish and chips",
        "sound": "フィッシュアンチップス",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "salt and pepper",
        "sound": "ソルタンペパ",
        "breakdown": "and が弱形『アン』、salt と連結。"
      },
      {
        "text": "bread and butter",
        "sound": "ブレダンバラ",
        "breakdown": "and が弱形『アン』、butter はフラップ。"
      },
      {
        "text": "cup of coffee",
        "sound": "カポヴコーフィ",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "kind of cold",
        "sound": "カインダコウルド",
        "breakdown": "kind of が縮約 kinda『カインダ』。"
      },
      {
        "text": "lots of fun",
        "sound": "ロッツォヴファン",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "one of them",
        "sound": "ワノヴェム",
        "breakdown": "of/them が弱形連結『オヴェム』。"
      },
      {
        "text": "a piece of paper",
        "sound": "アピーソヴペイパ",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "out of time",
        "sound": "アウロヴタイム",
        "breakdown": "out of が連結フラップ『アウロヴ』。"
      },
      {
        "text": "rock and roll",
        "sound": "ロッカンロウル",
        "breakdown": "and が弱形『アン』、rock と連結。"
      },
      {
        "text": "now and then",
        "sound": "ナウアンゼン",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "more and more",
        "sound": "モアランモア",
        "breakdown": "and が弱形『アン』、more と連結。"
      },
      {
        "text": "a glass of milk",
        "sound": "アグラソヴミルク",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "sort of nice",
        "sound": "ソータナイス",
        "breakdown": "sort of が縮約 sorta『ソータ』。"
      },
      {
        "text": "plenty of room",
        "sound": "プレンティオヴルーム",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "cream and sugar",
        "sound": "クリームアンシュガー",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "pen and paper",
        "sound": "ペナンペイパ",
        "breakdown": "and が弱形『アン』、pen と連結。"
      },
      {
        "text": "back and forth",
        "sound": "バッカンフォース",
        "breakdown": "and が弱形『アン』、back と連結。"
      },
      {
        "text": "here and now",
        "sound": "ヒアランナウ",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "in and out",
        "sound": "イナンアウト",
        "breakdown": "and が弱形『アン』、in と連結。"
      },
      {
        "text": "up and down",
        "sound": "アパンダウン",
        "breakdown": "and が弱形『アン』、up と連結。"
      },
      {
        "text": "odds and ends",
        "sound": "オッヅアンエンズ",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "give and take",
        "sound": "ギヴァンテイク",
        "breakdown": "and が弱形『アン』、give と連結。"
      },
      {
        "text": "wait and see",
        "sound": "ウェイタンスィー",
        "breakdown": "and が弱形『アン』、wait と連結。"
      },
      {
        "text": "pros and cons",
        "sound": "プロウザンコンズ",
        "breakdown": "and が弱形『アン』、pros と連結。"
      },
      {
        "text": "a slice of cake",
        "sound": "アスライソヴケイク",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "a ton of work",
        "sound": "アタノヴワーク",
        "breakdown": "of が弱形『ォヴ』、ton と連結。"
      },
      {
        "text": "kind of busy",
        "sound": "カインダビズィ",
        "breakdown": "kind of が縮約 kinda『カインダ』。"
      },
      {
        "text": "a sort of joke",
        "sound": "アソータジョウク",
        "breakdown": "sort of が縮約 sorta『ソータ』。"
      },
      {
        "text": "free of charge",
        "sound": "フリーオヴチャージ",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "fish and chips",
        "sound": "フィッシュアンチップス",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "rock and roll",
        "sound": "ロッカンロール",
        "breakdown": "and が弱形『アン』、rock と連結。"
      },
      {
        "text": "salt and pepper",
        "sound": "ソールタンペパ",
        "breakdown": "and が弱形『アン』、salt と連結。"
      },
      {
        "text": "now and then",
        "sound": "ナウアンゼン",
        "breakdown": "and が弱形『アン』。"
      },
      {
        "text": "cup of coffee",
        "sound": "カポヴコーフィ",
        "breakdown": "of が弱形『ォヴ』、cup と連結。"
      },
      {
        "text": "glass of water",
        "sound": "グラソヴウォーター",
        "breakdown": "of が弱形『ォヴ』、glass と連結。"
      },
      {
        "text": "kind of like",
        "sound": "カインダライク",
        "breakdown": "kind of＝kinda『カインダ』。"
      },
      {
        "text": "out of here",
        "sound": "アウロヴヒア",
        "breakdown": "of が弱形＋t のフラップ『アウロヴ』。"
      },
      {
        "text": "for a while",
        "sound": "フォアワイル",
        "breakdown": "for が弱形『フォ』、a と連結。"
      },
      {
        "text": "to the store",
        "sound": "トゥザストア",
        "breakdown": "to/the が弱形『トゥザ』。"
      },
      {
        "text": "at the office",
        "sound": "アッジオフィス",
        "breakdown": "at/the が弱形『アッジ』。"
      },
      {
        "text": "can you help",
        "sound": "キャニュヘルプ",
        "breakdown": "can が弱形『キャン』、you と連結。"
      },
      {
        "text": "bread and butter",
        "sound": "ブレッダンバタ",
        "breakdown": "and が弱形『アン』、bread と連結。"
      },
      {
        "text": "back and forth",
        "sound": "バッカンフォース",
        "breakdown": "and が弱形『アン』、back と連結。"
      },
      {
        "text": "here and there",
        "sound": "ヒアランゼア",
        "breakdown": "and が弱形『アン』、here と連結。"
      },
      {
        "text": "pros and cons",
        "sound": "プロウザンコンズ",
        "breakdown": "and が弱形『アン』、pros と連結。"
      },
      {
        "text": "a glass of milk",
        "sound": "アグラソヴミルク",
        "breakdown": "of が弱形『ォヴ』、glass と連結。"
      },
      {
        "text": "a piece of pie",
        "sound": "アピーソヴパイ",
        "breakdown": "of が弱形『ォヴ』、piece と連結。"
      },
      {
        "text": "lots of fun",
        "sound": "ロッツォヴファン",
        "breakdown": "of が弱形『ォヴ』。"
      },
      {
        "text": "time for tea",
        "sound": "タイムフォティー",
        "breakdown": "for が弱形『フォ』、time と連結。"
      },
      {
        "text": "go to work",
        "sound": "ゴウトゥワーク",
        "breakdown": "to が弱形『トゥ』。"
      },
      {
        "text": "at the door",
        "sound": "アッザドア",
        "breakdown": "at/the が弱形『アッザ』。"
      },
      {
        "text": "on the table",
        "sound": "オンザテイボー",
        "breakdown": "on/the が弱形『オンザ』。"
      },
      {
        "text": "do you know",
        "sound": "ドュノウ",
        "breakdown": "do you が弱形『ドュ』。"
      }
    ]
  },
  {
    "id": "contract",
    "name": "縮約（wanna・gonna）",
    "color": "assim",
    "short": "want to → wanna 等にくだける",
    "ja": "口語では2語が縮まって1語のように発音されます。つづりは変わりませんが音が融合します。",
    "how": "want to → wanna、going to → gonna、got to → gotta、have to → hafta、kind of → kinda。",
    "examples": [
      {
        "text": "I want to go",
        "sound": "アイワナゴウ",
        "breakdown": "want to の t が融合し wanna /ˈwɑːnə/ →『ワナ』。"
      },
      {
        "text": "I'm going to call",
        "sound": "アイムガナコーォ",
        "breakdown": "going to → gonna /ˈɡɔːnə/。call は語末ダークLで『コーォ』。"
      },
      {
        "text": "I've got to leave",
        "sound": "アイヴガラリーヴ",
        "breakdown": "got to → gotta、tt が母音間でフラップ化し『ガラ』。"
      },
      {
        "text": "got to go",
        "sound": "ガラゴウ",
        "breakdown": "got to → gotta、tt がフラップ化『ガラ』→『ガラ-ゴウ』。"
      },
      {
        "text": "out of here",
        "sound": "アウラヒア",
        "breakdown": "out of → outta、フラップ化『アウラ』→『アウラ-ヒア』。"
      },
      {
        "text": "let me",
        "sound": "レンミー",
        "breakdown": "let me → lemme、t が n に同化『レンミー』。"
      },
      {
        "text": "kind of",
        "sound": "カインダ",
        "breakdown": "kind of → kinda。of が弱まり『カイン-ダ』。"
      },
      {
        "text": "want to",
        "sound": "ワナ",
        "breakdown": "want to → wanna。nt の t と to が融合→『ワナ』。"
      },
      {
        "text": "I want to go",
        "sound": "アイワナゴウ",
        "breakdown": "want to が縮約して wanna『ワナ』。"
      },
      {
        "text": "going to be late",
        "sound": "ガナビーレイト",
        "breakdown": "going to が縮約して gonna『ガナ』。"
      },
      {
        "text": "I have got to go",
        "sound": "アイガラゴウ",
        "breakdown": "have got to が縮約し gotta『ガラ』、go と連結。"
      },
      {
        "text": "kind of strange",
        "sound": "カインダストレンジ",
        "breakdown": "kind of が縮約し kinda『カインダ』。"
      },
      {
        "text": "what are you doing",
        "sound": "ワラユドゥーイン",
        "breakdown": "what are が縮約『ワラ』、you と連結。"
      },
      {
        "text": "let me see",
        "sound": "レミスィー",
        "breakdown": "let me が縮約『レミ』。"
      },
      {
        "text": "I do not know",
        "sound": "アイダノウ",
        "breakdown": "do not が縮約 dunno『ダノウ』。"
      },
      {
        "text": "give me that",
        "sound": "ギミザッ",
        "breakdown": "give me が縮約『ギミ』、that と連結。"
      },
      {
        "text": "what do you think",
        "sound": "ワダユスィンク",
        "breakdown": "what do you が縮約『ワダユ』。"
      },
      {
        "text": "got to run",
        "sound": "ガララン",
        "breakdown": "got to が縮約 gotta『ガラ』、run と連結。"
      },
      {
        "text": "I am going to go",
        "sound": "アイムガナゴウ",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "do not worry",
        "sound": "ドンウォーリ",
        "breakdown": "do not が縮約 don't『ドン』。"
      },
      {
        "text": "I want to know",
        "sound": "アイワナノウ",
        "breakdown": "want to が縮約 wanna『ワナ』。"
      },
      {
        "text": "out of here",
        "sound": "アウロヴヒア",
        "breakdown": "out of が連結しフラップ『アウロヴ』。"
      },
      {
        "text": "let me check",
        "sound": "レミチェック",
        "breakdown": "let me が縮約『レミ』。"
      },
      {
        "text": "have got to leave",
        "sound": "ハフガラリーヴ",
        "breakdown": "have got to が縮約 gotta『ガラ』。"
      },
      {
        "text": "going to try",
        "sound": "ガナトライ",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "do you know",
        "sound": "ヂュノウ",
        "breakdown": "do you が縮約『ヂュ』。"
      },
      {
        "text": "I would have done it",
        "sound": "アイウダンイッ",
        "breakdown": "would have が縮約 would've『ウダヴ』。"
      },
      {
        "text": "should have known",
        "sound": "シュダノウン",
        "breakdown": "should have が縮約 should've『シュダヴ』。"
      },
      {
        "text": "could have been",
        "sound": "クダビン",
        "breakdown": "could have が縮約 could've『クダヴ』。"
      },
      {
        "text": "must have left",
        "sound": "マスタレフト",
        "breakdown": "must have が縮約 must've『マスタヴ』。"
      },
      {
        "text": "got to go",
        "sound": "ガラゴウ",
        "breakdown": "got to が縮約 gotta『ガラ』。"
      },
      {
        "text": "want to see",
        "sound": "ワナスィー",
        "breakdown": "want to が縮約 wanna『ワナ』。"
      },
      {
        "text": "going to win",
        "sound": "ガナウィン",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "have to leave",
        "sound": "ハフタリーヴ",
        "breakdown": "have to が縮約『ハフタ』。"
      },
      {
        "text": "ought to know",
        "sound": "オータノウ",
        "breakdown": "ought to が縮約『オータ』。"
      },
      {
        "text": "used to live",
        "sound": "ユーストゥリヴ",
        "breakdown": "used to が縮約『ユーストゥ』。"
      },
      {
        "text": "supposed to be",
        "sound": "サポウストゥビ",
        "breakdown": "supposed to が縮約『サポウストゥ』。"
      },
      {
        "text": "let me see",
        "sound": "レミスィー",
        "breakdown": "let me が縮約 lemme『レミ』。"
      },
      {
        "text": "give me that",
        "sound": "ギミザッ",
        "breakdown": "give me が縮約 gimme『ギミ』。"
      },
      {
        "text": "don't know yet",
        "sound": "ダノウイェッ",
        "breakdown": "don't know が縮約 dunno『ダノウ』。"
      },
      {
        "text": "what do you think",
        "sound": "ワダユスィンク",
        "breakdown": "what do you が縮約『ワダユ』。"
      },
      {
        "text": "I will have finished",
        "sound": "アイルハヴフィニッシュト",
        "breakdown": "I will が縮約 I'll『アイル』。"
      },
      {
        "text": "they would not go",
        "sound": "ゼイウドゥンゴウ",
        "breakdown": "would not が縮約 wouldn't『ウドゥン』。"
      },
      {
        "text": "she has not left",
        "sound": "シーハズンレフト",
        "breakdown": "has not が縮約 hasn't『ハズン』。"
      },
      {
        "text": "we are not ready",
        "sound": "ウィアーンレディ",
        "breakdown": "are not が縮約 aren't『アーン』。"
      },
      {
        "text": "it is not working",
        "sound": "イッツノットワーキン",
        "breakdown": "it is が縮約 it's『イッツ』。"
      },
      {
        "text": "you have got it",
        "sound": "ユヴガリッ",
        "breakdown": "you have が縮約 you've『ユヴ』。"
      },
      {
        "text": "there is a problem",
        "sound": "ゼアズアプロブレム",
        "breakdown": "there is が縮約 there's『ゼアズ』。"
      },
      {
        "text": "who would have thought",
        "sound": "フーウダソート",
        "breakdown": "would have が縮約 would've『ウダヴ』。"
      },
      {
        "text": "might have missed",
        "sound": "マイタミスト",
        "breakdown": "might have が縮約 might've『マイタヴ』。"
      },
      {
        "text": "need to know",
        "sound": "ニートゥノウ",
        "breakdown": "need to が縮約『ニートゥ』。"
      },
      {
        "text": "try to help",
        "sound": "トライタヘルプ",
        "breakdown": "try to が縮約『トライタ』。"
      },
      {
        "text": "going to start",
        "sound": "ガナスタート",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "want to leave",
        "sound": "ワナリーヴ",
        "breakdown": "want to が縮約 wanna『ワナ』。"
      },
      {
        "text": "have got to run",
        "sound": "ハフガララン",
        "breakdown": "got to が縮約 gotta『ガラ』。"
      },
      {
        "text": "let me help",
        "sound": "レミヘルプ",
        "breakdown": "let me が縮約 lemme『レミ』。"
      },
      {
        "text": "I have got it",
        "sound": "アイヴガリッ",
        "breakdown": "I have が縮約 I've『アイヴ』。"
      },
      {
        "text": "she will come",
        "sound": "シール カム",
        "breakdown": "she will が縮約 she'll『シール』。"
      },
      {
        "text": "we have done",
        "sound": "ウィヴダン",
        "breakdown": "we have が縮約 we've『ウィヴ』。"
      },
      {
        "text": "they are ready",
        "sound": "ゼアレディ",
        "breakdown": "they are が縮約 they're『ゼア』。"
      },
      {
        "text": "it is fine",
        "sound": "イッツファイン",
        "breakdown": "it is が縮約 it's『イッツ』。"
      },
      {
        "text": "that is right",
        "sound": "ザッツライト",
        "breakdown": "that is が縮約 that's『ザッツ』。"
      },
      {
        "text": "who is there",
        "sound": "フーズゼア",
        "breakdown": "who is が縮約 who's『フーズ』。"
      },
      {
        "text": "let us go",
        "sound": "レッツゴウ",
        "breakdown": "let us が縮約 let's『レッツ』。"
      },
      {
        "text": "going to win",
        "sound": "ガナウィン",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "want to know",
        "sound": "ワナノウ",
        "breakdown": "want to が縮約 wanna『ワナ』。"
      },
      {
        "text": "have to go",
        "sound": "ハフタゴウ",
        "breakdown": "have to が縮約『ハフタ』。"
      },
      {
        "text": "ought to",
        "sound": "オータ",
        "breakdown": "ought to が縮約『オータ』。"
      },
      {
        "text": "I have seen it",
        "sound": "アイヴスィーニッ",
        "breakdown": "I have が縮約 I've『アイヴ』。"
      },
      {
        "text": "he will go",
        "sound": "ヒール ゴウ",
        "breakdown": "he will が縮約 he'll『ヒール』。"
      },
      {
        "text": "you have won",
        "sound": "ユーヴワン",
        "breakdown": "you have が縮約 you've『ユーヴ』。"
      },
      {
        "text": "we are here",
        "sound": "ウィアヒア",
        "breakdown": "we are が縮約 we're『ウィア』。"
      },
      {
        "text": "she is ready",
        "sound": "シーズレディ",
        "breakdown": "she is が縮約 she's『シーズ』。"
      },
      {
        "text": "it has been",
        "sound": "イッツビン",
        "breakdown": "it has が縮約 it's『イッツ』。"
      },
      {
        "text": "what is it",
        "sound": "ワッツィッ",
        "breakdown": "what is が縮約 what's『ワッツ』。"
      },
      {
        "text": "there is time",
        "sound": "ゼアズタイム",
        "breakdown": "there is が縮約 there's『ゼアズ』。"
      },
      {
        "text": "going to go",
        "sound": "ガナゴウ",
        "breakdown": "going to が縮約 gonna『ガナ』。"
      },
      {
        "text": "want to see",
        "sound": "ワナスィー",
        "breakdown": "want to が縮約 wanna『ワナ』。"
      },
      {
        "text": "has to be",
        "sound": "ハストゥビー",
        "breakdown": "has to が縮約『ハストゥ』。"
      },
      {
        "text": "used to be",
        "sound": "ユーストゥビー",
        "breakdown": "used to が縮約『ユーストゥ』。"
      }
    ]
  },
  {
    "id": "aspiration",
    "name": "帯気音（息のp/t/k）",
    "color": "link",
    "short": "語頭の p/t/k は強い息を伴う",
    "ja": "強勢のある音節の頭の p/t/k は強い息（帯気）を伴い『プハ／トゥハ／クハ』のように出ます。一方 s の直後（spin, stop, sky）では帯気が消え、日本語の『パ・タ・カ』に近くなります。",
    "how": "語頭・強勢頭の p/t/k は帯気、s の直後は無帯気。",
    "examples": [
      {
        "text": "pin / spin",
        "sound": "ピン / スピン",
        "breakdown": "pin の p は息を伴い『プハィン』寄り。spin は s の後で帯気が消え『スピン』。"
      },
      {
        "text": "top",
        "sound": "タップ",
        "breakdown": "語頭 t は帯気して強く、語末 p は破裂を弱め（未開放）気味。"
      },
      {
        "text": "key",
        "sound": "キー",
        "breakdown": "語頭 k は息を伴い『クヒー』寄りに出る。"
      },
      {
        "text": "task",
        "sound": "タスク",
        "breakdown": "s の後の k は帯気が消え『スク』、語頭 t は帯気して強い。"
      },
      {
        "text": "speak",
        "sound": "スピーク",
        "breakdown": "s の直後の p は帯気なし→『スピーク』（pは『プハ』にならない）。"
      },
      {
        "text": "car",
        "sound": "カー",
        "breakdown": "語頭 k は息を伴って強く『クハー』寄り→『カー』。"
      },
      {
        "text": "stop",
        "sound": "スタップ",
        "breakdown": "s の直後の t は帯気が消え『タ』。語頭の t（top）なら強い息を伴う。"
      },
      {
        "text": "school",
        "sound": "スクーォ",
        "breakdown": "s の直後の k は帯気なし→『スクー』、語末ダークLで『ォ』。"
      },
      {
        "text": "pin (息あり)",
        "sound": "プヒン",
        "breakdown": "語頭 p は強い息を伴う『プヒン』。"
      },
      {
        "text": "top (息あり)",
        "sound": "トップ",
        "breakdown": "語頭 t は強い息を伴う。"
      },
      {
        "text": "come (息あり)",
        "sound": "クハム",
        "breakdown": "語頭 k は強い息を伴う『クハム』。"
      },
      {
        "text": "pen (息あり)",
        "sound": "プヘン",
        "breakdown": "語頭 p は強い息を伴う『プヘン』。"
      },
      {
        "text": "tea (息あり)",
        "sound": "トヒー",
        "breakdown": "語頭 t は強い息を伴う『トヒー』。"
      },
      {
        "text": "spin (息なし)",
        "sound": "スピン",
        "breakdown": "s の後の p は息を伴わない『スピン』。"
      },
      {
        "text": "stop (息なし)",
        "sound": "スタップ",
        "breakdown": "s の後の t は息を伴わない『スタップ』。"
      },
      {
        "text": "sky (息なし)",
        "sound": "スカイ",
        "breakdown": "s の後の k は息を伴わない『スカイ』。"
      },
      {
        "text": "kit (息あり)",
        "sound": "クヒット",
        "breakdown": "語頭 k は強い息を伴う『クヒット』。"
      },
      {
        "text": "pot (息あり)",
        "sound": "プハット",
        "breakdown": "語頭 p は強い息を伴う『プハット』。"
      },
      {
        "text": "time (息あり)",
        "sound": "トハイム",
        "breakdown": "語頭 t は強い息を伴う『トハイム』。"
      },
      {
        "text": "cool (息あり)",
        "sound": "クフール",
        "breakdown": "語頭 k は強い息を伴う『クフール』。"
      },
      {
        "text": "paper (息あり)",
        "sound": "ペイパ",
        "breakdown": "語頭 p は強い息を伴う『ペイパ』。"
      },
      {
        "text": "table (息あり)",
        "sound": "テイボー",
        "breakdown": "語頭 t は強い息を伴う『テイボー』。"
      },
      {
        "text": "candle (息あり)",
        "sound": "キャンドー",
        "breakdown": "語頭 k は強い息を伴う『キャンドー』。"
      },
      {
        "text": "pepper (息あり)",
        "sound": "ペパ",
        "breakdown": "語頭 p は強い息を伴う『ペパ』。"
      },
      {
        "text": "target (息あり)",
        "sound": "ターゲット",
        "breakdown": "語頭 t は強い息を伴う『ターゲット』。"
      },
      {
        "text": "spend (息なし)",
        "sound": "スペンド",
        "breakdown": "s の後の p は息を伴わない『スペンド』。"
      },
      {
        "text": "stand (息なし)",
        "sound": "スタンド",
        "breakdown": "s の後の t は息を伴わない『スタンド』。"
      },
      {
        "text": "scan (息なし)",
        "sound": "スキャン",
        "breakdown": "s の後の k は息を伴わない『スキャン』。"
      },
      {
        "text": "kettle (息あり)",
        "sound": "ケトー",
        "breakdown": "語頭 k は強い息を伴う『ケトー』。"
      },
      {
        "text": "pocket (息あり)",
        "sound": "ポケット",
        "breakdown": "語頭 p は強い息を伴う『ポケット』。"
      },
      {
        "text": "ticket (息あり)",
        "sound": "ティケット",
        "breakdown": "語頭 t は強い息を伴う『ティケット』。"
      },
      {
        "text": "corner (息あり)",
        "sound": "コーナ",
        "breakdown": "語頭 k は強い息を伴う『コーナ』。"
      }
    ]
  }
];

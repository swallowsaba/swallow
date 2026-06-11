/* ============================================================
   data/grammar.js — 文法レッスン（日本人がつまずく順）
   各レッスン：解説(ja) → 例文 → 並べ替え → 穴埋め → 英作文セルフチェック
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.grammar = [
  {
    id: "g_present_perfect",
    title: "現在完了（have + 過去分詞）",
    ja: "「過去のある時点から今につながる」感覚を表します。日本語の過去形につられて単純過去にしがちですが、" +
        "『経験（〜したことがある）』『継続（ずっと〜している）』『完了（ちょうど〜した）』は現在完了を使います。",
    examples: [
      { en: "I have worked here for three years.", ja: "ここで3年働いています（継続）。" },
      { en: "She has just finished the report.", ja: "彼女はちょうど報告書を仕上げた（完了）。" },
      { en: "Have you ever been to New York?", ja: "ニューヨークに行ったことはありますか（経験）？" }
    ],
    reorder: { answer: "I have already sent the email.", ja: "もうメールを送りました。" },
    blank: { before: "We ", after: " met before, I think.", options: ["have", "has", "had", "are"], answer: "have", ja: "以前お会いしたことがある気がします。" },
    writing: { prompt: "現在完了を使って「この会社で◯年働いている」と書いてみましょう。", model: "I have worked at this company for five years." }
  },
  {
    id: "g_articles",
    title: "冠詞（a / an / the）",
    ja: "日本語にない冠詞は最難関の一つです。初めて話題に出す数えられる単数名詞には a/an、" +
        "すでに話題に出た・特定できるものには the を使います。母音の音で始まる語の前は an になります（an hour）。",
    examples: [
      { en: "I sent a proposal. The proposal was approved.", ja: "提案書を送った。その提案書は承認された。" },
      { en: "She is an engineer.", ja: "彼女はエンジニアです。" },
      { en: "Let's meet in an hour.", ja: "1時間後に会いましょう。" }
    ],
    reorder: { answer: "Please open the file I sent.", ja: "私が送ったファイルを開いてください。" },
    blank: { before: "I have ", after: " idea for the campaign.", options: ["a", "an", "the", "（不要）"], answer: "an", ja: "キャンペーンの案があります。" },
    writing: { prompt: "a と the を1つずつ使って、商品を紹介する2文を書いてみましょう。", model: "We launched a new app. The app is already popular." }
  },
  {
    id: "g_prepositions",
    title: "前置詞（in / on / at / by）",
    ja: "時間・場所の感覚をつかむのがコツです。時間は in（月・年）, on（曜日・日付）, at（時刻）。" +
        "期限は by（〜までに）, 期間は for（〜の間）。日本語の助詞と1対1で対応しない点に注意します。",
    examples: [
      { en: "The meeting is at 3 p.m. on Monday.", ja: "会議は月曜の午後3時です。" },
      { en: "Please reply by Friday.", ja: "金曜までに返信してください。" },
      { en: "We have worked together for years.", ja: "私たちは何年も一緒に働いてきた。" }
    ],
    reorder: { answer: "Let's talk on Tuesday morning.", ja: "火曜の朝に話しましょう。" },
    blank: { before: "Please submit it ", after: " the end of the day.", options: ["by", "until", "in", "on"], answer: "by", ja: "今日中に提出してください。" },
    writing: { prompt: "by と at を使って、締め切りと会議時刻を1文にまとめてみましょう。", model: "Please finish it by noon; the review is at 2 p.m." }
  },
  {
    id: "g_relative",
    title: "関係詞（who / which / that）",
    ja: "2つの文を1つにまとめ、名詞を後ろから説明します。人には who、物には which、" +
        "どちらにも使えるのが that。説明を足すことで、英語らしい滑らかな文になります。",
    examples: [
      { en: "The client who called is waiting.", ja: "電話してきた顧客が待っています。" },
      { en: "This is the report that I mentioned.", ja: "これが私の言っていた報告書です。" },
      { en: "We use a tool which saves time.", ja: "時間を節約できるツールを使っています。" }
    ],
    reorder: { answer: "She is the person who leads the team.", ja: "彼女がチームを率いる人です。" },
    blank: { before: "Here is the file ", after: " you requested.", options: ["that", "who", "where", "what"], answer: "that", ja: "ご依頼のファイルです。" },
    writing: { prompt: "who か which を使って、同僚かツールを1文で説明してみましょう。", model: "He is a colleague who always helps me." }
  },
  {
    id: "g_subjunctive",
    title: "仮定法（If + 過去 / would）",
    ja: "現実とは違う仮定や、丁寧な提案に使います。『もし〜なら…だろう』は If＋過去形, 主節に would。" +
        "現在のことでも動詞は過去形にするのがポイントです。",
    examples: [
      { en: "If I were you, I would accept the offer.", ja: "私があなたなら、その提案を受けます。" },
      { en: "If we had more time, we would test it again.", ja: "もっと時間があれば、もう一度テストするのに。" },
      { en: "It would be great if you could join.", ja: "ご参加いただけると嬉しいです。" }
    ],
    reorder: { answer: "If I had time, I would help you.", ja: "時間があれば、手伝うのに。" },
    blank: { before: "If I ", after: " the manager, I would change the plan.", options: ["were", "am", "was", "be"], answer: "were", ja: "私が責任者なら、計画を変える。" },
    writing: { prompt: "If I were 〜 を使って、丁寧な提案を1文書いてみましょう。", model: "If I were in your position, I would wait one more week." }
  },
  {
    id: "g_polite",
    title: "ビジネスの婉曲表現（Could you / I was wondering if）",
    ja: "直接的な依頼は失礼に響くことがあります。Could you 〜? や I was wondering if you could 〜 を使うと、" +
        "丁寧で角の立たない依頼になります。ビジネスメールや会議で重宝します。",
    examples: [
      { en: "Could you send me the details?", ja: "詳細を送っていただけますか？" },
      { en: "I was wondering if you could review this.", ja: "こちらをご確認いただけないかと思いまして。" },
      { en: "Would it be possible to move the meeting?", ja: "会議をずらすことは可能でしょうか？" }
    ],
    reorder: { answer: "Could you share the slides with me?", ja: "スライドを共有していただけますか？" },
    blank: { before: "I was wondering if you ", after: " help me with this.", options: ["could", "can", "will", "would"], answer: "could", ja: "これを手伝っていただけないかと思いまして。" },
    writing: { prompt: "I was wondering if 〜 を使って、丁寧に資料を依頼する1文を書いてみましょう。", model: "I was wondering if you could send me the latest figures." }
  }
];

/* ---- 追加レッスン ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_passive",
    title: "受動態（be + 過去分詞）",
    ja: "「〜される」を表します。動作の主より対象を主役にしたいとき、行為者が不明・重要でないときに使います。" +
        "ビジネスでは The report was approved. のように、誰が、より「何がどうなったか」を端的に伝えられます。",
    examples: [
      { en: "The proposal was approved yesterday.", ja: "提案は昨日承認された。" },
      { en: "The meeting was moved to Friday.", ja: "会議は金曜に変更された。" },
      { en: "The invoice will be sent next week.", ja: "請求書は来週送られます。" }
    ],
    reorder: { answer: "The report was sent this morning.", ja: "報告書は今朝送られました。" },
    blank: { before: "The schedule ", after: " updated an hour ago.", options: ["was", "is being", "has", "did"], answer: "was", ja: "予定は1時間前に更新された。" },
    writing: { prompt: "受動態を使って「会議が延期された」と書いてみましょう。", model: "The meeting was postponed until next week." }
  },
  {
    id: "g_comparison",
    title: "比較（-er / more / the -est）",
    ja: "2つを比べるときは -er か more 〜 + than、3つ以上で一番を言うときは the -est / the most 〜。" +
        "長い形容詞（efficient など）は more / most を使います。as 〜 as（同じくらい）も便利です。",
    examples: [
      { en: "This plan is cheaper than the old one.", ja: "この案は前の案より安い。" },
      { en: "The new tool is more efficient.", ja: "新しいツールはより効率的だ。" },
      { en: "This is the best option for us.", ja: "これが私たちにとって最良の選択肢だ。" }
    ],
    reorder: { answer: "This option is better than the others.", ja: "この選択肢は他より良い。" },
    blank: { before: "The new process is ", after: " efficient than before.", options: ["more", "most", "much", "many"], answer: "more", ja: "新しい工程は以前より効率的だ。" },
    writing: { prompt: "比較級を使って、2つの案を比べる1文を書いてみましょう。", model: "Plan A is faster than Plan B, but Plan B is cheaper." }
  }
]);

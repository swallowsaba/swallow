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

/* ---- 穴埋めの「選択肢ごとの解説」を各レッスンに付与（誤答理由） ---- */
(function () {
  var EX = {
    g_present_perfect: {
      answer: "have",
      why: "主語 We は複数なので have。過去から今につながる『経験』を表す現在完了です。",
      opts: {
        "have": "正解。We（複数）＋ have ＋ 過去分詞 met で現在完了。",
        "has": "has は三人称単数（he/she/it）用。主語 We には使えません。",
        "had": "had は過去完了。ここは『今までに会ったことがある』という現在につながる話なので have。",
        "are": "are は be動詞。met（過去分詞）と組み合わせる完了形には使えません。"
      }
    },
    g_articles: {
      answer: "an",
      why: "idea は母音の音 /aɪ/ で始まるので a ではなく an。可算名詞の単数なので冠詞も必要です。",
      opts: {
        "a": "a は子音の音で始まる語の前。idea は母音始まりなので an が正しい。",
        "an": "正解。母音の音で始まる単数可算名詞 idea の前は an。",
        "the": "the は『特定のもの』を指すとき。ここは『ある案』と初出なので a/an。",
        "（不要）": "idea は可算名詞の単数。無冠詞では使えないので冠詞が必要。"
      }
    },
    g_prepositions: {
      answer: "by",
      why: "by + 期限 は『その時までに（完了）』。期限を示す定番表現です。",
      opts: {
        "by": "正解。by the end of the day で『今日中に（までに）』完了を表す。",
        "until": "until は『その時までずっと継続』。提出の『期限』には by。",
        "in": "in は『〜の中／〜後に』。期限の意味にはなりません。",
        "on": "on は曜日・日付に使う（on Monday）。end of the day には不可。"
      }
    },
    g_relative: {
      answer: "that",
      why: "先行詞 the file（モノ）の目的語にあたる関係代名詞。that／which が使えます。",
      opts: {
        "that": "正解。モノを指す関係代名詞 that。the file (that) you requested。",
        "who": "who は人を指す関係代名詞。file はモノなので不可。",
        "where": "where は場所を指す関係副詞。ここは目的語が抜けているので不可。",
        "what": "what は先行詞を含む（=the thing which）。既に the file があるので重複。"
      }
    },
    g_subjunctive: {
      answer: "were",
      why: "仮定法過去では、主語が I でも be動詞は were を使うのが原則（現実と違う仮定）。",
      opts: {
        "were": "正解。仮定法過去は If I were … と were を使う（口語の was も可だが原則 were）。",
        "am": "am は現在の事実。ここは『もし〜だったら』の非現実なので不可。",
        "was": "口語では聞くが、仮定法の原則は If I were。試験・ビジネスでは were。",
        "be": "原形 be は使えない。仮定法過去は were。"
      }
    },
    g_polite: {
      answer: "could",
      why: "I was wondering if you could … は依頼を最も丁寧にする定番。過去形で控えめさを出します。",
      opts: {
        "could": "正解。婉曲な依頼。was wondering if you could … で非常に丁寧。",
        "can": "can でも通じるが直接的。was wondering と時制も揃わない。",
        "will": "will は意志・予定。丁寧な依頼の型には合わない。",
        "would": "would help も丁寧だが、定型は if you could。"
      }
    },
    g_passive: {
      answer: "was",
      why: "an hour ago（過去の一点）＋ updated（過去分詞）なので受動態の過去 was updated。",
      opts: {
        "was": "正解。was + 過去分詞 updated で『更新された』。an hour ago と一致。",
        "is being": "is being updated は『今まさに更新中』。an hour ago（過去）と矛盾。",
        "has": "has updated は能動の現在完了。『された』の受け身にはならない。",
        "did": "did + updated は文法的に不可。受動態は be + 過去分詞。"
      }
    },
    g_comparison: {
      answer: "more",
      why: "efficient は長い形容詞なので比較級は more efficient。than と呼応します。",
      opts: {
        "more": "正解。3音節以上の efficient は more をつけて比較級に。more efficient than …。",
        "most": "most は最上級（the most）。than と一緒には使わない。",
        "much": "much は『量』の修飾。比較級を作る語ではない。",
        "many": "many は数えられる名詞の数。形容詞 efficient の比較には使えない。"
      }
    }
  };
  (window.EigoData.grammar || []).forEach(function (l) {
    if (l.blank && EX[l.id]) { l.blank.explain = EX[l.id]; }
  });
})();

/* ---- 増量：文法レッスン6本（誤答解説 explain つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_gerund_inf", title: "動名詞と不定詞（doing / to do）",
    ja: "動詞の後に動詞を続けるとき、-ing（動名詞）を取る動詞（enjoy, finish, consider…）と、to+動詞（不定詞）を取る動詞（want, decide, hope…）があります。意味で変わる動詞（remember/stop など）もあります。",
    examples: [
      { en: "I finished writing the report.", ja: "報告書を書き終えた。" },
      { en: "We decided to postpone the launch.", ja: "発売を延期することにした。" },
      { en: "Please remember to send it.", ja: "送るのを忘れないで。" }
    ],
    reorder: { answer: "We are considering hiring more staff.", ja: "増員を検討しています。" },
    blank: { before: "I look forward to ", after: " you.", options: ["meeting", "meet", "met", "to meet"], answer: "meeting", ja: "お会いするのを楽しみにしています。",
      explain: { answer: "meeting", why: "look forward to の to は前置詞。前置詞の後ろは動名詞 -ing。",
        opts: { "meeting": "正解。look forward to は前置詞 to なので後ろは動名詞 meeting。", "meet": "原形は不可。前置詞 to の後ろは名詞か動名詞。", "met": "過去形は不可。", "to meet": "to が重複。look forward to + meeting。" } } },
    writing: { prompt: "「〜することに決めた」を decide to で書いてみましょう。", model: "We decided to change suppliers." }
  },
  {
    id: "g_modals", title: "助動詞（must / should / might）",
    ja: "推量や義務の強さを表します。must（強い義務・確信）、should（助言・推奨）、might/may（弱い可能性）、have to（必要）。否定形で意味が変わる点に注意（mustn't=禁止, don't have to=不要）。",
    examples: [
      { en: "You should double-check the numbers.", ja: "数字を再確認したほうがいい。" },
      { en: "It might rain later.", ja: "あとで雨が降るかもしれない。" },
      { en: "You must wear an ID badge.", ja: "IDバッジ着用は必須です。" }
    ],
    reorder: { answer: "You should ask the manager first.", ja: "まず上司に聞くべきだ。" },
    blank: { before: "You ", after: " worry; it's already fixed.", options: ["don't have to", "mustn't", "have to", "should"], answer: "don't have to", ja: "心配しなくていいよ、もう直ったから。",
      explain: { answer: "don't have to", why: "『〜しなくてよい（不要）』は don't have to。mustn't は『〜してはいけない（禁止）』で逆の意味。",
        opts: { "don't have to": "正解。『心配する必要はない』＝不要。", "mustn't": "『心配してはいけない』＝禁止。文意に合わない。", "have to": "『心配しなければならない』＝逆。", "should": "『心配すべき』＝逆の助言。" } } },
    writing: { prompt: "should を使って助言を1文書いてみましょう。", model: "You should confirm the booking by email." }
  },
  {
    id: "g_causative", title: "使役（make / let / have + 人 + 動詞）",
    ja: "『人に〜させる/してもらう』。make（強制）、let（許可）、have（依頼・手配）は後ろに『動詞の原形』を取ります。get は get 人 to do（to が必要）で形が違います。",
    examples: [
      { en: "The manager let us leave early.", ja: "上司は早退を許してくれた。" },
      { en: "I'll have the team review it.", ja: "チームに確認させます。" },
      { en: "Don't make me wait.", ja: "待たせないで。" }
    ],
    reorder: { answer: "Let me check the schedule.", ja: "予定を確認させてください。" },
    blank: { before: "I had the IT team ", after: " my laptop.", options: ["fix", "to fix", "fixed", "fixing"], answer: "fix", ja: "ITチームにノートPCを直してもらった。",
      explain: { answer: "fix", why: "have + 人 + 動詞の原形。『〜してもらう』。",
        opts: { "fix": "正解。have the team fix（原形）で『チームに直してもらう』。", "to fix": "have の使役では to は不要。", "fixed": "have + 物 + 過去分詞なら可だが、ここは『人(team)に』なので原形。", "fixing": "-ing は不可。" } } },
    writing: { prompt: "let を使って『〜させてください』を書いてみましょう。", model: "Let me know if you have any questions." }
  },
  {
    id: "g_future", title: "未来表現（will / be going to）",
    ja: "will はその場の決定・予測・申し出。be going to は前から決めていた予定や、根拠のある予測。現在進行形も近い予定（I'm meeting…）に使えます。",
    examples: [
      { en: "I'll send it right now.", ja: "今すぐ送ります（その場の決定）。" },
      { en: "We're going to launch in May.", ja: "5月に発売予定です（既定）。" },
      { en: "I'm meeting the client tomorrow.", ja: "明日その顧客と会います（予定）。" }
    ],
    reorder: { answer: "I will call you when it is ready.", ja: "準備できたら電話します。" },
    blank: { before: "Look at those clouds — it ", after: " rain.", options: ["is going to", "will", "would", "goes to"], answer: "is going to", ja: "あの雲を見て、雨が降りそうだ。",
      explain: { answer: "is going to", why: "目の前の根拠（雲）にもとづく予測は be going to。",
        opts: { "is going to": "正解。今ある証拠からの予測は be going to。", "will": "will は根拠の薄い予測やその場の決定。証拠がある時は going to が自然。", "would": "would は仮定・過去の習慣など。予測の文に合わない。", "goes to": "goes to は不可。be going to の形。" } } },
    writing: { prompt: "be going to で来週の予定を1文。", model: "We are going to release the update next week." }
  },
  {
    id: "g_quantifiers", title: "数量詞（some / any / much / many）",
    ja: "数えられる名詞には many/a few、数えられない名詞には much/a little。肯定文は some、否定・疑問は any が基本（依頼・勧めの疑問では some も使う）。",
    examples: [
      { en: "We have many options.", ja: "選択肢が多くある。" },
      { en: "There isn't much time.", ja: "あまり時間がない。" },
      { en: "Would you like some coffee?", ja: "コーヒーはいかが？（勧め）" }
    ],
    reorder: { answer: "We don't have any feedback yet.", ja: "まだフィードバックがない。" },
    blank: { before: "How ", after: " people are coming?", options: ["many", "much", "few", "little"], answer: "many", ja: "何人来ますか？",
      explain: { answer: "many", why: "people は数えられる名詞なので many。",
        opts: { "many": "正解。数えられる名詞 people の数を尋ねる how many。", "much": "much は数えられない名詞用（how much money）。", "few": "few は『ほとんどない』の意味で疑問詞にならない。", "little": "little も量で、疑問詞 how と組まない。" } } },
    writing: { prompt: "much か many を使って在庫について1文。", model: "We don't have many units left in stock." }
  },
  {
    id: "g_conjunctions", title: "接続詞（although / because / so）",
    ja: "理由は because、結果は so、譲歩（〜だけれど）は although/though、対比は but/while。although は1文に1回（although … , … で接続）。",
    examples: [
      { en: "We shipped it early because the client needed it.", ja: "顧客が必要としたので早く出荷した。" },
      { en: "It was late, so we rescheduled.", ja: "遅かったので予定を変えた。" },
      { en: "Although it was hard, we finished.", ja: "大変だったが、やり遂げた。" }
    ],
    reorder: { answer: "Although the budget was small, the result was great.", ja: "予算は小さかったが結果は素晴らしかった。" },
    blank: { before: "We delayed the launch ", after: " the test failed.", options: ["because", "so", "although", "but"], answer: "because", ja: "テストに失敗したので発売を遅らせた。",
      explain: { answer: "because", why: "後ろが『理由』なので because（〜なので）。",
        opts: { "because": "正解。『テスト失敗』という理由を導く because。", "so": "so は『結果』を導く。理由節には合わない。", "although": "although は『〜だけれど』の譲歩。理由ではない。", "but": "but は対比。理由を表さない。" } } },
    writing: { prompt: "because を使って遅延の理由を1文。", model: "We postponed the meeting because two members were sick." }
  }
]);

/* ---- 増量：文法レッスン（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_present_continuous", title: "現在進行形（be + -ing）",
    ja: "『今まさに進行中』の動作や、最近の一時的な状況、確定した近い予定を表します。状態動詞（know, like, want など）は通常進行形にしません。",
    examples: [
      { en: "She is working from home today.", ja: "彼女は今日は在宅勤務です。" },
      { en: "We are launching next month.", ja: "来月ローンチ予定です。" },
      { en: "I'm not feeling well.", ja: "体調が良くありません。" }
    ],
    reorder: { answer: "They are reviewing the contract now.", ja: "彼らは今、契約書を確認中です。" },
    blank: { before: "He ", after: " on the report right now.", options: ["is working", "works", "work", "worked"], answer: "is working", ja: "彼は今その報告書に取り組んでいます。",
      explain: { answer: "is working", why: "right now（今まさに）なので現在進行形 is working。",
        opts: { "is working": "正解。right now の進行中の動作は be + -ing。", "works": "現在形は習慣・一般的事実。今まさにの動作には進行形。", "work": "主語 He に三単現の s が必要で、進行中でもない。", "worked": "過去形。now と合わない。" } } },
    writing: { prompt: "現在進行形で『今〜しているところ』を1文。", model: "I'm preparing the slides for tomorrow." }
  },
  {
    id: "g_past_simple", title: "過去形（規則・不規則動詞）",
    ja: "過去の完了した動作・状態。規則動詞は -ed、不規則動詞は固有の形（go→went, take→took）。過去の特定時点（yesterday, last week）と相性が良いです。",
    examples: [
      { en: "We finished the project last week.", ja: "先週そのプロジェクトを終えた。" },
      { en: "She went to the conference.", ja: "彼女は会議に行った。" },
      { en: "I didn't receive your email.", ja: "メールを受け取っていません。" }
    ],
    reorder: { answer: "They sent the invoice yesterday.", ja: "彼らは昨日請求書を送った。" },
    blank: { before: "We ", after: " the deal last Friday.", options: ["closed", "close", "have closed", "closing"], answer: "closed", ja: "先週金曜に契約をまとめた。",
      explain: { answer: "closed", why: "last Friday（過去の特定時点）なので過去形 closed。",
        opts: { "closed": "正解。過去の一点 last Friday には過去形。", "close": "現在形。過去の出来事に合わない。", "have closed": "現在完了は『いつ』を特定する語（last Friday）と一緒に使えない。", "closing": "-ing 単独では述語にならない。" } } },
    writing: { prompt: "過去形で昨日したことを1文。", model: "I called the supplier and confirmed the order yesterday." }
  },
  {
    id: "g_countable", title: "可算・不可算名詞（a/an, much/many）",
    ja: "数えられる名詞は a/an・複数形・many、数えられない名詞（information, advice, work など）は単数扱い・much。日本語の感覚と違う不可算名詞に注意。",
    examples: [
      { en: "I need some information.", ja: "情報が必要です。" },
      { en: "Can I give you some advice?", ja: "助言してもいい？" },
      { en: "We have a lot of work today.", ja: "今日は仕事が多い。" }
    ],
    reorder: { answer: "She gave me a piece of advice.", ja: "彼女は助言をくれた。" },
    blank: { before: "He gave me a lot of useful ", after: ".", options: ["information", "informations", "an information", "informations"], answer: "information", ja: "彼は有益な情報をたくさんくれた。",
      explain: { answer: "information", why: "information は不可算。複数形 s も a も付けない。",
        opts: { "information": "正解。information は不可算名詞でそのまま使う。", "informations": "不可算なので複数形 s は付けられない。", "an information": "不可算なので a/an は付かない。", "informations ": "同上、複数形不可。" } } },
    writing: { prompt: "不可算名詞 advice か information を使って1文。", model: "Thank you for the helpful information." }
  },
  {
    id: "g_present_perfect_cont", title: "現在完了進行形（have been + -ing）",
    ja: "過去から今まで『ずっと続いている動作』を強調します。継続の長さや、たった今まで続いていたことを表すのに使います。",
    examples: [
      { en: "I have been working here since 2020.", ja: "2020年からずっとここで働いています。" },
      { en: "We have been waiting for an hour.", ja: "1時間ずっと待っています。" },
      { en: "She has been studying English for years.", ja: "彼女は何年も英語を勉強しています。" }
    ],
    reorder: { answer: "They have been testing the system all week.", ja: "彼らは1週間ずっとシステムを試験している。" },
    blank: { before: "We have ", after: " on this since morning.", options: ["been working", "worked", "work", "working"], answer: "been working", ja: "朝からずっとこれに取り組んでいます。",
      explain: { answer: "been working", why: "have + been + -ing で『ずっと〜し続けている』の継続を強調。",
        opts: { "been working": "正解。現在完了進行形 have been working。", "worked": "現在完了（完了・経験）だが継続中の動作の強調にはならない。", "work": "形が不完全。", "working": "have working は誤り。been が必要。" } } },
    writing: { prompt: "have been -ing で継続中のことを1文。", model: "I have been learning English every day for six months." }
  },
  {
    id: "g_so_such", title: "強調（so / such）",
    ja: "so は形容詞・副詞を強める（so good）、such は『a/an + 形容詞 + 名詞』を強める（such a good idea）。結果の that 節を続けることも多いです。",
    examples: [
      { en: "It was so helpful.", ja: "とても助かりました。" },
      { en: "It was such a great meeting.", ja: "とても良い会議でした。" },
      { en: "She was so busy that she skipped lunch.", ja: "彼女は忙しすぎて昼食を抜いた。" }
    ],
    reorder: { answer: "It was such a long day.", ja: "本当に長い一日だった。" },
    blank: { before: "It was ", after: " a productive session.", options: ["such", "so", "very", "too"], answer: "such", ja: "とても生産的な会でした。",
      explain: { answer: "such", why: "such + a + 形容詞 + 名詞（a productive session）。so は名詞句を直接強められない。",
        opts: { "such": "正解。such a productive session。", "so": "so は形容詞/副詞単独を強める（so productive）。名詞句には such。", "very": "very a … の語順は不可。", "too": "too は『〜すぎる』で意味が変わる。" } } },
    writing: { prompt: "such a … を使って感想を1文。", model: "It was such a valuable discussion." }
  },
  {
    id: "g_reported", title: "間接話法（say / tell that …）",
    ja: "人の発言を伝えるとき、時制を1つ過去にずらすのが基本（is→was, will→would）。tell は人を目的語に取り（tell me that …）、say は取りません（say that …）。",
    examples: [
      { en: "He said that he was busy.", ja: "彼は忙しいと言った。" },
      { en: "She told me that she would call.", ja: "彼女は電話すると言った。" },
      { en: "They said they had finished.", ja: "彼らは終わったと言った。" }
    ],
    reorder: { answer: "She told me that the report was ready.", ja: "彼女は報告書ができたと言った。" },
    blank: { before: "He ", after: " me that he would be late.", options: ["told", "said", "spoke", "talked"], answer: "told", ja: "彼は遅れると私に言った。",
      explain: { answer: "told", why: "tell は『tell + 人 + that』。me が続くので told。",
        opts: { "told": "正解。tell me that … の形。", "said": "say は人を直接目的語に取らない（said to me なら可）。", "spoke": "speak は that 節を直接取らない。", "talked": "talk も that 節を直接取らない。" } } },
    writing: { prompt: "told me that … で誰かの発言を1文。", model: "She told me that the client had approved the plan." }
  }
]);

/* ---- 増量：関係副詞・強調構文・分詞構文（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_relative_adverb", title: "関係副詞（where / when / why / how）",
    ja: "先行詞が『場所・時・理由・方法』のとき、関係副詞でつなぎます。where=場所(the office where…)、when=時(the day when…)、why=理由(the reason why…)、how=方法。関係代名詞(which/that)と違い、後ろは『完全な文』が続きます。",
    examples: [
      { en: "This is the office where we met.", ja: "ここが私たちが会ったオフィスです。" },
      { en: "I remember the day when we launched.", ja: "発売した日を覚えています。" },
      { en: "Tell me the reason why it failed.", ja: "失敗した理由を教えて。" }
    ],
    reorder: { answer: "That is the room where we hold meetings.", ja: "あそこが会議をする部屋です。" },
    blank: { before: "Monday is the day ", after: " we review progress.", options: ["when", "where", "which", "what"], answer: "when", ja: "月曜は進捗を確認する日です。",
      explain: { answer: "when", why: "先行詞 the day（時）なので関係副詞 when。後ろは完全な文。",
        opts: { "when": "正解。時を表す先行詞 the day には when。", "where": "where は場所の先行詞用。the day には合わない。", "which": "関係代名詞 which の後ろは『不完全な文』。ここは完全文なので不可。", "what": "what は先行詞を含むため the day と重複し不可。" } } },
    writing: { prompt: "where を使って場所を説明する1文。", model: "This is the building where our headquarters are located." }
  },
  {
    id: "g_cleft", title: "強調構文（It is … that …）",
    ja: "文中の要素を強調したいとき、It is/was 〜 that … の形ではさみます（分裂文／cleft）。強調するのが人なら that の代わりに who も可。『〜こそが／〜なのは』のニュアンス。",
    examples: [
      { en: "It was John who closed the deal.", ja: "契約をまとめたのはジョンだった。" },
      { en: "It is quality that matters most.", ja: "最も重要なのは品質だ。" },
      { en: "It was yesterday that they called.", ja: "彼らが電話したのは昨日だった。" }
    ],
    reorder: { answer: "It is the client that decides.", ja: "決めるのは顧客だ。" },
    blank: { before: "It was the deadline ", after: " caused the stress.", options: ["that", "which is", "what", "when"], answer: "that", ja: "ストレスの原因は締め切りだった。",
      explain: { answer: "that", why: "強調構文 It was X that …。強調する語の後ろは that。",
        opts: { "that": "正解。It was the deadline that … の分裂文。", "which is": "is が余分。It was … that の型を崩す。", "what": "what は使えない。強調構文は that（人なら who）。", "when": "when は時の関係副詞。ここでは主語の役割なので that。" } } },
    writing: { prompt: "It was … that … で何かを強調する1文。", model: "It was the new strategy that turned the business around." }
  },
  {
    id: "g_participle", title: "分詞構文（-ing / -ed で文をつなぐ）",
    ja: "接続詞＋主語を省き、分詞（-ing/-ed）で副詞的に状況・理由・時を表します。能動なら現在分詞(-ing)、受動なら過去分詞(-ed)。主節と主語が同じときに使います。",
    examples: [
      { en: "Working late, she finished the report.", ja: "遅くまで働いて、彼女は報告書を仕上げた。" },
      { en: "Based on the data, we changed the plan.", ja: "データに基づき、計画を変えた。" },
      { en: "Having finished the call, he left.", ja: "通話を終えて、彼は出かけた。" }
    ],
    reorder: { answer: "Knowing the risk, we proceeded carefully.", ja: "リスクを知った上で、慎重に進めた。" },
    blank: { before: "", after: " on the report, she missed lunch.", options: ["Focusing", "Focused", "Focus", "To focus"], answer: "Focusing", ja: "報告書に集中していて、彼女は昼食を逃した。",
      explain: { answer: "Focusing", why: "主語(she)が『集中する』側＝能動なので現在分詞 -ing。",
        opts: { "Focusing": "正解。能動の動作は現在分詞 Focusing …。", "Focused": "過去分詞は受動（〜される）。ここは自分が集中する能動なので不可。", "Focus": "原形では文頭の副詞句にならない。", "To focus": "to不定詞では『集中するために』と意味がずれ、文意に合わない。" } } },
    writing: { prompt: "-ing の分詞構文で『〜しながら…した』を1文。", model: "Reviewing the numbers, we noticed a small error." }
  }
]);

/* ---- 増量：whose/複合関係詞・倒置・仮定法過去完了（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_whose", title: "関係代名詞 whose・複合関係詞",
    ja: "whose は『その人/物の〜』と所有を表してつなぎます（the client whose order …）。複合関係詞 whatever（〜するものは何でも）、whoever（〜する人は誰でも）、whichever（どちらでも）も覚えると表現が広がります。",
    examples: [
      { en: "The client whose order was delayed called us.", ja: "注文が遅れた顧客が電話してきた。" },
      { en: "Choose whichever option works best.", ja: "一番良い方を選んで。" },
      { en: "Whoever finishes first can leave.", ja: "先に終えた人は帰っていい。" }
    ],
    reorder: { answer: "We hired a vendor whose prices were fair.", ja: "価格が適正な業者を採用した。" },
    blank: { before: "That's the manager ", after: " team won the award.", options: ["whose", "who", "which", "that"], answer: "whose", ja: "あれがチームが受賞したマネージャーです。",
      explain: { answer: "whose", why: "後ろが『その人の team』と所有関係なので whose。",
        opts: { "whose": "正解。whose team（その人のチーム）で所有を表す。", "who": "who は主格。後ろに team という名詞が続く所有関係では whose。", "which": "which はモノ用で、かつ所有を表せない。", "that": "that は所有を表せない。" } } },
    writing: { prompt: "whose を使って所有を表す1文。", model: "I met a designer whose work I really admire." }
  },
  {
    id: "g_inversion", title: "倒置（Never / Not only / Hardly …）",
    ja: "否定の副詞（never, rarely, hardly, not only, no sooner …）を文頭に置くと、その後ろは『疑問文の語順』に倒置します（強調・フォーマル）。Never have I … / Not only did we … の形。",
    examples: [
      { en: "Never have I seen such growth.", ja: "こんな成長は見たことがない。" },
      { en: "Not only did we finish, but we saved money.", ja: "終えただけでなく、節約もできた。" },
      { en: "Hardly had we started when it failed.", ja: "始めるやいなや失敗した。" }
    ],
    reorder: { answer: "Rarely do we see such results.", ja: "こんな結果はめったに見ない。" },
    blank: { before: "Not only ", after: " the deadline, but they cut costs.", options: ["did they meet", "they met", "they did meet", "met they"], answer: "did they meet", ja: "彼らは締め切りを守っただけでなく、費用も削減した。",
      explain: { answer: "did they meet", why: "Not only を文頭に出すと倒置し、do/did + 主語 + 原形 の疑問文語順になる。",
        opts: { "did they meet": "正解。Not only did they meet … と倒置。", "they met": "倒置していない普通の語順。Not only 文頭では不可。", "they did meet": "強調の did だが語順が倒置していない。", "met they": "語順が誤り。did they meet が正しい。" } } },
    writing: { prompt: "Never have I … で経験を強調する1文。", model: "Never have I worked with such a dedicated team." }
  },
  {
    id: "g_third_conditional", title: "仮定法過去完了（If I had …, I would have …）",
    ja: "過去の事実と反対の仮定『もし〜だったら、…だっただろうに』。If + 主語 + had + 過去分詞, 主語 + would/could/might have + 過去分詞。実際には起きなかったことを表します。",
    examples: [
      { en: "If we had started earlier, we would have finished on time.", ja: "もっと早く始めていたら、間に合っただろうに。" },
      { en: "If I had known, I would have told you.", ja: "知っていたら、伝えたのに。" },
      { en: "They could have won if they had prepared.", ja: "準備していれば勝てたのに。" }
    ],
    reorder: { answer: "If we had tested it, we would have caught the bug.", ja: "試していれば、不具合に気づけたのに。" },
    blank: { before: "If they had asked, we ", after: " helped.", options: ["would have", "would", "will have", "had"], answer: "would have", ja: "頼んでくれていたら、手伝ったのに。",
      explain: { answer: "would have", why: "仮定法過去完了の帰結は would have + 過去分詞。",
        opts: { "would have": "正解。If … had asked, … would have helped（過去の反実仮想）。", "would": "would help は仮定法過去（現在の反実）。過去の話には would have。", "will have": "will は仮定法では使わない。", "had": "had helped では帰結節にならない。" } } },
    writing: { prompt: "If I had …, I would have … で過去の後悔を1文。", model: "If I had double-checked the figures, I would have avoided the mistake." }
  }
]);

/* ---- 増量：強調のdo・無生物主語・前置詞の使い分け（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_emphatic_do", title: "強調の do（本当に〜する）",
    ja: "肯定文の動詞を強調するとき、do/does/did + 原形 を使います。『本当に〜する／確かに〜した』のニュアンス。反論や念押しに便利です（I do appreciate it. / He did call.）。",
    examples: [
      { en: "I do appreciate your help.", ja: "本当に感謝しています。" },
      { en: "She does care about quality.", ja: "彼女は確かに品質を気にしている。" },
      { en: "We did send the invoice.", ja: "請求書は確かに送りました。" }
    ],
    reorder: { answer: "I do understand your concern.", ja: "ご懸念はよく分かります。" },
    blank: { before: "We ", after: " submit it on time, I promise.", options: ["did", "do", "does", "have"], answer: "did", ja: "確かに期限内に提出しました、本当です。",
      explain: { answer: "did", why: "過去の動作を強調するので did + 原形（submit）。",
        opts: { "did": "正解。did submit で『確かに提出した』と過去を強調。", "do": "do submit は現在の強調。過去の話なので did。", "does": "三単現用。主語 We には合わない。", "have": "have submit は誤り。have submitted なら別だが強調の形ではない。" } } },
    writing: { prompt: "do/did を使って強調する1文。", model: "I did read your report, and I do agree with it." }
  },
  {
    id: "g_inanimate_subject", title: "無生物主語（モノが主語）",
    ja: "英語ではモノ・事柄を主語にして、人を目的語にする表現が自然です（This will save you time. / The news made me happy.）。日本語の『〜のおかげで／〜のせいで』を1語の動詞で表せます。",
    examples: [
      { en: "This tool saves us a lot of time.", ja: "このツールのおかげで時間を大幅に節約できる。" },
      { en: "The delay cost us the deal.", ja: "遅れのせいで契約を失った。" },
      { en: "What brings you here?", ja: "どうしてここへ？" }
    ],
    reorder: { answer: "The report gave us new insights.", ja: "その報告書は新しい洞察をくれた。" },
    blank: { before: "The new system ", after: " us reduce errors.", options: ["helps", "help", "is helping us to", "helped to"], answer: "helps", ja: "新システムのおかげでミスを減らせる。",
      explain: { answer: "helps", why: "無生物主語 The system＋helps us + 原形（reduce）。三単現の s。",
        opts: { "helps": "正解。help us reduce（原形）で『〜するのに役立つ』。", "help": "主語が単数の system なので三単現の s が必要。", "is helping us to": "進行形は一般的事実に不自然。原形 reduce で十分。", "helped to": "過去形は文意（一般的事実）に合わない。" } } },
    writing: { prompt: "モノを主語にして『〜のおかげで…できる』を1文。", model: "This dashboard helps managers track progress at a glance." }
  },
  {
    id: "g_prepositions2", title: "前置詞の使い分け（in / on / at, for / since, by / until）",
    ja: "時：at（時刻）on（曜日・日）in（月・年・季節）。期間：for（長さ）since（起点）。期限：by（〜までに完了）until（〜までずっと）。場所：at（地点）on（接触面）in（内部）。",
    examples: [
      { en: "The meeting is at 3 p.m. on Monday.", ja: "会議は月曜の午後3時です。" },
      { en: "I've worked here since 2020.", ja: "2020年からここで働いています。" },
      { en: "Please reply by Friday.", ja: "金曜までに返信してください。" }
    ],
    reorder: { answer: "We have known them for ten years.", ja: "彼らとは10年来の付き合いだ。" },
    blank: { before: "I'll be in the office ", after: " 9 a.m.", options: ["at", "on", "in", "by"], answer: "at", ja: "午前9時にオフィスにいます。",
      explain: { answer: "at", why: "具体的な時刻には at（at 9 a.m.）。",
        opts: { "at": "正解。時刻は at。at 9 a.m.。", "on": "on は曜日・日付（on Monday）。", "in": "in は月・年・季節（in May）。", "by": "by は『〜までに（期限）』で意味が変わる。" } } },
    writing: { prompt: "for と since を使い分けて在籍歴を1文。", model: "I have worked here for five years, since 2020." }
  }
]);

/* ---- 増量：比較表現・間接疑問文・未来完了（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_comparatives2", title: "比較の慣用表現（as…as / the +er, the +er）",
    ja: "同等比較 as + 原級 + as（〜と同じくらい）、否定 not as…as（〜ほど…でない）。比較級の強調は much/far/a lot + 比較級。『〜すればするほど』は the +比較級, the +比較級。",
    examples: [
      { en: "This version is as fast as the old one.", ja: "この版は旧版と同じくらい速い。" },
      { en: "It's far more efficient than before.", ja: "以前よりずっと効率的だ。" },
      { en: "The sooner, the better.", ja: "早ければ早いほど良い。" }
    ],
    reorder: { answer: "The more we test, the fewer bugs we find.", ja: "試すほど不具合は減る。" },
    blank: { before: "Our new tool is ", after: " more powerful than the old one.", options: ["much", "very", "more", "so"], answer: "much", ja: "新ツールは旧ツールよりずっと強力だ。",
      explain: { answer: "much", why: "比較級 more powerful を強める語は much/far/a lot。very は比較級を強められない。",
        opts: { "much": "正解。much more powerful（ずっと強力）。", "very": "very は原級を強める（very powerful）。比較級 more には使えない。", "more": "more more となり重複で不可。", "so": "so + 原級。比較級の強調にはならない。" } } },
    writing: { prompt: "as … as を使って同等比較の1文。", model: "This plan is as effective as the previous one, but cheaper." }
  },
  {
    id: "g_indirect_question", title: "間接疑問文（語順に注意）",
    ja: "疑問文を文の一部に組み込むと、語順は『疑問文』ではなく『平叙文（主語+動詞）』になります。Do you know where it is?（×where is it）。Yes/No疑問は if/whether でつなぎます。",
    examples: [
      { en: "Could you tell me where the meeting is?", ja: "会議の場所を教えてください。" },
      { en: "I don't know when they will arrive.", ja: "いつ着くか分かりません。" },
      { en: "Do you know if he is available?", ja: "彼が空いているか分かりますか？" }
    ],
    reorder: { answer: "Could you tell me how this works?", ja: "これがどう動くか教えてください。" },
    blank: { before: "Do you know where ", after: "?", options: ["the office is", "is the office", "the office", "does the office"], answer: "the office is", ja: "オフィスがどこか分かりますか？",
      explain: { answer: "the office is", why: "間接疑問では平叙文の語順（主語 the office + 動詞 is）。",
        opts: { "the office is": "正解。where the office is（主語+動詞）の語順。", "is the office": "疑問文の語順。間接疑問では使わない。", "the office": "動詞が欠けている。", "does the office": "do を使う疑問文語順。間接疑問では不可。" } } },
    writing: { prompt: "Could you tell me … で間接疑問を1文。", model: "Could you tell me when the report will be ready?" }
  },
  {
    id: "g_future_perfect", title: "未来完了（will have + 過去分詞）",
    ja: "未来のある時点までに『完了しているだろう』ことを表します。by + 未来の時点 とよく一緒に使います（By Friday, we will have finished.）。",
    examples: [
      { en: "By next month, we will have launched.", ja: "来月までにはローンチを終えているでしょう。" },
      { en: "She will have left by then.", ja: "その頃には彼女は出発しているだろう。" },
      { en: "We will have completed testing by Friday.", ja: "金曜までにはテストを終えているはずだ。" }
    ],
    reorder: { answer: "By 2030, they will have expanded overseas.", ja: "2030年までに彼らは海外展開を終えているだろう。" },
    blank: { before: "By the end of the day, we ", after: " the issue.", options: ["will have fixed", "will fix", "have fixed", "fixed"], answer: "will have fixed", ja: "今日中にはその問題を解決し終えているでしょう。",
      explain: { answer: "will have fixed", why: "未来の時点（by the end of the day）までの完了は will have + 過去分詞。",
        opts: { "will have fixed": "正解。未来完了 will have fixed。", "will fix": "単純未来。『その時までに完了』のニュアンスが出ない。", "have fixed": "現在完了。未来の話に合わない。", "fixed": "過去形。未来の文に合わない。" } } },
    writing: { prompt: "By … , I will have … で未来完了を1文。", model: "By next quarter, we will have onboarded ten new clients." }
  }
]);

/* ---- 増量：受身的使役・used to/would・no sooner系（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_have_something_done", title: "受身的使役（have/get + 物 + 過去分詞）",
    ja: "『（自分でなく）人にやってもらう／物が〜される』ときは have/get + 物 + 過去分詞。I had my car repaired.（車を修理してもらった）。前の『使役（have + 人 + 原形）』と形が違う点に注意。",
    examples: [
      { en: "I had my laptop fixed.", ja: "ノートPCを直してもらった。" },
      { en: "We got the contract reviewed by a lawyer.", ja: "弁護士に契約書を確認してもらった。" },
      { en: "She had the report translated.", ja: "彼女は報告書を翻訳してもらった。" }
    ],
    reorder: { answer: "We had the office cleaned yesterday.", ja: "昨日オフィスを清掃してもらった。" },
    blank: { before: "I need to have these documents ", after: " by tomorrow.", options: ["signed", "sign", "to sign", "signing"], answer: "signed", ja: "明日までにこの書類に署名してもらう必要がある。",
      explain: { answer: "signed", why: "have + 物(documents) + 過去分詞(signed)。書類は『署名される』側＝受動。",
        opts: { "signed": "正解。have the documents signed（署名してもらう／される）。", "sign": "原形は『have + 人 + 原形』の使役用。ここは物なので過去分詞。", "to sign": "to不定詞はこの構文では使わない。", "signing": "-ing は不可。受動なので過去分詞 signed。" } } },
    writing: { prompt: "have + 物 + 過去分詞 で『〜してもらった』を1文。", model: "I had the presentation proofread before the meeting." }
  },
  {
    id: "g_used_to", title: "過去の習慣（used to / would）",
    ja: "used to + 原形は『昔は〜していた（今は違う）』過去の習慣・状態。would + 原形も過去の反復習慣に使えますが、状態動詞（live, like など）には would を使えず used to のみ。be used to + -ing（〜に慣れている）とは別物。",
    examples: [
      { en: "I used to work in sales.", ja: "昔は営業をしていた。" },
      { en: "We would meet every Friday.", ja: "毎週金曜に集まったものだ。" },
      { en: "She used to live in Tokyo.", ja: "彼女は昔東京に住んでいた。" }
    ],
    reorder: { answer: "We used to have weekly meetings.", ja: "以前は毎週会議をしていた。" },
    blank: { before: "There ", after: " to be a café here.", options: ["used", "use", "would", "is used"], answer: "used", ja: "昔ここにカフェがあった。",
      explain: { answer: "used", why: "過去の状態は used to。state（存在）なので would は使えない。",
        opts: { "used": "正解。There used to be …（昔は〜があった）。", "use": "used to の形。原形 use では誤り。", "would": "would は反復動作に使い、状態（be）には不可。", "is used": "is used to は『慣れている』で意味が違う。" } } },
    writing: { prompt: "used to を使って昔の習慣を1文。", model: "I used to commute two hours every day before I moved." }
  },
  {
    id: "g_no_sooner", title: "強調の否定倒置（No sooner / Hardly / Scarcely）",
    ja: "『〜するやいなや』を表すフォーマルな倒置。No sooner had S + 過去分詞 than …／Hardly had S + 過去分詞 when …。文頭の否定語で主語と助動詞が倒置します。",
    examples: [
      { en: "No sooner had we launched than demand spiked.", ja: "ローンチするやいなや需要が急増した。" },
      { en: "Hardly had the meeting started when the power went out.", ja: "会議が始まるやいなや停電した。" },
      { en: "Scarcely had he arrived when it began.", ja: "彼が着くやいなや始まった。" }
    ],
    reorder: { answer: "No sooner had I sent it than I noticed the typo.", ja: "送った途端、誤字に気づいた。" },
    blank: { before: "No sooner ", after: " the email than they replied.", options: ["had we sent", "we sent", "we had sent", "did we sent"], answer: "had we sent", ja: "メールを送るやいなや返信が来た。",
      explain: { answer: "had we sent", why: "No sooner を文頭に出すと倒置：had + 主語 + 過去分詞。",
        opts: { "had we sent": "正解。No sooner had we sent … than …。", "we sent": "倒置していない普通の語順で不可。", "we had sent": "倒置が必要（had we sent）。", "did we sent": "do は使わず had + 過去分詞。sent も原形でない。" } } },
    writing: { prompt: "No sooner had … than … で『〜するやいなや』を1文。", model: "No sooner had we fixed one bug than another appeared." }
  }
]);

/* ---- 増量：疑似分裂文・譲歩・同格のthat（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  {
    id: "g_pseudo_cleft", title: "疑似分裂文（What … is / All … is）",
    ja: "What で始めて『〜なのは…だ』と要素を強調します（What we need is time.）。All (that) … is で『〜なのは…だけ』。主語を強調して印象づけるビジネス頻出パターンです。",
    examples: [
      { en: "What we need is more data.", ja: "必要なのはもっとデータだ。" },
      { en: "What matters is the result.", ja: "重要なのは結果だ。" },
      { en: "All I want is a clear answer.", ja: "ほしいのは明確な答えだけだ。" }
    ],
    reorder: { answer: "What the team needs is clear direction.", ja: "チームに必要なのは明確な方向性だ。" },
    blank: { before: "", after: " we need is a better process.", options: ["What", "That", "Which", "It"], answer: "What", ja: "必要なのはより良い工程だ。",
      explain: { answer: "What", why: "疑似分裂文は What で始めて主語節を作る（What we need is …）。",
        opts: { "What": "正解。What we need is …（必要なのは〜だ）。", "That": "That we need … では強調構文にならない。", "Which": "Which は先行詞が必要で文頭の主語節にならない。", "It": "It … は別の強調構文（It is … that）で形が違う。" } } },
    writing: { prompt: "What … is … で要点を強調する1文。", model: "What really drives growth is customer trust." }
  },
  {
    id: "g_concession", title: "譲歩（however / no matter how）",
    ja: "『どんなに〜でも』は however + 形容詞/副詞 + 主語 + 動詞、または no matter how …。whatever/whoever/wherever（何が/誰が/どこで〜しようとも）も同じ譲歩の働きをします。",
    examples: [
      { en: "However hard it is, we'll finish.", ja: "どんなに大変でも、やり遂げる。" },
      { en: "No matter what happens, stay calm.", ja: "何が起きても落ち着いて。" },
      { en: "Whatever you decide, I'll support it.", ja: "何を決めても支持します。" }
    ],
    reorder: { answer: "No matter how busy we are, safety comes first.", ja: "どんなに忙しくても安全が最優先だ。" },
    blank: { before: "", after: " hard you try, some things take time.", options: ["However", "Whatever", "Although", "Despite"], answer: "However", ja: "どんなに頑張っても、時間がかかることもある。",
      explain: { answer: "However", why: "However + 形容詞/副詞（hard）+ 主語 + 動詞 で『どんなに〜でも』。",
        opts: { "However": "正解。However hard you try（どんなに頑張っても）。", "Whatever": "Whatever は名詞節用（whatever you do）。hard を直接修飾しない。", "Although": "Although は『〜だけれど』で後ろは完全文。hard を取れない。", "Despite": "Despite は前置詞で後ろは名詞。文を取れない。" } } },
    writing: { prompt: "No matter … で譲歩を1文。", model: "No matter what challenges we face, we keep improving." }
  },
  {
    id: "g_appositive_that", title: "同格の that（the fact that …）",
    ja: "名詞の内容を that 節で説明する『同格』。the fact that …（〜という事実）、the idea that …（〜という考え）、the news that …（〜という知らせ）。関係代名詞の that と違い、後ろは『完全な文』です。",
    examples: [
      { en: "The fact that we won surprised everyone.", ja: "勝ったという事実が皆を驚かせた。" },
      { en: "The idea that it's free is appealing.", ja: "無料だという点が魅力的だ。" },
      { en: "I like the idea that anyone can join.", ja: "誰でも参加できるという考えが好きだ。" }
    ],
    reorder: { answer: "The news that sales doubled excited the team.", ja: "売上が倍になったという知らせがチームを沸かせた。" },
    blank: { before: "The fact ", after: " they replied fast impressed us.", options: ["that", "which", "what", "of which"], answer: "that", ja: "返信が速かったという事実に感心した。",
      explain: { answer: "that", why: "同格の that。the fact の内容を完全文で説明する。",
        opts: { "that": "正解。the fact that they replied …（〜という事実）。", "which": "which は関係代名詞で後ろが不完全文。ここは完全文なので不可。", "what": "what は先行詞を含むため the fact と重複し不可。", "of which": "of which は所有・部分関係で同格にならない。" } } },
    writing: { prompt: "the fact that … を使って1文。", model: "The fact that the client renewed shows our service works." }
  }
]);

/* ---- 増量（大）：文法12レッスン（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  { id: "g_passive_basic", title: "受動態の基本（be + 過去分詞）",
    ja: "動作の受け手を主語にするのが受動態。be動詞＋過去分詞で作り、行為者は by … で示します（必要なときだけ）。誰がしたか不明・重要でないときに便利。",
    examples: [ { en: "The report was written by the team.", ja: "報告書はチームによって書かれた。" }, { en: "Lunch is served at noon.", ja: "昼食は正午に出される。" }, { en: "The issue has been resolved.", ja: "問題は解決された。" } ],
    reorder: { answer: "The package was delivered this morning.", ja: "荷物は今朝配達された。" },
    blank: { before: "The invoice ", after: " yesterday.", options: ["was sent", "sent", "is sending", "has sent"], answer: "was sent", ja: "請求書は昨日送られた。",
      explain: { answer: "was sent", why: "受け手(invoice)が主語＋過去の話なので was + 過去分詞。",
        opts: { "was sent": "正解。受動態の過去 was sent。", "sent": "能動の過去。主語が『送られる』側なので受動態に。", "is sending": "能動の進行形。受け身でない。", "has sent": "能動の現在完了。受け身は has been sent。" } } },
    writing: { prompt: "受動態で『〜された』を1文。", model: "The new policy was announced last week." } },
  { id: "g_infinitive_uses", title: "不定詞の用法（目的・too…to・enough to）",
    ja: "to + 動詞は『〜するために』(目的)、too + 形容詞 + to(〜すぎて…できない)、形容詞 + enough to(…するのに十分〜)など多用途。",
    examples: [ { en: "I called to confirm the time.", ja: "時間を確認するために電話した。" }, { en: "It's too late to change it.", ja: "変えるには遅すぎる。" }, { en: "She is experienced enough to lead.", ja: "彼女は率いるのに十分な経験がある。" } ],
    reorder: { answer: "We met to discuss the budget.", ja: "予算を話し合うために集まった。" },
    blank: { before: "The box is too heavy ", after: " alone.", options: ["to carry", "carrying", "carry", "for carry"], answer: "to carry", ja: "その箱は一人で運ぶには重すぎる。",
      explain: { answer: "to carry", why: "too + 形容詞 + to + 原形（〜すぎて…できない）。",
        opts: { "to carry": "正解。too heavy to carry。", "carrying": "-ing は不可。to + 原形。", "carry": "to が必要。", "for carry": "for + 原形は不可。" } } },
    writing: { prompt: "目的の不定詞で1文。", model: "I'm writing to follow up on our meeting." } },
  { id: "g_verb_meaning_change", title: "動名詞と不定詞で意味が変わる動詞",
    ja: "remember/forget/stop/try は後ろが -ing か to で意味が変わる。stop doing(〜をやめる)/stop to do(〜するために立ち止まる)。remember to do(これから〜するのを覚えている)/remember doing(〜したのを覚えている)。",
    examples: [ { en: "Remember to send it.", ja: "送るのを忘れずに（これから）。" }, { en: "I remember sending it.", ja: "送ったのを覚えている（過去）。" }, { en: "She stopped to take a call.", ja: "電話に出るため立ち止まった。" } ],
    reorder: { answer: "Please remember to lock the door.", ja: "ドアの施錠を忘れずに。" },
    blank: { before: "He stopped ", after: " emails and focused on the call.", options: ["checking", "to check", "check", "checked"], answer: "checking", ja: "彼はメール確認をやめて電話に集中した。",
      explain: { answer: "checking", why: "stop doing で『〜するのをやめる』。stop to do は『〜のために立ち止まる』で意味が違う。",
        opts: { "checking": "正解。stop checking（確認をやめる）。", "to check": "stop to check は『確認するために立ち止まる』で文意と逆。", "check": "形が不適切。", "checked": "過去形は不可。" } } },
    writing: { prompt: "remember doing で過去の記憶を1文。", model: "I remember meeting her at the conference last year." } },
  { id: "g_relative_nondefining", title: "関係詞の制限用法・非制限用法（, which）",
    ja: "コンマなしは『限定（どの〜か特定）』、コンマつきは『補足説明（非制限）』。非制限では that は使えず which/who を使います。",
    examples: [ { en: "The client who called is waiting.", ja: "電話してきた顧客が待っている（限定）。" }, { en: "Our CEO, who joined in 2020, will speak.", ja: "2020年に入社した当社CEOが話す（補足）。" }, { en: "We use Slack, which works well.", ja: "Slackを使っていて、それは快適だ。" } ],
    reorder: { answer: "The report, which was long, took hours.", ja: "その報告書は長くて、数時間かかった。" },
    blank: { before: "Our office, ", after: " is downtown, has great views.", options: ["which", "that", "where", "what"], answer: "which", ja: "当社のオフィスは中心街にあり、眺めが良い。",
      explain: { answer: "which", why: "コンマつき非制限用法では that 不可。モノなので which。",
        opts: { "which": "正解。非制限用法 , which …。", "that": "非制限（コンマ）では that は使えない。", "where": "後ろが is downtown で主語が抜けており場所の関係副詞にならない。", "what": "先行詞を含むため重複で不可。" } } },
    writing: { prompt: ", which を使って補足説明を1文。", model: "We adopted the new tool, which saved us hours each week." } },
  { id: "g_contrast_while", title: "対比の while / whereas",
    ja: "while と whereas は『〜である一方で』と2つを対比します（フォーマルは whereas）。while には『〜する間に』の時の意味もあります。",
    examples: [ { en: "Sales rose, while costs fell.", ja: "売上は伸び、一方で費用は下がった。" }, { en: "He prefers email, whereas I prefer calls.", ja: "彼はメール派で、私は電話派だ。" }, { en: "While I agree, I have concerns.", ja: "同意はするが、懸念もある。" } ],
    reorder: { answer: "Our team is small, whereas theirs is large.", ja: "うちは小規模だが、彼らは大規模だ。" },
    blank: { before: "The east region grew, ", after: " the west declined.", options: ["whereas", "because", "so", "unless"], answer: "whereas", ja: "東部は成長したが、西部は落ち込んだ。",
      explain: { answer: "whereas", why: "2つを対比しているので whereas（〜の一方で）。",
        opts: { "whereas": "正解。対比を表す whereas。", "because": "理由ではない。", "so": "結果ではない。", "unless": "条件（〜でない限り）で文意に合わない。" } } },
    writing: { prompt: "whereas で2つを対比する1文。", model: "Our prices are higher, whereas our quality is far better." } },
  { id: "g_conditional_unless", title: "条件の unless / as long as / provided",
    ja: "unless = if … not（〜でない限り）。as long as / provided (that) = 〜という条件で。条件節は未来でも現在形を使います。",
    examples: [ { en: "Call me unless it's resolved.", ja: "解決しない限り電話して。" }, { en: "You can go as long as you finish first.", ja: "先に終えれば行っていい。" }, { en: "Provided it's approved, we'll start.", ja: "承認されれば始める。" } ],
    reorder: { answer: "We will ship today as long as it is ready.", ja: "準備できていれば今日発送する。" },
    blank: { before: "We can't proceed ", after: " the client agrees.", options: ["unless", "if", "as", "while"], answer: "unless", ja: "顧客が同意しない限り進められない。",
      explain: { answer: "unless", why: "『〜しない限り』＝ unless（= if … not）。",
        opts: { "unless": "正解。unless the client agrees（同意しない限り）。", "if": "if the client agrees では意味が逆（同意すれば）。", "as": "理由・様態で文意に合わない。", "while": "対比・時で条件にならない。" } } },
    writing: { prompt: "as long as で条件を1文。", model: "I'll support the plan as long as the budget is realistic." } },
  { id: "g_despite", title: "譲歩の despite / in spite of / although",
    ja: "despite / in spite of は前置詞句で後ろは『名詞・動名詞』。although / though は接続詞で後ろは『主語＋動詞』。混同に注意（despite the delay / although it was delayed）。",
    examples: [ { en: "Despite the delay, we finished.", ja: "遅れにもかかわらず終えた。" }, { en: "Although it rained, we went.", ja: "雨だったが行った。" }, { en: "In spite of the cost, it's worth it.", ja: "費用はかかるが価値がある。" } ],
    reorder: { answer: "Despite the risks, they invested.", ja: "リスクにもかかわらず投資した。" },
    blank: { before: "", after: " the high cost, we bought it.", options: ["Despite", "Although", "Even", "Because"], answer: "Despite", ja: "高コストにもかかわらず購入した。",
      explain: { answer: "Despite", why: "後ろが名詞句(the high cost)なので前置詞 Despite。",
        opts: { "Despite": "正解。Despite + 名詞句。", "Although": "Although の後ろは主語＋動詞（文）。名詞句は取れない。", "Even": "Even 単独では接続できない（even though なら可）。", "Because": "理由で文意に合わない。" } } },
    writing: { prompt: "despite + 名詞 で譲歩を1文。", model: "Despite a tight deadline, the team delivered on time." } },
  { id: "g_modal_perfect", title: "助動詞 + have + 過去分詞（過去の推量）",
    ja: "must have done(〜したに違いない)、can't have done(〜したはずがない)、might/could have done(〜したかもしれない)、should have done(〜すべきだった＝後悔)。過去の推量・後悔を表します。",
    examples: [ { en: "He must have forgotten.", ja: "彼は忘れたに違いない。" }, { en: "They can't have finished already.", ja: "もう終えたはずがない。" }, { en: "I should have double-checked.", ja: "再確認すべきだった。" } ],
    reorder: { answer: "She might have missed the email.", ja: "彼女はメールを見落としたのかもしれない。" },
    blank: { before: "The light is on; someone ", after: " be inside.", options: ["must", "can't", "should", "would"], answer: "must", ja: "電気がついている、中に誰かいるに違いない。",
      explain: { answer: "must", why: "強い確信の推量は must（〜に違いない）。",
        opts: { "must": "正解。must be inside（いるに違いない）。", "can't": "『いるはずがない』で証拠(電気)と矛盾。", "should": "義務・推奨で推量の確信にならない。", "would": "仮定・習慣で文意に合わない。" } } },
    writing: { prompt: "must have + 過去分詞 で過去の推量を1文。", model: "The server must have crashed during the night." } },
  { id: "g_not_until", title: "強調構文の応用（It was not until … that …）",
    ja: "『〜して初めて…した』を強調する型。It was not until + 時/出来事 + that + 主語 + 動詞。",
    examples: [ { en: "It was not until Friday that we got a reply.", ja: "金曜になって初めて返信が来た。" }, { en: "It wasn't until then that I understood.", ja: "その時になって初めて理解した。" }, { en: "It was not until 2020 that they expanded.", ja: "2020年になって初めて拡大した。" } ],
    reorder: { answer: "It was not until later that we noticed the error.", ja: "後になって初めてミスに気づいた。" },
    blank: { before: "It was not until the demo ", after: " they were convinced.", options: ["that", "when", "then", "which"], answer: "that", ja: "デモを見て初めて彼らは納得した。",
      explain: { answer: "that", why: "It was not until X that … の固定形。",
        opts: { "that": "正解。not until … that …。", "when": "この強調構文では that を使う。", "then": "副詞で接続できない。", "which": "関係代名詞で先行詞が必要。" } } },
    writing: { prompt: "It was not until … that … で1文。", model: "It was not until the audit that we found the discrepancy." } },
  { id: "g_postmodifying", title: "分詞の後置修飾（standing / written）",
    ja: "名詞の後ろに分詞句を置いて修飾します。能動・進行は現在分詞(the man standing there)、受動・完了は過去分詞(the report written by him)。関係代名詞＋be の省略形です。",
    examples: [ { en: "The man speaking now is our CEO.", ja: "今話している男性が当社CEOだ。" }, { en: "The email sent yesterday was urgent.", ja: "昨日送られたメールは緊急だった。" }, { en: "Anyone interested can join.", ja: "興味のある人は参加できる。" } ],
    reorder: { answer: "The documents attached are confidential.", ja: "添付された書類は機密だ。" },
    blank: { before: "The report ", after: " by the auditor is ready.", options: ["prepared", "preparing", "prepare", "prepares"], answer: "prepared", ja: "監査人が作成した報告書ができている。",
      explain: { answer: "prepared", why: "report は『作成される』側＝受動なので過去分詞 prepared。",
        opts: { "prepared": "正解。the report prepared by …（〜によって作成された）。", "preparing": "現在分詞は能動。報告書が『作成する』のは不自然。", "prepare": "原形は修飾できない。", "prepares": "三単現で修飾にならない。" } } },
    writing: { prompt: "過去分詞の後置修飾で1文。", model: "The proposal submitted last week was approved." } },
  { id: "g_superlative", title: "最上級の応用（one of the +最上級 / ever）",
    ja: "one of the + 最上級 + 複数名詞（最も〜なものの一つ）、最上級 + 現在完了 + ever（今まで〜した中で最も）。比較対象の範囲は in/of で示します。",
    examples: [ { en: "It's one of the best tools available.", ja: "入手できる最良のツールの一つだ。" }, { en: "This is the hardest project we've ever done.", ja: "これは今までで最難関の案件だ。" }, { en: "She's the most reliable person on the team.", ja: "彼女はチームで最も頼れる人だ。" } ],
    reorder: { answer: "This is one of the most important decisions.", ja: "これは最も重要な決定の一つだ。" },
    blank: { before: "It's the best result we ", after: " achieved.", options: ["have ever", "ever", "had ever been", "are ever"], answer: "have ever", ja: "今まで達成した中で最高の結果だ。",
      explain: { answer: "have ever", why: "最上級＋ have ever + 過去分詞（今まで〜した中で最も）。",
        opts: { "have ever": "正解。the best … we have ever achieved。", "ever": "完了形 have が必要。", "had ever been": "受動で文意に合わない。", "are ever": "形が不適切。" } } },
    writing: { prompt: "one of the +最上級 で1文。", model: "This is one of the most promising markets in the region." } },
  { id: "g_there_is", title: "存在の there is / there are",
    ja: "『〜がある／いる』は There is + 単数 / There are + 複数。続く名詞の数に be動詞を合わせます。新情報の存在を導入するときに使います。",
    examples: [ { en: "There is a problem with the file.", ja: "ファイルに問題がある。" }, { en: "There are several options.", ja: "選択肢がいくつかある。" }, { en: "There has been a change.", ja: "変更があった。" } ],
    reorder: { answer: "There are two issues we should discuss.", ja: "話し合うべき問題が2つある。" },
    blank: { before: "There ", after: " three items on the agenda.", options: ["are", "is", "has", "have"], answer: "are", ja: "議題に3つの項目がある。",
      explain: { answer: "are", why: "後ろが複数(three items)なので There are。",
        opts: { "are": "正解。複数名詞には There are。", "is": "単数用。three items は複数。", "has": "There has は完了形用（has been）。", "have": "There have も完了形用で、ここは現在の存在。" } } },
    writing: { prompt: "There are … で存在を1文。", model: "There are a few risks we need to address first." } }
]);

/* ---- 増量（大）：文法12レッスン（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  { id:"g_reflexive", title:"再帰代名詞（myself / yourself）",
    ja:"動作の対象が主語自身のとき再帰代名詞（myself など）を使います。enjoy yourself（楽しむ）など定型も多い。強調用法『自分で』もあります（I did it myself）。",
    examples:[{en:"I taught myself to code.",ja:"独学でコードを学んだ。"},{en:"Please help yourself.",ja:"ご自由にどうぞ。"},{en:"She finished it herself.",ja:"彼女は自分で仕上げた。"}],
    reorder:{answer:"We should remind ourselves of the goal.",ja:"目標を自分たちで思い出すべきだ。"},
    blank:{before:"He hurt ", after:" while moving boxes.", options:["himself","him","his","he"], answer:"himself", ja:"彼は箱を運んでいて自分をけがした。",
      explain:{answer:"himself", why:"動作の対象が主語自身なので再帰代名詞 himself。",
        opts:{"himself":"正解。主語 He＝対象なので himself。","him":"目的格 him は『他人』を指す。自分自身には再帰代名詞。","his":"所有格で目的語にならない。","he":"主格は目的語に置けない。"}}},
    writing:{prompt:"enjoy yourself などの再帰表現で1文。", model:"Make yourself at home while you wait."} },
  { id:"g_each_every", title:"each / every / all / both",
    ja:"each（個々に・2つ以上）、every（全体を一つずつ・3つ以上）はともに単数扱い。all は複数（または不可算）。both は2つ。each of / all of + 複数名詞 の形に注意。",
    examples:[{en:"Each member has a task.",ja:"各メンバーに役割がある。"},{en:"Every seat was taken.",ja:"全席が埋まっていた。"},{en:"Both options work.",ja:"どちらの案も使える。"}],
    reorder:{answer:"All the reports are ready.",ja:"すべての報告書ができている。"},
    blank:{before:"", after:" employee has an ID card.", options:["Every","All","Both","Many of"], answer:"Every", ja:"全従業員がIDカードを持つ。",
      explain:{answer:"Every", why:"単数名詞 employee の前で『一人ずつ全員』は every（単数扱い）。",
        opts:{"Every":"正解。every + 単数名詞 + 単数動詞。","All":"all の後は複数名詞（all employees）。","Both":"both は2つ限定。","Many of":"many of + the + 複数名詞 となり形が合わない。"}}},
    writing:{prompt:"each of を使って1文。", model:"Each of the proposals has its own strengths."} },
  { id:"g_question_tags", title:"付加疑問（…, isn't it?）",
    ja:"文末に短い疑問を付けて確認します。肯定文→否定の付加疑問、否定文→肯定の付加疑問。主語は代名詞、助動詞は本文に合わせます（You're coming, aren't you?）。",
    examples:[{en:"You're joining, aren't you?",ja:"参加するよね？"},{en:"It doesn't work, does it?",ja:"動かないよね？"},{en:"She can help, can't she?",ja:"彼女は手伝えるよね？"}],
    reorder:{answer:"They sent it, didn't they?",ja:"彼らは送ったよね？"},
    blank:{before:"You finished the report, ", after:"?", options:["didn't you","did you","weren't you","haven't you"], answer:"didn't you", ja:"報告書を終えたよね？",
      explain:{answer:"didn't you", why:"肯定の過去形 finished → 否定の付加疑問 didn't you。",
        opts:{"didn't you":"正解。肯定文＋否定タグ、過去なので didn't you。","did you":"肯定文には否定タグを付ける。","weren't you":"be動詞ではないので不可。","haven't you":"完了形ではないので have は使わない。"}}},
    writing:{prompt:"付加疑問で確認する1文。", model:"We're still on schedule, aren't we?"} },
  { id:"g_so_neither", title:"同意の倒置（So do I / Neither do I）",
    ja:"『私も〜だ』は So + 助動詞 + 主語（肯定）、『私も〜でない』は Neither/Nor + 助動詞 + 主語（否定）。助動詞は相手の文に合わせます。",
    examples:[{en:"I'm tired. — So am I.",ja:"疲れた。—私も。"},{en:"I don't agree. — Neither do I.",ja:"賛成しない。—私も。"},{en:"She can go. — So can I.",ja:"彼女は行ける。—私も。"}],
    reorder:{answer:"They liked it and so did we.",ja:"彼らは気に入り、私たちも。"},
    blank:{before:"I haven't seen it. — ", after:" have I.", options:["Neither","So","Either","Nor do"], answer:"Neither", ja:"見ていない。—私も。",
      explain:{answer:"Neither", why:"否定への同意は Neither + 助動詞 + 主語（Neither have I）。",
        opts:{"Neither":"正解。否定同意 Neither have I。","So":"So は肯定同意用。","Either":"Either はこの倒置形を作れない。","Nor do":"完了形なので do でなく have。"}}},
    writing:{prompt:"So do I / Neither do I で同意を1文。", model:"\"I work remotely.\" \"So do I.\""} },
  { id:"g_would_rather", title:"would rather / had better",
    ja:"would rather + 原形（〜したい・むしろ）、had better + 原形（〜したほうがよい・警告）。否定は would rather not / had better not。",
    examples:[{en:"I'd rather wait.",ja:"むしろ待ちたい。"},{en:"You'd better leave now.",ja:"もう出たほうがいい。"},{en:"I'd rather not say.",ja:"言いたくない。"}],
    reorder:{answer:"We had better confirm the time.",ja:"時間を確認したほうがいい。"},
    blank:{before:"You'd better ", after:" before it rains.", options:["leave","to leave","leaving","left"], answer:"leave", ja:"雨が降る前に出たほうがいい。",
      explain:{answer:"leave", why:"had better + 動詞の原形。",
        opts:{"leave":"正解。had better + 原形。","to leave":"to は付けない。","leaving":"-ing は不可。","left":"過去形は不可。"}}},
    writing:{prompt:"would rather で好みを1文。", model:"I'd rather discuss this in person than over email."} },
  { id:"g_its_time", title:"It's time + 過去形（仮定法）",
    ja:"It's (about/high) time + 主語 + 過去形 で『もう〜してもよい頃だ（まだしていない）』。過去形でも意味は現在〜未来の仮定的ニュアンスです。",
    examples:[{en:"It's time we left.",ja:"もう出る時間だ。"},{en:"It's high time they decided.",ja:"そろそろ決めるべき頃だ。"},{en:"It's about time you took a break.",ja:"そろそろ休んでいい頃だ。"}],
    reorder:{answer:"It's time we updated the system.",ja:"そろそろシステムを更新する頃だ。"},
    blank:{before:"It's high time we ", after:" this issue.", options:["addressed","address","will address","addressing"], answer:"addressed", ja:"そろそろこの問題に対処すべき頃だ。",
      explain:{answer:"addressed", why:"It's time + 主語 + 過去形（仮定法）。",
        opts:{"addressed":"正解。It's high time we addressed …。","address":"原形は不可。過去形を使う。","will address":"未来形は使わない。","addressing":"-ing は不可。"}}},
    writing:{prompt:"It's time + 過去形 で1文。", model:"It's time we reviewed our pricing strategy."} },
  { id:"g_wish", title:"wish の用法（I wish I were / had）",
    ja:"現在の願望（現実と逆）は wish + 過去形（I wish I were …）、過去への後悔は wish + 過去完了（I wish I had …）。願望の were は I/he でも were が原則。",
    examples:[{en:"I wish I were taller.",ja:"背が高ければなあ。"},{en:"I wish I had known earlier.",ja:"もっと早く知っていればなあ。"},{en:"She wishes she could join.",ja:"参加できればと彼女は思っている。"}],
    reorder:{answer:"I wish we had more time.",ja:"もっと時間があればなあ。"},
    blank:{before:"I wish I ", after:" checked it before sending.", options:["had","have","would","did"], answer:"had", ja:"送る前に確認していればよかった。",
      explain:{answer:"had", why:"過去への後悔は wish + 過去完了（had + 過去分詞）。",
        opts:{"had":"正解。I wish I had checked（〜していればよかった）。","have":"現在完了は wish の後で使わない。","would":"I wish I would は不自然。","did":"過去形は現在の願望用で、過去の後悔には過去完了。"}}},
    writing:{prompt:"I wish + 過去完了 で過去の後悔を1文。", model:"I wish I had double-checked the contract before signing."} },
  { id:"g_if_omission", title:"if の省略による倒置（Had I known / Were I）",
    ja:"フォーマルな文では if を省き、助動詞を前に出して倒置できます。If I had known → Had I known、If I were → Were I、If it should → Should it。",
    examples:[{en:"Had I known, I would have called.",ja:"知っていたら電話したのに。"},{en:"Were I in charge, I'd change it.",ja:"私が担当なら変える。"},{en:"Should you need help, let me know.",ja:"助けが要れば知らせて。"}],
    reorder:{answer:"Had we started earlier, we would have finished.",ja:"早く始めていれば終わっていた。"},
    blank:{before:"", after:" I known, I would have prepared.", options:["Had","If had","Have","Did"], answer:"Had", ja:"知っていたら準備したのに。",
      explain:{answer:"Had", why:"If I had known の if 省略倒置＝ Had I known。",
        opts:{"Had":"正解。Had I known …（倒置）。","If had":"if と倒置は併用しない。","Have":"現在完了になり意味が変わる。","Did":"do は使わず had + 過去分詞。"}}},
    writing:{prompt:"Should you … で丁寧な条件を1文。", model:"Should you have any questions, feel free to reach out."} },
  { id:"g_either_neither", title:"either … or / neither … nor",
    ja:"either A or B（AかBのどちらか）、neither A nor B（AもBも〜ない）。動詞は近い方の名詞に合わせます（Neither he nor they were …）。",
    examples:[{en:"Either Monday or Tuesday works.",ja:"月曜か火曜なら大丈夫。"},{en:"Neither option is ideal.",ja:"どちらの案も理想的でない。"},{en:"Neither he nor I was aware.",ja:"彼も私も気づかなかった。"}],
    reorder:{answer:"We can either call or email them.",ja:"電話かメールで連絡できる。"},
    blank:{before:"Neither the manager ", after:" the staff were informed.", options:["nor","or","and","not"], answer:"nor", ja:"管理職もスタッフも知らされていなかった。",
      explain:{answer:"nor", why:"neither とペアになるのは nor。",
        opts:{"nor":"正解。neither A nor B。","or":"either A or B で使う。neither には nor。","and":"並列で否定の対にならない。","not":"接続詞にならない。"}}},
    writing:{prompt:"either … or で選択肢を1文。", model:"You can either join in person or attend online."} },
  { id:"g_future_continuous", title:"未来進行形（will be + -ing）",
    ja:"未来のある時点で『進行中だろう』動作、または既定の予定を表します。This time tomorrow, I'll be flying. 丁寧に予定を尋ねる Will you be using …? にも使えます。",
    examples:[{en:"I'll be working late tonight.",ja:"今夜は遅くまで働いている。"},{en:"This time next week, we'll be presenting.",ja:"来週の今頃は発表しているだろう。"},{en:"Will you be joining the call?",ja:"その通話に参加されますか？"}],
    reorder:{answer:"We will be reviewing applications all week.",ja:"今週はずっと応募書類を審査している。"},
    blank:{before:"At 3 p.m. tomorrow, I ", after:" with a client.", options:["will be meeting","will met","am meeting yesterday","met"], answer:"will be meeting", ja:"明日午後3時には顧客と面談中だ。",
      explain:{answer:"will be meeting", why:"未来の時点で進行中の動作は will be + -ing。",
        opts:{"will be meeting":"正解。未来進行形。","will met":"形が誤り。","am meeting yesterday":"yesterday と現在形で矛盾。","met":"過去形で未来に合わない。"}}},
    writing:{prompt:"未来進行形で予定を1文。", model:"I'll be traveling next week, so let's meet the week after."} },
  { id:"g_agreement", title:"主語と動詞の一致（a number of / each など）",
    ja:"each / every / either / neither / a number と続く語は単数扱い、a number of + 複数名詞は複数扱い。the number of は単数。集合名詞は文脈で単複が変わります。",
    examples:[{en:"Each of the files is large.",ja:"各ファイルが大きい。"},{en:"A number of issues remain.",ja:"いくつかの問題が残る。"},{en:"The number of users is growing.",ja:"利用者数が増えている。"}],
    reorder:{answer:"Neither of the plans was approved.",ja:"どちらの案も承認されなかった。"},
    blank:{before:"Each of the candidates ", after:" qualified.", options:["is","are","were","have"], answer:"is", ja:"候補者の各人が有資格だ。",
      explain:{answer:"is", why:"each of + 複数名詞 でも動詞は単数（each が単数扱い）。",
        opts:{"is":"正解。Each of … is（単数）。","are":"each は単数扱いなので are は不可。","were":"複数・過去で一致しない。","have":"be動詞が必要な文脈。"}}},
    writing:{prompt:"a number of を使って1文。", model:"A number of clients have requested the new feature."} },
  { id:"g_emphatic_self", title:"強調の再帰（…myself で『自分で』）",
    ja:"再帰代名詞を文末や主語直後に置くと『他でもなく自分が／自身で』と強調します（I'll do it myself / The CEO herself attended）。",
    examples:[{en:"I'll handle it myself.",ja:"自分で対処します。"},{en:"The director himself approved it.",ja:"部長自らが承認した。"},{en:"They built it themselves.",ja:"彼らは自分たちで作った。"}],
    reorder:{answer:"She presented the results herself.",ja:"彼女自身が結果を発表した。"},
    blank:{before:"The CEO ", after:" answered the question.", options:["himself","his","him","he self"], answer:"himself", ja:"CEO自らがその質問に答えた。",
      explain:{answer:"himself", why:"主語を強調する再帰代名詞 himself（〜自身が）。",
        opts:{"himself":"正解。The CEO himself（CEO自らが）。","his":"所有格は強調にならない。","him":"目的格で主語強調にならない。","he self":"そんな形はない。"}}},
    writing:{prompt:"…myself で『自分で』を強調する1文。", model:"I reviewed every line of the contract myself."} }
]);

/* ---- 増量（大）：文法15レッスン（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  { id:"g_verb_prep", title:"動詞＋前置詞（depend on / consist of）",
    ja:"特定の前置詞と結びつく動詞。depend on, consist of, result in, rely on, apply for, deal with, refer to, account for などは固定の組み合わせで覚えます。",
    examples:[{en:"It depends on the budget.",ja:"予算次第だ。"},{en:"The team consists of five people.",ja:"チームは5人から成る。"},{en:"This resulted in a delay.",ja:"これが遅延を招いた。"}],
    reorder:{answer:"We need to deal with this issue.",ja:"この問題に対処する必要がある。"},
    blank:{before:"The plan resulted ", after:" higher costs.", options:["in","on","to","for"], answer:"in", ja:"その計画は高コストを招いた。",
      explain:{answer:"in", why:"result in（〜という結果になる）が固定の組み合わせ。",
        opts:{"in":"正解。result in + 結果。","on":"depend on などに使う前置詞。","to":"result to は誤り。","for":"apply for などに使う。"}}},
    writing:{prompt:"depend on を使って1文。", model:"Our timeline depends on the client's feedback."} },
  { id:"g_adj_prep", title:"形容詞＋前置詞（interested in / good at）",
    ja:"形容詞と結びつく前置詞も決まっています。interested in, good at, afraid of, responsible for, similar to, different from, capable of, aware of など。",
    examples:[{en:"She's good at negotiation.",ja:"彼女は交渉が得意だ。"},{en:"I'm interested in the role.",ja:"その職に興味がある。"},{en:"He's responsible for sales.",ja:"彼は営業の責任者だ。"}],
    reorder:{answer:"We are aware of the risks.",ja:"リスクは承知している。"},
    blank:{before:"This is similar ", after:" the old version.", options:["to","with","as","than"], answer:"to", ja:"これは旧版に似ている。",
      explain:{answer:"to", why:"similar to（〜に似ている）が固定。",
        opts:{"to":"正解。similar to。","with":"similar with は誤り。","as":"the same as には as を使うが similar は to。","than":"比較級の than。similar には使わない。"}}},
    writing:{prompt:"good at か interested in で1文。", model:"I'm interested in learning more about your process."} },
  { id:"g_gerund_subject", title:"動名詞の主語（-ing として始める）",
    ja:"動名詞は名詞のように主語になれます（Reading helps you learn.）。主語が動名詞のとき動詞は単数扱いです。",
    examples:[{en:"Planning ahead saves time.",ja:"前もって計画すると時間を節約できる。"},{en:"Learning English takes practice.",ja:"英語学習には練習が要る。"},{en:"Skipping steps causes errors.",ja:"手順を飛ばすとミスが出る。"}],
    reorder:{answer:"Working together improves results.",ja:"協力すると成果が上がる。"},
    blank:{before:"", after:" feedback early helps a lot.", options:["Getting","Get","To getting","Got"], answer:"Getting", ja:"早めに意見をもらうと大いに助かる。",
      explain:{answer:"Getting", why:"主語には動名詞 -ing。Getting feedback が主語。",
        opts:{"Getting":"正解。動名詞主語 Getting …。","Get":"原形は主語にならない。","To getting":"to + -ing のこの形は不可。","Got":"過去形は主語にならない。"}}},
    writing:{prompt:"動名詞を主語にして1文。", model:"Reviewing the data carefully prevents mistakes."} },
  { id:"g_so_that", title:"目的・結果（so that / so…that / such…that）",
    ja:"so that + 主語 + can/will …（〜するように：目的）。so + 形容詞/副詞 + that …（とても〜なので…：結果）。such + (a) + 名詞 + that …。",
    examples:[{en:"I left early so that I could catch the train.",ja:"電車に間に合うよう早く出た。"},{en:"It was so hot that we stopped.",ja:"暑すぎて中断した。"},{en:"It was such a success that they expanded.",ja:"大成功で拡大した。"}],
    reorder:{answer:"We simplified it so that everyone could use it.",ja:"皆が使えるよう簡素化した。"},
    blank:{before:"He spoke slowly ", after:" everyone could follow.", options:["so that","so","such that","in order"], answer:"so that", ja:"皆が理解できるよう彼はゆっくり話した。",
      explain:{answer:"so that", why:"目的『〜するように』は so that + 主語 + can/could。",
        opts:{"so that":"正解。so that everyone could follow。","so":"so + 形容詞 + that の結果用。","such that":"形式ばった用法で文意に合わない。","in order":"in order to + 原形 か in order that の形にする。"}}},
    writing:{prompt:"so that で目的を1文。", model:"I'll send the agenda early so that you can prepare."} },
  { id:"g_in_order_to", title:"目的の表現（in order to / so as to）",
    ja:"in order to + 原形、so as to + 原形 はどちらも『〜するために』。否定は in order not to / so as not to。to不定詞だけでも目的を表せます。",
    examples:[{en:"We met in order to finalize the plan.",ja:"計画を固めるために集まった。"},{en:"He left early so as to avoid traffic.",ja:"渋滞を避けるため早く出た。"},{en:"Speak clearly so as not to confuse them.",ja:"混乱させないようはっきり話して。"}],
    reorder:{answer:"We rehearsed in order to avoid mistakes.",ja:"ミスを避けるためリハーサルした。"},
    blank:{before:"Double-check it ", after:" not to miss anything.", options:["so as","in order","such as","so that"], answer:"so as", ja:"見落としがないよう再確認して。",
      explain:{answer:"so as", why:"so as not to + 原形（〜しないように）。",
        opts:{"so as":"正解。so as not to miss。","in order":"in order not to なら可だが not の位置が合わない。","such as":"『〜のような』で意味が違う。","so that":"so that の後は主語＋動詞。"}}},
    writing:{prompt:"in order to で目的を1文。", model:"We standardized the format in order to save time."} },
  { id:"g_prefer", title:"好みの表現（prefer A to B / would rather A than B）",
    ja:"prefer A to B（BよりAを好む）、prefer to do rather than do、would rather A than B（BよりむしろA）。比較の対象を to / than で示します。",
    examples:[{en:"I prefer tea to coffee.",ja:"コーヒーより紅茶が好き。"},{en:"I'd rather walk than drive.",ja:"運転よりむしろ歩きたい。"},{en:"She prefers working alone.",ja:"彼女は一人で働くのを好む。"}],
    reorder:{answer:"We prefer email to phone calls.",ja:"電話よりメールがいい。"},
    blank:{before:"I prefer meeting in person ", after:" calling.", options:["to","than","over than","from"], answer:"to", ja:"電話より対面で会うほうがいい。",
      explain:{answer:"to", why:"prefer A to B（BよりAを好む）。",
        opts:{"to":"正解。prefer … to …。","than":"than は would rather や比較級で使う。","over than":"重複で誤り。","from":"different from などに使う。"}}},
    writing:{prompt:"prefer A to B で1文。", model:"I prefer concise reports to long presentations."} },
  { id:"g_would_mind", title:"丁寧な依頼（Would you mind + -ing?）",
    ja:"Would/Do you mind + -ing?（〜していただけますか）。答えで『どうぞ』は No, not at all.（嫌でない＝OK）。Would you mind if I + 過去形 …? で許可も尋ねます。",
    examples:[{en:"Would you mind closing the door?",ja:"ドアを閉めていただけますか？"},{en:"Do you mind waiting a moment?",ja:"少し待っていただけますか？"},{en:"Would you mind if I joined?",ja:"参加してもいいですか？"}],
    reorder:{answer:"Would you mind sending it again?",ja:"もう一度送っていただけますか？"},
    blank:{before:"Would you mind ", after:" the file?", options:["sharing","to share","share","shared"], answer:"sharing", ja:"ファイルを共有していただけますか？",
      explain:{answer:"sharing", why:"mind の後ろは動名詞 -ing。",
        opts:{"sharing":"正解。Would you mind sharing …？","to share":"mind to do は不可。","share":"原形は不可。","shared":"過去形は不可。"}}},
    writing:{prompt:"Would you mind + -ing で丁寧な依頼を1文。", model:"Would you mind reviewing this before Friday?"} },
  { id:"g_used_to_be", title:"used to / be used to / get used to の違い",
    ja:"used to + 原形（昔は〜した）、be used to + -ing/名詞（〜に慣れている）、get used to + -ing（〜に慣れる）。後ろの形と意味の違いに注意。",
    examples:[{en:"I used to commute by train.",ja:"昔は電車通勤だった。"},{en:"I'm used to working late.",ja:"遅くまで働くのに慣れている。"},{en:"You'll get used to the system.",ja:"そのシステムに慣れますよ。"}],
    reorder:{answer:"She is used to giving presentations.",ja:"彼女は発表に慣れている。"},
    blank:{before:"I'm not used ", after:" so early.", options:["to getting up","to get up","get up","used to get"], answer:"to getting up", ja:"そんなに早起きするのに慣れていない。",
      explain:{answer:"to getting up", why:"be used to + -ing（〜に慣れている）。",
        opts:{"to getting up":"正解。be used to + 動名詞。","to get up":"used to + 原形は『昔〜した』で意味が違う。","get up":"形が不完全。","used to get":"『昔起きた』で意味が違う。"}}},
    writing:{prompt:"be used to + -ing で1文。", model:"Our team is used to working across time zones."} },
  { id:"g_future_time_clause", title:"時・条件の副詞節（未来でも現在形）",
    ja:"when, after, before, until, as soon as, if などの副詞節の中では、未来のことでも現在形を使います（I'll call you when I arrive. ×will arrive）。",
    examples:[{en:"I'll email you when I get there.",ja:"着いたらメールします。"},{en:"We'll start as soon as everyone is ready.",ja:"全員そろい次第始めます。"},{en:"Wait here until I come back.",ja:"戻るまでここで待って。"}],
    reorder:{answer:"Call me after you finish the report.",ja:"報告書を終えたら電話して。"},
    blank:{before:"I'll let you know as soon as it ", after:".", options:["arrives","will arrive","arrived","is arriving"], answer:"arrives", ja:"届き次第お知らせします。",
      explain:{answer:"arrives", why:"時の副詞節では未来でも現在形（arrives）。",
        opts:{"arrives":"正解。as soon as it arrives（現在形）。","will arrive":"副詞節内では will を使わない。","arrived":"過去形は不可。","is arriving":"進行形は不自然。"}}},
    writing:{prompt:"when + 現在形（未来の意味）で1文。", model:"I'll update the team when the results come in."} },
  { id:"g_reported_question", title:"間接話法の疑問（asked if / asked where）",
    ja:"疑問文を伝えるとき、Yes/No疑問は if/whether、疑問詞疑問は疑問詞でつなぎ、語順は平叙文に。時制も1つ過去へずらします。",
    examples:[{en:"She asked if I was free.",ja:"彼女は私が空いているか尋ねた。"},{en:"He asked where the office was.",ja:"彼はオフィスの場所を尋ねた。"},{en:"They asked when we would finish.",ja:"いつ終わるか彼らは尋ねた。"}],
    reorder:{answer:"He asked whether we had received it.",ja:"彼はそれを受け取ったか尋ねた。"},
    blank:{before:"She asked where I ", after:".", options:["worked","do I work","did I work","work"], answer:"worked", ja:"彼女は私がどこで働いているか尋ねた。",
      explain:{answer:"worked", why:"間接話法では平叙文語順＋時制をずらす（worked）。",
        opts:{"worked":"正解。where I worked（主語+動詞、過去化）。","do I work":"疑問文語順は不可。","did I work":"疑問文語順は不可。","work":"時制の一致で過去へ。"}}},
    writing:{prompt:"asked if … で間接疑問を1文。", model:"The client asked if we could deliver by Friday."} },
  { id:"g_enough_too", title:"程度（enough / too）",
    ja:"形容詞/副詞 + enough（十分〜）、enough + 名詞（十分な〜）、too + 形容詞（〜すぎる）。enough to do / too … to do の形が頻出。",
    examples:[{en:"It's good enough to ship.",ja:"出荷するには十分良い。"},{en:"We have enough time.",ja:"十分な時間がある。"},{en:"It's too risky to try.",ja:"試すにはリスクが高すぎる。"}],
    reorder:{answer:"She is experienced enough to lead.",ja:"彼女は率いるのに十分な経験がある。"},
    blank:{before:"The room isn't big ", after:" for everyone.", options:["enough","too","so","very"], answer:"enough", ja:"その部屋は全員には十分な大きさでない。",
      explain:{answer:"enough", why:"形容詞の後ろに enough（big enough）。",
        opts:{"enough":"正解。big enough（十分な大きさ）。","too":"too big は『大きすぎる』で逆。","so":"so big は that 節を伴う。","very":"程度を強めるだけで『十分』の意味にならない。"}}},
    writing:{prompt:"too … to … で1文。", model:"The deadline is too tight to add new features."} },
  { id:"g_articles_deep", title:"冠詞の使い分け（a/an / the / 無冠詞）",
    ja:"初出・不特定の可算単数は a/an、特定（既出・唯一）は the、総称の複数・不可算・固有名詞などは無冠詞が基本。文脈で『どれを指すか特定できるか』が鍵。",
    examples:[{en:"I have a question.",ja:"質問が一つある（初出）。"},{en:"The question is difficult.",ja:"その質問は難しい（特定）。"},{en:"Questions are welcome.",ja:"質問は歓迎です（総称）。"}],
    reorder:{answer:"The report you sent was helpful.",ja:"送ってくれた報告書は役立った。"},
    blank:{before:"Could you open ", after:" window? It's hot.", options:["the","a","an","（無冠詞）"], answer:"the", ja:"窓を開けてもらえますか？暑くて。",
      explain:{answer:"the", why:"その場で特定できる窓なので the。",
        opts:{"the":"正解。話し手と聞き手が分かる特定の窓は the。","a":"初出の不特定なら a だが、ここは目の前の特定の窓。","an":"window は子音始まりで an は不可。","（無冠詞）":"可算単数は無冠詞では使えない。"}}},
    writing:{prompt:"a→the の流れで2文。", model:"I bought a laptop. The laptop is very fast."} },
  { id:"g_mixed_conditional", title:"混合条件文（過去の仮定→現在の結果）",
    ja:"If + 過去完了（過去の非現実）, 主語 + would + 原形（現在の結果）。『あの時〜だったら、今は…だろうに』と時制をまたぎます。",
    examples:[{en:"If I had studied medicine, I would be a doctor now.",ja:"医学を学んでいたら、今頃医者だろう。"},{en:"If we had saved more, we wouldn't be worried now.",ja:"もっと貯めていたら、今心配せずに済むのに。"},{en:"If she had taken the job, she'd be in Tokyo.",ja:"その職に就いていたら、今頃東京だろう。"}],
    reorder:{answer:"If we had hired earlier, we would be ready now.",ja:"早く採用していたら、今は準備万端だろう。"},
    blank:{before:"If I had backed it up, I ", after:" panicking now.", options:["wouldn't be","wouldn't have been","won't be","am not"], answer:"wouldn't be", ja:"バックアップしていたら、今あわてていないのに。",
      explain:{answer:"wouldn't be", why:"過去の仮定→現在の結果。帰結は would + 原形（現在）。",
        opts:{"wouldn't be":"正解。現在の結果なので would + 原形。","wouldn't have been":"過去の結果になり『now』と合わない。","won't be":"will は仮定の帰結に使わない。","am not":"直説法で仮定にならない。"}}},
    writing:{prompt:"混合条件文で1文。", model:"If I had learned to code earlier, I would have more options now."} },
  { id:"g_subjunctive_that", title:"要求・提案のthat節（原形）",
    ja:"suggest, recommend, insist, request, demand, propose の後の that 節では動詞は『原形』（仮定法現在）。He suggested (that) she be promoted. 否定は that 主語 + not + 原形。",
    examples:[{en:"They insisted that he attend.",ja:"彼が出席するよう主張した。"},{en:"We recommend that the report be revised.",ja:"報告書の修正を勧める。"},{en:"She requested that it be done today.",ja:"今日中にするよう求めた。"}],
    reorder:{answer:"I suggest that we postpone the launch.",ja:"発売の延期を提案します。"},
    blank:{before:"The board recommends that the policy ", after:" updated.", options:["be","is","was","will be"], answer:"be", ja:"取締役会は方針の更新を勧める。",
      explain:{answer:"be", why:"recommend that 節は原形（仮定法現在）→ be。",
        opts:{"be":"正解。recommend that … be updated（原形）。","is":"三単現でなく原形を使う。","was":"過去形は不可。","will be":"will は使わない。"}}},
    writing:{prompt:"suggest that + 原形 で提案を1文。", model:"I suggest that each team submit a short summary."} },
  { id:"g_causative_get", title:"使役の get（get + 人 + to do）",
    ja:"get は『get + 人 + to + 原形』で『（説得して）〜してもらう』。have/make が原形を取るのに対し、get は to を伴う点が違います。",
    examples:[{en:"I got him to sign the form.",ja:"彼に書類へ署名してもらった。"},{en:"We got the vendor to lower the price.",ja:"業者に値下げしてもらった。"},{en:"Try to get them to agree.",ja:"彼らに同意してもらおう。"}],
    reorder:{answer:"We got the team to review it quickly.",ja:"チームに素早く確認してもらった。"},
    blank:{before:"How did you get them ", after:" early?", options:["to finish","finish","finishing","finished"], answer:"to finish", ja:"どうやって彼らに早く終わらせたの？",
      explain:{answer:"to finish", why:"get + 人 + to + 原形。",
        opts:{"to finish":"正解。get them to finish。","finish":"have/make なら原形だが get は to が必要。","finishing":"-ing は不可。","finished":"get + 物 + 過去分詞は受動。ここは人に『してもらう』。"}}},
    writing:{prompt:"get + 人 + to do で1文。", model:"I'll get the designer to send the mockups today."} }
]);

/* ---- 増量：文法6レッスン（誤答解説つき） ---- */
window.EigoData.grammar = window.EigoData.grammar.concat([
  { id:"g_formal_it", title:"形式主語 it（It is … to do / that …）",
    ja:"主語が長い不定詞句や that 節のとき、it を仮の主語に置いて後ろに回します。It is important to confirm. / It is clear that …。",
    examples:[{en:"It's important to double-check.",ja:"再確認することが大切だ。"},{en:"It's clear that we need help.",ja:"助けが必要なのは明らかだ。"},{en:"It's hard to say.",ja:"何とも言えない。"}],
    reorder:{answer:"It is essential to back up your data.",ja:"データのバックアップは不可欠だ。"},
    blank:{before:"", after:" is useful to have a checklist.", options:["It","That","This","There"], answer:"It", ja:"チェックリストがあると便利だ。",
      explain:{answer:"It", why:"後ろの to 不定詞を指す形式主語は It。",
        opts:{"It":"正解。It is … to do の形式主語。","That":"That + 節 が必要で to 不定詞を受けない。","This":"指示語で形式主語にならない。","There":"There is は存在文で意味が違う。"}}},
    writing:{prompt:"It is + 形容詞 + to do で1文。", model:"It is helpful to summarize the key points first."} },
  { id:"g_double_object", title:"二重目的語（give 人 物 / give 物 to 人）",
    ja:"give, send, show, offer, lend などは『動詞 + 人 + 物』か『動詞 + 物 + to + 人』。代名詞の物のときは to を使う形が自然（give it to me）。",
    examples:[{en:"I sent her the report.",ja:"彼女に報告書を送った。"},{en:"I sent the report to her.",ja:"同上（to 構文）。"},{en:"Could you show me the data?",ja:"データを見せてくれますか？"}],
    reorder:{answer:"Please give the client a discount.",ja:"顧客に割引を出してください。"},
    blank:{before:"Can you send ", after:" to the team?", options:["it","the team it","them it","it them"], answer:"it", ja:"それをチームに送ってくれますか？",
      explain:{answer:"it", why:"代名詞の物は『動詞 + 物(it) + to + 人』が自然（send it to the team）。",
        opts:{"it":"正解。send it to the team。","the team it":"語順が不自然。","them it":"二重代名詞は避ける。","it them":"語順が誤り。"}}},
    writing:{prompt:"give 人 物 の形で1文。", model:"I'll give you a quick update after the call."} },
  { id:"g_preposition_end", title:"前置詞で終わる関係詞（the person I spoke to）",
    ja:"口語では関係詞節の前置詞を文末に残すのが自然です（the person (who) I spoke to / the issue (that) we talked about）。関係代名詞は省略できることが多いです。",
    examples:[{en:"That's the client I told you about.",ja:"あれが話していた顧客だ。"},{en:"This is the tool we rely on.",ja:"これが頼りにしているツールだ。"},{en:"Who did you give it to?",ja:"誰にそれを渡したの？"}],
    reorder:{answer:"This is the report I was looking for.",ja:"これが探していた報告書だ。"},
    blank:{before:"That's the colleague I work ", after:".", options:["with","to","on","of"], answer:"with", ja:"あれが一緒に働いている同僚だ。",
      explain:{answer:"with", why:"work with someone の with が文末に残る。",
        opts:{"with":"正解。work with → … I work with。","to":"work to は誤り。","on":"work on は『〜に取り組む』で意味が違う。","of":"work of は不自然。"}}},
    writing:{prompt:"前置詞が文末に残る関係詞で1文。", model:"This is the platform we built our service on."} },
  { id:"g_negative_question", title:"否定疑問とその応答（Don't you …?）",
    ja:"否定疑問（Don't you agree?）への応答は『事実が肯定なら Yes、否定なら No』。日本語の『はい/いいえ』と逆になることがあるので注意（賛成なら Yes, I do）。",
    examples:[{en:"Isn't it ready? — Yes, it is.",ja:"準備できてない？—いや、できてるよ。"},{en:"Don't you like it? — No, I don't.",ja:"好きじゃないの？—うん、好きじゃない。"},{en:"Haven't they replied? — Yes, they have.",ja:"返信ないの？—あるよ。"}],
    reorder:{answer:"Didn't you receive my email?",ja:"私のメールを受け取らなかった？"},
    blank:{before:"\"Isn't this correct?\" \"", after:", it is.\"", options:["Yes","No","Not","So"], answer:"Yes", ja:"「これ合ってない？」「いや、合ってるよ。」",
      explain:{answer:"Yes", why:"事実が肯定（合っている）なら、否定疑問でも Yes で答える。",
        opts:{"Yes":"正解。事実が肯定なので Yes, it is。","No":"No は事実が否定のとき。","Not":"単独で応答にならない。","So":"応答語にならない。"}}},
    writing:{prompt:"否定疑問に Yes/No で答える1文。", model:"\"Haven't we met before?\" \"Yes, at the conference.\""} },
  { id:"g_only_inversion", title:"Only … で始める倒置（Only then did …）",
    ja:"Only then / Only after / Only when などを文頭に出すと、その後ろは疑問文語順に倒置します（Only then did I understand）。強調・フォーマル。",
    examples:[{en:"Only then did we realize the issue.",ja:"その時初めて問題に気づいた。"},{en:"Only after testing did we ship it.",ja:"検証して初めて出荷した。"},{en:"Only by working together can we succeed.",ja:"協力して初めて成功できる。"}],
    reorder:{answer:"Only later did they confirm the order.",ja:"後になって彼らは注文を確定した。"},
    blank:{before:"Only after the demo ", after:" they decide.", options:["did","they","had","was"], answer:"did", ja:"デモの後で初めて彼らは決めた。",
      explain:{answer:"did", why:"Only after … を文頭に出すと倒置：did + 主語 + 原形。",
        opts:{"did":"正解。Only after … did they decide。","they":"倒置していない普通の語順。","had":"完了形でなく一般動詞 decide なので did。","was":"be動詞ではない。"}}},
    writing:{prompt:"Only when … で倒置の1文。", model:"Only when sales dropped did we change the strategy."} },
  { id:"g_emphasis_very_much", title:"強調の very / much（過去分詞・比較級）",
    ja:"形容詞・副詞は very で、過去分詞や比較級は much/(very) much で強めます。とても疲れた＝very tired（形容詞）/ much appreciated（過去分詞）/ much better（比較級）。",
    examples:[{en:"Your help is much appreciated.",ja:"ご助力に深く感謝します。"},{en:"This is much better.",ja:"こちらの方がずっと良い。"},{en:"I'm very tired.",ja:"とても疲れた。"}],
    reorder:{answer:"The new design is much improved.",ja:"新デザインは大きく改善された。"},
    blank:{before:"Your feedback is ", after:" appreciated.", options:["much","very","so","too"], answer:"much", ja:"ご意見に大変感謝します。",
      explain:{answer:"much", why:"過去分詞 appreciated を強めるのは much（very appreciated は不自然）。",
        opts:{"much":"正解。much appreciated。","very":"very appreciated はやや不自然（very much appreciated なら可）。","so":"so + that 節を伴う。","too":"『〜すぎる』で意味が変わる。"}}},
    writing:{prompt:"much appreciated を使って1文。", model:"Your quick response is much appreciated."} }
]);

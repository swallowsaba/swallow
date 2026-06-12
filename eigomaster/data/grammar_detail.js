/* ============================================================
   文法レッスンの詳説（教科書・NHK講座スタイル）
   - キー：grammar.js の各レッスン id
   - core : ①基本の考え方（なぜそう言うのか）
   - form : ②形（公式）
   - dialog: ③ミニ会話（A/B）と訳
   - pitfall: ④日本人がつまずくポイント
   - 詳説が無いレッスンも、表示側が共通の教科書レイアウトで整形する。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.grammarDetail = {
  g_cleft_it: {
    core: "英語は「新情報・強調したいこと」を It is ～ that … の「～」の位置に置いて目立たせます。日本語の「〜のは…だ」に当たる形で、会話でも書き言葉でも非常によく使います。",
    form: "It is/was ＋ 強調したい語句 ＋ that ＋ 残りの文",
    dialog: [
      { en: "A: Did Ken break the printer?", ja: "A：プリンターを壊したのはケン？" },
      { en: "B: No. It was the new intern that broke it.", ja: "B：いや。壊したのは新人のインターンだよ。" }
    ],
    pitfall: "強調したい語句を that の後に残してしまうミスが多発します。×It was that the intern broke it.（強調語句が無い）。また人を強調するときは that の代わりに who も使えますが、モノ・時・場所は that が安全です。"
  },
  g_subjunctive_demand: {
    core: "「要求・提案・必要」を表す動詞（insist / suggest / demand / recommend / require など）の後の that 節は、「まだ実現していない内容」を述べるため、動詞を原形（仮定法現在）にします。現実の描写ではなく『そうあるべきだ』という頭の中の話だからです。",
    form: "S ＋ insist / suggest など ＋ that ＋ 主語 ＋ 動詞の原形",
    dialog: [
      { en: "A: He's always late to standup.", ja: "A：彼、朝会にいつも遅れるね。" },
      { en: "B: I suggested that he set two alarms.", ja: "B：目覚ましを2つかけるよう提案したよ。" }
    ],
    pitfall: "三単現の -s を付けない・does not ではなく not＋原形にする、の2点が最重要です。×I suggested that he sets… ○…that he set…。イギリス英語では should を入れて that he should set とも言います。"
  },
  g_wish: {
    core: "wish は「現実とは違う願望」を表すため、時制をひとつ過去にずらします。『現在の事実と違う』なら過去形、『過去の事実と違う（後悔）』なら過去完了。時制のズレ＝現実とのズレ、と覚えるのがコツです。",
    form: "I wish ＋ S ＋ 過去形（今の願望）／ I wish ＋ S ＋ had 過去分詞（過去の後悔）／ I wish ＋ S ＋ would 原形（相手への不満）",
    dialog: [
      { en: "A: The meeting ran three hours again.", ja: "A：会議また3時間もかかったよ。" },
      { en: "B: I wish we had an agenda. And I wish I had skipped it.", ja: "B：議題表があればなあ。出なきゃよかったとも思うよ。" }
    ],
    pitfall: "hope との混同に注意。hope は実現可能な願い（I hope it works）、wish は現実に反する願い。また be 動詞は I wish I were… と were を使うのが標準です。"
  },
  g_modal_perfect: {
    core: "助動詞＋have＋過去分詞は「過去への推量・評価」をひとまとめに言う形です。must have done（〜したに違いない）→確信、might have done（〜したかも）→可能性、should have done（〜すべきだった）→後悔・非難。助動詞が「今の気持ち」、have done が「過去の出来事」を担当します。",
    form: "must / can't / might / should ＋ have ＋ 過去分詞",
    dialog: [
      { en: "A: The file is gone!", ja: "A：ファイルが消えてる！" },
      { en: "B: Someone must have deleted it. We should have made a backup.", ja: "B：誰かが消したに違いない。バックアップを取っておくべきだったね。" }
    ],
    pitfall: "「〜したはずがない」は must not have ではなく can't have done を使います。また should have done は「実際にはしなかった」という含みが必ずあります。"
  },
  g_used_to_would: {
    core: "used to は「今はもう違う」という対比を含む過去の習慣・状態。would も過去の習慣に使えますが、『動作の繰り返し』専用で、状態（住んでいた・好きだった・〜があった）には使えません。",
    form: "used to ＋ 原形（習慣・状態）／ would ＋ 原形（反復動作のみ）",
    dialog: [
      { en: "A: You know this area well!", ja: "A：この辺り詳しいね！" },
      { en: "B: I used to live here. I would walk this street every morning.", ja: "B：昔ここに住んでてね。毎朝この通りを歩いたものだよ。" }
    ],
    pitfall: "×There would be a cafe here.（状態に would は不可）→ ○There used to be a cafe here.。疑問・否定は did you use to / didn't use to と use に戻る点も頻出ミスです。"
  },
  g_conditional_omit_if: {
    core: "仮定法の if 節は、助動詞 had / were / should を文頭に出すと if を省略できます。書き言葉やフォーマルな場面で好まれ、引き締まった印象になります。",
    form: "Had ＋ S ＋ 過去分詞（= If S had done）／ Were ＋ S（= If S were）／ Should ＋ S ＋ 原形（= If S should）",
    dialog: [
      { en: "A: Why didn't you tell me about the change?", ja: "A：なんで変更を教えてくれなかったの？" },
      { en: "B: Had I known earlier, I would have told you right away.", ja: "B：もっと早く知っていたら、すぐ伝えていたよ。" }
    ],
    pitfall: "倒置したのに if を残す二重ミスに注意（×If had I known）。否定は Had I not known のように not を主語の後に置きます。"
  },
  g_inversion_neg_adv2: {
    core: "Never / Little / At no time などの否定的な語句を文頭に出すと、その直後は疑問文と同じ語順（倒置）になります。「絶対に〜ない」という強い気持ちを文頭で宣言するイメージです。",
    form: "否定の副詞句 ＋ 助動詞 ＋ 主語 ＋ 動詞",
    dialog: [
      { en: "A: Did you expect this much demand?", ja: "A：ここまでの需要、予想してた？" },
      { en: "B: Never did we imagine it would sell out in an hour.", ja: "B：1時間で完売するとは夢にも思わなかったよ。" }
    ],
    pitfall: "倒置を忘れる（×Never we imagined）か、一般動詞なのに did を入れ忘れるのが定番ミス。be動詞なら At no time was he aware… のように be を前に出します。"
  },
  g_relative_quantifier: {
    core: "「そのうちのいくつかは／大半は」と前の名詞の一部を受けて文をつなぐときは、数量詞＋of＋which/whom を使います。2文に切らずに済むため、報告書やメールで重宝します。",
    form: "..., some / most / many / none / two ＋ of ＋ which（モノ）/ whom（人）...",
    dialog: [
      { en: "A: How did the interviews go?", ja: "A：面接はどうだった？" },
      { en: "B: We met five candidates, two of whom were excellent.", ja: "B：5人と会って、うち2人がとても優秀だったよ。" }
    ],
    pitfall: "×…, some of them were excellent と them を使うと文が2つに割れて文法ミスになります（接続詞が無いため）。関係詞節の中では which/whom を使うのが鉄則です。"
  },
  g_passive_report: {
    core: "「〜と言われている・報じられている」と情報の出どころをぼかして伝える形です。ニュースやビジネス文書の定番で、It is said that 節と、主語を立てる S is said to do の2通りがあります。",
    form: "It is said / believed / reported that ＋ 文　＝　S ＋ is said to ＋ 動詞原形（過去の内容なら to have 過去分詞）",
    dialog: [
      { en: "A: What do you know about the new CEO?", ja: "A：新しいCEOについて何か知ってる？" },
      { en: "B: She is said to have turned around two startups.", ja: "B：スタートアップを2社立て直したと言われているよ。" }
    ],
    pitfall: "時制のズレに注意：言われている内容が過去なら to have done。×He is said to be rich last year → ○He is said to have been rich。"
  },
  g_so_neither_short: {
    core: "付加疑問は「〜だよね？」と相手に確認・同意を求める形。前の文が肯定なら否定タグ、否定なら肯定タグと、必ず逆になります。下げ調子で言えば同意要求、上げ調子なら本当に質問しているニュアンスです。",
    form: "肯定文, 助動詞n't ＋ 主語? ／ 否定文, 助動詞 ＋ 主語?",
    dialog: [
      { en: "A: The demo went well, didn't it?", ja: "A：デモ、うまくいったよね？" },
      { en: "B: It did! You weren't nervous, were you?", ja: "B：うん！緊張してなかったよね？" }
    ],
    pitfall: "Let's には shall we?、命令文には will you? を付けます。I'm のタグは aren't I? という例外も頻出です。"
  },
  g_it_takes: {
    core: "「時間がかかる」は時間を主語にせず、仮主語 It を立てて It takes（時間）to do と言うのが英語の発想です。人を入れるなら takes の直後に置きます。",
    form: "It takes ＋ (人) ＋ 時間 ＋ to ＋ 動詞原形",
    dialog: [
      { en: "A: How long does it take to get approval?", ja: "A：承認が下りるのにどれくらいかかる？" },
      { en: "B: It usually takes us about three days.", ja: "B：だいたい3日くらいかかるよ。" }
    ],
    pitfall: "×I take two hours to commute のように人を主語にしがちですが、It takes me two hours to commute が自然。費用は cost を使い分けます（It cost me ¥3,000）。"
  },
  g_participle_perfect: {
    core: "分詞構文で「主節より前に終わった動作」を表すときは Having＋過去分詞にします。順番のズレを having が引き受けるイメージで、報告書の冒頭表現として頻出です。",
    form: "Having ＋ 過去分詞 ..., ＋ 主節（受け身なら Having been ＋ 過去分詞）",
    dialog: [
      { en: "A: You look relieved.", ja: "A：ほっとした顔してるね。" },
      { en: "B: Having submitted the report, I can finally relax.", ja: "B：報告書を出し終えたから、やっと一息つけるよ。" }
    ],
    pitfall: "主節の主語と分詞の意味上の主語が一致していることが絶対条件です。×Having finished the report, the deadline was met.（締切が報告書を書いたことになる）。"
  }
};

/* ============================================================
   統合レッスン用 追加トレーニング素材 その2
   これまで専用問題が無かったスキルを問題化する。
   - stress     : アクセント（強い音節を当てる）  syl:音節配列 ans:強音節index
   - intonation : イントネーション（上げ/下げ/選択を選ぶ） choices先頭が正解
   - rhythm     : リズム（強く読む語の組を選ぶ）       choices先頭が正解
   - qrt        : 瞬間英作文（和文→英文をゼロから入力） ja / answer(別解 alts)
   - chunk      : チャンク（意味のかたまりに区切る）   ja / answer(語列) chunks(正解区切り)
   - thinking   : 英語思考（和文発想でなく英語発想の自然な言い方を選ぶ） 先頭が正解
   - culture    : 異文化コミュニケーション（場面に適した表現を選ぶ）  先頭が正解
   - discussion : ディスカッション（議論を進める/同意・反論の定型を選ぶ） 先頭が正解
   - collocation: コロケーション穴埋め（自然な語の結びつきを選ぶ）  先頭が正解
   ============================================================ */
window.EigoData = window.EigoData || {};

/* ---- アクセント：強い音節を当てる ---- */
window.EigoData.stressItems = [
  { level: "A2", word: "develop",     syl: ["de", "VEL", "op"],        ans: 1, ja: "発展させる" },
  { level: "A2", word: "important",   syl: ["im", "POR", "tant"],      ans: 1, ja: "重要な" },
  { level: "A2", word: "computer",    syl: ["com", "PU", "ter"],       ans: 1, ja: "コンピューター" },
  { level: "A2", word: "banana",      syl: ["ba", "NA", "na"],         ans: 1, ja: "バナナ" },
  { level: "B1", word: "photograph",  syl: ["PHO", "to", "graph"],     ans: 0, ja: "写真" },
  { level: "B1", word: "photographer",syl: ["pho", "TOG", "ra", "pher"],ans: 1, ja: "写真家" },
  { level: "B1", word: "economy",     syl: ["e", "CON", "o", "my"],    ans: 1, ja: "経済" },
  { level: "B1", word: "economic",    syl: ["e", "co", "NOM", "ic"],   ans: 2, ja: "経済の" },
  { level: "B1", word: "comfortable", syl: ["COM", "fort", "a", "ble"],ans: 0, ja: "快適な" },
  { level: "B2", word: "necessary",   syl: ["NE", "ces", "sa", "ry"],  ans: 0, ja: "必要な" },
  { level: "B2", word: "responsible", syl: ["re", "SPON", "si", "ble"],ans: 1, ja: "責任がある" },
  { level: "B2", word: "available",   syl: ["a", "VAIL", "a", "ble"],  ans: 1, ja: "利用できる" },
  { level: "B2", word: "negotiate",   syl: ["ne", "GO", "ti", "ate"],  ans: 1, ja: "交渉する" },
  { level: "B2", word: "opportunity", syl: ["op", "por", "TU", "ni", "ty"], ans: 2, ja: "機会" },
  { level: "C1", word: "sophisticated",syl: ["so", "PHIS", "ti", "ca", "ted"], ans: 1, ja: "洗練された" },
  { level: "C1", word: "preferable",  syl: ["PRE", "fer", "a", "ble"], ans: 0, ja: "好ましい" },
  // 同綴り異強勢（名詞↔動詞）
  { level: "B1", word: "record (名詞)", syl: ["RE", "cord"],  ans: 0, ja: "記録（名詞）", say: "record" },
  { level: "B1", word: "record (動詞)", syl: ["re", "CORD"],  ans: 1, ja: "記録する（動詞）", say: "record" },
  { level: "B2", word: "present (名詞)",syl: ["PRE", "sent"], ans: 0, ja: "贈り物（名詞）", say: "present" },
  { level: "B2", word: "present (動詞)",syl: ["pre", "SENT"], ans: 1, ja: "提示する（動詞）", say: "present" }
];

/* ---- イントネーション ---- */
window.EigoData.intonationItems = [
  { level: "A2", text: "Are you coming to the party?", q: "文末の調子は？",
    choices: ["上げる↗（Yes/No疑問）", "下げる↘（平叙）", "上げてから下げる", "変えない"],
    explain: "Yes/Noで答える疑問文は文末を上げる↗。" },
  { level: "B1", text: "Where is the meeting room?", q: "文末の調子は？",
    choices: ["下げる↘（WH疑問）", "上げる↗", "上げてから下げる", "平坦"],
    explain: "WH疑問文（where/what/why…）は文末を下げる↘のが普通。" },
  { level: "B1", text: "Would you like coffee or tea?", q: "coffee と tea の調子は？",
    choices: ["coffee↗ tea↘（選択疑問）", "両方↗", "両方↘", "coffee↘ tea↗"],
    explain: "選択疑問は前を上げ↗、最後を下げる↘。" },
  { level: "B2", text: "You finished it already?", q: "驚きを表す調子は？",
    choices: ["文末を強く上げる↗", "下げる↘", "平坦に読む", "途中で切る"],
    explain: "平叙文でも文末を強く上げると驚き・確認のニュアンスになる。" },
  { level: "B2", text: "It's a great idea, isn't it?", q: "同意を求める付加疑問の調子は？",
    choices: ["isn't it を下げる↘（同意を期待）", "isn't it を上げる↗（本当に質問）", "全体を上げる", "全体を下げる"],
    explain: "答えが分かっていて同意を求めるときは付加疑問を下げる↘。" },
  { level: "C1", text: "I didn't say SHE took it.", q: "『彼女が取ったとは言っていない』の含みを出すには？",
    choices: ["SHE を強く（他の誰かなら言った）", "say を強く", "took を強く", "均等に読む"],
    explain: "強勢を置く語で含意が変わる。SHEを強調＝『彼女ではない誰か』の含み。" }
];

/* ---- リズム（強く読む内容語を選ぶ） ---- */
window.EigoData.rhythmItems = [
  { level: "B1", text: "I'll SEND the REPORT in the MORNING.", q: "強く読む語の組み合わせは？",
    choices: ["send / report / morning（内容語）", "I'll / the / in（機能語）", "all words equally", "send / the / in"],
    explain: "英語は内容語（動詞・名詞）を強く、機能語（冠詞・前置詞）を弱く読む強勢拍リズム。" },
  { level: "B1", text: "Can you GIVE me a HAND with this BOX?", q: "強く読む語は？",
    choices: ["give / hand / box", "can / you / me", "a / with / this", "すべて均等"],
    explain: "give a hand（手伝う）の内容語を強く。機能語は弱形で速く。" },
  { level: "B2", text: "We NEED to CUT COSTS without LOSING QUALITY.", q: "強く読む語は？",
    choices: ["need / cut / costs / losing / quality", "we / to / without", "to / without / the", "すべて均等"],
    explain: "内容語を強く等間隔に。機能語(to, without)は短く挟む。" },
  { level: "B2", text: "It was the BEST decision we ever MADE.", q: "最も強い2語は？",
    choices: ["best / made", "it / was", "the / we", "was / ever"],
    explain: "情報の核（best, made）に最も強い強勢が乗る。" }
];

/* ---- 瞬間英作文（和文→英文をゼロから） ---- */
window.EigoData.qrtItems = [
  { level: "A2", ja: "折り返しご連絡します。", answer: "I'll get back to you.", alts: ["I will get back to you."] },
  { level: "A2", ja: "少しお時間よろしいですか。", answer: "Do you have a minute?", alts: ["Do you have a moment?"] },
  { level: "B1", ja: "その件は確認して折り返します。", answer: "Let me check and get back to you.", alts: ["I'll check and get back to you."] },
  { level: "B1", ja: "会議を3時に変更できますか。", answer: "Can we move the meeting to 3?", alts: ["Could we move the meeting to three?", "Can we reschedule the meeting to 3?"] },
  { level: "B1", ja: "ご協力ありがとうございます。", answer: "Thank you for your help.", alts: ["Thanks for your help."] },
  { level: "B2", ja: "締め切りに間に合わせるよう最善を尽くします。", answer: "I'll do my best to meet the deadline.", alts: ["I will do my best to meet the deadline."] },
  { level: "B2", ja: "予算を少し超えています。", answer: "It's a bit over our budget.", alts: ["This is a little over budget.", "It is a bit over our budget."] },
  { level: "B2", ja: "認識を合わせておきましょう。", answer: "Let's get on the same page.", alts: ["Let's make sure we're on the same page."] },
  { level: "B2", ja: "具体例を挙げていただけますか。", answer: "Could you give me an example?", alts: ["Can you give me an example?"] },
  { level: "C1", ja: "その前提が妥当か確認したいです。", answer: "I'd like to check if that assumption is valid.", alts: ["I want to check whether that assumption holds."] }
];

/* ---- チャンク（意味のかたまりに区切る） ---- */
window.EigoData.chunkItems = [
  { level: "B1", text: "I'd like to talk about the new plan.",
    q: "意味のかたまりの区切り方として自然なのは？",
    choices: ["I'd like to talk / about the new plan", "I'd / like to talk about / the new / plan", "I'd like / to talk about the / new plan", "I'd like to / talk / about / the / new / plan"],
    explain: "「したい＋話す/その新計画について」で意味の塊に区切るとリスニング・音読が楽になる。" },
  { level: "B2", text: "We need to finish this before the deadline.",
    q: "自然なチャンク区切りは？",
    choices: ["We need to finish this / before the deadline", "We need / to finish this before / the deadline", "We / need to / finish this before the / deadline", "We need to finish / this before / the deadline"],
    explain: "主語+動詞のかたまり/前置詞句のかたまりで区切る。" },
  { level: "B2", text: "In my opinion, the second option is better.",
    q: "自然なチャンク区切りは？",
    choices: ["In my opinion, / the second option / is better", "In / my opinion the / second option is / better", "In my / opinion the second / option is better", "In my opinion the second option / is better"],
    explain: "前置き句/主語句/述部、で区切る。カンマは自然な切れ目の目印。" }
];

/* ---- 英語思考（直訳でなく英語らしい言い方を選ぶ） ---- */
window.EigoData.thinkingItems = [
  { level: "B1", ja: "（直訳『私の意見では難しいと思う』を自然に）",
    text: "「それは難しいと思う」を英語らしく言うと？",
    choices: ["I'm not sure that will work.", "I think that is difficult.", "It is difficult I think.", "Difficult, I think so."],
    explain: "日本語の「難しい＝やんわり否定」は英語では I'm not sure it'll work. と機能で言うのが自然。" },
  { level: "B2", ja: "",
    text: "「よろしくお願いします」をメール結びで自然に言うと？",
    choices: ["Thank you in advance for your help.", "Please do it well.", "I leave it to your kindness.", "Best regards for your future."],
    explain: "「よろしく」に直訳は無い。場面の機能（先に礼を述べる）で表現する。" },
  { level: "B2", ja: "",
    text: "「検討します」を前向き/保留どちらでもなく中立に言うと？",
    choices: ["Let me think about it.", "I will consider to do it.", "I keep it in my heart.", "I do the consideration."],
    explain: "「検討します」は Let me think about it. が自然。consider は to不定詞を取らない。" },
  { level: "C1", ja: "",
    text: "「お世話になっております」を英語メールで始めるなら？",
    choices: ["I hope you're doing well.", "I am always in your care.", "Thank you for taking care of me always.", "You always help me, thanks."],
    explain: "定型の社交辞令は機能で置換。英語では I hope you're doing well. が定番の書き出し。" }
];

/* ---- 異文化コミュニケーション ---- */
window.EigoData.cultureItems = [
  { level: "B1", text: "会議で相手の意見に反対したいとき、角を立てない言い方は？",
    choices: ["I see your point, but have we considered...?", "No, you are wrong.", "That's a bad idea.", "I totally disagree with you."],
    explain: "英語でも全否定は強すぎる。一旦受けて(I see your point)から代案を出すのが安全。" },
  { level: "B2", text: "褒められたときの返し方として無難なのは？",
    choices: ["Thank you, that's kind of you to say.", "No, no, it's nothing, I'm not good.", "Yes, I know I'm great.", "Why do you say that to me?"],
    explain: "英語圏では褒め言葉は素直に受けるのが普通。過度な謙遜はかえって不自然。" },
  { level: "B2", text: "依頼を断るとき、関係を保つ言い方は？",
    choices: ["I'd love to, but I won't be able to this time.", "No. I can't.", "It's impossible for me absolutely.", "Why are you asking me this?"],
    explain: "断りは『意欲＋無理な理由＋次の余地』の順で柔らかく。" },
  { level: "C1", text: "沈黙が続いたとき会議を前に進める一言は？",
    choices: ["Shall we hear from someone who hasn't spoken yet?", "Why is everyone so quiet?", "Nobody has any idea?", "This silence is awkward."],
    explain: "沈黙を責めず、発言を促す中立的な進行表現が場をなごませる。" }
];

/* ---- ディスカッション（議論の定型） ---- */
window.EigoData.discussionItems = [
  { level: "B1", text: "相手の意見に賛成しつつ付け加えるとき：",
    choices: ["That's a good point, and I'd add that...", "You are right always.", "Yes yes yes go on.", "I have nothing to say."],
    explain: "賛成＋追加（and I'd add that）で議論を発展させる。" },
  { level: "B2", text: "部分的に賛成し、条件を付けるとき：",
    choices: ["I agree to some extent, but only if we have the budget.", "Maybe yes maybe no.", "I cannot say anything.", "It depends on you."],
    explain: "to some extent（ある程度）＋条件で、立場を明確にしつつ柔軟に。" },
  { level: "B2", text: "話が脱線したとき本題に戻す一言：",
    choices: ["Let's come back to the main point.", "Stop talking about that.", "You are off topic now.", "That is not important at all."],
    explain: "come back to the main point で角を立てず軌道修正。" },
  { level: "C1", text: "議論をまとめて結論へ向かうとき：",
    choices: ["So, if I understand correctly, we agree on three things.", "Okay finish finish.", "I think we talked enough.", "Let's just decide somehow."],
    explain: "理解の確認＋論点整理で建設的に締めくくる。" }
];

/* ---- コロケーション穴埋め ---- */
window.EigoData.collocationItems = [
  { level: "B1", text: "We need to ___ a decision by Friday.", q: "自然な語は？",
    choices: ["make", "do", "take", "give"], explain: "decision は make a decision（do ではない）。" },
  { level: "B1", text: "Could you ___ me a favor?", q: "自然な語は？",
    choices: ["do", "make", "give", "take"], explain: "favor は do someone a favor。" },
  { level: "B2", text: "Let's ___ progress on the project.", q: "自然な語は？",
    choices: ["make", "do", "take", "have"], explain: "progress は make progress。" },
  { level: "B2", text: "We should ___ the risk into account.", q: "自然な語は？",
    choices: ["take", "make", "do", "bring"], explain: "take ... into account（考慮に入れる）。" },
  { level: "B2", text: "She ___ a strong impression on the client.", q: "自然な語は？",
    choices: ["made", "did", "took", "gave"], explain: "impression は make an impression。" },
  { level: "C1", text: "Let's ___ a meeting to discuss this.", q: "自然な語は？",
    choices: ["set up", "make up", "take up", "do up"], explain: "set up a meeting（会議を設定する）。" }
];

/* ============================================================
   増量セットB
   ============================================================ */
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B1", word:"interesting", syl:["IN","ter","est","ing"], ans:0, ja:"興味深い" },
  { level:"B1", word:"experience", syl:["ex","PE","ri","ence"], ans:1, ja:"経験" },
  { level:"B1", word:"environment", syl:["en","VI","ron","ment"], ans:1, ja:"環境" },
  { level:"B1", word:"particular", syl:["par","TIC","u","lar"], ans:1, ja:"特定の" },
  { level:"B2", word:"communicate", syl:["com","MU","ni","cate"], ans:1, ja:"伝える" },
  { level:"B2", word:"communication", syl:["com","mu","ni","CA","tion"], ans:3, ja:"伝達" },
  { level:"B2", word:"democracy", syl:["de","MOC","ra","cy"], ans:1, ja:"民主主義" },
  { level:"B2", word:"democratic", syl:["dem","o","CRAT","ic"], ans:2, ja:"民主的な" },
  { level:"B2", word:"photography", syl:["pho","TOG","ra","phy"], ans:1, ja:"写真術" },
  { level:"B2", word:"international", syl:["in","ter","NA","tion","al"], ans:2, ja:"国際的な" },
  { level:"B2", word:"organization", syl:["or","gan","i","ZA","tion"], ans:3, ja:"組織" },
  { level:"B2", word:"administration", syl:["ad","min","is","TRA","tion"], ans:3, ja:"運営" },
  { level:"C1", word:"characteristic", syl:["char","ac","ter","IS","tic"], ans:3, ja:"特徴" },
  { level:"C1", word:"responsibility", syl:["re","spon","si","BIL","i","ty"], ans:3, ja:"責任" },
  { level:"C1", word:"recommendation", syl:["rec","om","men","DA","tion"], ans:3, ja:"推薦" },
  { level:"B1", word:"object (名詞)", syl:["OB","ject"], ans:0, ja:"物体（名詞）", say:"object" },
  { level:"B1", word:"object (動詞)", syl:["ob","JECT"], ans:1, ja:"反対する（動詞）", say:"object" },
  { level:"B2", word:"increase (名詞)", syl:["IN","crease"], ans:0, ja:"増加（名詞）", say:"increase" },
  { level:"B2", word:"increase (動詞)", syl:["in","CREASE"], ans:1, ja:"増やす（動詞）", say:"increase" },
  { level:"B2", word:"contract (名詞)", syl:["CON","tract"], ans:0, ja:"契約（名詞）", say:"contract" },
  { level:"B2", word:"contract (動詞)", syl:["con","TRACT"], ans:1, ja:"契約する（動詞）", say:"contract" }
]);

window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B1", text:"Can you help me, please?", q:"文末の調子は？",
    choices:["上げる↗（依頼のYes/No）","下げる↘","平坦","途中で切る"], explain:"Yes/Noで答える依頼疑問は上げ↗。" },
  { level:"B1", text:"What time does it start?", q:"文末の調子は？",
    choices:["下げる↘（WH疑問）","上げる↗","平坦","強く上げる"], explain:"WH疑問は下げ↘。" },
  { level:"B2", text:"So you're saying it's too expensive?", q:"確認・驚きの調子は？",
    choices:["文末を上げる↗（確認）","下げる↘","平坦に読む","最初を強く"], explain:"平叙の形でも上げると確認・聞き返しになる。" },
  { level:"B2", text:"Tea, coffee, or juice?", q:"3択の調子は？",
    choices:["tea↗ coffee↗ juice↘","全部↗","全部↘","tea↘ 他↗"], explain:"列挙の選択疑問は最後だけ下げ↘。" },
  { level:"C1", text:"I never said it was your fault.", q:"『あなたのせいとは言っていない』の含みで fault を守るには？",
    choices:["said を強調（言ってはいない、ほのめかしただけ）","never を弱く","fault を弱く","均等に読む"], explain:"強調語で含意が変わる。said強調＝『口にしてはいない』。" }
]);

window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B1", text:"Please CALL me when you GET there.", q:"強く読む語は？",
    choices:["call / get / there","please / me / when","you / there","均等"], explain:"内容語(call, get, there)を強く。" },
  { level:"B2", text:"We're TRYING to FINISH the REPORT by FRIDAY.", q:"強く読む語は？",
    choices:["trying / finish / report / Friday","we're / to / the / by","to / the / by","均等"], explain:"動詞・名詞を等間隔に強く。" },
  { level:"B2", text:"The MORE you PRACTICE, the BETTER you GET.", q:"強く読む語は？",
    choices:["more / practice / better / get","the / you / the / you","you / you","均等"], explain:"The 比較級, the 比較級 構文。内容語を強く。" },
  { level:"C1", text:"It's not WHAT you know, it's WHO you know.", q:"最も強い2語は？",
    choices:["what / who","it's / it's","you / you","know / know"], explain:"対比の核 what↔who に最も強い強勢。" }
]);

window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"少々お待ちください。", answer:"Just a moment, please.", alts:["One moment, please.","Hold on a second."] },
  { level:"A2", ja:"問題ありません。", answer:"No problem.", alts:["That's fine.","No worries."] },
  { level:"B1", ja:"資料を金曜までに送ります。", answer:"I'll send the documents by Friday.", alts:["I will send the materials by Friday."] },
  { level:"B1", ja:"その点について同意します。", answer:"I agree with you on that.", alts:["I agree on that point."] },
  { level:"B1", ja:"もう少し詳しく教えてください。", answer:"Could you tell me more about it?", alts:["Can you give me more details?"] },
  { level:"B2", ja:"ご提案ありがとうございますが、今回は見送ります。", answer:"Thank you for the offer, but we'll pass this time.", alts:["Thanks for the proposal, but we'll pass for now."] },
  { level:"B2", ja:"この件は持ち帰って検討します。", answer:"Let me take this back and think it over.", alts:["I'll take this back and consider it."] },
  { level:"B2", ja:"代替案を提案してもよろしいですか。", answer:"May I suggest an alternative?", alts:["Could I propose an alternative?"] },
  { level:"B2", ja:"締め切りを一週間延ばせますか。", answer:"Could we extend the deadline by a week?", alts:["Can we push the deadline back a week?"] },
  { level:"C1", ja:"この数字の根拠を伺えますか。", answer:"Could you walk me through these numbers?", alts:["Could you explain the basis for these figures?"] },
  { level:"C1", ja:"双方にとって良い妥協点を見つけましょう。", answer:"Let's find a compromise that works for both sides.", alts:["Let's find a middle ground that works for everyone."] },
  { level:"C1", ja:"認識に齟齬がないか確認させてください。", answer:"Let me make sure we're on the same page.", alts:["Let me confirm we're aligned."] }
]);

window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B1", text:"Thank you for coming to the meeting today.", q:"自然なチャンク区切りは？",
    choices:["Thank you for coming / to the meeting today","Thank / you for / coming to the / meeting today","Thank you / for / coming to / the meeting / today","Thank you for coming to the / meeting today"], explain:"感謝＋来てくれたこと/会議へ今日、で区切る。" },
  { level:"B2", text:"If you have any questions, feel free to ask.", q:"自然なチャンク区切りは？",
    choices:["If you have any questions, / feel free to ask","If / you have any / questions feel free / to ask","If you / have any questions feel / free to ask","If you have / any questions feel free to / ask"], explain:"条件節/主節、で区切る。カンマが目印。" },
  { level:"B2", text:"We should focus on what really matters.", q:"自然なチャンク区切りは？",
    choices:["We should focus / on what really matters","We / should focus on what / really matters","We should / focus on what really / matters","We should focus on / what / really / matters"], explain:"主語+動詞/前置詞句、で区切る。" },
  { level:"C1", text:"Given the circumstances, I think we made the right call.", q:"自然なチャンク区切りは？",
    choices:["Given the circumstances, / I think / we made the right call","Given / the circumstances I think we / made the right call","Given the / circumstances I / think we made / the right call","Given the circumstances I think we made / the right call"], explain:"前置き句/主節の主語動詞/補語、で区切る。" }
]);

window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B1", ja:"", text:"「（誘いを断って）また今度」を自然に言うと？",
    choices:["Maybe another time.","Next time I do it.","Another time please me.","I refuse but later."], explain:"社交辞令の断りは Maybe another time. が自然。" },
  { level:"B2", ja:"", text:"「無理しないでね」を自然に言うと？",
    choices:["Take it easy.","Don't do impossible.","No overwork to you.","Please not hard work."], explain:"気遣いの定型は Take it easy. / Don't push yourself too hard." },
  { level:"B2", ja:"", text:"「助かります」を依頼の場面で自然に言うと？",
    choices:["That would really help.","You save me much.","It is helpful to me yes.","Help is good for me."], explain:"機能で言い換え：That would really help. が自然。" },
  { level:"C1", ja:"", text:"「ご迷惑をおかけしました」をビジネスで自然に言うと？",
    choices:["Sorry for the inconvenience.","Sorry I gave you trouble much.","Excuse my annoyance to you.","I made you trouble sorry."], explain:"定型は Sorry for the inconvenience. / Apologies for any trouble." },
  { level:"C1", ja:"", text:"「念のため確認ですが」を自然に切り出すと？",
    choices:["Just to be sure,","For the carefulness,","To make safe,","By the just in case,"], explain:"Just to be sure, / Just to confirm, が自然な前置き。" }
]);

window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B1", text:"初対面のスモールトークで安全な話題は？",
    choices:["How was your trip here?","How much do you earn?","Why are you not married?","How old are you exactly?"], explain:"収入・年齢・結婚はプライバシー。移動や天気など無難な話題から。" },
  { level:"B2", text:"相手の提案に懸念を伝えるが関係を保ちたい：",
    choices:["I like the idea; my only concern is the timeline.","Your idea has a big problem.","This will never work.","I don't trust this plan."], explain:"肯定→唯一の懸念、の順でやわらげる。" },
  { level:"B2", text:"会議で発言をやんわり促す：",
    choices:["I'd love to hear your thoughts on this.","Say something now.","Why are you silent?","You must speak."], explain:"I'd love to hear your thoughts. が丁寧な促し。" },
  { level:"C1", text:"締め切り遅延を相手に責任転嫁せず伝える：",
    choices:["It looks like we're running behind; how can we get back on track?","You made us late again.","This delay is your fault.","Someone messed up clearly."], explain:"主語をweにして非難を避け、解決志向で。" }
]);

window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B1", text:"発言を始める前置きとして自然なのは？",
    choices:["If I could just add something here,","Listen to me now.","I talk first okay.","My turn to speak."], explain:"If I could just add … は丁寧な割り込み・発言開始。" },
  { level:"B2", text:"相手の意見に反対の立場を示すが丁寧に：",
    choices:["I see it a little differently.","You are completely wrong.","No way that's true.","That makes no sense."], explain:"see it differently は柔らかい反対表明。" },
  { level:"B2", text:"根拠を求めて議論を深める：",
    choices:["What evidence do we have for that?","Says who?","Prove it then.","That's just your opinion."], explain:"What evidence …？ は建設的に根拠を問う。" },
  { level:"C1", text:"対立する意見を統合に向ける：",
    choices:["Maybe both points are right in different situations.","One of you must be wrong.","Let's just pick one randomly.","Stop arguing already."], explain:"両論を状況依存として統合する調整的発言。" }
]);

window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B1", text:"I need to ___ an appointment with the dentist.", q:"自然な語は？",
    choices:["make","do","take","get"], explain:"appointment は make an appointment。" },
  { level:"B1", text:"Please ___ attention to the safety rules.", q:"自然な語は？",
    choices:["pay","make","do","give"], explain:"attention は pay attention。" },
  { level:"B2", text:"The new ad will ___ awareness of our brand.", q:"自然な語は？",
    choices:["raise","rise","lift","grow"], explain:"awareness は raise awareness（他動詞 raise）。" },
  { level:"B2", text:"We need to ___ a compromise.", q:"自然な語は？",
    choices:["reach","make","do","take"], explain:"compromise は reach a compromise。" },
  { level:"B2", text:"Let's ___ a deadline for this task.", q:"自然な語は？",
    choices:["set","make","do","put"], explain:"deadline は set a deadline。" },
  { level:"C1", text:"The report will ___ light on the issue.", q:"自然な語は？",
    choices:["shed","give","make","put"], explain:"shed light on（解明する）。" },
  { level:"B2", text:"They failed to ___ the terms of the contract.", q:"自然な語は？",
    choices:["meet","do","make","reach"], explain:"meet the terms（条件を満たす）。" },
  { level:"B2", text:"We should ___ steps to prevent this.", q:"自然な語は？",
    choices:["take","make","do","give"], explain:"take steps（措置を講じる）。" }
]);

/* ============================================================
   増量セットD：発音系・産出系 第2弾
   ============================================================ */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"後ほどお電話します。", answer:"I'll call you later.", alts:["I will call you later."] },
  { level:"A2", ja:"どういたしまして。", answer:"You're welcome.", alts:["My pleasure."] },
  { level:"B1", ja:"その会議に出席できません。", answer:"I can't attend the meeting.", alts:["I won't be able to attend the meeting."] },
  { level:"B1", ja:"進捗を共有していただけますか。", answer:"Could you share the progress?", alts:["Can you give me an update?"] },
  { level:"B1", ja:"確認のうえ、明日ご連絡します。", answer:"I'll check and let you know tomorrow.", alts:["I will confirm and contact you tomorrow."] },
  { level:"B2", ja:"スケジュールが合わず申し訳ありません。", answer:"I'm sorry our schedules don't match.", alts:["Sorry, our schedules don't line up."] },
  { level:"B2", ja:"この案で進めてよろしいですか。", answer:"Shall we go ahead with this plan?", alts:["Can we proceed with this plan?"] },
  { level:"B2", ja:"念のため、もう一度ご確認いただけますか。", answer:"Just to be safe, could you check again?", alts:["Could you double-check, just in case?"] },
  { level:"C1", ja:"その点については認識を共有しておきたいです。", answer:"I'd like to align on that point.", alts:["I want to make sure we agree on that."] },
  { level:"C1", ja:"長期的な視点で考えるべきだと思います。", answer:"I think we should take a long-term view.", alts:["We should look at this from a long-term perspective."] },
  { level:"B2", ja:"ご都合の良い日時を教えてください。", answer:"Please let me know a time that works for you.", alts:["Could you tell me when works for you?"] },
  { level:"B2", ja:"問題が解決し次第お知らせします。", answer:"I'll let you know as soon as it's fixed.", alts:["I will notify you once it's resolved."] }
]);

window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B1", word:"computer", syl:["com","PU","ter"], ans:1, ja:"コンピューター" },
  { level:"B1", word:"banana", syl:["ba","NA","na"], ans:1, ja:"バナナ" },
  { level:"B1", word:"hotel", syl:["ho","TEL"], ans:1, ja:"ホテル" },
  { level:"B1", word:"police", syl:["po","LICE"], ans:1, ja:"警察" },
  { level:"B2", word:"category", syl:["CAT","e","go","ry"], ans:0, ja:"分類" },
  { level:"B2", word:"strategy", syl:["STRAT","e","gy"], ans:0, ja:"戦略" },
  { level:"B2", word:"variety", syl:["va","RI","e","ty"], ans:1, ja:"多様性" },
  { level:"B2", word:"analysis", syl:["a","NAL","y","sis"], ans:1, ja:"分析" },
  { level:"B2", word:"specific", syl:["spe","CIF","ic"], ans:1, ja:"具体的な" },
  { level:"C1", word:"phenomenon", syl:["phe","NOM","e","non"], ans:1, ja:"現象" },
  { level:"C1", word:"hypothesis", syl:["hy","POTH","e","sis"], ans:1, ja:"仮説" },
  { level:"C1", word:"inevitable", syl:["in","EV","i","ta","ble"], ans:1, ja:"避けられない" },
  { level:"B2", word:"permit (名詞)", syl:["PER","mit"], ans:0, ja:"許可証（名詞）", say:"permit" },
  { level:"B2", word:"permit (動詞)", syl:["per","MIT"], ans:1, ja:"許可する（動詞）", say:"permit" },
  { level:"B2", word:"export (名詞)", syl:["EX","port"], ans:0, ja:"輸出（名詞）", say:"export" },
  { level:"B2", word:"export (動詞)", syl:["ex","PORT"], ans:1, ja:"輸出する（動詞）", say:"export" }
]);

window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B1", text:"Let's ___ a break.", q:"自然な語は？", choices:["take","make","do","have"], explain:"break は take a break。" },
  { level:"B1", text:"I'd like to ___ a complaint.", q:"自然な語は？", choices:["make","do","take","give"], explain:"complaint は make a complaint。" },
  { level:"B2", text:"The company will ___ a profit this year.", q:"自然な語は？", choices:["make","do","take","get"], explain:"profit は make a profit。" },
  { level:"B2", text:"We must ___ a balance between cost and quality.", q:"自然な語は？", choices:["strike","make","do","hit"], explain:"strike a balance（バランスを取る）。" },
  { level:"B2", text:"Let's ___ a brainstorming session.", q:"自然な語は？", choices:["hold","make","do","take"], explain:"hold a session（会を開く）。" },
  { level:"C1", text:"The findings ___ doubt on the theory.", q:"自然な語は？", choices:["cast","make","put","give"], explain:"cast doubt on（疑問を投げかける）。" }
]);

window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お疲れ様です」を同僚へ自然に言うと？",
    choices:["（直訳は無い）Hi / Good to see you などで代替","You are tired good work","Thanks for your tiredness","Good job for being tired"], explain:"「お疲れ様」に英語の直訳は無い。挨拶や Good work などで機能を代替。" },
  { level:"B2", ja:"", text:"「とりあえず」を会話で自然に言うと？",
    choices:["for now","tentatively anyway","first of all just","as a beginning thing"], explain:"「とりあえず」は for now がもっとも自然。" },
  { level:"C1", ja:"", text:"「善処します」を曖昧さを保って言うと？",
    choices:["I'll see what I can do.","I will do goodness.","I handle it goodly.","I make best handling."], explain:"I'll see what I can do. が含みを残す定番。" },
  { level:"B1", ja:"", text:"「了解です」をカジュアルに言うと？",
    choices:["Got it.","I am understand.","Roger that understood yes.","Comprehension done."], explain:"Got it. / Will do. が自然。" }
]);

window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の国の文化について尋ねる丁寧な切り出し：",
    choices:["I'd love to learn more about how things work there.","Your country is so strange to me.","Why do you do it that way?","That's weird where you're from."], explain:"好奇心を敬意とともに。learn more about が安全。" },
  { level:"B2", text:"会議で時間に遅れた相手への配慮：",
    choices:["No worries, we just got started.","You are late again.","Why can't you be on time?","We waited so long for you."], explain:"遅刻を責めず場を和ませる。" },
  { level:"C1", text:"はっきりNoを言いにくい文化差をふまえた確認：",
    choices:["Just to be clear, is that a yes or are there concerns?","So yes or no, tell me now.","Stop being vague please.","Why won't you decide?"], explain:"曖昧さを責めず、丁寧に意思を明確化する。" }
]);

window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"自分の提案を控えめに出す：",
    choices:["This might be worth considering:","Listen to my great idea:","You should do what I say:","My idea is the best:"], explain:"might be worth considering は控えめで受け入れられやすい。" },
  { level:"B2", text:"議論の前提をそろえる：",
    choices:["Can we agree on the goal first?","Let's just argue.","Goals don't matter here.","Skip the basics."], explain:"目的の合意から始めると議論が噛み合う。" },
  { level:"C1", text:"少数意見に配慮しつつ進める：",
    choices:["I hear the concern; can we address it as we move forward?","Ignore the minority.","Majority wins, end of story.","Stop slowing us down."], explain:"懸念を受け止めつつ前進する包摂的進行。" }
]);

window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B1", text:"You're coming, right?", q:"right? の調子は？",
    choices:["上げる↗（確認を求める）","下げる↘","平坦","強く下げる"], explain:"確認のtag/right? は上げ↗。" },
  { level:"B2", text:"That's all for today.", q:"締めの調子は？",
    choices:["下げる↘（断定・終了）","上げる↗","平坦に伸ばす","途中で切る"], explain:"宣言・締めは下げ↘で完結感。" }
]);

window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I'll TAKE care of it RIGHT away.", q:"強く読む語は？",
    choices:["take / care / right / away","I'll / of / it","of it / away","均等"], explain:"take care of / right away の内容語を強く。" },
  { level:"B2", text:"Let's KEEP it SHORT and SIMPLE.", q:"強く読む語は？",
    choices:["keep / short / simple","let's / it / and","and / it","均等"], explain:"keep / short / simple を等間隔に強く。" }
]);

window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As far as I know, the deal is still on.", q:"自然なチャンク区切りは？",
    choices:["As far as I know, / the deal is still on","As / far as I know the / deal is still on","As far as / I know the deal / is still on","As far as I know the deal / is still on"], explain:"前置きの副詞節/主節、で区切る。" },
  { level:"C1", text:"To be honest with you, I have some reservations.", q:"自然なチャンク区切りは？",
    choices:["To be honest with you, / I have some reservations","To be / honest with you I have / some reservations","To be honest / with you I have some / reservations","To be honest with you I have / some reservations"], explain:"前置き句/主節、で区切る。" }
]);

/* ============================================================
   増量セットF：発音系・産出系 第3弾
   ============================================================ */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"承知しました。", answer:"Understood.", alts:["Got it.","Noted."] },
  { level:"A2", ja:"また連絡します。", answer:"I'll be in touch.", alts:["I will contact you again."] },
  { level:"B1", ja:"添付ファイルをご確認ください。", answer:"Please find the attached file.", alts:["Please check the attached file."] },
  { level:"B1", ja:"ご返信お待ちしております。", answer:"I look forward to your reply.", alts:["I'm looking forward to hearing from you."] },
  { level:"B1", ja:"その日は予定が入っています。", answer:"I have other plans that day.", alts:["I'm not free that day."] },
  { level:"B2", ja:"優先順位を見直す必要があります。", answer:"We need to reconsider our priorities.", alts:["We should review our priorities."] },
  { level:"B2", ja:"懸念点を共有させてください。", answer:"Let me share my concerns.", alts:["I'd like to raise a concern."] },
  { level:"B2", ja:"この方向性で問題ないか確認したいです。", answer:"I'd like to confirm we're heading the right way.", alts:["I want to check this direction is okay."] },
  { level:"C1", ja:"現実的な落としどころを探りましょう。", answer:"Let's look for a realistic middle ground.", alts:["Let's find a workable compromise."] },
  { level:"C1", ja:"そのリスクは許容範囲内だと考えます。", answer:"I think that risk is acceptable.", alts:["I believe that risk is within an acceptable range."] }
]);

window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B1", word:"machine", syl:["ma","CHINE"], ans:1, ja:"機械" },
  { level:"B1", word:"unique", syl:["u","NIQUE"], ans:1, ja:"独特の" },
  { level:"B2", word:"colleague", syl:["COL","league"], ans:0, ja:"同僚" },
  { level:"B2", word:"committee", syl:["com","MIT","tee"], ans:1, ja:"委員会" },
  { level:"B2", word:"efficiency", syl:["ef","FI","cien","cy"], ans:1, ja:"効率" },
  { level:"B2", word:"priority", syl:["pri","OR","i","ty"], ans:1, ja:"優先事項" },
  { level:"B2", word:"facility", syl:["fa","CIL","i","ty"], ans:1, ja:"施設" },
  { level:"C1", word:"infrastructure", syl:["IN","fra","struc","ture"], ans:0, ja:"インフラ" },
  { level:"C1", word:"accommodate", syl:["ac","COM","mo","date"], ans:1, ja:"収容する" },
  { level:"C1", word:"deteriorate", syl:["de","TE","ri","o","rate"], ans:1, ja:"悪化する" },
  { level:"B2", word:"refund (名詞)", syl:["RE","fund"], ans:0, ja:"払い戻し（名詞）", say:"refund" },
  { level:"B2", word:"refund (動詞)", syl:["re","FUND"], ans:1, ja:"払い戻す（動詞）", say:"refund" },
  { level:"B2", word:"conduct (名詞)", syl:["CON","duct"], ans:0, ja:"行い（名詞）", say:"conduct" },
  { level:"B2", word:"conduct (動詞)", syl:["con","DUCT"], ans:1, ja:"実施する（動詞）", say:"conduct" }
]);

window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B1", text:"Let's ___ in touch after the event.", q:"自然な語は？", choices:["keep","make","do","take"], explain:"keep in touch（連絡を取り合う）。" },
  { level:"B2", text:"The plan will ___ into effect next month.", q:"自然な語は？", choices:["come","make","do","take"], explain:"come into effect（発効する）。" },
  { level:"B2", text:"We need to ___ ground on this negotiation.", q:"自然な語は？", choices:["gain","make","do","take"], explain:"gain ground（前進する・優位に立つ）。" },
  { level:"B2", text:"Let me ___ that into consideration.", q:"自然な語は？", choices:["take","make","do","put"], explain:"take into consideration（考慮する）。" },
  { level:"C1", text:"The decision will ___ a precedent.", q:"自然な語は？", choices:["set","make","do","give"], explain:"set a precedent（前例をつくる）。" },
  { level:"C1", text:"They ___ a significant role in the project.", q:"自然な語は？", choices:["played","made","did","took"], explain:"play a role（役割を果たす）。" }
]);

window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B1", ja:"", text:"「がんばって」を試験前の友人に自然に言うと？",
    choices:["Good luck!","Do your best fight!","Effort please you!","Hard work to you!"], explain:"Good luck! / You've got this! が自然。" },
  { level:"B2", ja:"", text:"「お先に失礼します」を退社時に自然に言うと？",
    choices:["I'm heading out. See you tomorrow.","I leave before you sorry.","Excuse my early leaving.","I go first rudely."], explain:"I'm heading out. が自然な退社の挨拶。" },
  { level:"B2", ja:"", text:"「助かりました」を後から感謝する自然な言い方は？",
    choices:["That really helped a lot.","You were a great help to my saving.","I was saved by you much.","Your help saved me greatly."], explain:"That really helped. が自然。" },
  { level:"C1", ja:"", text:"「ご検討いただけますと幸いです」を丁寧に言うと？",
    choices:["I'd appreciate it if you could consider this.","I am happy if you consider please.","Your consideration makes me happy.","Please be happy to consider."], explain:"I'd appreciate it if you could … が定型の丁寧表現。" }
]);

window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の意見を最後まで聞く姿勢を示す：",
    choices:["Please go on, I'm listening.","Hurry up and finish.","I already know that.","Get to the point fast."], explain:"傾聴を示す Please go on. が関係を保つ。" },
  { level:"C1", text:"直接的すぎる指摘を和らげる：",
    choices:["One thing we might want to revisit is the budget.","Your budget is wrong.","You failed at the budget.","The budget is a disaster."], explain:"might want to revisit で柔らかく問題提起。" },
  { level:"B2", text:"会議で割り込まれたとき穏やかに続ける：",
    choices:["If I could just finish my point...","Stop interrupting me.","Let me talk now.","You are rude."], explain:"If I could just finish … で角を立てず継続。" }
]);

window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"他の視点を求める：",
    choices:["Does anyone see this differently?","I'm always right here.","No other views needed.","Just agree with me."], explain:"see this differently? で多様な視点を歓迎。" },
  { level:"C1", text:"議論を要点に集約する：",
    choices:["It sounds like our main options are A and B.","Too many ideas, stop.","This is chaos now.","Let's give up."], explain:"選択肢を整理して合意形成に導く。" },
  { level:"B2", text:"自分が間違っていたと認める：",
    choices:["You make a fair point; I hadn't considered that.","I'm never wrong though.","Fine, whatever you say.","That changes nothing."], explain:"非を認めつつ建設的に。fair point で相手を立てる。" }
]);

window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Could you possibly help me with this?", q:"丁寧な依頼の調子は？",
    choices:["文末を上げる↗（控えめな依頼）","下げる↘","平坦","強く下げる"], explain:"控えめな依頼は文末を上げ↗て柔らかく。" },
  { level:"C1", text:"Well, that's one way to look at it.", q:"含みのある相づちの調子は？",
    choices:["平坦〜やや下げ（婉曲な留保）","強く上げる","強く下げて断定","途中で切る"], explain:"平坦〜やや下げで『一理あるが…』という婉曲な留保。" }
]);

window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's TOUCH BASE before the CALL.", q:"強く読む語は？",
    choices:["touch / base / call","let's / the","before / the","均等"], explain:"touch base / call の内容語を強く。" },
  { level:"C1", text:"The SOONER we START, the SOONER we FINISH.", q:"強く読む語は？",
    choices:["sooner / start / sooner / finish","the / we / the / we","we / we","均等"], explain:"The 比較級構文。sooner/start/finish を強く。" }
]);

window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"Once we finish this, we can move on.", q:"自然なチャンク区切りは？",
    choices:["Once we finish this, / we can move on","Once / we finish this we / can move on","Once we / finish this we can / move on","Once we finish / this we can move / on"], explain:"接続詞節/主節、で区切る。" },
  { level:"C1", text:"In terms of cost, this option is far better.", q:"自然なチャンク区切りは？",
    choices:["In terms of cost, / this option is far better","In / terms of cost this / option is far better","In terms / of cost this option / is far better","In terms of cost this / option is far better"], explain:"前置き句/主節、で区切る。" }
]);

/* ============================================================
   増量セットH：発音系・産出系 第4弾
   ============================================================ */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"問題ないと思います。", answer:"I think it's fine.", alts:["I think that's okay."] },
  { level:"A2", ja:"すぐ戻ります。", answer:"I'll be right back.", alts:["I will be back soon."] },
  { level:"B1", ja:"日程を再調整できますか。", answer:"Could we reschedule?", alts:["Can we reschedule the meeting?"] },
  { level:"B1", ja:"念のため確認させてください。", answer:"Let me just double-check.", alts:["Let me confirm to be sure."] },
  { level:"B1", ja:"そのファイルが見つかりません。", answer:"I can't find that file.", alts:["I'm unable to find the file."] },
  { level:"B2", ja:"この件を最優先で対応します。", answer:"I'll make this my top priority.", alts:["I will prioritize this."] },
  { level:"B2", ja:"代替案をいくつか用意しました。", answer:"I've prepared a few alternatives.", alts:["I prepared some alternative options."] },
  { level:"B2", ja:"双方の都合を合わせましょう。", answer:"Let's find a time that works for both of us.", alts:["Let's coordinate our schedules."] },
  { level:"C1", ja:"その想定にはいくつか前提があります。", answer:"That assumption rests on a few conditions.", alts:["There are some assumptions behind that."] },
  { level:"C1", ja:"結論を急がず、もう少し検討しましょう。", answer:"Let's not rush to a conclusion; let's think it through.", alts:["Let's take more time before deciding."] }
]);

window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B1", word:"July", syl:["Ju","LY"], ans:1, ja:"7月" },
  { level:"B1", word:"engineer", syl:["en","gi","NEER"], ans:2, ja:"技術者" },
  { level:"B1", word:"employee", syl:["em","ploy","EE"], ans:2, ja:"従業員" },
  { level:"B2", word:"executive", syl:["ex","EC","u","tive"], ans:1, ja:"重役" },
  { level:"B2", word:"initiative", syl:["i","NI","tia","tive"], ans:1, ja:"主導権" },
  { level:"B2", word:"competitive", syl:["com","PET","i","tive"], ans:1, ja:"競争力のある" },
  { level:"B2", word:"definitely", syl:["DEF","i","nite","ly"], ans:0, ja:"確実に" },
  { level:"C1", word:"unprecedented", syl:["un","PRES","e","den","ted"], ans:1, ja:"前例のない" },
  { level:"C1", word:"simultaneously", syl:["si","mul","TA","ne","ous","ly"], ans:2, ja:"同時に" },
  { level:"B2", word:"survey (名詞)", syl:["SUR","vey"], ans:0, ja:"調査（名詞）", say:"survey" },
  { level:"B2", word:"survey (動詞)", syl:["sur","VEY"], ans:1, ja:"調査する（動詞）", say:"survey" },
  { level:"B2", word:"protest (名詞)", syl:["PRO","test"], ans:0, ja:"抗議（名詞）", say:"protest" },
  { level:"B2", word:"protest (動詞)", syl:["pro","TEST"], ans:1, ja:"抗議する（動詞）", say:"protest" }
]);

window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B1", text:"Let's ___ a goal for this quarter.", q:"自然な語は？", choices:["set","make","do","put"], explain:"set a goal（目標を設定する）。" },
  { level:"B2", text:"We need to ___ action immediately.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take action（行動を起こす）。" },
  { level:"B2", text:"The merger will ___ value for shareholders.", q:"自然な語は？", choices:["create","make","do","give"], explain:"create value（価値を生む）。" },
  { level:"B2", text:"Please ___ note of the new policy.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take note of（留意する）。" },
  { level:"C1", text:"The crisis ___ serious questions about safety.", q:"自然な語は？", choices:["raised","made","did","took"], explain:"raise questions（疑問を提起する）。" },
  { level:"C1", text:"They ___ ground in the negotiations.", q:"自然な語は？", choices:["lost","made","did","took"], explain:"lose ground（後退する）。" }
]);

window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B1", ja:"", text:"「いただきます」に相当する英語の場面表現は？",
    choices:["（決まり文句は無い）Let's eat! / This looks great!","I receive food now.","Thanks for the meal before.","I take it humbly."], explain:"「いただきます」に直訳は無い。Let's eat! などで場をつなぐ。" },
  { level:"B2", ja:"", text:"「よろしくお伝えください」を自然に言うと？",
    choices:["Please say hi to them for me.","Please tell my regards well.","Send my good to them please.","Please transmit my hello."], explain:"Say hi / Give my regards to … が自然。" },
  { level:"B2", ja:"", text:"「とんでもないです（恐縮です）」を褒められて言うと？",
    choices:["Oh, you're too kind.","No it is nonsense.","That is impossible thing.","Don't say such big."], explain:"You're too kind. / I appreciate that. が自然。" },
  { level:"C1", ja:"", text:"「前向きに検討します」を含みをもって言うと？",
    choices:["We'll give it serious thought.","We think forward about it.","We consider positively yes.","We do positive thinking."], explain:"give it serious thought が自然で含みも保てる。" }
]);

window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の専門分野に敬意を示しつつ質問する：",
    choices:["You know this better than I do—how would you approach it?","You must know everything.","Just tell me the answer.","Is this even hard for you?"], explain:"相手の専門性を立てて意見を引き出す。" },
  { level:"C1", text:"対立を避けつつ自分の立場を保つ：",
    choices:["I respect that view, though I'd weigh it differently.","You're wrong and I'm right.","There's no point arguing.","Believe what you want."], explain:"敬意＋自分の重み付けの違い、で対立を回避。" },
  { level:"B2", text:"沈黙が気まずいときの中立的な一言：",
    choices:["Let's take a moment to think it over.","Why is no one talking?","This is so awkward.","Someone say something."], explain:"沈黙を『考える時間』と前向きに枠づける。" }
]);

window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"議論を具体例で前進させる：",
    choices:["Can we look at a concrete example?","Stop being abstract.","Examples are boring.","Just trust me here."], explain:"concrete example で議論を地に足のついたものに。" },
  { level:"C1", text:"対立点を建設的に名指しする：",
    choices:["It seems we differ mainly on timing—shall we focus there?","You just don't get it.","We'll never agree.","This is hopeless."], explain:"相違点を特定し、そこに焦点化して解決に向かう。" },
  { level:"B2", text:"相手の提案を発展させる：",
    choices:["Building on that, we could also add a pilot phase.","Forget your idea, here's mine.","That's not enough at all.","I have nothing to build."], explain:"Building on that … で協調的に発展させる。" }
]);

window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Right, so let's move on.", q:"進行の合図 Right の調子は？",
    choices:["やや下げて区切る（話題転換）","強く上げる","長く伸ばす","平坦のまま"], explain:"談話標識 Right はやや下げて区切り、話題を進める。" },
  { level:"C1", text:"You did read the brief, didn't you?", q:"確認したい付加疑問の調子は？",
    choices:["didn't you を下げる↘（確認の含み）","強く上げる↗","平坦","途中で切る"], explain:"答えを予期する確認は付加疑問を下げ↘。" }
]);

window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"We're RUNNING a bit BEHIND on the SCHEDULE.", q:"強く読む語は？",
    choices:["running / behind / schedule","we're / a / on the","bit / on","均等"], explain:"内容語(running, behind, schedule)を強く。" },
  { level:"C1", text:"It's WORTH doing if it SAVES us TIME.", q:"強く読む語は？",
    choices:["worth / saves / time","it's / if it / us","doing / us","均等"], explain:"情報の核(worth, saves, time)を強く。" }
]);

window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"After we review the data, we'll make a decision.", q:"自然なチャンク区切りは？",
    choices:["After we review the data, / we'll make a decision","After / we review the data we'll / make a decision","After we / review the data we'll make / a decision","After we review / the data we'll make a / decision"], explain:"時の副詞節/主節、で区切る。" },
  { level:"C1", text:"Despite the setbacks, the project stayed on track.", q:"自然なチャンク区切りは？",
    choices:["Despite the setbacks, / the project stayed on track","Despite / the setbacks the project / stayed on track","Despite the / setbacks the project stayed / on track","Despite the setbacks the / project stayed on track"], explain:"譲歩の前置き句/主節、で区切る。" }
]);

/* 増量セットJ：発音系・産出系 第5弾 */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"B1", ja:"いつ頃お返事いただけますか。", answer:"When can I expect your reply?", alts:["When should I expect to hear back?"] },
  { level:"B1", ja:"その点は把握しています。", answer:"I'm aware of that.", alts:["I'm already aware of that point."] },
  { level:"B2", ja:"具体的な数字で示していただけますか。", answer:"Could you show me the actual numbers?", alts:["Can you give me concrete figures?"] },
  { level:"B2", ja:"認識の相違があるようです。", answer:"It seems we have a misunderstanding.", alts:["There seems to be a gap in our understanding."] },
  { level:"B2", ja:"今期の目標を再確認しましょう。", answer:"Let's revisit our goals for this quarter.", alts:["Let's go over this quarter's targets again."] },
  { level:"C1", ja:"その判断は時期尚早だと思います。", answer:"I think it's premature to decide that.", alts:["I believe it's too early to make that call."] },
  { level:"C1", ja:"長所と短所を整理してから決めましょう。", answer:"Let's weigh the pros and cons before deciding.", alts:["Let's lay out the pros and cons first."] }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"appreciate", syl:["ap","PRE","ci","ate"], ans:1, ja:"感謝する" },
  { level:"B2", word:"available", syl:["a","VAIL","a","ble"], ans:1, ja:"利用可能な" },
  { level:"B2", word:"determine", syl:["de","TER","mine"], ans:1, ja:"決定する" },
  { level:"C1", word:"negotiation", syl:["ne","go","ti","A","tion"], ans:3, ja:"交渉" },
  { level:"C1", word:"sustainability", syl:["sus","tain","a","BIL","i","ty"], ans:3, ja:"持続可能性" },
  { level:"B2", word:"decrease (名詞)", syl:["DE","crease"], ans:0, ja:"減少（名詞）", say:"decrease" },
  { level:"B2", word:"decrease (動詞)", syl:["de","CREASE"], ans:1, ja:"減らす（動詞）", say:"decrease" },
  { level:"B2", word:"address (名詞)", syl:["AD","dress"], ans:0, ja:"住所（名詞・米）", say:"address" },
  { level:"B2", word:"address (動詞)", syl:["ad","DRESS"], ans:1, ja:"対処する（動詞）", say:"address" }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"We should ___ advantage of this opportunity.", q:"自然な語は？", choices:["take","make","do","get"], explain:"take advantage of（活用する）。" },
  { level:"B2", text:"Let's ___ progress at the end of each week.", q:"自然な語は？", choices:["review","make","do","take"], explain:"review progress（進捗を見直す）。" },
  { level:"C1", text:"The new rule will ___ effect immediately.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take effect（発効する）。" },
  { level:"C1", text:"We must ___ expectations early.", q:"自然な語は？", choices:["manage","make","do","take"], explain:"manage expectations（期待値を調整する）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お手数をおかけします」を依頼時に自然に言うと？",
    choices:["Sorry for the trouble, and thank you.","I give you hand trouble.","Excuse my troublesome request big.","Please bear my annoyance."], explain:"Sorry for the trouble / I appreciate your help が自然。" },
  { level:"C1", ja:"", text:"「おかげさまで」を成果報告で自然に言うと？",
    choices:["Thanks to your support, it went well.","By your shadow it is good.","Your grace made it happen.","Owing to you greatly thanks."], explain:"Thanks to your support … が自然。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"フィードバックを求めるとき相手が答えやすい聞き方：",
    choices:["What's one thing I could do better?","Tell me everything wrong with me.","Was I bad?","Do you hate my work?"], explain:"one thing … better と絞ると答えやすく前向き。" },
  { level:"C1", text:"異論を述べる前のクッション表現：",
    choices:["I might be missing something, but...","You're obviously wrong, but...","No offense, but you failed...","I hate to say it, but..."], explain:"I might be missing something で謙虚に異論を切り出す。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言の機会を相手に譲る：",
    choices:["What's your take on this?","I'll keep talking.","No one else matters.","Just listen to me."], explain:"What's your take? で相手に発言を促す。" },
  { level:"C1", text:"前提を共有してから議論する：",
    choices:["Let's make sure we're starting from the same facts.","Facts don't matter here.","Let's just argue freely.","Skip the setup."], explain:"共通の事実から始めて議論をかみ合わせる。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To make a long story short, it worked.", q:"自然なチャンク区切りは？",
    choices:["To make a long story short, / it worked","To make / a long story short it / worked","To make a long / story short it worked","To make a long story / short it worked"], explain:"定型の前置き句/主節、で区切る。" }
]);

/* 増量セットL：瞬間英作文・アクセント 大バッチ */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"了解しました。", answer:"Got it.", alts:["Understood.","Will do."] },
  { level:"A2", ja:"少し休憩しましょう。", answer:"Let's take a short break.", alts:["Let's have a quick break."] },
  { level:"B1", ja:"明日までに仕上げます。", answer:"I'll finish it by tomorrow.", alts:["I will have it done by tomorrow."] },
  { level:"B1", ja:"その件で相談があります。", answer:"I'd like to talk to you about that.", alts:["I want to discuss that with you."] },
  { level:"B2", ja:"認識を合わせておきたいです。", answer:"I want to make sure we're aligned.", alts:["Let's get on the same page."] },
  { level:"B2", ja:"このリスクをどう抑えますか。", answer:"How can we minimize this risk?", alts:["How do we reduce this risk?"] },
  { level:"B2", ja:"次回までに案を用意します。", answer:"I'll prepare a proposal by next time.", alts:["I will have a draft ready by next time."] },
  { level:"C1", ja:"その判断は状況次第だと思います。", answer:"I think that depends on the situation.", alts:["It depends on the circumstances."] },
  { level:"C1", ja:"優先順位を明確にしておきましょう。", answer:"Let's be clear about our priorities.", alts:["Let's clarify the priorities."] }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B1", word:"agenda", syl:["a","GEN","da"], ans:1, ja:"議題" },
  { level:"B1", word:"percent", syl:["per","CENT"], ans:1, ja:"パーセント" },
  { level:"B2", word:"statistics", syl:["sta","TIS","tics"], ans:1, ja:"統計" },
  { level:"B2", word:"alternative", syl:["al","TER","na","tive"], ans:1, ja:"代替案" },
  { level:"B2", word:"significant", syl:["sig","NIF","i","cant"], ans:1, ja:"重要な" },
  { level:"C1", word:"entrepreneur", syl:["en","tre","pre","NEUR"], ans:3, ja:"起業家" },
  { level:"C1", word:"bureaucracy", syl:["bu","REAU","cra","cy"], ans:1, ja:"官僚制" },
  { level:"B2", word:"reject (名詞)", syl:["RE","ject"], ans:0, ja:"不良品（名詞）", say:"reject" },
  { level:"B2", word:"reject (動詞)", syl:["re","JECT"], ans:1, ja:"拒否する（動詞）", say:"reject" }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"We should ___ a deal with them.", q:"自然な語は？", choices:["strike","make","do","take"], explain:"strike a deal（取引をまとめる）。" },
  { level:"B2", text:"Let's ___ a meeting for Monday.", q:"自然な語は？", choices:["arrange","make","do","take"], explain:"arrange a meeting（会議を手配する）。" },
  { level:"C1", text:"The findings ___ doubt on earlier studies.", q:"自然な語は？", choices:["cast","make","put","give"], explain:"cast doubt on（疑念を投げかける）。" }
]);

/* 増量セットN：瞬間英作文・アクセント・コロケーション */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"了解です、やっておきます。", answer:"Sure, I'll handle it.", alts:["Okay, I'll take care of it."] },
  { level:"B1", ja:"確認でき次第ご連絡します。", answer:"I'll let you know once I've checked.", alts:["I will contact you after checking."] },
  { level:"B1", ja:"それは私の担当ではありません。", answer:"That's not my area.", alts:["That's outside my responsibility."] },
  { level:"B2", ja:"この案にはいくつか懸念があります。", answer:"I have a few concerns about this plan.", alts:["There are some concerns with this proposal."] },
  { level:"B2", ja:"もう少し情報が必要です。", answer:"I need a bit more information.", alts:["Could you give me more details?"] },
  { level:"B2", ja:"優先順位をはっきりさせましょう。", answer:"Let's clarify the priorities.", alts:["Let's get the priorities straight."] },
  { level:"C1", ja:"その点については保留にさせてください。", answer:"Let me hold off on that for now.", alts:["I'd like to put that on hold."] },
  { level:"C1", ja:"双方の利益を考慮する必要があります。", answer:"We need to consider both sides' interests.", alts:["We should weigh the interests of both parties."] }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"capacity", syl:["ca","PAC","i","ty"], ans:1, ja:"容量" },
  { level:"B2", word:"authority", syl:["au","THOR","i","ty"], ans:1, ja:"権威" },
  { level:"B2", word:"majority", syl:["ma","JOR","i","ty"], ans:1, ja:"大多数" },
  { level:"B2", word:"minority", syl:["mi","NOR","i","ty"], ans:1, ja:"少数派" },
  { level:"C1", word:"accountability", syl:["ac","coun","ta","BIL","i","ty"], ans:3, ja:"説明責任" },
  { level:"B2", word:"contrast (名詞)", syl:["CON","trast"], ans:0, ja:"対比（名詞）", say:"contrast" },
  { level:"B2", word:"contrast (動詞)", syl:["con","TRAST"], ans:1, ja:"対比する（動詞）", say:"contrast" }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a compromise.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a compromise（妥協に至る）。" },
  { level:"B2", text:"We should ___ the matter further.", q:"自然な語は？", choices:["pursue","make","do","give"], explain:"pursue the matter（問題を追究する）。" },
  { level:"C1", text:"The report will ___ recommendations.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make recommendations（提言する）。" }
]);

/* 増量セットO：瞬間英作文・アクセント・チャンク・英語思考 大バッチ */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"少し考えさせてください。", answer:"Let me think for a moment.", alts:["Give me a second to think."] },
  { level:"A2", ja:"気にしないでください。", answer:"Don't worry about it.", alts:["No worries."] },
  { level:"B1", ja:"会議に5分遅れます。", answer:"I'll be five minutes late to the meeting.", alts:["I'm running five minutes late."] },
  { level:"B1", ja:"資料を共有しますね。", answer:"I'll share the documents.", alts:["Let me share the materials."] },
  { level:"B2", ja:"その方向で進めましょう。", answer:"Let's go in that direction.", alts:["Let's proceed that way."] },
  { level:"B2", ja:"懸念を解消できれば賛成です。", answer:"I'm on board if we can address the concerns.", alts:["I'll agree once the concerns are resolved."] },
  { level:"B2", ja:"全体像を共有させてください。", answer:"Let me give you the big picture.", alts:["Let me walk you through the overview."] },
  { level:"C1", ja:"その前提は再検討の余地があります。", answer:"That assumption is worth revisiting.", alts:["We should reconsider that assumption."] },
  { level:"C1", ja:"短期と長期の両方を見据えるべきです。", answer:"We should consider both the short and long term.", alts:["We need to balance short-term and long-term views."] },
  { level:"C1", ja:"認識のずれを早めに埋めましょう。", answer:"Let's close the gap in understanding early.", alts:["Let's align before the gap widens."] }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"ability", syl:["a","BIL","i","ty"], ans:1, ja:"能力" },
  { level:"B2", word:"reality", syl:["re","AL","i","ty"], ans:1, ja:"現実" },
  { level:"B2", word:"society", syl:["so","CI","e","ty"], ans:1, ja:"社会" },
  { level:"B2", word:"identity", syl:["i","DEN","ti","ty"], ans:1, ja:"同一性" },
  { level:"C1", word:"compatibility", syl:["com","pat","i","BIL","i","ty"], ans:3, ja:"互換性" },
  { level:"B2", word:"convert (名詞)", syl:["CON","vert"], ans:0, ja:"改宗者（名詞）", say:"convert" },
  { level:"B2", word:"convert (動詞)", syl:["con","VERT"], ans:1, ja:"変換する（動詞）", say:"convert" },
  { level:"B2", word:"insult (名詞)", syl:["IN","sult"], ans:0, ja:"侮辱（名詞）", say:"insult" },
  { level:"B2", word:"insult (動詞)", syl:["in","SULT"], ans:1, ja:"侮辱する（動詞）", say:"insult" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As soon as the data comes in, we'll update the report.", q:"自然なチャンク区切りは？", choices:["As soon as the data comes in, / we'll update the report","As / soon as the data comes / in we'll update","As soon as / the data comes in we'll / update the report","As soon as the data / comes in we'll update / the report"], explain:"時の副詞節/主節、で区切る。" },
  { level:"C1", text:"With that in mind, let's move to the next item.", q:"自然なチャンク区切りは？", choices:["With that in mind, / let's move to the next item","With / that in mind let's move / to the next item","With that / in mind let's move to / the next item","With that in mind let's / move to the next item"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「失礼します（入室時）」を自然に言うと？", choices:["Sorry to interrupt.","Excuse my rudeness enter.","I do rude now.","Permit my interruption big."], explain:"Sorry to interrupt. が自然。直訳は不自然。" },
  { level:"C1", ja:"", text:"「お言葉に甘えて」を申し出を受けて言うと？", choices:["If you insist, thank you.","I depend on your word.","I take your sweet word.","By your kindness I obey."], explain:"If you insist / If it's no trouble, … が自然。" },
  { level:"B2", ja:"", text:"「ご無沙汰しております」を久々の連絡で言うと？", choices:["It's been a while.","Long no contact sorry.","I was absent from you.","My silence was long."], explain:"It's been a while. / Long time no see. が自然。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の時間を尊重して切り出す：", choices:["I know you're busy, so I'll keep this brief.","You have time for me right.","This won't take long maybe.","Listen quickly to me."], explain:"多忙を気遣い簡潔にする前置きが好印象。" },
  { level:"C1", text:"意見の相違を前向きに位置づける：", choices:["I think our different views can actually make this stronger.","You disagree so we fail.","Different opinions are bad.","Let's just pick mine."], explain:"相違を強みと捉える建設的フレーミング。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"論点を一つに絞る：", choices:["Let's focus on one issue at a time.","Talk about everything now.","No focus needed here.","Just decide somehow."], explain:"one issue at a time で議論を整理。" },
  { level:"C1", text:"合意を文書化して締める：", choices:["Let's put what we agreed in writing.","We don't need records.","Forget what we said.","Writing is a waste."], explain:"合意の文書化で認識のずれを防ぐ。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Sorry?", q:"聞き返しの Sorry? の調子は？", choices:["上げる↗（もう一度の意）","下げる↘","平坦","強く下げる"], explain:"聞き返しの Sorry? は上げ↗。" },
  { level:"C1", text:"You really think so?", q:"懐疑を表す調子は？", choices:["文末を強く上げる↗","下げる↘","平坦","途中で切る"], explain:"懐疑・驚きは文末を強く上げる↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's GET this DONE by the END of the DAY.", q:"強く読む語は？", choices:["get / done / end / day","let's / this / by the / of the","this / of","均等"], explain:"内容語(get, done, end, day)を強く。" }
]);

/* 増量：高次スキル（手薄カテゴリ補強） */
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B1", text:"Please SEND it BEFORE the MEETING.", q:"強く読む語は？", choices:["send / before / meeting","please / it / the","it / the","均等"], explain:"内容語(send, before, meeting)を強く。" },
  { level:"B2", text:"We CAN'T AFFORD to WAIT any LONGER.", q:"強く読む語は？", choices:["can't / afford / wait / longer","we / to / any","to / any","均等"], explain:"can't は否定で強く。内容語を等間隔に。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B1", text:"When you have a moment, please call me.", q:"自然なチャンク区切りは？", choices:["When you have a moment, / please call me","When / you have a moment please / call me","When you / have a moment please call / me","When you have / a moment please call me"], explain:"条件節/主節、で区切る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B1", text:"Is this seat taken?", q:"文末の調子は？", choices:["上げる↗（Yes/No疑問）","下げる↘","平坦","強く下げる"], explain:"Yes/No疑問は上げ↗。" }
]);

/* 増量セットR：瞬間英作文・アクセント・コロケーション・チャンク・英語思考 */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"すぐ折り返します。", answer:"I'll call you right back.", alts:["Let me call you back shortly."] },
  { level:"B1", ja:"少し時間をいただけますか。", answer:"Could you give me a moment?", alts:["Can I have a minute?"] },
  { level:"B1", ja:"念のため確認させてください。", answer:"Let me confirm just to be sure.", alts:["Let me double-check just in case."] },
  { level:"B2", ja:"その点は持ち帰って検討します。", answer:"Let me take that back and consider it.", alts:["I'll take that away and think it over."] },
  { level:"B2", ja:"認識に齟齬がないか確認しましょう。", answer:"Let's make sure we're on the same page.", alts:["Let's check we're aligned."] },
  { level:"B2", ja:"これは優先度を上げるべきです。", answer:"We should bump up the priority on this.", alts:["This deserves a higher priority."] },
  { level:"C1", ja:"前提が崩れたので見直しが必要です。", answer:"The assumption no longer holds, so we need to revisit this.", alts:["Since the premise has changed, a review is needed."] },
  { level:"C1", ja:"短期的な痛みは長期的な利益のためです。", answer:"The short-term pain is for long-term gain.", alts:["We accept short-term costs for long-term benefit."] }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a deadline.", q:"自然な語は？", choices:["set","make","do","put"], explain:"set a deadline（締切を設定する）。" },
  { level:"B2", text:"We need to ___ a decision.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a decision（決定する）。" },
  { level:"B2", text:"They will ___ the risk.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a risk（リスクを取る）。" },
  { level:"C1", text:"Let's ___ momentum.", q:"自然な語は？", choices:["build","make","do","set"], explain:"build momentum（勢いをつける）。" },
  { level:"C1", text:"We should ___ expectations.", q:"自然な語は？", choices:["manage","do","make","give"], explain:"manage expectations（期待値を調整する）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"economy", syl:["e","CON","o","my"], ans:1, ja:"経済" },
  { level:"B2", word:"democracy", syl:["de","MOC","ra","cy"], ans:1, ja:"民主主義" },
  { level:"B2", word:"philosophy", syl:["phi","LOS","o","phy"], ans:1, ja:"哲学" },
  { level:"C1", word:"phenomenon", syl:["phe","NOM","e","non"], ans:1, ja:"現象" },
  { level:"C1", word:"hierarchy", syl:["HI","er","ar","chy"], ans:0, ja:"階層" },
  { level:"B2", word:"project (名詞)", syl:["PROJ","ect"], ans:0, ja:"計画（名詞）", say:"project" },
  { level:"B2", word:"project (動詞)", syl:["pro","JECT"], ans:1, ja:"投影する（動詞）", say:"project" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To be honest, I'm not convinced yet.", q:"自然なチャンク区切りは？", choices:["To be honest, / I'm not convinced yet","To / be honest I'm not / convinced yet","To be / honest I'm not convinced / yet","To be honest I'm / not convinced yet"], explain:"前置きの副詞句/主節、で区切る。" },
  { level:"C1", text:"Given the circumstances, we did our best.", q:"自然なチャンク区切りは？", choices:["Given the circumstances, / we did our best","Given / the circumstances we did / our best","Given the / circumstances we did our / best","Given the circumstances we / did our best"], explain:"分詞句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「とりあえずビールで」を自然に言うと？", choices:["I'll start with a beer.","For now beer please.","Beer is tentative.","Anyway, beer."], explain:"I'll start with … が自然。直訳は不自然。" },
  { level:"C1", ja:"", text:"「察してください」を伝えたいとき英語では？", choices:["I'll let you read between the lines.","Please guess my mind.","Sense it please.","Understand without words."], explain:"read between the lines（行間を読む）で示唆。" },
  { level:"B2", ja:"", text:"「お疲れさまでした（退社時）」に近いのは？", choices:["Have a good evening!","You are tired good.","Thanks for your tiredness.","Good job tired."], explain:"退社時は Have a good evening! / See you tomorrow! が自然。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"相手の意見を引き出す：", choices:["What's your take on this?","Just agree with me.","Why think at all?","Don't bother sharing."], explain:"What's your take? で意見を促す。" },
  { level:"C1", text:"対立を再構成して前進させる：", choices:["Let's reframe this as a shared problem to solve.","You are simply wrong.","Let's just drop it.","One of us must lose."], explain:"共有の課題に再フレームして建設的に。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"褒められたときの自然な返し：", choices:["Thank you, that means a lot.","No, I am not good.","Why praise me?","That's obvious."], explain:"英語圏では否定せず感謝で受けるのが自然。" },
  { level:"C1", text:"会議で発言を遮らず入る：", choices:["If I could just add one thing...","Stop, listen to me.","You talk too much.","Be quiet now."], explain:"If I could just add … で丁寧に割り込む。" }
]);

/* 増量セットT：瞬間英作文・アクセント・コロケーション・チャンク・英語思考・異文化（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"少しお待ちください。", answer:"Just a moment, please.", alts:["Hold on a second."] },
  { level:"A2", ja:"問題ありません。", answer:"No problem at all.", alts:["That's totally fine."] },
  { level:"B1", ja:"後で詳しく説明します。", answer:"I'll explain it in detail later.", alts:["Let me go into detail later."] },
  { level:"B1", ja:"その件は把握しています。", answer:"I'm aware of that.", alts:["I'm on top of that."] },
  { level:"B1", ja:"代わりの案はありますか。", answer:"Do you have an alternative?", alts:["Is there another option?"] },
  { level:"B2", ja:"優先度を見直す必要があります。", answer:"We need to reassess the priorities.", alts:["Let's re-evaluate what comes first."] },
  { level:"B2", ja:"その判断はあなたに任せます。", answer:"I'll leave that call to you.", alts:["That decision is yours to make."] },
  { level:"B2", ja:"認識を合わせてから進めましょう。", answer:"Let's get aligned before moving forward.", alts:["Let's sync up before we proceed."] },
  { level:"C1", ja:"このリスクは許容範囲だと考えます。", answer:"I'd consider this risk acceptable.", alts:["This risk falls within tolerance."] },
  { level:"C1", ja:"長い目で見れば投資する価値があります。", answer:"In the long run, it's worth the investment.", alts:["Over time, the investment pays off."] }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ progress regularly.", q:"自然な語は？", choices:["track","make","do","give"], explain:"track progress（進捗を追う）。" },
  { level:"B2", text:"We need to ___ attention to detail.", q:"自然な語は？", choices:["pay","make","do","give"], explain:"pay attention（注意を払う）。" },
  { level:"B2", text:"Let's ___ a meeting for Monday.", q:"自然な語は？", choices:["schedule","make","do","put"], explain:"schedule a meeting（会議を設定する）。" },
  { level:"C1", text:"They will ___ ground in the market.", q:"自然な語は？", choices:["gain","make","do","take"], explain:"gain ground（地歩を固める）。" },
  { level:"C1", text:"Let's ___ a strong case for this.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a case（論拠を示す）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"opportunity", syl:["op","por","TU","ni","ty"], ans:2, ja:"機会" },
  { level:"B2", word:"necessary", syl:["NEC","es","sar","y"], ans:0, ja:"必要な" },
  { level:"B2", word:"available", syl:["a","VAIL","a","ble"], ans:1, ja:"利用可能な" },
  { level:"C1", word:"inevitable", syl:["in","EV","i","ta","ble"], ans:1, ja:"避けられない" },
  { level:"C1", word:"unanimous", syl:["u","NAN","i","mous"], ans:1, ja:"満場一致の" },
  { level:"B2", word:"present (名詞)", syl:["PRES","ent"], ans:0, ja:"贈り物（名詞）", say:"present" },
  { level:"B2", word:"present (動詞)", syl:["pre","SENT"], ans:1, ja:"提示する（動詞）", say:"present" },
  { level:"B2", word:"object (名詞)", syl:["OB","ject"], ans:0, ja:"物体（名詞）", say:"object" },
  { level:"B2", word:"object (動詞)", syl:["ob","JECT"], ans:1, ja:"反対する（動詞）", say:"object" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"In my opinion, we should wait.", q:"自然なチャンク区切りは？", choices:["In my opinion, / we should wait","In / my opinion we should / wait","In my / opinion we should wait","In my opinion we / should wait"], explain:"前置きの副詞句/主節、で区切る。" },
  { level:"C1", text:"All things considered, it went well.", q:"自然なチャンク区切りは？", choices:["All things considered, / it went well","All / things considered it / went well","All things / considered it went / well","All things considered it / went well"], explain:"独立分詞構文/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「よろしくお願いします（仕事の依頼後）」に近いのは？", choices:["Thanks in advance for your help.","Please do well to me.","I ask you kindly favor.","Best regards future."], explain:"Thanks in advance / I appreciate your help が自然。" },
  { level:"C1", ja:"", text:"「念のため」を文に添えるなら？", choices:["just in case","for the case","by the case","in any case only"], explain:"just in case ＝ 念のため。" },
  { level:"B2", ja:"", text:"「気のせいかも」を伝えるなら？", choices:["Maybe it's just me.","My feeling is fault.","It is air feeling.","Maybe my spirit."], explain:"Maybe it's just me. が自然。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の都合を尊重して切り出す：", choices:["Is now a good time to talk?","Talk to me right now.","You must listen now.","I will speak anyway."], explain:"Is now a good time? で相手の都合を尊重。" },
  { level:"C1", text:"異論を述べる前のクッション：", choices:["I see your point, but I'd add that...","You are wrong, listen.","That's a bad idea.","No, just no."], explain:"I see your point, but … で受けてから異論。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"議論を要約して確認する：", choices:["So, to recap, we agreed on three things.","Forget what we said.","No summary needed.","Let's just move on."], explain:"to recap で要点を確認し合意を固める。" },
  { level:"C1", text:"少数意見に配慮する：", choices:["Before we decide, does anyone see it differently?","Majority wins, done.","No other views matter.","Let's not ask."], explain:"異なる見方を募り少数意見に配慮。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"You're coming, right?", q:"付加疑問 right? の調子は？", choices:["上げる↗（確認）","下げる↘","平坦","強く下げる"], explain:"確認の付加疑問は上げ↗。" },
  { level:"C1", text:"That's interesting...", q:"含みを持たせる調子は？", choices:["語尾を伸ばし下げ気味↘","強く上げる↗","平坦に切る","早口で上げる"], explain:"含みは語尾を伸ばし下げ気味に。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I REALLY NEED to TALK to YOU.", q:"強く読む語は？", choices:["really / need / talk / you","I / to / to","to / to","均等"], explain:"内容語(really, need, talk, you)を強く。" },
  { level:"C1", text:"We've GOT to FINISH this by FIVE.", q:"強く読む語は？", choices:["got / finish / five","we've / to / this / by","to / by","均等"], explain:"内容語(got, finish, five)を強く。" }
]);

/* 増量セットV：瞬間英作文・アクセント・コロケーション他（6倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"了解です。", answer:"Got it.", alts:["Understood."] },
  { level:"A2", ja:"任せてください。", answer:"Leave it to me.", alts:["I've got this."] },
  { level:"B1", ja:"念のため共有します。", answer:"Just sharing this for reference.", alts:["I'll share this just in case."] },
  { level:"B1", ja:"問題があれば教えてください。", answer:"Let me know if there are any issues.", alts:["Tell me if anything comes up."] },
  { level:"B2", ja:"この方針で進めてよろしいですか。", answer:"Are you okay with proceeding this way?", alts:["Shall we move forward with this approach?"] },
  { level:"B2", ja:"懸念点を先に潰しておきましょう。", answer:"Let's address the concerns up front.", alts:["Let's clear the concerns first."] },
  { level:"B2", ja:"これは想定の範囲内です。", answer:"This is within our expectations.", alts:["This is no surprise."] },
  { level:"C1", ja:"短期的には痛手ですが長期的には妥当です。", answer:"It hurts short-term but makes sense long-term.", alts:["A short-term loss for a long-term gain."] },
  { level:"C1", ja:"トレードオフを明確にしましょう。", answer:"Let's make the trade-offs explicit.", alts:["Let's spell out the trade-offs."] },
  { level:"C1", ja:"成功基準を先に合意しておきたいです。", answer:"I'd like to agree on success criteria first.", alts:["Let's define what success looks like up front."] }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ ground rules.", q:"自然な語は？", choices:["set","make","do","give"], explain:"set ground rules（基本ルールを決める）。" },
  { level:"B2", text:"We need to ___ a balance.", q:"自然な語は？", choices:["strike","make","do","take"], explain:"strike a balance（バランスを取る）。" },
  { level:"B2", text:"They will ___ the gap.", q:"自然な語は？", choices:["bridge","make","do","give"], explain:"bridge the gap（隔たりを埋める）。" },
  { level:"C1", text:"Let's ___ the groundwork.", q:"自然な語は？", choices:["lay","make","do","put"], explain:"lay the groundwork（下地を作る）。" },
  { level:"C1", text:"We should ___ a precedent.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set a precedent（前例を作る）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"definitely", syl:["DEF","i","nite","ly"], ans:0, ja:"確かに" },
  { level:"B2", word:"comfortable", syl:["COMF","ta","ble"], ans:0, ja:"快適な" },
  { level:"B2", word:"vegetable", syl:["VEG","ta","ble"], ans:0, ja:"野菜" },
  { level:"C1", word:"deteriorate", syl:["de","TE","ri","o","rate"], ans:1, ja:"悪化する" },
  { level:"C1", word:"interpretation", syl:["in","ter","pre","TA","tion"], ans:3, ja:"解釈" },
  { level:"B2", word:"permit (名詞)", syl:["PER","mit"], ans:0, ja:"許可証（名詞）", say:"permit" },
  { level:"B2", word:"permit (動詞)", syl:["per","MIT"], ans:1, ja:"許可する（動詞）", say:"permit" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お先に失礼します」を退社時に言うなら？", choices:["I'm heading out, see you tomorrow.","I leave first sorry.","Excuse my early go.","Forgive earlier exit."], explain:"I'm heading out. / See you tomorrow! が自然。" },
  { level:"C1", ja:"", text:"「ご足労おかけします」に近いのは？", choices:["Thanks for coming all this way.","Sorry for your legs.","Thanks for your trouble walk.","Forgive the distance."], explain:"Thanks for coming all this way. が自然。" },
  { level:"B2", ja:"", text:"「とりあえず」を会話で使うなら？", choices:["For now, let's go with this.","Tentatively forever.","Anyway this thing.","First of all maybe."], explain:"For now ＝ とりあえず。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"合意点を確認して前進：", choices:["It sounds like we agree on the main goal.","Stop arguing now.","No agreement matters.","Let's just vote."], explain:"共通点を言語化して前進。" },
  { level:"C1", text:"行き詰まりを打開する：", choices:["What would need to be true for this to work?","This is hopeless.","Let's give up.","Nobody can fix this."], explain:"成立条件を問い、打開策を探る。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"贈り物を渡すときの一言：", choices:["It's just a little something.","This is expensive gift.","You must like this.","Take it now please."], explain:"It's just a little something. と控えめに渡すのが自然。" },
  { level:"C1", text:"批判をやわらげて伝える：", choices:["One thing we might improve is...","This is terrible work.","You did it wrong.","Fix everything now."], explain:"One thing we might improve … と建設的に。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Could you help me?", q:"丁寧な依頼の調子は？", choices:["やや上げる↗","強く下げる↘","平坦","語尾を切る"], explain:"丁寧な依頼はやや上げ↗で柔らかく。" },
  { level:"C1", text:"I suppose so.", q:"しぶしぶ同意の調子は？", choices:["平坦〜下げ気味でためらいを示す","強く上げる↗","明るく上げる","速く下げる"], explain:"気乗りしない同意は平坦〜下げ気味。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I CAN'T BELIEVE you DID that.", q:"強く読む語は？", choices:["can't / believe / did / that","I / you","you / that","均等"], explain:"can't（否定）と内容語を強く。" },
  { level:"C1", text:"We MUST DELIVER on TIME.", q:"強く読む語は？", choices:["must / deliver / time","we / on","on / the","均等"], explain:"must と内容語(deliver, time)を強く。" }
]);

/* 増量セットX：瞬間英作文・アクセント・コロケーション他（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"承知しました。", answer:"Understood.", alts:["Got it."] },
  { level:"A2", ja:"今行きます。", answer:"I'm coming now.", alts:["On my way."] },
  { level:"B1", ja:"少し席を外します。", answer:"I'll step away for a moment.", alts:["I'll be back shortly."] },
  { level:"B1", ja:"後ほど共有します。", answer:"I'll share it later.", alts:["Let me send it afterward."] },
  { level:"B1", ja:"何か手伝えますか。", answer:"Is there anything I can do?", alts:["Can I help with anything?"] },
  { level:"B2", ja:"認識のずれを早めに埋めましょう。", answer:"Let's close any gaps in understanding early.", alts:["Let's align before the gap widens."] },
  { level:"B2", ja:"優先度の根拠を教えてください。", answer:"Could you explain the reasoning behind the priorities?", alts:["What's driving these priorities?"] },
  { level:"B2", ja:"その案は持ち帰って検討します。", answer:"Let me take that back and think it over.", alts:["I'll consider that and get back to you."] },
  { level:"C1", ja:"リスクと見返りを天秤にかけましょう。", answer:"Let's weigh the risks against the rewards.", alts:["Let's balance risk and reward."] },
  { level:"C1", ja:"この決定は後戻りできるか確認したいです。", answer:"I'd like to check whether this decision is reversible.", alts:["Is this a one-way door?"] }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ momentum going.", q:"自然な語は？", choices:["keep","make","do","take"], explain:"keep momentum going（勢いを保つ）。" },
  { level:"B2", text:"We need to ___ a conclusion.", q:"自然な語は？", choices:["reach","make","do","give"], explain:"reach a conclusion（結論に達する）。" },
  { level:"B2", text:"They will ___ doubt on it.", q:"自然な語は？", choices:["cast","make","do","give"], explain:"cast doubt（疑念を投げかける）。" },
  { level:"C1", text:"Let's ___ a compromise.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a compromise（妥協に至る）。" },
  { level:"C1", text:"We should ___ the initiative.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take the initiative（主導権を握る）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"category", syl:["CAT","e","gor","y"], ans:0, ja:"カテゴリー" },
  { level:"B2", word:"ceremony", syl:["CER","e","mo","ny"], ans:0, ja:"式典" },
  { level:"B2", word:"temporary", syl:["TEM","po","rar","y"], ans:0, ja:"一時的な" },
  { level:"C1", word:"characteristic", syl:["char","ac","ter","IS","tic"], ans:3, ja:"特徴" },
  { level:"C1", word:"administration", syl:["ad","min","is","TRA","tion"], ans:3, ja:"管理" },
  { level:"B2", word:"rebel (名詞)", syl:["REB","el"], ans:0, ja:"反逆者（名詞）", say:"rebel" },
  { level:"B2", word:"rebel (動詞)", syl:["re","BEL"], ans:1, ja:"反逆する（動詞）", say:"rebel" },
  { level:"B2", word:"contract (名詞)", syl:["CON","tract"], ans:0, ja:"契約（名詞）", say:"contract" },
  { level:"B2", word:"contract (動詞)", syl:["con","TRACT"], ans:1, ja:"契約する（動詞）", say:"contract" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As far as I know, it's confirmed.", q:"自然なチャンク区切りは？", choices:["As far as I know, / it's confirmed","As / far as I know it's / confirmed","As far / as I know it's confirmed","As far as I / know it's confirmed"], explain:"前置きの副詞節/主節、で区切る。" },
  { level:"C1", text:"Needless to say, quality matters.", q:"自然なチャンク区切りは？", choices:["Needless to say, / quality matters","Needless / to say quality / matters","Needless to / say quality matters","Needless to say quality / matters"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「だいたいで大丈夫」を伝えるなら？", choices:["A rough estimate is fine.","Around is okay big.","Generally so much.","Almost is good yes."], explain:"A rough estimate is fine. が自然。" },
  { level:"C1", ja:"", text:"「手前味噌ですが」に近いのは？", choices:["If I may say so myself,","My own miso but,","Praising myself sorry,","Self-flatter but,"], explain:"If I may say so myself, が自然。" },
  { level:"B2", ja:"", text:"「念のためもう一度」を言うなら？", choices:["Just to be safe, let's check again.","For safe one more.","Carefully twice please.","Safety repeat now."], explain:"Just to be safe, … が自然。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を促して巻き込む：", choices:["I'd love to hear what you think.","You must speak now.","Why so quiet always?","Just stay silent."], explain:"意見を歓迎して巻き込む。" },
  { level:"C1", text:"前提を共有してから議論する：", choices:["Let's agree on the facts before debating.","Skip facts just argue.","Facts don't matter.","Let's fight first."], explain:"事実の合意を先に取り、生産的に議論。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"頼みごとの前置き：", choices:["I hate to ask, but could you...?","You must help me now.","Do this for me.","I order you to..."], explain:"I hate to ask, but … と低姿勢で切り出す。" },
  { level:"C1", text:"相手の面子を保つ断り方：", choices:["It's a great idea; the timing's just tough right now.","Your idea is bad.","No, never.","That won't work ever."], explain:"案自体は評価しつつ時期を理由に断る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Right?", q:"同意を求める Right? の調子は？", choices:["上げる↗","下げる↘","平坦","強く下げる"], explain:"同意確認の Right? は上げ↗。" },
  { level:"C1", text:"Well, it depends.", q:"留保を示す調子は？", choices:["depends を伸ばし下げ気味","強く上げる↗","平坦に切る","速く上げる"], explain:"留保は語を伸ばし下げ気味に。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"PLEASE DON'T FORGET to CALL.", q:"強く読む語は？", choices:["please / don't / forget / call","to","the / a","均等"], explain:"don't（否定）と内容語を強く。" },
  { level:"C1", text:"We SHOULD'VE STARTED much EARLIER.", q:"強く読む語は？", choices:["should've / started / earlier","we / much","much / the","均等"], explain:"内容語(started, earlier)と should've を強く。" }
]);

/* 増量セットZ：瞬間英作文・コロケーション・アクセント他（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  { level:"A2", ja:"すぐやります。", answer:"I'll do it right away.", alts:["On it now."] },
  { level:"A2", ja:"problemありません。", answer:"No problem.", alts:["That's fine."] },
  { level:"B1", ja:"念のため確認します。", answer:"Let me confirm just in case.", alts:["I'll double-check to be safe."] },
  { level:"B1", ja:"少し調整が必要です。", answer:"This needs a few tweaks.", alts:["It needs minor adjustments."] },
  { level:"B1", ja:"後で詳細を送ります。", answer:"I'll send the details later.", alts:["Details to follow."] },
  { level:"B2", ja:"認識のずれを確認しましょう。", answer:"Let's check where we might be misaligned.", alts:["Let's find any gaps in understanding."] },
  { level:"B2", ja:"その判断の根拠を共有してください。", answer:"Could you share the basis for that call?", alts:["What's behind that decision?"] },
  { level:"B2", ja:"優先順位を一緒に決めましょう。", answer:"Let's decide the priorities together.", alts:["Let's align on what comes first."] },
  { level:"C1", ja:"これは元に戻せる決定でしょうか。", answer:"Is this a reversible decision?", alts:["Can we undo this later if needed?"] },
  { level:"C1", ja:"トレードオフを明示しておきましょう。", answer:"Let's make the trade-offs explicit.", alts:["Let's spell out what we're giving up."] }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ the issue head-on.", q:"自然な語は？", choices:["tackle","make","do","give"], explain:"tackle an issue（問題に取り組む）。" },
  { level:"B2", text:"We need to ___ expectations.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set expectations（期待値を設定する）。" },
  { level:"B2", text:"They will ___ a risk assessment.", q:"自然な語は？", choices:["conduct","make","do","give"], explain:"conduct an assessment（評価を実施する）。" },
  { level:"C1", text:"Let's ___ consensus.", q:"自然な語は？", choices:["build","make","do","take"], explain:"build consensus（合意を形成する）。" },
  { level:"C1", text:"We should ___ accountability.", q:"自然な語は？", choices:["ensure","make","do","give"], explain:"ensure accountability（説明責任を確保する）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"photograph", syl:["PHO","to","graph"], ans:0, ja:"写真" },
  { level:"B2", word:"photographer", syl:["pho","TOG","ra","pher"], ans:1, ja:"写真家" },
  { level:"B2", word:"photographic", syl:["pho","to","GRAPH","ic"], ans:2, ja:"写真の" },
  { level:"C1", word:"hospitable", syl:["hos","PIT","a","ble"], ans:1, ja:"もてなしのよい" },
  { level:"C1", word:"comparable", syl:["COM","pa","ra","ble"], ans:0, ja:"比較できる" },
  { level:"B2", word:"convert (名詞)", syl:["CON","vert"], ans:0, ja:"改宗者（名詞）", say:"convert" },
  { level:"B2", word:"convert (動詞)", syl:["con","VERT"], ans:1, ja:"変換する（動詞）", say:"convert" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お任せします」を伝えるなら？", choices:["I'll leave it to you.","I throw to you.","You take all.","Do as you."], explain:"I'll leave it to you. が自然。" },
  { level:"C1", ja:"", text:"「無理しないでね」を伝えるなら？", choices:["Don't push yourself too hard.","No impossible please.","Don't do unreasonable.","Take it not hard."], explain:"Don't push yourself too hard. が自然。" },
  { level:"B2", ja:"", text:"「助かります」を伝えるなら？", choices:["That would really help.","You are helping me save.","Help is appreciated much.","I am helped yes."], explain:"That would really help. が自然。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"対立点を明確にして前進：", choices:["It seems we differ on the timeline—let's focus there.","Stop disagreeing now.","No difference matters.","Let's just vote."], explain:"相違点を特定して議論を集中。" },
  { level:"C1", text:"第三の選択肢を促す：", choices:["Is there an option we haven't considered?","Only two choices exist.","Stop thinking more.","Pick one of these two."], explain:"未検討の選択肢を引き出す。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"誘いを丁寧に断る：", choices:["I'd love to, but I already have plans.","No, I won't come.","Why invite me?","That sounds boring."], explain:"I'd love to, but … と理由を添えて断る。" },
  { level:"C1", text:"相手の提案を立てつつ補足：", choices:["That's a solid plan; one thing to consider is timing.","Your plan misses everything.","That won't work at all.","Redo it completely."], explain:"案を評価しつつ補足点を添える。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Are you sure?", q:"念押しの調子は？", choices:["上げる↗","下げる↘","平坦","強く下げる"], explain:"Yes/No疑問の念押しは上げ↗。" },
  { level:"C1", text:"I mean, it's fine, I guess.", q:"ためらいの調子は？", choices:["全体に下げ気味でためらいを示す","明るく上げる↗","強く言い切る","速く上げる"], explain:"ためらいは下げ気味＋区切りで。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I JUST WANT to MAKE SURE.", q:"強く読む語は？", choices:["just / want / make / sure","I / to","to / the","均等"], explain:"内容語(just, want, make, sure)を強く。" },
  { level:"C1", text:"We CAN'T AFFORD to WAIT any LONGER.", q:"強く読む語は？", choices:["can't / afford / wait / longer","we / to / any","to / any","均等"], explain:"can't と内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To begin with, let's set the goal.", q:"自然なチャンク区切りは？", choices:["To begin with, / let's set the goal","To / begin with let's set / the goal","To begin / with let's set the goal","To begin with let's / set the goal"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"That said, we should stay cautious.", q:"自然なチャンク区切りは？", choices:["That said, / we should stay cautious","That / said we should stay / cautious","That said we / should stay cautious","That said we should / stay cautious"], explain:"談話標識/主節、で区切る。" }
]);


/* 増量：瞬間英作文 大量（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"ありがとう、助かります。","answer":"Thanks, that helps.","alts":[]},
  {"level":"A2","ja":"ちょっと待ってね。","answer":"Hang on a sec.","alts":[]},
  {"level":"A2","ja":"もう一度お願いします。","answer":"Could you repeat that?","alts":[]},
  {"level":"A2","ja":"何時に会いますか。","answer":"What time should we meet?","alts":[]},
  {"level":"A2","ja":"どこで会いましょうか。","answer":"Where should we meet?","alts":[]},
  {"level":"A2","ja":"準備はできましたか。","answer":"Are you ready?","alts":[]},
  {"level":"A2","ja":"気をつけてね。","answer":"Take care.","alts":[]},
  {"level":"A2","ja":"楽しんできてね。","answer":"Have fun.","alts":[]},
  {"level":"A2","ja":"お大事に。","answer":"Get well soon.","alts":[]},
  {"level":"A2","ja":"おめでとう！","answer":"Congratulations!","alts":[]},
  {"level":"B1","ja":"それはいい考えですね。","answer":"That's a good idea.","alts":[]},
  {"level":"B1","ja":"少し時間をください。","answer":"Give me a moment.","alts":[]},
  {"level":"B1","ja":"後で確認します。","answer":"I'll check later.","alts":[]},
  {"level":"B1","ja":"念のため聞いておきます。","answer":"I'll ask just in case.","alts":[]},
  {"level":"B1","ja":"そろそろ行かないと。","answer":"I should get going.","alts":[]},
  {"level":"B1","ja":"連絡を取り合いましょう。","answer":"Let's keep in touch.","alts":[]},
  {"level":"B1","ja":"手伝いましょうか。","answer":"Do you need a hand?","alts":[]},
  {"level":"B1","ja":"それで大丈夫です。","answer":"That works for me.","alts":[]},
  {"level":"B1","ja":"もう少し詳しく教えて。","answer":"Tell me a bit more.","alts":[]},
  {"level":"B1","ja":"やってみる価値はある。","answer":"It's worth a try.","alts":[]},
  {"level":"B1","ja":"まだ決めていません。","answer":"I haven't decided yet.","alts":[]},
  {"level":"B1","ja":"だいたい分かりました。","answer":"I more or less get it.","alts":[]},
  {"level":"B1","ja":"なんとかなるでしょう。","answer":"We'll manage somehow.","alts":[]},
  {"level":"B2","ja":"優先順位をつけましょう。","answer":"Let's prioritize.","alts":[]},
  {"level":"B2","ja":"前提を確認させてください。","answer":"Let me check the assumptions.","alts":[]},
  {"level":"B2","ja":"それは持ち帰って検討します。","answer":"I'll take that back and consider it.","alts":[]},
  {"level":"B2","ja":"期待値を調整しましょう。","answer":"Let's manage expectations.","alts":[]},
  {"level":"B2","ja":"範囲を絞った方がいいです。","answer":"We should narrow the scope.","alts":[]},
  {"level":"B2","ja":"リスクを洗い出しましょう。","answer":"Let's identify the risks.","alts":[]},
  {"level":"B2","ja":"代替案を用意しています。","answer":"I have a backup plan ready.","alts":[]},
  {"level":"B2","ja":"その判断はお任せします。","answer":"I'll leave that decision to you.","alts":[]},
  {"level":"B2","ja":"早めに共有してください。","answer":"Please share it early.","alts":[]},
  {"level":"B2","ja":"根拠を教えてもらえますか。","answer":"Could you share the reasoning?","alts":[]},
  {"level":"B2","ja":"無理のない範囲でお願いします。","answer":"Only as much as is reasonable, please.","alts":[]},
  {"level":"B2","ja":"締切を少し延ばせますか。","answer":"Could we push the deadline a little?","alts":[]},
  {"level":"B2","ja":"方向性は合っていると思います。","answer":"I think we're heading the right way.","alts":[]},
  {"level":"B2","ja":"懸念点を先に潰しましょう。","answer":"Let's address the concerns first.","alts":[]},
  {"level":"C1","ja":"短期的な犠牲は長期の利益のためです。","answer":"The short-term sacrifice is for long-term gain.","alts":[]},
  {"level":"C1","ja":"この決定は元に戻せますか。","answer":"Is this decision reversible?","alts":[]},
  {"level":"C1","ja":"前提が崩れたので見直しが必要です。","answer":"The premise has shifted, so we need to revisit this.","alts":[]},
  {"level":"C1","ja":"これは慎重に進めるべき案件です。","answer":"This is something we should handle carefully.","alts":[]},
  {"level":"C1","ja":"長い目で見れば妥当な投資です。","answer":"In the long run, it's a sound investment.","alts":[]},
  {"level":"C1","ja":"不確実性を前提に計画しましょう。","answer":"Let's plan with uncertainty in mind.","alts":[]}
]);

/* 増量セットAB：アクセント・コロケーション他 大量（5倍ペース） */
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"calendar", syl:["CAL","en","dar"], ans:0, ja:"カレンダー" },
  { level:"B2", word:"committee", syl:["com","MIT","tee"], ans:1, ja:"委員会" },
  { level:"B2", word:"continue", syl:["con","TIN","ue"], ans:1, ja:"続ける" },
  { level:"B2", word:"develop", syl:["de","VEL","op"], ans:1, ja:"開発する" },
  { level:"B2", word:"environment", syl:["en","VI","ron","ment"], ans:1, ja:"環境" },
  { level:"B2", word:"familiar", syl:["fa","MIL","iar"], ans:1, ja:"よく知った" },
  { level:"B2", word:"important", syl:["im","POR","tant"], ans:1, ja:"重要な" },
  { level:"B2", word:"particular", syl:["par","TIC","u","lar"], ans:1, ja:"特定の" },
  { level:"C1", word:"accompany", syl:["ac","COM","pa","ny"], ans:1, ja:"同行する" },
  { level:"C1", word:"significant", syl:["sig","NIF","i","cant"], ans:1, ja:"重要な" },
  { level:"B2", word:"record (名詞)", syl:["REC","ord"], ans:0, ja:"記録（名詞）", say:"record" },
  { level:"B2", word:"record (動詞)", syl:["re","CORD"], ans:1, ja:"記録する（動詞）", say:"record" },
  { level:"B2", word:"insult (名詞)", syl:["IN","sult"], ans:0, ja:"侮辱（名詞）", say:"insult" },
  { level:"B2", word:"insult (動詞)", syl:["in","SULT"], ans:1, ja:"侮辱する（動詞）", say:"insult" }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a goal.", q:"自然な語は？", choices:["set","make","do","put"], explain:"set a goal（目標を設定する）。" },
  { level:"B2", text:"We need to ___ progress.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make progress（前進する）。" },
  { level:"B2", text:"They will ___ an effort.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make an effort（努力する）。" },
  { level:"B2", text:"Let's ___ a break.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a break（休憩する）。" },
  { level:"B2", text:"We should ___ research.", q:"自然な語は？", choices:["do","make","take","give"], explain:"do research（研究する）。" },
  { level:"B2", text:"Let's ___ a chance.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a chance（賭けてみる）。" },
  { level:"C1", text:"Let's ___ headway.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make headway（進展させる）。" },
  { level:"C1", text:"We should ___ scrutiny.", q:"自然な語は？", choices:["withstand","make","do","give"], explain:"withstand scrutiny（精査に耐える）。" },
  { level:"C1", text:"Let's ___ a foothold.", q:"自然な語は？", choices:["gain","make","do","take"], explain:"gain a foothold（足がかりを得る）。" },
  { level:"C1", text:"They will ___ the upper hand.", q:"自然な語は？", choices:["gain","make","do","give"], explain:"gain the upper hand（優位に立つ）。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"Frankly, I'm not so sure.", q:"自然なチャンク区切りは？", choices:["Frankly, / I'm not so sure","Frank / ly I'm not / so sure","Frankly I'm / not so sure","Frankly I'm not / so sure"], explain:"前置きの副詞/主節、で区切る。" },
  { level:"B2", text:"On the whole, it worked well.", q:"自然なチャンク区切りは？", choices:["On the whole, / it worked well","On / the whole it worked / well","On the / whole it worked well","On the whole it / worked well"], explain:"副詞句/主節、で区切る。" },
  { level:"C1", text:"Having said that, risks remain.", q:"自然なチャンク区切りは？", choices:["Having said that, / risks remain","Having / said that risks / remain","Having said / that risks remain","Having said that risks / remain"], explain:"分詞句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「とりあえず保留で」を伝えるなら？", choices:["Let's put it on hold for now.","Hold tentative please.","For now reserve it.","Pause maybe yes."], explain:"put it on hold ＝ 保留にする。" },
  { level:"B2", ja:"", text:"「あいにくですが」を伝えるなら？", choices:["Unfortunately, ...","Bad luck but...","Sadly truth is...","Regret to inform maybe..."], explain:"Unfortunately, … が自然。" },
  { level:"C1", ja:"", text:"「差し支えなければ」を伝えるなら？", choices:["If you don't mind my asking,","If no trouble for you,","If permitted kindly,","If acceptable maybe,"], explain:"If you don't mind … が自然。" },
  { level:"B2", ja:"", text:"「念のためですが」を文頭で言うなら？", choices:["Just to be clear,","For clear reason,","Clearly speaking now,","To clarify maybe,"], explain:"Just to be clear, ＝ 念のため明確にすると。" },
  { level:"C1", ja:"", text:"「言いにくいのですが」を伝えるなら？", choices:["This is a little awkward to say, but...","Hard to say word but...","Difficult speaking now...","Saying is tough but..."], explain:"This is a little awkward to say, but … が自然。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"初対面で打ち解ける一言：", choices:["It's great to finally meet you.","You must know me.","Why meet now?","Talk to me fast."], explain:"It's great to finally meet you. で好印象。" },
  { level:"B2", text:"相手の成功を祝う：", choices:["Congratulations—you really earned it!","Lucky you got it.","Why you succeed?","That's normal only."], explain:"努力を認めて祝うのが自然。" },
  { level:"C1", text:"反対意見を尊重しつつ述べる：", choices:["I respect that view; here's another angle.","Your view is wrong.","Only my view counts.","Stop thinking that."], explain:"相手の見解を尊重しつつ別の角度を示す。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"議論を脱線から戻す：", choices:["Let's bring it back to the main question.","Keep going off-topic.","No focus needed.","Talk about anything."], explain:"本題に引き戻す建設的な一言。" },
  { level:"B2", text:"相手の貢献を認める：", choices:["That's a really helpful point.","Your point is useless.","Why say that?","Stop contributing."], explain:"貢献を認めて議論を活性化。" },
  { level:"C1", text:"合意形成を促す：", choices:["Can we agree on this as a starting point?","Just obey me.","No agreement ever.","Let's not decide."], explain:"出発点としての合意を促す。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"You did what?", q:"驚きの調子は？", choices:["強く上げる↗","平坦に下げる","小さく下げる","ささやく"], explain:"驚きの聞き返しは強く上げ↗。" },
  { level:"B2", text:"Okay, sure.", q:"乗り気な同意の調子は？", choices:["明るく上げ気味↗","暗く下げる","平坦","ためらう"], explain:"乗り気な同意は明るく上げ気味。" },
  { level:"C1", text:"Well, that's one way to put it.", q:"含みのある調子は？", choices:["ゆっくり下げ気味で含みを残す","強く上げる","速く言い切る","明るく上げる"], explain:"含みは下げ気味＋間で示す。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I TOLD you it would WORK.", q:"強く読む語は？", choices:["told / work","I / you / it","you / it / would","均等"], explain:"内容語(told, work)を強く。" },
  { level:"B2", text:"PLEASE SEND it as SOON as POSSIBLE.", q:"強く読む語は？", choices:["please / send / soon / possible","it / as / as","as / as","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"We've NEVER SEEN anything LIKE it.", q:"強く読む語は？", choices:["never / seen / like","we've / anything / it","anything / it","均等"], explain:"never と内容語を強く。" }
]);


/* 増量：瞬間英作文 大量2（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"それで合っています。","answer":"That's correct.","alts":[]},
  {"level":"A2","ja":"まだ終わっていません。","answer":"I'm not done yet.","alts":[]},
  {"level":"A2","ja":"もう少しで終わります。","answer":"Almost there.","alts":[]},
  {"level":"A2","ja":"席を外していました。","answer":"I was away from my desk.","alts":[]},
  {"level":"A2","ja":"聞こえていますか。","answer":"Can you hear me?","alts":[]},
  {"level":"A2","ja":"画面が固まりました。","answer":"My screen froze.","alts":[]},
  {"level":"A2","ja":"あとでかけ直します。","answer":"I'll call back later.","alts":[]},
  {"level":"A2","ja":"よく聞こえません。","answer":"I can't hear you well.","alts":[]},
  {"level":"A2","ja":"資料を共有します。","answer":"I'll share the materials.","alts":[]},
  {"level":"A2","ja":"時間どおりです。","answer":"Right on time.","alts":[]},
  {"level":"B1","ja":"その点は同意できません。","answer":"I can't agree on that point.","alts":[]},
  {"level":"B1","ja":"代わりの提案があります。","answer":"I have an alternative suggestion.","alts":[]},
  {"level":"B1","ja":"順番に説明します。","answer":"Let me explain step by step.","alts":[]},
  {"level":"B1","ja":"誤解があったようです。","answer":"There seems to be a misunderstanding.","alts":[]},
  {"level":"B1","ja":"期限に間に合いそうです。","answer":"We should make the deadline.","alts":[]},
  {"level":"B1","ja":"それは想定外でした。","answer":"That was unexpected.","alts":[]},
  {"level":"B1","ja":"前向きに検討します。","answer":"I'll consider it positively.","alts":[]},
  {"level":"B1","ja":"意見をまとめます。","answer":"Let me summarize the opinions.","alts":[]},
  {"level":"B1","ja":"これは優先すべきです。","answer":"This should be a priority.","alts":[]},
  {"level":"B1","ja":"時間をもらえますか。","answer":"Could I have some time?","alts":[]},
  {"level":"B1","ja":"それで問題ありません。","answer":"That's no problem.","alts":[]},
  {"level":"B1","ja":"念のため記録します。","answer":"I'll note it just in case.","alts":[]},
  {"level":"B1","ja":"うまくいくと思います。","answer":"I think it'll work out.","alts":[]},
  {"level":"B2","ja":"認識を揃えてから進めましょう。","answer":"Let's align before we proceed.","alts":[]},
  {"level":"B2","ja":"前提を明確にしておきたいです。","answer":"I'd like to clarify the assumptions.","alts":[]},
  {"level":"B2","ja":"リスクを共有しておきます。","answer":"Let me flag the risks.","alts":[]},
  {"level":"B2","ja":"範囲を絞った方が良さそうです。","answer":"It seems better to narrow the scope.","alts":[]},
  {"level":"B2","ja":"根拠を示してもらえますか。","answer":"Could you show me the rationale?","alts":[]},
  {"level":"B2","ja":"代替案も検討すべきです。","answer":"We should consider alternatives too.","alts":[]},
  {"level":"B2","ja":"担当を明確にしましょう。","answer":"Let's clarify ownership.","alts":[]},
  {"level":"B2","ja":"これは持ち帰って検討します。","answer":"I'll take this back to consider.","alts":[]},
  {"level":"B2","ja":"決定を記録しておきましょう。","answer":"Let's document the decision.","alts":[]},
  {"level":"B2","ja":"現実的な計画にしましょう。","answer":"Let's keep the plan realistic.","alts":[]},
  {"level":"B2","ja":"懸念を先に潰しておきましょう。","answer":"Let's address concerns up front.","alts":[]},
  {"level":"B2","ja":"方向性を確認させてください。","answer":"Let me confirm the direction.","alts":[]},
  {"level":"B2","ja":"無理のない範囲で進めましょう。","answer":"Let's proceed at a sustainable pace.","alts":[]},
  {"level":"C1","ja":"短期の損失は長期の利益のためです。","answer":"The short-term loss serves a long-term gain.","alts":[]},
  {"level":"C1","ja":"前提が変わったので再検討が必要です。","answer":"The premise has changed, so we must reconsider.","alts":[]},
  {"level":"C1","ja":"成功の定義を先に合意しましょう。","answer":"Let's agree on the definition of success first.","alts":[]},
  {"level":"C1","ja":"不確実性を織り込んで計画しましょう。","answer":"Let's build uncertainty into the plan.","alts":[]},
  {"level":"C1","ja":"これは慎重に扱うべき案件です。","answer":"This is a matter to handle with care.","alts":[]},
  {"level":"C1","ja":"長期的には妥当な投資です。","answer":"In the long run, it's a reasonable investment.","alts":[]}
]);

/* 増量セットAD：アクセント・コロケーション他 大量2（5倍ペース） */
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"celebrate", syl:["CEL","e","brate"], ans:0, ja:"祝う" },
  { level:"B2", word:"determine", syl:["de","TER","mine"], ans:1, ja:"決定する" },
  { level:"B2", word:"establish", syl:["es","TAB","lish"], ans:1, ja:"確立する" },
  { level:"B2", word:"imagine", syl:["i","MAG","ine"], ans:1, ja:"想像する" },
  { level:"B2", word:"remember", syl:["re","MEM","ber"], ans:1, ja:"覚えている" },
  { level:"C1", word:"acknowledge", syl:["ac","KNOWL","edge"], ans:1, ja:"認める" },
  { level:"C1", word:"deliberate", syl:["de","LIB","er","ate"], ans:1, ja:"熟考する" },
  { level:"B2", word:"conflict (名詞)", syl:["CON","flict"], ans:0, ja:"対立（名詞）", say:"conflict" },
  { level:"B2", word:"conflict (動詞)", syl:["con","FLICT"], ans:1, ja:"対立する（動詞）", say:"conflict" },
  { level:"B2", word:"contrast (名詞)", syl:["CON","trast"], ans:0, ja:"対照（名詞）", say:"contrast" },
  { level:"B2", word:"contrast (動詞)", syl:["con","TRAST"], ans:1, ja:"対照する（動詞）", say:"contrast" },
  { level:"B2", word:"decrease (名詞)", syl:["DE","crease"], ans:0, ja:"減少（名詞）", say:"decrease" },
  { level:"B2", word:"decrease (動詞)", syl:["de","CREASE"], ans:1, ja:"減少する（動詞）", say:"decrease" }
]);
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ attention to this.", q:"自然な語は？", choices:["draw","make","do","take"], explain:"draw attention（注意を引く）。" },
  { level:"B2", text:"We need to ___ a promise.", q:"自然な語は？", choices:["keep","make","do","take"], explain:"keep a promise（約束を守る）。" },
  { level:"B2", text:"They will ___ a complaint.", q:"自然な語は？", choices:["file","make","do","give"], explain:"file a complaint（苦情を申し立てる）。" },
  { level:"B2", text:"Let's ___ a question.", q:"自然な語は？", choices:["raise","make","do","take"], explain:"raise a question（疑問を提起する）。" },
  { level:"B2", text:"We should ___ control.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take control（制御する）。" },
  { level:"C1", text:"Let's ___ a distinction.", q:"自然な語は？", choices:["draw","make","do","take"], explain:"draw a distinction（区別する）。" },
  { level:"C1", text:"We should ___ inroads.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make inroads（進出する）。" },
  { level:"C1", text:"Let's ___ traction.", q:"自然な語は？", choices:["gain","make","do","take"], explain:"gain traction（勢いを得る）。" },
  { level:"C1", text:"They will ___ a stance.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a stance（立場を取る）。" },
  { level:"C1", text:"Let's ___ light on this.", q:"自然な語は？", choices:["shed","make","do","take"], explain:"shed light（明らかにする）。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"By the way, did you call them?", q:"自然なチャンク区切りは？", choices:["By the way, / did you call them?","By / the way did you / call them","By the / way did you call them","By the way did you / call them"], explain:"前置きの句/主節、で区切る。" },
  { level:"B2", text:"After all, we did our best.", q:"自然なチャンク区切りは？", choices:["After all, / we did our best","After / all we did our / best","After all we / did our best","After all we did / our best"], explain:"副詞句/主節、で区切る。" },
  { level:"C1", text:"To put it simply, it failed.", q:"自然なチャンク区切りは？", choices:["To put it simply, / it failed","To / put it simply it / failed","To put / it simply it failed","To put it simply it / failed"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「気が向いたら」を伝えるなら？", choices:["If you feel like it,","If your spirit comes,","When mind turns,","If mood arrives,"], explain:"If you feel like it ＝ 気が向いたら。" },
  { level:"B2", ja:"", text:"「ざっくり言うと」を伝えるなら？", choices:["Roughly speaking,","Rough say now,","In big words,","Loosely talk,"], explain:"Roughly speaking ＝ ざっくり言うと。" },
  { level:"C1", ja:"", text:"「言うまでもなく」を伝えるなら？", choices:["Needless to say,","No need say,","Without saying word,","Of course speak,"], explain:"Needless to say ＝ 言うまでもなく。" },
  { level:"B2", ja:"", text:"「ついでに」を伝えるなら？", choices:["While you're at it,","While doing add,","On the way also,","Plus do it,"], explain:"While you're at it ＝ ついでに。" },
  { level:"C1", ja:"", text:"「率直に言うと」を伝えるなら？", choices:["To be frank,","Frank speaking yes,","With honest mouth,","Truly direct now,"], explain:"To be frank ＝ 率直に言うと。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"頼みを受けるときの一言：", choices:["Happy to help.","Why ask me?","That's a burden.","Do it yourself."], explain:"Happy to help. で快く受ける。" },
  { level:"B2", text:"遅刻を詫びるとき：", choices:["Sorry to keep you waiting.","Late is normal.","Why wait for me?","You should wait."], explain:"Sorry to keep you waiting. が自然。" },
  { level:"C1", text:"意見の相違を保ちつつ協調：", choices:["Let's agree to disagree on this.","You must agree.","One of us is wrong.","Stop disagreeing."], explain:"agree to disagree で協調的に相違を認める。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を促して場を開く：", choices:["Does anyone want to add to that?","Only I speak here.","No more talking.","Stop sharing now."], explain:"発言を歓迎して場を開く。" },
  { level:"C1", text:"前提を問い直して深める：", choices:["What if the opposite were true?","Stop questioning.","Assumptions are facts.","Don't think more."], explain:"逆を仮定して議論を深める。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Seriously?", q:"驚き・疑いの調子は？", choices:["強く上げる↗","平坦に下げる","小さく下げる","ささやく"], explain:"驚き・疑いは強く上げ↗。" },
  { level:"B2", text:"That's fine, I guess.", q:"渋々の調子は？", choices:["guess を伸ばし下げ気味","明るく上げる↗","強く言い切る","速く上げる"], explain:"渋々の同意は下げ気味＋間で。" },
  { level:"C1", text:"Interesting choice...", q:"含みのある調子は？", choices:["語尾を伸ばし下げ気味で含みを残す","明るく上げる","速く言い切る","強く上げる"], explain:"含みは語尾を伸ばし下げ気味に。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I REALLY APPRECIATE your HELP.", q:"強く読む語は？", choices:["really / appreciate / help","I / your","your / the","均等"], explain:"内容語(really, appreciate, help)を強く。" },
  { level:"B2", text:"Let's MAKE SURE it's DONE RIGHT.", q:"強く読む語は？", choices:["make / sure / done / right","let's / it's","it's / the","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"We CAN'T LET this SLIP through the CRACKS.", q:"強く読む語は？", choices:["can't / let / slip / cracks","we / this / the","this / the","均等"], explain:"can't と内容語を強く。" }
]);


/* 増量：瞬間英作文 大量3（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"また後で。","answer":"See you later.","alts":[]},
  {"level":"A2","ja":"もちろんです。","answer":"Of course.","alts":[]},
  {"level":"A2","ja":"分かりません。","answer":"I don't know.","alts":[]},
  {"level":"A2","ja":"大丈夫ですか。","answer":"Are you okay?","alts":[]},
  {"level":"A2","ja":"気にしないで。","answer":"Never mind.","alts":[]},
  {"level":"A2","ja":"お願いします。","answer":"Yes, please.","alts":[]},
  {"level":"A2","ja":"結構です。","answer":"No, thank you.","alts":[]},
  {"level":"A2","ja":"急いでいます。","answer":"I'm in a hurry.","alts":[]},
  {"level":"A2","ja":"そう思います。","answer":"I think so.","alts":[]},
  {"level":"A2","ja":"そうは思いません。","answer":"I don't think so.","alts":[]},
  {"level":"A2","ja":"多分ね。","answer":"Maybe.","alts":[]},
  {"level":"A2","ja":"本当に？","answer":"Really?","alts":[]},
  {"level":"A2","ja":"まさか。","answer":"No way.","alts":[]},
  {"level":"A2","ja":"やったね。","answer":"Way to go.","alts":[]},
  {"level":"B1","ja":"それは大変でしたね。","answer":"That must have been tough.","alts":[]},
  {"level":"B1","ja":"順調に進んでいます。","answer":"It's going smoothly.","alts":[]},
  {"level":"B1","ja":"まだ検討中です。","answer":"I'm still thinking about it.","alts":[]},
  {"level":"B1","ja":"もう少しで終わります。","answer":"I'm almost finished.","alts":[]},
  {"level":"B1","ja":"手伝ってくれてありがとう。","answer":"Thanks for your help.","alts":[]},
  {"level":"B1","ja":"遠慮なく言ってください。","answer":"Feel free to tell me.","alts":[]},
  {"level":"B1","ja":"それは初耳です。","answer":"That's news to me.","alts":[]},
  {"level":"B1","ja":"よく分かりました。","answer":"I understand completely.","alts":[]},
  {"level":"B1","ja":"考えておきます。","answer":"I'll think about it.","alts":[]},
  {"level":"B1","ja":"間に合いますか。","answer":"Will we make it in time?","alts":[]},
  {"level":"B1","ja":"急がなくていいですよ。","answer":"There's no rush.","alts":[]},
  {"level":"B1","ja":"どちらでもいいです。","answer":"Either is fine with me.","alts":[]},
  {"level":"B1","ja":"そろそろ始めましょう。","answer":"Let's get started.","alts":[]},
  {"level":"B1","ja":"休憩しましょう。","answer":"Let's take a break.","alts":[]},
  {"level":"B1","ja":"もう一度説明します。","answer":"Let me explain again.","alts":[]},
  {"level":"B1","ja":"それで決まりですね。","answer":"Then it's settled.","alts":[]},
  {"level":"B1","ja":"気が変わりました。","answer":"I changed my mind.","alts":[]},
  {"level":"B1","ja":"あなた次第です。","answer":"It's up to you.","alts":[]},
  {"level":"B2","ja":"認識を合わせておきたいです。","answer":"I'd like to get on the same page.","alts":[]},
  {"level":"B2","ja":"優先順位を確認させてください。","answer":"Let me confirm the priorities.","alts":[]},
  {"level":"B2","ja":"それは想定の範囲内です。","answer":"That's within expectations.","alts":[]},
  {"level":"B2","ja":"代替案を検討しましょう。","answer":"Let's consider alternatives.","alts":[]},
  {"level":"B2","ja":"その点は同意しかねます。","answer":"I have to disagree on that.","alts":[]},
  {"level":"B2","ja":"根拠を教えてもらえますか。","answer":"Could you give me the rationale?","alts":[]},
  {"level":"B2","ja":"前提条件を確認しましょう。","answer":"Let's check the prerequisites.","alts":[]},
  {"level":"B2","ja":"リスクを洗い出す必要があります。","answer":"We need to identify the risks.","alts":[]},
  {"level":"B2","ja":"期待値を調整しておきましょう。","answer":"Let's set expectations.","alts":[]},
  {"level":"B2","ja":"この件は持ち帰ります。","answer":"I'll take this back with me.","alts":[]},
  {"level":"B2","ja":"範囲を明確にしましょう。","answer":"Let's clarify the scope.","alts":[]},
  {"level":"B2","ja":"担当を決めておきましょう。","answer":"Let's assign ownership.","alts":[]},
  {"level":"B2","ja":"懸念があれば教えてください。","answer":"Let me know if you have concerns.","alts":[]},
  {"level":"B2","ja":"これは慎重に進めましょう。","answer":"Let's proceed carefully.","alts":[]},
  {"level":"B2","ja":"方向性は合っていますか。","answer":"Are we headed the right way?","alts":[]},
  {"level":"B2","ja":"無理のない範囲で進めます。","answer":"I'll proceed at a sustainable pace.","alts":[]},
  {"level":"B2","ja":"フィードバックをまとめます。","answer":"I'll consolidate the feedback.","alts":[]},
  {"level":"C1","ja":"短期的な痛みは長期の利益のためです。","answer":"Short-term pain serves long-term gain.","alts":[]},
  {"level":"C1","ja":"前提が変わったので再考が必要です。","answer":"The premise changed, so we should reconsider.","alts":[]},
  {"level":"C1","ja":"これは慎重に扱うべき案件です。","answer":"This warrants careful handling.","alts":[]},
  {"level":"C1","ja":"長期的には妥当な判断です。","answer":"It's a sound call in the long run.","alts":[]},
  {"level":"C1","ja":"機会費用も考慮すべきです。","answer":"We should weigh the opportunity cost.","alts":[]},
  {"level":"C1","ja":"最悪の事態に備えましょう。","answer":"Let's prepare for the worst case.","alts":[]}
]);

/* 増量セットAF：高次スキル各種 大量2（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a plan.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a plan（計画を立てる）。" },
  { level:"B2", text:"We need to ___ a risk.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a risk（リスクを取る）。" },
  { level:"B2", text:"They ___ a profit last year.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a profit（利益を出す）。" },
  { level:"B2", text:"Let's ___ a favor.", q:"自然な語は？", choices:["do","make","take","give"], explain:"do a favor（頼みを聞く）。" },
  { level:"B2", text:"We should ___ notice.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take notice（注目する）。" },
  { level:"B2", text:"Let's ___ a comment.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a comment（コメントする）。" },
  { level:"B2", text:"He ___ a speech yesterday.", q:"自然な語は？", choices:["gave","made","did","took"], explain:"give a speech（演説する）。" },
  { level:"B2", text:"Let's ___ an exception.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make an exception（例外を設ける）。" },
  { level:"C1", text:"Let's ___ ground rules.", q:"自然な語は？", choices:["lay","make","do","take"], explain:"lay ground rules（基本ルールを定める）。" },
  { level:"C1", text:"We should ___ a stand.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a stand（立場を明確にする）。" },
  { level:"C1", text:"Let's ___ doubt to rest.", q:"自然な語は？", choices:["put","make","do","take"], explain:"put doubt to rest（疑いを払拭する）。" },
  { level:"C1", text:"They ___ concessions.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make concessions（譲歩する）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"information", syl:["in","for","MA","tion"], ans:2, ja:"情報" },
  { level:"B2", word:"education", syl:["ed","u","CA","tion"], ans:2, ja:"教育" },
  { level:"B2", word:"celebration", syl:["cel","e","BRA","tion"], ans:2, ja:"祝賀" },
  { level:"B2", word:"organization", syl:["or","gan","i","ZA","tion"], ans:3, ja:"組織" },
  { level:"B2", word:"possibility", syl:["pos","si","BIL","i","ty"], ans:2, ja:"可能性" },
  { level:"C1", word:"responsibility", syl:["re","spon","si","BIL","i","ty"], ans:3, ja:"責任" },
  { level:"C1", word:"recommendation", syl:["rec","om","men","DA","tion"], ans:3, ja:"推薦" },
  { level:"B2", word:"export (名詞)", syl:["EX","port"], ans:0, ja:"輸出（名詞）", say:"export" },
  { level:"B2", word:"export (動詞)", syl:["ex","PORT"], ans:1, ja:"輸出する（動詞）", say:"export" },
  { level:"B2", word:"import (名詞)", syl:["IM","port"], ans:0, ja:"輸入（名詞）", say:"import" },
  { level:"B2", word:"import (動詞)", syl:["im","PORT"], ans:1, ja:"輸入する（動詞）", say:"import" },
  { level:"B2", word:"suspect (名詞)", syl:["SUS","pect"], ans:0, ja:"容疑者（名詞）", say:"suspect" },
  { level:"B2", word:"suspect (動詞)", syl:["sus","PECT"], ans:1, ja:"疑う（動詞）", say:"suspect" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To be fair, they tried hard.", q:"自然なチャンク区切りは？", choices:["To be fair, / they tried hard","To / be fair they tried / hard","To be / fair they tried hard","To be fair they / tried hard"], explain:"前置きの句/主節、で区切る。" },
  { level:"B2", text:"In other words, it failed.", q:"自然なチャンク区切りは？", choices:["In other words, / it failed","In / other words it / failed","In other / words it failed","In other words it / failed"], explain:"談話標識/主節、で区切る。" },
  { level:"C1", text:"That being said, we move on.", q:"自然なチャンク区切りは？", choices:["That being said, / we move on","That / being said we move / on","That being / said we move on","That being said we / move on"], explain:"独立分詞構文/主節、で区切る。" },
  { level:"B2", text:"As a result, sales rose.", q:"自然なチャンク区切りは？", choices:["As a result, / sales rose","As / a result sales / rose","As a / result sales rose","As a result sales / rose"], explain:"副詞句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「とりあえずやってみます」を伝えるなら？", choices:["I'll give it a shot for now.","I do tentative try.","First of all attempt.","Anyway I do it."], explain:"give it a shot ＝ やってみる。" },
  { level:"B2", ja:"", text:"「念のため確認します」を伝えるなら？", choices:["Let me check just to be sure.","For sure I confirm.","Carefully I check twice.","Safety confirm now."], explain:"just to be sure ＝ 念のため。" },
  { level:"C1", ja:"", text:"「ご存じかもしれませんが」を伝えるなら？", choices:["As you may know,","You maybe know that,","Perhaps knowing you,","If you know maybe,"], explain:"As you may know ＝ ご存じかもしれませんが。" },
  { level:"B2", ja:"", text:"「言い換えると」を伝えるなら？", choices:["In other words,","With other word,","Saying again now,","To repeat maybe,"], explain:"In other words ＝ 言い換えると。" },
  { level:"C1", ja:"", text:"「率直に申し上げて」を伝えるなら？", choices:["To put it bluntly,","Bluntly say now,","With blunt mouth,","Direct talking yes,"], explain:"To put it bluntly ＝ 率直に言うと。" },
  { level:"B2", ja:"", text:"「ちなみに」を伝えるなら？", choices:["By the way,","By the road,","On the way also,","Side note maybe,"], explain:"By the way ＝ ちなみに。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"会議で発言の順番を譲る：", choices:["Please, go ahead.","I speak first always.","You wait for me.","Be quiet now."], explain:"Please, go ahead. で順番を譲る。" },
  { level:"B2", text:"知らないことを正直に言う：", choices:["I'm not sure, let me find out.","I know everything.","Don't ask me that.","Why would I know?"], explain:"知らないと認め調べる姿勢が好印象。" },
  { level:"C1", text:"相手の時間を尊重して切り上げる：", choices:["I'll let you get back to your day.","Keep listening to me.","You have time for me.","Don't go yet."], explain:"相手の時間を尊重して締める。" },
  { level:"C1", text:"称賛を謙虚に受ける：", choices:["Thank you, it was a team effort.","Yes, I'm the best.","Of course I did it.","Naturally, it was me."], explain:"チームに功績を分けて謙虚に受ける。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"相手の論点を要約して確認：", choices:["So you're saying we should wait—is that right?","I wasn't listening.","Your point is wrong.","Let's not summarize."], explain:"要約して理解を確認し議論を進める。" },
  { level:"B2", text:"建設的に異論を述べる：", choices:["I see it a little differently—here's why.","You're completely wrong.","That's a bad idea.","Stop talking now."], explain:"違いを認めつつ理由を示す。" },
  { level:"C1", text:"議論を具体例で前進させる：", choices:["Can we ground this in a concrete example?","Stay abstract forever.","Examples are useless.","Let's not be specific."], explain:"具体例で議論を地に足のついたものにする。" },
  { level:"C1", text:"合意できない点を明確化：", choices:["Let's pinpoint exactly where we diverge.","Just agree with me.","No need to clarify.","Let's fight it out."], explain:"相違点を特定して生産的に進める。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"You're kidding!", q:"驚きの調子は？", choices:["強く上げる↗","平坦に下げる","小さく下げる","ささやく"], explain:"驚きの感嘆は強く上げ↗。" },
  { level:"B2", text:"I suppose so.", q:"気乗りしない同意の調子は？", choices:["平坦〜下げ気味でためらい","明るく上げる↗","強く言い切る","速く上げる"], explain:"気乗りしない同意は平坦〜下げ気味。" },
  { level:"B2", text:"Could you, possibly?", q:"丁寧な依頼の調子は？", choices:["やや上げて柔らかく","強く下げる","平坦に切る","速く下げる"], explain:"丁寧な依頼はやや上げて柔らかく。" },
  { level:"C1", text:"Well, it's complicated.", q:"留保を示す調子は？", choices:["complicated を伸ばし下げ気味","強く上げる","明るく上げる","速く言い切る"], explain:"留保は語を伸ばし下げ気味に。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I COMPLETELY UNDERSTAND your POINT.", q:"強く読む語は？", choices:["completely / understand / point","I / your","your / the","均等"], explain:"内容語(completely, understand, point)を強く。" },
  { level:"B2", text:"Let's FOCUS on what REALLY MATTERS.", q:"強く読む語は？", choices:["focus / really / matters","let's / on / what","on / what","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"We MUSTN'T LOSE SIGHT of the GOAL.", q:"強く読む語は？", choices:["mustn't / lose / sight / goal","we / of / the","of / the","均等"], explain:"mustn't と内容語を強く。" },
  { level:"C1", text:"It's NOT about BLAME; it's about LEARNING.", q:"強く読む語は？", choices:["not / blame / learning","it's / about / it's","about / it's","均等"], explain:"対比される内容語(not, blame, learning)を強く。" }
]);


/* 増量：瞬間英作文 大量4（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"こちらこそ。","answer":"Likewise.","alts":[]},
  {"level":"A2","ja":"お先にどうぞ。","answer":"After you.","alts":[]},
  {"level":"A2","ja":"そのとおり。","answer":"Exactly.","alts":[]},
  {"level":"A2","ja":"まさにそれ。","answer":"That's the one.","alts":[]},
  {"level":"A2","ja":"もう十分です。","answer":"That's enough.","alts":[]},
  {"level":"A2","ja":"今行きます。","answer":"I'm coming.","alts":[]},
  {"level":"A2","ja":"ちょっと失礼。","answer":"Excuse me a moment.","alts":[]},
  {"level":"A2","ja":"気が向いたら。","answer":"If I feel like it.","alts":[]},
  {"level":"A2","ja":"今日はここまで。","answer":"That's it for today.","alts":[]},
  {"level":"A2","ja":"遠慮します。","answer":"I'll pass.","alts":[]},
  {"level":"A2","ja":"楽しみにしてます。","answer":"I'm looking forward to it.","alts":[]},
  {"level":"A2","ja":"そうかもね。","answer":"Could be.","alts":[]},
  {"level":"A2","ja":"何でもないよ。","answer":"It's nothing.","alts":[]},
  {"level":"A2","ja":"だと思った。","answer":"I figured.","alts":[]},
  {"level":"A2","ja":"やっぱりね。","answer":"Just as I thought.","alts":[]},
  {"level":"B1","ja":"もう一度言ってもらえますか。","answer":"Could you say that again?","alts":[]},
  {"level":"B1","ja":"それで合っていますか。","answer":"Is that correct?","alts":[]},
  {"level":"B1","ja":"手短に言うと。","answer":"To make a long story short.","alts":[]},
  {"level":"B1","ja":"ご都合はいかがですか。","answer":"Does that suit you?","alts":[]},
  {"level":"B1","ja":"お役に立てて嬉しいです。","answer":"I'm glad I could help.","alts":[]},
  {"level":"B1","ja":"それは知りませんでした。","answer":"I had no idea.","alts":[]},
  {"level":"B1","ja":"まだ確定ではありません。","answer":"It's not final yet.","alts":[]},
  {"level":"B1","ja":"あとはお任せします。","answer":"I'll leave the rest to you.","alts":[]},
  {"level":"B1","ja":"そろそろ失礼します。","answer":"I should be going.","alts":[]},
  {"level":"B1","ja":"引き続きよろしく。","answer":"Thanks for your continued support.","alts":[]},
  {"level":"B1","ja":"問題が起きました。","answer":"A problem has come up.","alts":[]},
  {"level":"B1","ja":"なるべく早くお願いします。","answer":"As soon as possible, please.","alts":[]},
  {"level":"B1","ja":"そう簡単ではありません。","answer":"It's not that simple.","alts":[]},
  {"level":"B1","ja":"どうにかします。","answer":"I'll figure something out.","alts":[]},
  {"level":"B1","ja":"今のところ順調です。","answer":"So far so good.","alts":[]},
  {"level":"B1","ja":"もう少し時間が必要です。","answer":"I need a bit more time.","alts":[]},
  {"level":"B1","ja":"そこが問題なんです。","answer":"That's exactly the problem.","alts":[]},
  {"level":"B1","ja":"誤解だと思います。","answer":"I think it's a misunderstanding.","alts":[]},
  {"level":"B2","ja":"前向きに検討させてください。","answer":"Let me consider it positively.","alts":[]},
  {"level":"B2","ja":"現状を整理しましょう。","answer":"Let's take stock of where we are.","alts":[]},
  {"level":"B2","ja":"論点がずれています。","answer":"We're off topic.","alts":[]},
  {"level":"B2","ja":"そこは譲れません。","answer":"That's non-negotiable for me.","alts":[]},
  {"level":"B2","ja":"落としどころを探りましょう。","answer":"Let's find a compromise.","alts":[]},
  {"level":"B2","ja":"認識を共有させてください。","answer":"Let me share my understanding.","alts":[]},
  {"level":"B2","ja":"期限を再設定しましょう。","answer":"Let's reset the deadline.","alts":[]},
  {"level":"B2","ja":"根本原因を探りましょう。","answer":"Let's find the root cause.","alts":[]},
  {"level":"B2","ja":"それは想定の範囲内です。","answer":"That's within the expected range.","alts":[]},
  {"level":"B2","ja":"優先度を下げましょう。","answer":"Let's lower the priority.","alts":[]},
  {"level":"B2","ja":"段取りを確認しましょう。","answer":"Let's confirm the steps.","alts":[]},
  {"level":"B2","ja":"懸念を共有しておきます。","answer":"Let me flag my concern.","alts":[]},
  {"level":"B2","ja":"代案を持っています。","answer":"I have an alternative.","alts":[]},
  {"level":"B2","ja":"方針を固めましょう。","answer":"Let's settle on a direction.","alts":[]},
  {"level":"B2","ja":"そこは慎重にいきましょう。","answer":"Let's be careful there.","alts":[]},
  {"level":"B2","ja":"期待を擦り合わせましょう。","answer":"Let's align our expectations.","alts":[]},
  {"level":"B2","ja":"前提を疑ってみましょう。","answer":"Let's question the assumptions.","alts":[]},
  {"level":"B2","ja":"影響範囲を確認しましょう。","answer":"Let's check the scope of impact.","alts":[]},
  {"level":"B2","ja":"決め手に欠けます。","answer":"It lacks a deciding factor.","alts":[]},
  {"level":"B2","ja":"双方にとって良い案です。","answer":"It's good for both sides.","alts":[]},
  {"level":"C1","ja":"短期と長期を区別しましょう。","answer":"Let's distinguish short-term from long-term.","alts":[]},
  {"level":"C1","ja":"これは一方通行の決定です。","answer":"This is a one-way-door decision.","alts":[]},
  {"level":"C1","ja":"可逆な選択を優先しましょう。","answer":"Let's favor reversible choices.","alts":[]},
  {"level":"C1","ja":"前提が崩れたら見直します。","answer":"We'll revisit if the premise breaks.","alts":[]},
  {"level":"C1","ja":"成功の定義を共有しましょう。","answer":"Let's share the definition of success.","alts":[]},
  {"level":"C1","ja":"不確実性に強い計画にしましょう。","answer":"Let's make the plan robust to uncertainty.","alts":[]},
  {"level":"C1","ja":"慎重に扱うべき問題です。","answer":"It's an issue to handle with care.","alts":[]},
  {"level":"C1","ja":"長期的視点で判断しましょう。","answer":"Let's decide with a long-term view.","alts":[]},
  {"level":"C1","ja":"機会損失も考慮しましょう。","answer":"Let's account for the opportunity cost.","alts":[]},
  {"level":"C1","ja":"最悪を想定して備えましょう。","answer":"Let's plan for the worst and hope for the best.","alts":[]}
]);

/* 増量セットAH：高次スキル各種 大量3（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a decision.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a decision（決定する）。" },
  { level:"B2", text:"We need to ___ action.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take action（行動を起こす）。" },
  { level:"B2", text:"They ___ an apology.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an apology（謝罪する）。" },
  { level:"B2", text:"Let's ___ a difference.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a difference（違いを生む）。" },
  { level:"B2", text:"We should ___ a decision quickly.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a decision（決定に至る）。" },
  { level:"B2", text:"He ___ a risk by investing.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take a risk（リスクを取る）。" },
  { level:"B2", text:"Let's ___ progress on this.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make progress（進展する）。" },
  { level:"B2", text:"We ___ business with them.", q:"自然な語は？", choices:["do","make","take","give"], explain:"do business（取引する）。" },
  { level:"C1", text:"Let's ___ the groundwork.", q:"自然な語は？", choices:["lay","make","do","take"], explain:"lay the groundwork（下地を作る）。" },
  { level:"C1", text:"They ___ a precedent.", q:"自然な語は？", choices:["set","made","did","took"], explain:"set a precedent（前例を作る）。" },
  { level:"C1", text:"Let's ___ momentum.", q:"自然な語は？", choices:["build","make","do","take"], explain:"build momentum（勢いをつける）。" },
  { level:"C1", text:"We should ___ a compromise.", q:"自然な語は？", choices:["reach","make","do","give"], explain:"reach a compromise（妥協に達する）。" },
  { level:"C1", text:"Let's ___ the matter to rest.", q:"自然な語は？", choices:["put","make","do","take"], explain:"put the matter to rest（決着させる）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お手数おかけします」を伝えるなら？", choices:["Sorry to trouble you with this.","Trouble you sorry much.","Hand work sorry now.","Bother is sorry yes."], explain:"Sorry to trouble you ＝ お手数をかけて恐縮。" },
  { level:"B2", ja:"", text:"「念のためお伝えします」を伝えるなら？", choices:["Just so you're aware,","For knowing just,","Aware you should be,","Inform just maybe,"], explain:"Just so you're aware ＝ 念のためお伝えすると。" },
  { level:"C1", ja:"", text:"「差し支えなければ」を伝えるなら？", choices:["If it's not too much trouble,","If no big trouble for,","If acceptable to you maybe,","If permitted please,"], explain:"If it's not too much trouble ＝ 差し支えなければ。" },
  { level:"B2", ja:"", text:"「結論から言うと」を伝えるなら？", choices:["To get to the point,","Point first say now,","From conclusion talk,","End first maybe,"], explain:"To get to the point ＝ 結論から言うと。" },
  { level:"C1", ja:"", text:"「誤解のないように言うと」を伝えるなら？", choices:["To avoid any confusion,","No confuse please now,","Clear mistake avoid,","Misunderstand not maybe,"], explain:"To avoid any confusion ＝ 誤解のないように。" },
  { level:"B2", ja:"", text:"「正直なところ」を伝えるなら？", choices:["To be honest,","Honest place now,","With honest yes,","True saying maybe,"], explain:"To be honest ＝ 正直なところ。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"助けを申し出る丁寧な言い方：", choices:["Let me know if there's anything I can do.","I do everything for you.","You need my help now.","Why won't you ask?"], explain:"控えめに助けを申し出る定型。" },
  { level:"B2", text:"相手の意見に賛同を示す：", choices:["That's a great point.","Your point is obvious.","Why say that?","I knew that already."], explain:"That's a great point. で賛同を示す。" },
  { level:"C1", text:"丁寧に話題を変える：", choices:["On a different note, ...","Stop this topic now.","Change subject please.","I'm bored of this."], explain:"On a different note で自然に話題転換。" },
  { level:"C1", text:"批判をやわらげて伝える：", choices:["One small thing I'd suggest is...","You did this all wrong.","That's terrible work.","Redo everything now."], explain:"One small thing … で批判をやわらげる。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"議論を整理して焦点を絞る：", choices:["Let's narrow this down to one question.","Talk about everything.","No focus needed.","Keep it broad forever."], explain:"焦点を絞って議論を前進させる。" },
  { level:"B2", text:"相手の懸念を受け止める：", choices:["That's a valid concern—let's address it.","Your concern is silly.","Ignore that worry.","Stop worrying now."], explain:"懸念を認めて対処する姿勢。" },
  { level:"C1", text:"反証可能性を問う：", choices:["What evidence would change your mind?","Nothing changes my mind.","Evidence is useless.","Don't question it."], explain:"考えを変える証拠を問い議論を深める。" },
  { level:"C1", text:"合意を仮確定して前進：", choices:["Let's treat this as agreed for now and revisit.","Never agree on anything.","Decide nothing ever.","Let's argue more."], explain:"仮合意で前進し後で見直す。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"Generally speaking, it holds true.", q:"自然なチャンク区切りは？", choices:["Generally speaking, / it holds true","Generally / speaking it holds / true","Generally speaking it / holds true","Generally speaking it holds / true"], explain:"前置きの句/主節、で区切る。" },
  { level:"B2", text:"For instance, take this case.", q:"自然なチャンク区切りは？", choices:["For instance, / take this case","For / instance take this / case","For instance take / this case","For instance take this / case"], explain:"例示の句/主節、で区切る。" },
  { level:"C1", text:"All things being equal, choose simplicity.", q:"自然なチャンク区切りは？", choices:["All things being equal, / choose simplicity","All / things being equal choose / simplicity","All things / being equal choose simplicity","All things being equal choose / simplicity"], explain:"独立分詞句/主節、で区切る。" },
  { level:"B2", text:"At the end of the day, results matter.", q:"自然なチャンク区切りは？", choices:["At the end of the day, / results matter","At / the end of the day results / matter","At the end / of the day results matter","At the end of the day results / matter"], explain:"慣用句/主節、で区切る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"You think so?", q:"軽い疑問の調子は？", choices:["上げる↗","強く下げる","平坦","速く下げる"], explain:"確認の問いは上げ↗。" },
  { level:"B2", text:"Fine, whatever you say.", q:"投げやりな同意の調子は？", choices:["平坦〜下げ気味で気乗りしない","明るく上げる↗","強く言い切る","速く上げる"], explain:"投げやりは平坦〜下げ気味。" },
  { level:"C1", text:"That's... one way to look at it.", q:"含みの調子は？", choices:["間をおき下げ気味で含みを残す","明るく上げる","速く言い切る","強く上げる"], explain:"含みは間＋下げ気味で。" },
  { level:"B2", text:"Wait, really?", q:"驚いて聞き返す調子は？", choices:["really を強く上げる↗","下げて終える","平坦に切る","小さく言う"], explain:"驚きの聞き返しは強く上げ↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I'M NOT SURE that's the BEST IDEA.", q:"強く読む語は？", choices:["not / sure / best / idea","I'm / that's / the","that's / the","均等"], explain:"内容語と not を強く。" },
  { level:"B2", text:"Let's TAKE a STEP BACK for a SECOND.", q:"強く読む語は？", choices:["take / step / back / second","let's / a / for / a","a / for","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"It's WORTH DOING, even if it's HARD.", q:"強く読む語は？", choices:["worth / doing / hard","it's / even / if / it's","even / if","均等"], explain:"内容語(worth, doing, hard)を強く。" },
  { level:"C1", text:"The POINT isn't SPEED; it's ACCURACY.", q:"強く読む語は？", choices:["point / speed / accuracy","the / isn't / it's","isn't / it's","均等"], explain:"対比される内容語を強く。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"economy", syl:["e","CON","o","my"], ans:1, ja:"経済" },
  { level:"B2", word:"economic", syl:["ec","o","NOM","ic"], ans:2, ja:"経済の" },
  { level:"B2", word:"photographer", syl:["pho","TOG","ra","pher"], ans:1, ja:"写真家" },
  { level:"B2", word:"democracy", syl:["de","MOC","ra","cy"], ans:1, ja:"民主主義" },
  { level:"B2", word:"democratic", syl:["dem","o","CRAT","ic"], ans:2, ja:"民主的な" },
  { level:"C1", word:"phenomenon", syl:["phe","NOM","e","non"], ans:1, ja:"現象" },
  { level:"C1", word:"analysis", syl:["a","NAL","y","sis"], ans:1, ja:"分析" },
  { level:"B2", word:"protest (名詞)", syl:["PRO","test"], ans:0, ja:"抗議（名詞）", say:"protest" },
  { level:"B2", word:"protest (動詞)", syl:["pro","TEST"], ans:1, ja:"抗議する（動詞）", say:"protest" },
  { level:"B2", word:"rebel (名詞)", syl:["REB","el"], ans:0, ja:"反逆者（名詞）", say:"rebel" },
  { level:"B2", word:"rebel (動詞)", syl:["re","BEL"], ans:1, ja:"反抗する（動詞）", say:"rebel" },
  { level:"B2", word:"progress (名詞)", syl:["PROG","ress"], ans:0, ja:"進歩（名詞）", say:"progress" },
  { level:"B2", word:"progress (動詞)", syl:["pro","GRESS"], ans:1, ja:"進歩する（動詞）", say:"progress" }
]);


/* 増量：瞬間英作文 大量5（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"それで全部です。","answer":"That's all.","alts":[]},
  {"level":"A2","ja":"問題ないです。","answer":"It's all good.","alts":[]},
  {"level":"A2","ja":"まだ早いよ。","answer":"It's still early.","alts":[]},
  {"level":"A2","ja":"もう遅いよ。","answer":"It's getting late.","alts":[]},
  {"level":"A2","ja":"気にしてないよ。","answer":"I don't mind.","alts":[]},
  {"level":"A2","ja":"よくやった。","answer":"Good job.","alts":[]},
  {"level":"A2","ja":"惜しい。","answer":"So close.","alts":[]},
  {"level":"A2","ja":"信じられない。","answer":"I can't believe it.","alts":[]},
  {"level":"A2","ja":"そんな感じ。","answer":"Something like that.","alts":[]},
  {"level":"A2","ja":"たぶん無理。","answer":"Probably not.","alts":[]},
  {"level":"A2","ja":"どうかな。","answer":"I'm not sure.","alts":[]},
  {"level":"A2","ja":"そろそろだね。","answer":"It's about time.","alts":[]},
  {"level":"A2","ja":"今のところね。","answer":"For now.","alts":[]},
  {"level":"A2","ja":"そうだといいね。","answer":"I hope so.","alts":[]},
  {"level":"A2","ja":"またね。","answer":"Catch you later.","alts":[]},
  {"level":"B1","ja":"手が空いたら教えて。","answer":"Let me know when you're free.","alts":[]},
  {"level":"B1","ja":"それ、いいですね。","answer":"That sounds good.","alts":[]},
  {"level":"B1","ja":"よく考えますね。","answer":"Good thinking.","alts":[]},
  {"level":"B1","ja":"まさにそうです。","answer":"That's exactly it.","alts":[]},
  {"level":"B1","ja":"代わりにやります。","answer":"I'll do it instead.","alts":[]},
  {"level":"B1","ja":"今は控えます。","answer":"I'll hold off for now.","alts":[]},
  {"level":"B1","ja":"うまくいきそうです。","answer":"It looks promising.","alts":[]},
  {"level":"B1","ja":"お任せします。","answer":"It's your call.","alts":[]},
  {"level":"B1","ja":"急ぎではないです。","answer":"It's not urgent.","alts":[]},
  {"level":"B1","ja":"分担しましょう。","answer":"Let's split it up.","alts":[]},
  {"level":"B1","ja":"まとめておきます。","answer":"I'll put it together.","alts":[]},
  {"level":"B1","ja":"確認が取れました。","answer":"I got confirmation.","alts":[]},
  {"level":"B1","ja":"そこは大事ですね。","answer":"That's an important part.","alts":[]},
  {"level":"B1","ja":"順を追って進めます。","answer":"I'll go step by step.","alts":[]},
  {"level":"B1","ja":"それは助かります。","answer":"That would be a big help.","alts":[]},
  {"level":"B1","ja":"心当たりがあります。","answer":"I have an idea about that.","alts":[]},
  {"level":"B1","ja":"想定外でした。","answer":"That caught me off guard.","alts":[]},
  {"level":"B1","ja":"なんとか間に合いました。","answer":"We just made it.","alts":[]},
  {"level":"B1","ja":"引き続き見ておきます。","answer":"I'll keep an eye on it.","alts":[]},
  {"level":"B2","ja":"認識の相違を埋めましょう。","answer":"Let's close the gap in understanding.","alts":[]},
  {"level":"B2","ja":"論点を切り分けましょう。","answer":"Let's separate the issues.","alts":[]},
  {"level":"B2","ja":"そこが争点ですね。","answer":"That's the crux of it.","alts":[]},
  {"level":"B2","ja":"現実的な落としどころを探します。","answer":"Let's find a realistic middle ground.","alts":[]},
  {"level":"B2","ja":"前提を明示しておきます。","answer":"Let me state the assumptions.","alts":[]},
  {"level":"B2","ja":"優先度を見直しましょう。","answer":"Let's reassess the priorities.","alts":[]},
  {"level":"B2","ja":"影響を最小化しましょう。","answer":"Let's minimize the impact.","alts":[]},
  {"level":"B2","ja":"根拠が薄いと思います。","answer":"I find the basis weak.","alts":[]},
  {"level":"B2","ja":"代替案を比較しましょう。","answer":"Let's compare the alternatives.","alts":[]},
  {"level":"B2","ja":"担当範囲を明確にします。","answer":"I'll clarify the responsibilities.","alts":[]},
  {"level":"B2","ja":"期日を見直す必要があります。","answer":"We need to revisit the deadline.","alts":[]},
  {"level":"B2","ja":"懸念点を共有します。","answer":"Let me share the concerns.","alts":[]},
  {"level":"B2","ja":"方針を一致させましょう。","answer":"Let's align on the approach.","alts":[]},
  {"level":"B2","ja":"慎重に判断すべきです。","answer":"We should judge carefully.","alts":[]},
  {"level":"B2","ja":"擦り合わせが必要です。","answer":"We need to reconcile our views.","alts":[]},
  {"level":"B2","ja":"早めに動きましょう。","answer":"Let's act early.","alts":[]},
  {"level":"B2","ja":"想定の範囲内です。","answer":"It's within our expectations.","alts":[]},
  {"level":"B2","ja":"手戻りを避けたいです。","answer":"I want to avoid rework.","alts":[]},
  {"level":"B2","ja":"これで合意としましょう。","answer":"Let's call this agreed.","alts":[]},
  {"level":"B2","ja":"現状維持も選択肢です。","answer":"Staying the course is also an option.","alts":[]},
  {"level":"C1","ja":"可逆性を重視しましょう。","answer":"Let's prioritize reversibility.","alts":[]},
  {"level":"C1","ja":"前提の検証から始めましょう。","answer":"Let's start by testing the premise.","alts":[]},
  {"level":"C1","ja":"長期的な影響を見据えます。","answer":"Let's look at the long-term impact.","alts":[]},
  {"level":"C1","ja":"成功と失敗の基準を定めます。","answer":"Let's define what success and failure mean.","alts":[]},
  {"level":"C1","ja":"不確実性に備えた設計にします。","answer":"Let's design for uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を念頭に置きます。","answer":"Let's keep the opportunity cost in mind.","alts":[]},
  {"level":"C1","ja":"一方通行の決定は慎重に。","answer":"Let's be cautious with one-way doors.","alts":[]},
  {"level":"C1","ja":"短期と長期を切り分けます。","answer":"Let's separate short-term from long-term.","alts":[]},
  {"level":"C1","ja":"撤退条件を先に決めます。","answer":"Let's set exit criteria in advance.","alts":[]}
]);

/* 増量セットAJ：高次スキル各種 大量4（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a meeting.", q:"自然な語は？", choices:["hold","make","do","take"], explain:"hold a meeting（会議を開く）。" },
  { level:"B2", text:"We ___ a mistake.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a mistake（間違える）。" },
  { level:"B2", text:"Let's ___ a record.", q:"自然な語は？", choices:["keep","make","do","take"], explain:"keep a record（記録をつける）。" },
  { level:"B2", text:"They ___ an effort to improve.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an effort（努力する）。" },
  { level:"B2", text:"Let's ___ attention to detail.", q:"自然な語は？", choices:["pay","make","do","take"], explain:"pay attention（注意を払う）。" },
  { level:"B2", text:"We ___ a conclusion.", q:"自然な語は？", choices:["reached","made","did","took"], explain:"reach a conclusion（結論に達する）。" },
  { level:"C1", text:"Let's ___ the tone.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set the tone（雰囲気を決める）。" },
  { level:"C1", text:"They ___ headway on the issue.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make headway（進展する）。" },
  { level:"C1", text:"Let's ___ accountability clear.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make accountability clear（説明責任を明確にする）。" },
  { level:"C1", text:"We should ___ a balance.", q:"自然な語は？", choices:["strike","make","do","take"], explain:"strike a balance（バランスを取る）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「とはいえ」を文頭で言うなら？", choices:["That said,","That spoken,","With that yes,","Still saying,"], explain:"That said ＝ とはいえ。" },
  { level:"B2", ja:"", text:"「要するに」を伝えるなら？", choices:["In short,","Short say now,","To be brief maybe,","Sum up yes,"], explain:"In short ＝ 要するに。" },
  { level:"C1", ja:"", text:"「言わば」を伝えるなら？", choices:["so to speak,","speaking so yes,","as if saying,","in words maybe,"], explain:"so to speak ＝ 言わば。" },
  { level:"B2", ja:"", text:"「私の理解では」を伝えるなら？", choices:["The way I understand it,","My understand way,","I know it as,","Understanding mine yes,"], explain:"The way I understand it ＝ 私の理解では。" },
  { level:"C1", ja:"", text:"「公平を期すと」を伝えるなら？", choices:["In all fairness,","Fair all now,","With fairness yes,","To fair maybe,"], explain:"In all fairness ＝ 公平を期すと。" },
  { level:"B2", ja:"", text:"「いずれにせよ」を伝えるなら？", choices:["Either way,","Both road yes,","Any case now,","Whatever maybe,"], explain:"Either way ＝ いずれにせよ。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"会議を時間通りに締める：", choices:["Let's wrap up so we stay on time.","Keep going forever.","Time doesn't matter.","Let's run over."], explain:"時間を尊重して締める。" },
  { level:"B2", text:"相手の努力をねぎらう：", choices:["I know you put a lot into this.","You did nothing much.","Why bother?","That was easy for you."], explain:"努力を認めてねぎらう。" },
  { level:"C1", text:"反対を述べる前に共通点を示す：", choices:["We agree on the goal; the path is what differs.","You're just wrong.","No common ground.","Stop arguing."], explain:"共通点を示してから相違を述べる。" },
  { level:"C1", text:"感謝を具体的に伝える：", choices:["Your detailed notes saved me hours.","Thanks for whatever.","You helped I guess.","It was fine."], explain:"具体的に感謝を伝えると誠実に響く。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"前提を共有して議論を始める：", choices:["Let's agree on the basics first.","Skip the basics.","No need to align.","Let's just argue."], explain:"基礎合意から議論を始める。" },
  { level:"B2", text:"異なる視点を歓迎する：", choices:["I'd love to hear a different take.","Only my view matters.","No other views.","Stop disagreeing."], explain:"別視点を歓迎して議論を豊かにする。" },
  { level:"C1", text:"トレードオフを明確化する：", choices:["What are we trading off if we choose this?","No trade-offs exist.","Just pick one.","Don't analyze."], explain:"トレードオフを明示して判断を助ける。" },
  { level:"C1", text:"建設的に結論へ導く：", choices:["Where does that leave us on a decision?","Let's never decide.","Talk forever.","No conclusion needed."], explain:"議論を決定へと導く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"Of course, there are exceptions.", q:"自然なチャンク区切りは？", choices:["Of course, / there are exceptions","Of / course there are / exceptions","Of course there / are exceptions","Of course there are / exceptions"], explain:"前置きの句/主節、で区切る。" },
  { level:"B2", text:"In fact, it's quite common.", q:"自然なチャンク区切りは？", choices:["In fact, / it's quite common","In / fact it's quite / common","In fact it's / quite common","In fact it's quite / common"], explain:"談話標識/主節、で区切る。" },
  { level:"C1", text:"Granted, the risk is real.", q:"自然なチャンク区切りは？", choices:["Granted, / the risk is real","Granted / the risk is / real","Granted the / risk is real","Granted the risk is / real"], explain:"譲歩の語/主節、で区切る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Is that so?", q:"軽い驚きの調子は？", choices:["上げる↗","強く下げる","平坦","速く下げる"], explain:"軽い驚きの相槌は上げ↗。" },
  { level:"B2", text:"Right, of course.", q:"納得の調子は？", choices:["明るく下げる↘","強く上げる","平坦に切る","ためらう"], explain:"納得は明るく下げ↘。" },
  { level:"C1", text:"Hmm, let me think about that.", q:"熟考の調子は？", choices:["ゆっくり下げ気味で考える間を取る","速く上げる","強く言い切る","明るく上げる"], explain:"熟考は間＋下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's MAKE this DECISION TOGETHER.", q:"強く読む語は？", choices:["make / decision / together","let's / this","this / the","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"We VALUE QUALITY over QUANTITY.", q:"強く読む語は？", choices:["value / quality / quantity","we / over","over / the","均等"], explain:"対比される内容語を強く。" },
  { level:"B2", text:"PLEASE LET me KNOW if you NEED anything.", q:"強く読む語は？", choices:["please / let / know / need","me / if / you","if / you","均等"], explain:"内容語を強く、機能語は弱く。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"available", syl:["a","VAIL","a","ble"], ans:1, ja:"利用可能な" },
  { level:"B2", word:"experience", syl:["ex","PE","ri","ence"], ans:1, ja:"経験" },
  { level:"B2", word:"necessary", syl:["NEC","es","sar","y"], ans:0, ja:"必要な" },
  { level:"B2", word:"opportunity", syl:["op","por","TU","ni","ty"], ans:2, ja:"機会" },
  { level:"C1", word:"characteristic", syl:["char","ac","ter","IS","tic"], ans:3, ja:"特徴" },
  { level:"B2", word:"permit (名詞)", syl:["PER","mit"], ans:0, ja:"許可証（名詞）", say:"permit" },
  { level:"B2", word:"permit (動詞)", syl:["per","MIT"], ans:1, ja:"許可する（動詞）", say:"permit" },
  { level:"B2", word:"object (名詞)", syl:["OB","ject"], ans:0, ja:"物体（名詞）", say:"object" },
  { level:"B2", word:"object (動詞)", syl:["ob","JECT"], ans:1, ja:"反対する（動詞）", say:"object" }
]);


/* 増量：瞬間英作文 大量6（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もちろんいいよ。","answer":"Sure thing.","alts":[]},
  {"level":"A2","ja":"任せて。","answer":"I've got this.","alts":[]},
  {"level":"A2","ja":"やってみる。","answer":"I'll try.","alts":[]},
  {"level":"A2","ja":"そうしよう。","answer":"Let's do that.","alts":[]},
  {"level":"A2","ja":"いい考えだね。","answer":"Good idea.","alts":[]},
  {"level":"A2","ja":"気にしないで。","answer":"No worries.","alts":[]},
  {"level":"A2","ja":"残念だね。","answer":"That's too bad.","alts":[]},
  {"level":"A2","ja":"よかったね。","answer":"Good for you.","alts":[]},
  {"level":"A2","ja":"そろそろ行こう。","answer":"Let's get going.","alts":[]},
  {"level":"A2","ja":"もう少しだけ。","answer":"Just a little more.","alts":[]},
  {"level":"A2","ja":"今すぐは無理。","answer":"Not right now.","alts":[]},
  {"level":"A2","ja":"あとでね。","answer":"Later, okay?","alts":[]},
  {"level":"A2","ja":"まあいいか。","answer":"Oh well.","alts":[]},
  {"level":"A2","ja":"どうしよう。","answer":"What should I do?","alts":[]},
  {"level":"B1","ja":"もう一度試してみます。","answer":"I'll give it another try.","alts":[]},
  {"level":"B1","ja":"それなら安心です。","answer":"That's reassuring.","alts":[]},
  {"level":"B1","ja":"時間を作ります。","answer":"I'll make time.","alts":[]},
  {"level":"B1","ja":"うまく説明できません。","answer":"I can't explain it well.","alts":[]},
  {"level":"B1","ja":"少し休ませてください。","answer":"Let me take a short break.","alts":[]},
  {"level":"B1","ja":"思い出せません。","answer":"I can't recall.","alts":[]},
  {"level":"B1","ja":"間違えました。","answer":"I made a mistake.","alts":[]},
  {"level":"B1","ja":"確認しておきます。","answer":"I'll make sure.","alts":[]},
  {"level":"B1","ja":"それでお願いします。","answer":"Let's go with that.","alts":[]},
  {"level":"B1","ja":"どちらとも言えません。","answer":"I can't say either way.","alts":[]},
  {"level":"B1","ja":"そう単純ではないです。","answer":"It's not so straightforward.","alts":[]},
  {"level":"B1","ja":"なんとも言えません。","answer":"It's hard to say.","alts":[]},
  {"level":"B1","ja":"今は判断できません。","answer":"I can't judge right now.","alts":[]},
  {"level":"B1","ja":"前向きに考えます。","answer":"I'll think about it positively.","alts":[]},
  {"level":"B1","ja":"お役に立てれば。","answer":"I hope I can help.","alts":[]},
  {"level":"B2","ja":"現実的に考えましょう。","answer":"Let's be realistic.","alts":[]},
  {"level":"B2","ja":"論点を絞りましょう。","answer":"Let's narrow the focus.","alts":[]},
  {"level":"B2","ja":"前提を共有します。","answer":"Let me share the premise.","alts":[]},
  {"level":"B2","ja":"そこが肝心です。","answer":"That's the key.","alts":[]},
  {"level":"B2","ja":"落としどころを探ります。","answer":"Let's seek a compromise.","alts":[]},
  {"level":"B2","ja":"認識を合わせます。","answer":"Let me align our understanding.","alts":[]},
  {"level":"B2","ja":"影響を見極めます。","answer":"Let me assess the impact.","alts":[]},
  {"level":"B2","ja":"根拠を示します。","answer":"Let me give you the basis.","alts":[]},
  {"level":"B2","ja":"代替案を出します。","answer":"I'll offer an alternative.","alts":[]},
  {"level":"B2","ja":"担当を整理します。","answer":"Let me sort out ownership.","alts":[]},
  {"level":"B2","ja":"期限を調整します。","answer":"Let me adjust the timeline.","alts":[]},
  {"level":"B2","ja":"懸念を伝えておきます。","answer":"Let me raise a concern.","alts":[]},
  {"level":"B2","ja":"方針を確認します。","answer":"Let me confirm the approach.","alts":[]},
  {"level":"B2","ja":"慎重に進めます。","answer":"I'll proceed with caution.","alts":[]},
  {"level":"B2","ja":"擦り合わせをします。","answer":"Let me reconcile the views.","alts":[]},
  {"level":"B2","ja":"早めに着手します。","answer":"I'll get started early.","alts":[]},
  {"level":"B2","ja":"想定内の結果です。","answer":"It's an expected outcome.","alts":[]},
  {"level":"B2","ja":"手戻りを防ぎます。","answer":"Let me prevent rework.","alts":[]},
  {"level":"B2","ja":"これで合意とします。","answer":"Let's consider it agreed.","alts":[]},
  {"level":"B2","ja":"現状維持も検討します。","answer":"I'll also consider staying put.","alts":[]},
  {"level":"C1","ja":"可逆性を確保します。","answer":"Let me ensure reversibility.","alts":[]},
  {"level":"C1","ja":"前提を検証します。","answer":"Let me verify the premise.","alts":[]},
  {"level":"C1","ja":"長期影響を見ます。","answer":"Let me look at long-term effects.","alts":[]},
  {"level":"C1","ja":"成功基準を定めます。","answer":"Let me define success criteria.","alts":[]},
  {"level":"C1","ja":"不確実性に備えます。","answer":"Let me prepare for uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を考えます。","answer":"Let me weigh the opportunity cost.","alts":[]},
  {"level":"C1","ja":"一方通行は避けます。","answer":"Let me avoid one-way doors.","alts":[]},
  {"level":"C1","ja":"最悪に備えます。","answer":"Let me plan for the worst.","alts":[]},
  {"level":"C1","ja":"短期と長期を分けます。","answer":"Let me separate short and long term.","alts":[]},
  {"level":"C1","ja":"撤退条件を決めます。","answer":"Let me set exit criteria.","alts":[]}
]);

/* 増量セットAL：高次スキル各種 仕上げ（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a goal we can hit.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set a goal（目標を設定する）。" },
  { level:"B2", text:"They ___ great care with it.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take care（注意を払う）。" },
  { level:"B2", text:"Let's ___ a suggestion.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a suggestion（提案する）。" },
  { level:"B2", text:"We ___ an agreement.", q:"自然な語は？", choices:["reached","made","did","took"], explain:"reach an agreement（合意に達する）。" },
  { level:"C1", text:"Let's ___ the foundation.", q:"自然な語は？", choices:["lay","make","do","take"], explain:"lay the foundation（基礎を築く）。" },
  { level:"C1", text:"They ___ a name for themselves.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a name for oneself（名を上げる）。" },
  { level:"C1", text:"Let's ___ common ground.", q:"自然な語は？", choices:["find","make","do","take"], explain:"find common ground（共通点を見出す）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「念のため申し添えると」を伝えるなら？", choices:["Just to add,","Add just now,","For safety add,","Plus saying maybe,"], explain:"Just to add ＝ 念のため申し添えると。" },
  { level:"B2", ja:"", text:"「まとめると」を伝えるなら？", choices:["To sum up,","Sum now please,","In total say,","End up maybe,"], explain:"To sum up ＝ まとめると。" },
  { level:"C1", ja:"", text:"「強いて言えば」を伝えるなら？", choices:["If anything,","If forced say,","Strong saying yes,","Maybe if must,"], explain:"If anything ＝ 強いて言えば。" },
  { level:"B2", ja:"", text:"「一方で」を伝えるなら？", choices:["On the other hand,","Other hand now,","One side yes,","Against it maybe,"], explain:"On the other hand ＝ 一方で。" },
  { level:"C1", ja:"", text:"「率直に申し上げにくいのですが」を伝えるなら？", choices:["This is hard to say, but...","Hard mouth say but...","Difficult talk now...","Saying tough maybe..."], explain:"This is hard to say, but … が自然。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"会議冒頭で和ませる：", choices:["Thanks everyone for making the time.","You had to come.","Why are you late?","Let's just start."], explain:"参加への感謝で和ませる。" },
  { level:"B2", text:"相手のミスを責めずに指摘：", choices:["I think there might be a small mix-up here.","You messed this up.","This is all wrong.","How careless of you."], explain:"責めずに穏やかに指摘する。" },
  { level:"C1", text:"意見の相違を尊重して終える：", choices:["We may not fully agree, and that's okay.","You must agree with me.","One of us is wrong.","Stop disagreeing now."], explain:"相違を尊重して締める。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言の意図を確認する：", choices:["Just to clarify, do you mean X?","I ignored what you said.","Your meaning is wrong.","No need to clarify."], explain:"意図を確認して誤解を防ぐ。" },
  { level:"C1", text:"議論の前提をそろえる：", choices:["Let's agree on what we're solving first.","Skip the problem.","No need to define.","Let's just argue."], explain:"解くべき問題をそろえて議論する。" },
  { level:"C1", text:"建設的に締めくくる：", choices:["What's our next concrete step?","Let's talk forever.","No action needed.","Decide nothing."], explain:"次の具体行動を決めて締める。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"Ultimately, it's your decision.", q:"自然なチャンク区切りは？", choices:["Ultimately, / it's your decision","Ultimate / ly it's your / decision","Ultimately it's / your decision","Ultimately it's your / decision"], explain:"前置きの副詞/主節、で区切る。" },
  { level:"C1", text:"Broadly speaking, the trend holds.", q:"自然なチャンク区切りは？", choices:["Broadly speaking, / the trend holds","Broadly / speaking the trend / holds","Broadly speaking the / trend holds","Broadly speaking the trend / holds"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Sounds good to me.", q:"前向きな同意の調子は？", choices:["明るく下げる↘","強く上げる","平坦に切る","ためらう"], explain:"前向きな同意は明るく下げ↘。" },
  { level:"C1", text:"I'll have to think about that.", q:"保留の調子は？", choices:["think を伸ばし下げ気味で保留を示す","明るく上げる","速く言い切る","強く上げる"], explain:"保留は語を伸ばし下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"I THINK we SHOULD WAIT a BIT.", q:"強く読む語は？", choices:["think / should / wait / bit","I / we / a","we / a","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"It's ABOUT PROGRESS, not PERFECTION.", q:"強く読む語は？", choices:["progress / perfection","it's / about / not","about / not","均等"], explain:"対比される内容語を強く。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"comfortable", syl:["COM","fort","a","ble"], ans:0, ja:"快適な" },
  { level:"B2", word:"vegetable", syl:["VEG","e","ta","ble"], ans:0, ja:"野菜" },
  { level:"C1", word:"inevitable", syl:["in","EV","i","ta","ble"], ans:1, ja:"避けられない" },
  { level:"B2", word:"transfer (名詞)", syl:["TRANS","fer"], ans:0, ja:"移動（名詞）", say:"transfer" },
  { level:"B2", word:"transfer (動詞)", syl:["trans","FER"], ans:1, ja:"移す（動詞）", say:"transfer" },
  { level:"B2", word:"refund (名詞)", syl:["RE","fund"], ans:0, ja:"返金（名詞）", say:"refund" },
  { level:"B2", word:"refund (動詞)", syl:["re","FUND"], ans:1, ja:"返金する（動詞）", say:"refund" }
]);


/* 増量：瞬間英作文 大量7（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"そうだね。","answer":"That's right.","alts":[]},
  {"level":"A2","ja":"なるほどね。","answer":"I see.","alts":[]},
  {"level":"A2","ja":"了解です。","answer":"Will do.","alts":[]},
  {"level":"A2","ja":"本当に？","answer":"For real?","alts":[]},
  {"level":"A2","ja":"いいね。","answer":"Nice.","alts":[]},
  {"level":"A2","ja":"うまくいった。","answer":"It worked.","alts":[]},
  {"level":"A2","ja":"もう少し。","answer":"Almost.","alts":[]},
  {"level":"A2","ja":"大丈夫だよ。","answer":"It's okay.","alts":[]},
  {"level":"A2","ja":"そうしよう。","answer":"Let's.","alts":[]},
  {"level":"A2","ja":"また明日。","answer":"See you tomorrow.","alts":[]},
  {"level":"B1","ja":"ちょっと考えさせて。","answer":"Let me think for a sec.","alts":[]},
  {"level":"B1","ja":"それは助かる。","answer":"That helps a lot.","alts":[]},
  {"level":"B1","ja":"準備しておくね。","answer":"I'll get it ready.","alts":[]},
  {"level":"B1","ja":"まだ途中です。","answer":"I'm still on it.","alts":[]},
  {"level":"B1","ja":"もう一度確認します。","answer":"Let me check once more.","alts":[]},
  {"level":"B1","ja":"それで進めます。","answer":"I'll go ahead with that.","alts":[]},
  {"level":"B1","ja":"心配いりません。","answer":"No need to worry.","alts":[]},
  {"level":"B1","ja":"よく分かりました。","answer":"That's clear now.","alts":[]},
  {"level":"B1","ja":"引き受けます。","answer":"I'll take it on.","alts":[]},
  {"level":"B1","ja":"そこは同感です。","answer":"I agree on that.","alts":[]},
  {"level":"B1","ja":"少し違います。","answer":"It's a little different.","alts":[]},
  {"level":"B1","ja":"時間が押しています。","answer":"We're running short on time.","alts":[]},
  {"level":"B1","ja":"順調そうですね。","answer":"Looks like it's going well.","alts":[]},
  {"level":"B1","ja":"改めて相談します。","answer":"Let me consult you again.","alts":[]},
  {"level":"B2","ja":"要点を整理します。","answer":"Let me organize the key points.","alts":[]},
  {"level":"B2","ja":"前提を確認しましょう。","answer":"Let's confirm the premise.","alts":[]},
  {"level":"B2","ja":"そこが分かれ目です。","answer":"That's the turning point.","alts":[]},
  {"level":"B2","ja":"妥協点を探ります。","answer":"Let me look for a compromise.","alts":[]},
  {"level":"B2","ja":"認識をそろえます。","answer":"Let me align understanding.","alts":[]},
  {"level":"B2","ja":"影響を評価します。","answer":"Let me evaluate the impact.","alts":[]},
  {"level":"B2","ja":"根拠を補足します。","answer":"Let me add the rationale.","alts":[]},
  {"level":"B2","ja":"別案を検討します。","answer":"Let me consider another option.","alts":[]},
  {"level":"B2","ja":"分担を見直します。","answer":"Let me revisit the division.","alts":[]},
  {"level":"B2","ja":"期日を再調整します。","answer":"Let me reschedule.","alts":[]},
  {"level":"B2","ja":"懸念を明示します。","answer":"Let me state the concern.","alts":[]},
  {"level":"B2","ja":"方針を固めます。","answer":"Let me settle the direction.","alts":[]},
  {"level":"B2","ja":"丁寧に進めます。","answer":"I'll proceed thoughtfully.","alts":[]},
  {"level":"B2","ja":"先手を打ちます。","answer":"Let me get ahead of it.","alts":[]},
  {"level":"C1","ja":"可逆な判断を選びます。","answer":"Let me choose a reversible call.","alts":[]},
  {"level":"C1","ja":"前提を疑います。","answer":"Let me question the premise.","alts":[]},
  {"level":"C1","ja":"長期で評価します。","answer":"Let me judge over the long run.","alts":[]},
  {"level":"C1","ja":"成功条件を共有します。","answer":"Let me share the success conditions.","alts":[]},
  {"level":"C1","ja":"不確実性に強くします。","answer":"Let me make it robust to uncertainty.","alts":[]},
  {"level":"C1","ja":"一方通行を避けます。","answer":"Let me steer clear of one-way doors.","alts":[]},
  {"level":"C1","ja":"最悪を見込みます。","answer":"Let me account for the worst case.","alts":[]}
]);


/* 増量：瞬間英作文 大量8（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"席を取っておきます。","answer":"I'll save you a seat.","alts":[]},
  {"level":"A2","ja":"先に始めてください。","answer":"Please start without me.","alts":[]},
  {"level":"A2","ja":"席を替わりましょうか。","answer":"Shall we switch seats?","alts":[]},
  {"level":"A2","ja":"手伝いましょうか。","answer":"Want some help?","alts":[]},
  {"level":"A2","ja":"一緒に行きましょう。","answer":"Let's go together.","alts":[]},
  {"level":"A2","ja":"それで結構です。","answer":"That's fine with me.","alts":[]},
  {"level":"A2","ja":"よくできました。","answer":"Well done.","alts":[]},
  {"level":"A2","ja":"気にしないで。","answer":"Don't mention it.","alts":[]},
  {"level":"A2","ja":"ご親切にどうも。","answer":"That's very kind.","alts":[]},
  {"level":"A2","ja":"楽しかったです。","answer":"I had a great time.","alts":[]},
  {"level":"A2","ja":"また誘ってください。","answer":"Invite me again sometime.","alts":[]},
  {"level":"A2","ja":"久しぶりですね。","answer":"It's been a while.","alts":[]},
  {"level":"A2","ja":"お元気でしたか。","answer":"How have you been?","alts":[]},
  {"level":"A2","ja":"お先に失礼します。","answer":"I'll head out first.","alts":[]},
  {"level":"B1","ja":"それは良い質問ですね。","answer":"That's a good question.","alts":[]},
  {"level":"B1","ja":"考えたこともなかった。","answer":"I never thought of that.","alts":[]},
  {"level":"B1","ja":"なるほど、一理ある。","answer":"That makes sense.","alts":[]},
  {"level":"B1","ja":"同感です。","answer":"I feel the same way.","alts":[]},
  {"level":"B1","ja":"そこは微妙ですね。","answer":"That's a gray area.","alts":[]},
  {"level":"B1","ja":"意見が分かれそうです。","answer":"Opinions may differ.","alts":[]},
  {"level":"B1","ja":"もう少し情報が欲しい。","answer":"I'd like more information.","alts":[]},
  {"level":"B1","ja":"時間をかけて考えます。","answer":"I'll take time to think.","alts":[]},
  {"level":"B1","ja":"今は決められません。","answer":"I can't decide right now.","alts":[]},
  {"level":"B1","ja":"そう簡単ではないです。","answer":"It's not that easy.","alts":[]},
  {"level":"B1","ja":"なんとか乗り切ります。","answer":"I'll get through it somehow.","alts":[]},
  {"level":"B1","ja":"引き続き頑張ります。","answer":"I'll keep at it.","alts":[]},
  {"level":"B1","ja":"うまくいくといいですね。","answer":"I hope it works out.","alts":[]},
  {"level":"B1","ja":"その意気です。","answer":"That's the spirit.","alts":[]},
  {"level":"B2","ja":"論点を整理しましょう。","answer":"Let's organize the points.","alts":[]},
  {"level":"B2","ja":"前提を確認させてください。","answer":"Let me confirm the premise.","alts":[]},
  {"level":"B2","ja":"認識を合わせましょう。","answer":"Let's get aligned.","alts":[]},
  {"level":"B2","ja":"優先順位をつけましょう。","answer":"Let's set priorities.","alts":[]},
  {"level":"B2","ja":"リスクを洗い出します。","answer":"I'll identify the risks.","alts":[]},
  {"level":"B2","ja":"代替案を検討します。","answer":"I'll consider alternatives.","alts":[]},
  {"level":"B2","ja":"根拠を共有します。","answer":"Let me share the rationale.","alts":[]},
  {"level":"B2","ja":"期限を再調整します。","answer":"I'll reschedule the deadline.","alts":[]},
  {"level":"B2","ja":"懸念を伝えておきます。","answer":"Let me flag a concern.","alts":[]},
  {"level":"B2","ja":"方針を固めましょう。","answer":"Let's settle the direction.","alts":[]},
  {"level":"B2","ja":"擦り合わせが必要です。","answer":"We need to reconcile views.","alts":[]},
  {"level":"B2","ja":"早めに着手しましょう。","answer":"Let's start early.","alts":[]},
  {"level":"B2","ja":"想定内の結果です。","answer":"It's an expected result.","alts":[]},
  {"level":"B2","ja":"手戻りを防ぎましょう。","answer":"Let's prevent rework.","alts":[]},
  {"level":"B2","ja":"これで合意としましょう。","answer":"Let's call this settled.","alts":[]},
  {"level":"B2","ja":"現状維持も一案です。","answer":"Staying put is an option too.","alts":[]},
  {"level":"B2","ja":"影響範囲を確認します。","answer":"Let me check the scope of impact.","alts":[]},
  {"level":"B2","ja":"決め手に欠けます。","answer":"It lacks a clincher.","alts":[]},
  {"level":"C1","ja":"可逆性を重視します。","answer":"I'll prioritize reversibility.","alts":[]},
  {"level":"C1","ja":"長期視点で考えます。","answer":"Let me think long-term.","alts":[]},
  {"level":"C1","ja":"成功の定義を共有します。","answer":"Let me share the definition of success.","alts":[]},
  {"level":"C1","ja":"トレードオフを明示します。","answer":"Let me make the trade-offs explicit.","alts":[]},
  {"level":"C1","ja":"仮説を立てて検証します。","answer":"Let me form and test a hypothesis.","alts":[]},
  {"level":"C1","ja":"前例を踏まえて判断します。","answer":"Let me decide based on precedent.","alts":[]},
  {"level":"C1","ja":"想定外に強い設計にします。","answer":"Let me design for the unexpected.","alts":[]},
  {"level":"C1","ja":"因果と相関を区別します。","answer":"Let me distinguish cause from correlation.","alts":[]}
]);


/* 増量：瞬間英作文 大量9（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"どうぞお構いなく。","answer":"Please don't trouble yourself.","alts":[]},
  {"level":"A2","ja":"お言葉に甘えて。","answer":"I'll take you up on that.","alts":[]},
  {"level":"A2","ja":"とんでもないです。","answer":"Not at all.","alts":[]},
  {"level":"A2","ja":"助かりました。","answer":"That was a big help.","alts":[]},
  {"level":"A2","ja":"おかげさまで。","answer":"Thanks to you.","alts":[]},
  {"level":"A2","ja":"ご無沙汰しています。","answer":"It's been too long.","alts":[]},
  {"level":"A2","ja":"お大事に。","answer":"Take care of yourself.","alts":[]},
  {"level":"A2","ja":"行ってきます。","answer":"I'm off.","alts":[]},
  {"level":"A2","ja":"ただいま戻りました。","answer":"I'm back.","alts":[]},
  {"level":"A2","ja":"いただきます。","answer":"Let's eat.","alts":[]},
  {"level":"A2","ja":"ごちそうさまでした。","answer":"That was delicious.","alts":[]},
  {"level":"A2","ja":"失礼しました。","answer":"Excuse me.","alts":[]},
  {"level":"A2","ja":"お邪魔します。","answer":"Pardon the intrusion.","alts":[]},
  {"level":"A2","ja":"お疲れさまです。","answer":"Thanks for your hard work.","alts":[]},
  {"level":"A2","ja":"よろしくお願いします。","answer":"I look forward to working with you.","alts":[]},
  {"level":"B1","ja":"ご都合に合わせます。","answer":"I'll work around your schedule.","alts":[]},
  {"level":"B1","ja":"無理はしないでください。","answer":"Please don't push yourself.","alts":[]},
  {"level":"B1","ja":"お気持ちだけで十分です。","answer":"The thought is enough.","alts":[]},
  {"level":"B1","ja":"遠慮なくどうぞ。","answer":"Please go ahead.","alts":[]},
  {"level":"B1","ja":"それなら安心です。","answer":"That's a relief.","alts":[]},
  {"level":"B1","ja":"よく覚えていますね。","answer":"You have a good memory.","alts":[]},
  {"level":"B1","ja":"そう言っていただけると。","answer":"It means a lot to hear that.","alts":[]},
  {"level":"B1","ja":"あいにくですが。","answer":"Unfortunately.","alts":[]},
  {"level":"B1","ja":"念のためですが。","answer":"Just in case.","alts":[]},
  {"level":"B1","ja":"もしよろしければ。","answer":"If you don't mind.","alts":[]},
  {"level":"B1","ja":"差し支えなければ。","answer":"If it's not an inconvenience.","alts":[]},
  {"level":"B1","ja":"お役に立てれば幸いです。","answer":"I hope this helps.","alts":[]},
  {"level":"B1","ja":"気が向いたらどうぞ。","answer":"Whenever you feel like it.","alts":[]},
  {"level":"B1","ja":"ご自由にどうぞ。","answer":"Help yourself.","alts":[]},
  {"level":"B1","ja":"お待たせしました。","answer":"Thanks for waiting.","alts":[]},
  {"level":"B2","ja":"現実的に見積もりましょう。","answer":"Let's estimate realistically.","alts":[]},
  {"level":"B2","ja":"前提条件を洗い直します。","answer":"Let me re-examine the prerequisites.","alts":[]},
  {"level":"B2","ja":"そこが核心です。","answer":"That's the heart of it.","alts":[]},
  {"level":"B2","ja":"影響を見極めましょう。","answer":"Let's gauge the impact.","alts":[]},
  {"level":"B2","ja":"根拠を補強します。","answer":"Let me strengthen the rationale.","alts":[]},
  {"level":"B2","ja":"別の選択肢を出します。","answer":"Let me offer another option.","alts":[]},
  {"level":"B2","ja":"分担を整理しましょう。","answer":"Let's sort out the division.","alts":[]},
  {"level":"B2","ja":"期日を見直しましょう。","answer":"Let's revisit the deadline.","alts":[]},
  {"level":"B2","ja":"懸念を明示しておきます。","answer":"Let me make my concern explicit.","alts":[]},
  {"level":"B2","ja":"そこは慎重にいきましょう。","answer":"Let's tread carefully there.","alts":[]},
  {"level":"B2","ja":"先手を打ちましょう。","answer":"Let's stay ahead of it.","alts":[]},
  {"level":"B2","ja":"想定の範囲内です。","answer":"It's within the expected range.","alts":[]},
  {"level":"B2","ja":"手戻りを最小化します。","answer":"Let me minimize the rework.","alts":[]},
  {"level":"B2","ja":"これで合意としましょう。","answer":"Let's treat this as agreed.","alts":[]},
  {"level":"B2","ja":"現状維持も視野に入れます。","answer":"Let me keep the status quo in view.","alts":[]},
  {"level":"C1","ja":"可逆な選択を優先します。","answer":"Let me favor reversible choices.","alts":[]},
  {"level":"C1","ja":"前提から検証します。","answer":"Let me verify from the premise.","alts":[]},
  {"level":"C1","ja":"長期で最適化します。","answer":"Let me optimize for the long run.","alts":[]},
  {"level":"C1","ja":"成功基準を先に定めます。","answer":"Let me set success criteria first.","alts":[]},
  {"level":"C1","ja":"不確実性に強い設計です。","answer":"It's a design robust to uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を勘案します。","answer":"Let me factor in the opportunity cost.","alts":[]},
  {"level":"C1","ja":"一方通行は慎重に。","answer":"Let me be cautious with one-way doors.","alts":[]},
  {"level":"C1","ja":"最悪を想定します。","answer":"Let me assume the worst case.","alts":[]},
  {"level":"C1","ja":"短期と長期を切り分けます。","answer":"Let me separate short from long term.","alts":[]},
  {"level":"C1","ja":"撤退条件を明確にします。","answer":"Let me clarify the exit criteria.","alts":[]},
  {"level":"C1","ja":"因果関係を確かめます。","answer":"Let me confirm the causality.","alts":[]},
  {"level":"C1","ja":"仮説を検証します。","answer":"Let me test the hypothesis.","alts":[]},
  {"level":"C1","ja":"前例に学びます。","answer":"Let me learn from precedent.","alts":[]},
  {"level":"C1","ja":"想定外に備えます。","answer":"Let me prepare for the unexpected.","alts":[]},
  {"level":"C1","ja":"根本原因を突き止めます。","answer":"Let me pin down the root cause.","alts":[]}
]);

/* 増量セットAN：高次スキル各種 大量5（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ an impression.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make an impression（印象を与える）。" },
  { level:"B2", text:"They ___ a promise to us.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a promise（約束する）。" },
  { level:"B2", text:"Let's ___ a chance.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a chance（賭けてみる）。" },
  { level:"B2", text:"We ___ research on this.", q:"自然な語は？", choices:["did","made","took","gave"], explain:"do research（調査する）。" },
  { level:"B2", text:"Let's ___ a complaint.", q:"自然な語は？", choices:["lodge","make","do","take"], explain:"lodge a complaint（苦情を申し立てる）。" },
  { level:"B2", text:"They ___ a fortune.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a fortune（大金を稼ぐ）。" },
  { level:"B2", text:"Let's ___ a toast.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a toast（乾杯の音頭を取る）。" },
  { level:"B2", text:"We ___ a survey.", q:"自然な語は？", choices:["conducted","made","did","took"], explain:"conduct a survey（調査を行う）。" },
  { level:"C1", text:"Let's ___ a contribution.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a contribution（貢献する）。" },
  { level:"C1", text:"They ___ steps to fix it.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take steps（措置を講じる）。" },
  { level:"C1", text:"Let's ___ a case for it.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a case（論拠を示す）。" },
  { level:"C1", text:"We should ___ pressure on them.", q:"自然な語は？", choices:["put","make","do","take"], explain:"put pressure（圧力をかける）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"participate", syl:["par","TIC","i","pate"], ans:1, ja:"参加する" },
  { level:"B2", word:"communicate", syl:["com","MU","ni","cate"], ans:1, ja:"伝える" },
  { level:"B2", word:"investigate", syl:["in","VES","ti","gate"], ans:1, ja:"調査する" },
  { level:"B2", word:"negotiate", syl:["ne","GO","ti","ate"], ans:1, ja:"交渉する" },
  { level:"B2", word:"appreciate", syl:["ap","PRE","ci","ate"], ans:1, ja:"感謝する" },
  { level:"C1", word:"authenticity", syl:["au","then","TIC","i","ty"], ans:2, ja:"真正性" },
  { level:"C1", word:"sustainability", syl:["sus","tain","a","BIL","i","ty"], ans:3, ja:"持続可能性" },
  { level:"B2", word:"insult (名詞)", syl:["IN","sult"], ans:0, ja:"侮辱（名詞）", say:"insult" },
  { level:"B2", word:"insult (動詞)", syl:["in","SULT"], ans:1, ja:"侮辱する（動詞）", say:"insult" },
  { level:"B2", word:"contract (名詞)", syl:["CON","tract"], ans:0, ja:"契約（名詞）", say:"contract" },
  { level:"B2", word:"contract (動詞)", syl:["con","TRACT"], ans:1, ja:"契約する（動詞）", say:"contract" },
  { level:"B2", word:"increase (名詞)", syl:["IN","crease"], ans:0, ja:"増加（名詞）", say:"increase" },
  { level:"B2", word:"increase (動詞)", syl:["in","CREASE"], ans:1, ja:"増加する（動詞）", say:"increase" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As far as I know, it's fine.", q:"自然なチャンク区切りは？", choices:["As far as I know, / it's fine","As / far as I know it's / fine","As far as / I know it's fine","As far as I know it's / fine"], explain:"前置きの節/主節、で区切る。" },
  { level:"B2", text:"To begin with, let's review.", q:"自然なチャンク区切りは？", choices:["To begin with, / let's review","To / begin with let's / review","To begin / with let's review","To begin with let's / review"], explain:"前置き句/主節、で区切る。" },
  { level:"C1", text:"Given the constraints, we adapted.", q:"自然なチャンク区切りは？", choices:["Given the constraints, / we adapted","Given / the constraints we / adapted","Given the / constraints we adapted","Given the constraints we / adapted"], explain:"分詞句/主節、で区切る。" },
  { level:"B2", text:"More importantly, it works.", q:"自然なチャンク区切りは？", choices:["More importantly, / it works","More / importantly it / works","More importantly it / works","More importantly it works /"], explain:"談話標識/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「お言葉ですが」を伝えるなら？", choices:["With respect,","With word but,","Respect saying yes,","If allowed word,"], explain:"With respect ＝ お言葉ですが（丁寧な反論）。" },
  { level:"B2", text:"「念のため繰り返しますが」を伝えるなら？", choices:["Just to reiterate,","Repeat just for safe,","Again saying now,","To repeat maybe yes,"], explain:"Just to reiterate ＝ 念のため繰り返すと。", ja:"" },
  { level:"C1", ja:"", text:"「率直に言って驚きました」を伝えるなら？", choices:["Frankly, I was surprised.","Frank surprise me was.","Honest shock I had.","Direct surprised yes."], explain:"Frankly, I was surprised. が自然。" },
  { level:"B2", ja:"", text:"「言うなれば」を伝えるなら？", choices:["So to speak,","Say if can,","As to say now,","In word maybe,"], explain:"So to speak ＝ 言うなれば。" },
  { level:"C1", ja:"", text:"「結論を先に言うと」を伝えるなら？", choices:["To cut to the chase,","Cut chase first now,","End say before,","Quick point maybe,"], explain:"To cut to the chase ＝ 結論を先に言うと。" },
  { level:"B2", ja:"", text:"「逆に言えば」を伝えるなら？", choices:["Conversely,","Reverse say now,","Opposite talk yes,","Back word maybe,"], explain:"Conversely ＝ 逆に言えば。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"会議で時間を意識して促す：", choices:["In the interest of time, let's move on.","Time is gone, hurry.","Stop wasting time.","We're too slow always."], explain:"In the interest of time で丁寧に促す。" },
  { level:"B2", text:"相手の貢献を具体的に認める：", choices:["Your analysis really moved this forward.","You did something I guess.","It was okay work.","Anyone could do that."], explain:"具体的に貢献を認めると誠実。" },
  { level:"C1", text:"反論を質問の形で和らげる：", choices:["Have we considered the downside here?","You're wrong about this.","That's a bad idea.","Stop suggesting that."], explain:"質問形で反論を和らげる。" },
  { level:"C1", text:"断りつつ関係を保つ：", choices:["I can't this time, but please keep me in mind.","No, never ask again.","That's impossible for me.","Don't bother asking."], explain:"断りつつ将来の余地を残す。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を引き出して巻き込む：", choices:["What's your read on this?","Only I decide here.","No input needed.","Stop talking now."], explain:"意見を引き出して巻き込む。" },
  { level:"B2", text:"論点を一つに絞る：", choices:["Let's focus on the core question.","Talk about all things.","No focus needed.","Keep it vague."], explain:"核心の問いに焦点を絞る。" },
  { level:"C1", text:"前提の違いを明確化する：", choices:["I think we're starting from different assumptions.","You're just wrong.","Assumptions don't matter.","Let's not analyze."], explain:"前提の違いを明確にして議論を整理。" },
  { level:"C1", text:"合意を確認して前進する：", choices:["So we agree on X—shall we move to Y?","Let's never agree.","Decide nothing.","Keep arguing forever."], explain:"合意を確認し次へ進む。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"You don't say.", q:"皮肉な相槌の調子は？", choices:["平坦〜下げ気味で淡々と","強く上げる↗","明るく上げる","速く上げる"], explain:"皮肉な相槌は平坦〜下げ気味で。" },
  { level:"B2", text:"Could be better.", q:"控えめな評価の調子は？", choices:["下げ気味で淡々と","明るく上げる↗","強く言い切る","速く上げる"], explain:"控えめな評価は下げ気味で。" },
  { level:"C1", text:"I'd rather not, if that's okay.", q:"丁寧な辞退の調子は？", choices:["柔らかく下げ、語尾を和らげる","強く言い切る","明るく上げる","速く下げる"], explain:"丁寧な辞退は柔らかく下げて。" },
  { level:"B2", text:"Now we're talking!", q:"乗ってきた時の調子は？", choices:["明るく強く上げる↗","平坦に下げる","小さく言う","ためらう"], explain:"乗ってきた時は明るく強く上げ↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's GET to the BOTTOM of THIS.", q:"強く読む語は？", choices:["get / bottom / this","let's / to / the / of","to / the","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"It's NOT what you SAY, it's HOW you say it.", q:"強く読む語は？", choices:["not / say / how","it's / what / you","what / you","均等"], explain:"対比される内容語(not, say, how)を強く。" },
  { level:"B2", text:"We NEED to THINK this THROUGH.", q:"強く読む語は？", choices:["need / think / through","we / to / this","to / this","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"SUCCESS takes TIME, EFFORT, and PATIENCE.", q:"強く読む語は？", choices:["success / time / effort / patience","takes / and","and / the","均等"], explain:"列挙される内容語を強く。" }
]);


/* 増量：瞬間英作文 大量10（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もう一度お願いします。","answer":"Once more, please.","alts":[]},
  {"level":"A2","ja":"ゆっくり話してください。","answer":"Please speak slowly.","alts":[]},
  {"level":"A2","ja":"綴りを教えてください。","answer":"How do you spell that?","alts":[]},
  {"level":"A2","ja":"聞き取れませんでした。","answer":"I didn't catch that.","alts":[]},
  {"level":"A2","ja":"大きな声でお願いします。","answer":"Could you speak up?","alts":[]},
  {"level":"A2","ja":"それは何ですか。","answer":"What is that?","alts":[]},
  {"level":"A2","ja":"どういう意味ですか。","answer":"What does that mean?","alts":[]},
  {"level":"A2","ja":"例を挙げてください。","answer":"Could you give an example?","alts":[]},
  {"level":"A2","ja":"もう少し詳しく。","answer":"Could you be more specific?","alts":[]},
  {"level":"A2","ja":"要点は何ですか。","answer":"What's the main point?","alts":[]},
  {"level":"A2","ja":"今、何時ですか。","answer":"What time is it?","alts":[]},
  {"level":"A2","ja":"どこで会いますか。","answer":"Where shall we meet?","alts":[]},
  {"level":"A2","ja":"いつがいいですか。","answer":"When works for you?","alts":[]},
  {"level":"A2","ja":"誰が来ますか。","answer":"Who's coming?","alts":[]},
  {"level":"A2","ja":"なぜそうなりますか。","answer":"Why is that?","alts":[]},
  {"level":"B1","ja":"簡単に言うとこうです。","answer":"In simple terms, it's this.","alts":[]},
  {"level":"B1","ja":"具体例を挙げますね。","answer":"Let me give a concrete example.","alts":[]},
  {"level":"B1","ja":"言い換えるとこうです。","answer":"To put it another way, it's this.","alts":[]},
  {"level":"B1","ja":"つまりこういうことです。","answer":"In other words, it's this.","alts":[]},
  {"level":"B1","ja":"要するに賛成です。","answer":"In short, I agree.","alts":[]},
  {"level":"B1","ja":"結論から言います。","answer":"Let me start with the conclusion.","alts":[]},
  {"level":"B1","ja":"背景を説明します。","answer":"Let me give some background.","alts":[]},
  {"level":"B1","ja":"前置きはこのくらいで。","answer":"Enough of the preamble.","alts":[]},
  {"level":"B1","ja":"本題に入ります。","answer":"Let me get to the point.","alts":[]},
  {"level":"B1","ja":"補足させてください。","answer":"Let me add something.","alts":[]},
  {"level":"B1","ja":"訂正させてください。","answer":"Let me correct that.","alts":[]},
  {"level":"B1","ja":"繰り返しになりますが。","answer":"To repeat myself.","alts":[]},
  {"level":"B1","ja":"念のため確認します。","answer":"Let me double-check.","alts":[]},
  {"level":"B1","ja":"最後にまとめます。","answer":"Let me sum up at the end.","alts":[]},
  {"level":"B2","ja":"論理の飛躍があります。","answer":"There's a leap in logic.","alts":[]},
  {"level":"B2","ja":"前提に無理があります。","answer":"The premise is a stretch.","alts":[]},
  {"level":"B2","ja":"因果が逆かもしれません。","answer":"The causality may be reversed.","alts":[]},
  {"level":"B2","ja":"根拠が弱いと思います。","answer":"I find the evidence weak.","alts":[]},
  {"level":"B2","ja":"それは一般化しすぎです。","answer":"That's an overgeneralization.","alts":[]},
  {"level":"B2","ja":"別の解釈もできます。","answer":"There's another interpretation.","alts":[]},
  {"level":"B2","ja":"反例を挙げられます。","answer":"I can give a counterexample.","alts":[]},
  {"level":"B2","ja":"条件次第で変わります。","answer":"It depends on the conditions.","alts":[]},
  {"level":"B2","ja":"そこは検証が必要です。","answer":"That needs verification.","alts":[]},
  {"level":"B2","ja":"相関と因果は別です。","answer":"Correlation isn't causation.","alts":[]},
  {"level":"B2","ja":"文脈が抜けています。","answer":"The context is missing.","alts":[]},
  {"level":"B2","ja":"定義を明確にしましょう。","answer":"Let's clarify the definition.","alts":[]},
  {"level":"B2","ja":"例外を考慮しましょう。","answer":"Let's account for exceptions.","alts":[]},
  {"level":"B2","ja":"前提を共有しましょう。","answer":"Let's share the assumptions.","alts":[]},
  {"level":"B2","ja":"そこは合意できます。","answer":"We can agree on that.","alts":[]},
  {"level":"B2","ja":"部分的には賛成です。","answer":"I partly agree.","alts":[]},
  {"level":"B2","ja":"留保つきで賛成します。","answer":"I agree with reservations.","alts":[]},
  {"level":"B2","ja":"立場を保留します。","answer":"I'll reserve my position.","alts":[]},
  {"level":"B2","ja":"もう少し検討が必要です。","answer":"It needs more consideration.","alts":[]},
  {"level":"C1","ja":"帰納と演繹を区別します。","answer":"Let me separate induction from deduction.","alts":[]},
  {"level":"C1","ja":"反証可能性が重要です。","answer":"Falsifiability matters.","alts":[]},
  {"level":"C1","ja":"サンプルが偏っています。","answer":"The sample is biased.","alts":[]},
  {"level":"C1","ja":"交絡因子があります。","answer":"There's a confounding factor.","alts":[]},
  {"level":"C1","ja":"前提を疑うべきです。","answer":"We should question the premise.","alts":[]},
  {"level":"C1","ja":"論点先取の誤りです。","answer":"That's begging the question.","alts":[]},
  {"level":"C1","ja":"藁人形論法です。","answer":"That's a straw man.","alts":[]},
  {"level":"C1","ja":"滑りやすい坂論法です。","answer":"That's a slippery slope.","alts":[]},
  {"level":"C1","ja":"権威に訴える誤りです。","answer":"That's an appeal to authority.","alts":[]},
  {"level":"C1","ja":"個人攻撃は避けましょう。","answer":"Let's avoid ad hominem.","alts":[]},
  {"level":"C1","ja":"証拠の重みを比べます。","answer":"Let me weigh the evidence.","alts":[]},
  {"level":"C1","ja":"最も単純な説明を選びます。","answer":"Let me favor the simplest explanation.","alts":[]},
  {"level":"C1","ja":"誤った二分法です。","answer":"That's a false dichotomy.","alts":[]},
  {"level":"C1","ja":"逸話は証拠になりません。","answer":"Anecdotes aren't evidence.","alts":[]},
  {"level":"C1","ja":"前提を明示します。","answer":"Let me make the premise explicit.","alts":[]}
]);

/* 増量セットAP：高次スキル各種 大量6（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a deadline.", q:"自然な語は？", choices:["meet","make","do","give"], explain:"meet a deadline（締切に間に合う）。" },
  { level:"B2", text:"They ___ a law.", q:"自然な語は？", choices:["passed","made","did","took"], explain:"pass a law（法律を制定する）。" },
  { level:"B2", text:"Let's ___ a question to the panel.", q:"自然な語は？", choices:["pose","make","do","take"], explain:"pose a question（問いを投げる）。" },
  { level:"B2", text:"We ___ an obstacle.", q:"自然な語は？", choices:["overcame","made","did","gave"], explain:"overcome an obstacle（障害を克服する）。" },
  { level:"B2", text:"Let's ___ a target.", q:"自然な語は？", choices:["hit","make","do","give"], explain:"hit a target（目標を達成する）。" },
  { level:"B2", text:"They ___ a risk assessment.", q:"自然な語は？", choices:["carried out","made","did","gave"], explain:"carry out（実施する）。" },
  { level:"C1", text:"Let's ___ doubt on the claim.", q:"自然な語は？", choices:["cast","make","do","take"], explain:"cast doubt（疑念を投げかける）。" },
  { level:"C1", text:"They ___ ground in the market.", q:"自然な語は？", choices:["gained","made","did","took"], explain:"gain ground（地歩を固める）。" },
  { level:"C1", text:"Let's ___ a precedent aside.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set aside（脇に置く）。" },
  { level:"C1", text:"We should ___ the initiative.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take the initiative（主導権を握る）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「ご参考までに」を伝えるなら？", choices:["For your reference,","Reference for you now,","To refer you yes,","Look this maybe,"], explain:"For your reference ＝ ご参考までに。" },
  { level:"B2", ja:"", text:"「とりあえず」を伝えるなら？", choices:["For the time being,","Time being for now,","Anyway first yes,","Temporary do maybe,"], explain:"For the time being ＝ とりあえず。" },
  { level:"C1", ja:"", text:"「あえて言えば」を伝えるなら？", choices:["If I had to say,","Dare say I now,","Forcing word yes,","Maybe must say,"], explain:"If I had to say ＝ あえて言えば。" },
  { level:"B2", ja:"", text:"「念のため申し上げますが」を伝えるなら？", choices:["For the record,","Record for safe now,","Note this please yes,","Just say maybe,"], explain:"For the record ＝ 念のため申し上げると。" },
  { level:"C1", ja:"", text:"「私見ですが」を伝えるなら？", choices:["In my humble opinion,","My small think now,","Personal view yes,","I believe maybe,"], explain:"In my humble opinion ＝ 私見ですが。" },
  { level:"B2", ja:"", text:"「ざっくばらんに言うと」を伝えるなら？", choices:["Honestly speaking,","Honest talk now,","Open mouth yes,","Frank saying maybe,"], explain:"Honestly speaking ＝ ざっくばらんに言うと。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"相手の立場を尊重して頼む：", choices:["I know you're busy, but could you help?","Do this for me now.","You must help me.","Why won't you help?"], explain:"相手の状況を気遣って頼む。" },
  { level:"B2", text:"提案を控えめに切り出す：", choices:["This might be worth considering.","Do exactly this.","My idea is best.","You should obey."], explain:"控えめに提案を切り出す。" },
  { level:"C1", text:"意見を求めて対話を開く：", choices:["I'd value your perspective on this.","Just agree with me.","Your view is wrong.","Don't bother thinking."], explain:"相手の視点を尊重して対話を開く。" },
  { level:"C1", text:"感謝に謙虚に応じる：", choices:["I'm just glad it helped.","Yes, I'm amazing.","Of course it worked.","You owe me now."], explain:"謙虚に感謝へ応じる。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"議論を要約して確認する：", choices:["Let me make sure I've got this right.","I wasn't listening.","Your point is wrong.","No need to confirm."], explain:"要約して理解を確認する。" },
  { level:"B2", text:"異なる角度を提示する：", choices:["Here's another way to look at it.","Only my view counts.","No other angles.","Stop thinking."], explain:"別角度を提示して議論を広げる。" },
  { level:"C1", text:"暗黙の前提を表に出す：", choices:["I think there's an unspoken assumption here.","Assumptions are facts.","Don't question it.","Just move on."], explain:"暗黙の前提を表面化させる。" },
  { level:"C1", text:"対立を共通目標で橋渡し：", choices:["We both want the same outcome, right?","One of us must lose.","No common goal.","Let's just fight."], explain:"共通目標で対立を橋渡しする。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As a rule, we test first.", q:"自然なチャンク区切りは？", choices:["As a rule, / we test first","As / a rule we test / first","As a / rule we test first","As a rule we / test first"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"Needless to say, it matters.", q:"自然なチャンク区切りは？", choices:["Needless to say, / it matters","Needless / to say it / matters","Needless to / say it matters","Needless to say it / matters"], explain:"前置き句/主節、で区切る。" },
  { level:"B2", text:"On second thought, let's wait.", q:"自然なチャンク区切りは？", choices:["On second thought, / let's wait","On / second thought let's / wait","On second / thought let's wait","On second thought let's / wait"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Fair enough.", q:"納得の調子は？", choices:["明るく下げる↘","強く上げる","平坦に切る","ためらう"], explain:"納得は明るく下げ↘。" },
  { level:"C1", text:"Let me think... maybe.", q:"迷いの調子は？", choices:["間をおき下げ気味で迷いを示す","明るく上げる","速く言い切る","強く上げる"], explain:"迷いは間＋下げ気味で。" },
  { level:"B2", text:"Are you sure about that?", q:"疑問・確認の調子は？", choices:["that を上げる↗","下げて終える","平坦に切る","小さく言う"], explain:"確認の問いは語尾を上げ↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's KEEP it SIMPLE and CLEAR.", q:"強く読む語は？", choices:["keep / simple / clear","let's / it / and","it / and","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"PLAN for the WORST, HOPE for the BEST.", q:"強く読む語は？", choices:["plan / worst / hope / best","for / the / for / the","for / the","均等"], explain:"対比される内容語を強く。" },
  { level:"B2", text:"We CAN'T AFFORD to WAIT any LONGER.", q:"強く読む語は？", choices:["can't / afford / wait / longer","we / to / any","to / any","均等"], explain:"can't と内容語を強く。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"environment", syl:["en","VI","ron","ment"], ans:1, ja:"環境" },
  { level:"B2", word:"development", syl:["de","VEL","op","ment"], ans:1, ja:"発展" },
  { level:"B2", word:"experiment", syl:["ex","PER","i","ment"], ans:1, ja:"実験" },
  { level:"C1", word:"accompaniment", syl:["ac","COM","pa","ni","ment"], ans:1, ja:"伴奏" },
  { level:"B2", word:"survey (名詞)", syl:["SUR","vey"], ans:0, ja:"調査（名詞）", say:"survey" },
  { level:"B2", word:"survey (動詞)", syl:["sur","VEY"], ans:1, ja:"調査する（動詞）", say:"survey" },
  { level:"B2", word:"upset (名詞)", syl:["UP","set"], ans:0, ja:"動揺（名詞）", say:"upset" },
  { level:"B2", word:"upset (動詞)", syl:["up","SET"], ans:1, ja:"動揺させる（動詞）", say:"upset" }
]);


/* 増量：瞬間英作文 大量11（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"どうかしましたか。","answer":"Is something wrong?","alts":[]},
  {"level":"A2","ja":"お変わりありませんか。","answer":"How have you been keeping?","alts":[]},
  {"level":"A2","ja":"何かお探しですか。","answer":"Are you looking for something?","alts":[]},
  {"level":"A2","ja":"ご用件は何ですか。","answer":"What can I do for you?","alts":[]},
  {"level":"A2","ja":"少々お待ちを。","answer":"One moment, please.","alts":[]},
  {"level":"A2","ja":"すぐに参ります。","answer":"I'll be right with you.","alts":[]},
  {"level":"A2","ja":"どうぞこちらへ。","answer":"This way, please.","alts":[]},
  {"level":"A2","ja":"お掛けください。","answer":"Please have a seat.","alts":[]},
  {"level":"A2","ja":"何になさいますか。","answer":"What would you like?","alts":[]},
  {"level":"A2","ja":"以上でよろしいですか。","answer":"Will that be all?","alts":[]},
  {"level":"A2","ja":"お会計はこちらです。","answer":"Here's your bill.","alts":[]},
  {"level":"A2","ja":"またのお越しを。","answer":"Please come again.","alts":[]},
  {"level":"A2","ja":"よい一日を。","answer":"Have a good day.","alts":[]},
  {"level":"B1","ja":"お手伝いしましょうか。","answer":"May I help you with that?","alts":[]},
  {"level":"B1","ja":"遠慮なくおっしゃってください。","answer":"Please don't hesitate to say.","alts":[]},
  {"level":"B1","ja":"承知いたしました。","answer":"Certainly.","alts":[]},
  {"level":"B1","ja":"少し時間をいただけますか。","answer":"Could I have a moment?","alts":[]},
  {"level":"B1","ja":"確認してまいります。","answer":"Let me go check.","alts":[]},
  {"level":"B1","ja":"お待たせして申し訳ありません。","answer":"Sorry to keep you waiting.","alts":[]},
  {"level":"B1","ja":"すぐ対応いたします。","answer":"I'll see to it right away.","alts":[]},
  {"level":"B1","ja":"ご案内いたします。","answer":"Allow me to show you.","alts":[]},
  {"level":"B1","ja":"間違いございません。","answer":"There's no mistake.","alts":[]},
  {"level":"B1","ja":"念のためお伝えします。","answer":"Just to let you know.","alts":[]},
  {"level":"B1","ja":"お役に立てず申し訳ありません。","answer":"Sorry I couldn't be of more help.","alts":[]},
  {"level":"B1","ja":"今後ともよろしくお願いします。","answer":"I hope we can continue working together.","alts":[]},
  {"level":"B1","ja":"ご理解に感謝します。","answer":"Thank you for understanding.","alts":[]},
  {"level":"B2","ja":"状況を整理させてください。","answer":"Let me get the situation straight.","alts":[]},
  {"level":"B2","ja":"優先度を再考しましょう。","answer":"Let's rethink the priorities.","alts":[]},
  {"level":"B2","ja":"前提を明確にしましょう。","answer":"Let's make the premise clear.","alts":[]},
  {"level":"B2","ja":"そこが論点ですね。","answer":"That's the crux of the matter.","alts":[]},
  {"level":"B2","ja":"落としどころを見つけましょう。","answer":"Let's find a landing point.","alts":[]},
  {"level":"B2","ja":"影響を見積もりましょう。","answer":"Let's estimate the impact.","alts":[]},
  {"level":"B2","ja":"根拠を示してください。","answer":"Please show me the basis.","alts":[]},
  {"level":"B2","ja":"代案を用意します。","answer":"I'll prepare an alternative.","alts":[]},
  {"level":"B2","ja":"役割分担を決めましょう。","answer":"Let's divide the roles.","alts":[]},
  {"level":"B2","ja":"スケジュールを調整します。","answer":"I'll adjust the schedule.","alts":[]},
  {"level":"B2","ja":"方向性を合わせましょう。","answer":"Let's align on direction.","alts":[]},
  {"level":"B2","ja":"そこは丁寧に進めます。","answer":"I'll handle that carefully.","alts":[]},
  {"level":"B2","ja":"意見をすり合わせます。","answer":"Let me reconcile opinions.","alts":[]},
  {"level":"B2","ja":"想定どおりの結果です。","answer":"It's the expected outcome.","alts":[]},
  {"level":"B2","ja":"手戻りを減らしましょう。","answer":"Let's cut down on rework.","alts":[]},
  {"level":"B2","ja":"合意としてよろしいですか。","answer":"May we consider this agreed?","alts":[]},
  {"level":"B2","ja":"現状維持も検討します。","answer":"I'll also weigh the status quo.","alts":[]},
  {"level":"C1","ja":"可逆な判断を選びます。","answer":"I'll opt for a reversible call.","alts":[]},
  {"level":"C1","ja":"長期で最適化します。","answer":"Let me optimize long-term.","alts":[]},
  {"level":"C1","ja":"成功条件を定義します。","answer":"Let me define the success conditions.","alts":[]},
  {"level":"C1","ja":"不確実性に備えます。","answer":"Let me hedge against uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を見ます。","answer":"Let me look at the opportunity cost.","alts":[]},
  {"level":"C1","ja":"一方通行を避けます。","answer":"Let me avoid irreversible moves.","alts":[]},
  {"level":"C1","ja":"最悪に備えます。","answer":"Let me brace for the worst.","alts":[]},
  {"level":"C1","ja":"短期と長期を分けます。","answer":"Let me decouple short and long term.","alts":[]},
  {"level":"C1","ja":"撤退基準を決めます。","answer":"Let me set the exit threshold.","alts":[]},
  {"level":"C1","ja":"根本原因を探ります。","answer":"Let me dig for the root cause.","alts":[]},
  {"level":"C1","ja":"前提を検証します。","answer":"Let me validate the assumptions.","alts":[]},
  {"level":"C1","ja":"証拠で裏づけます。","answer":"Let me back it with evidence.","alts":[]},
  {"level":"C1","ja":"反証を探します。","answer":"Let me look for counterevidence.","alts":[]},
  {"level":"C1","ja":"単純な説明を選びます。","answer":"Let me pick the simplest explanation.","alts":[]}
]);


/* 増量：瞬間英作文 大量12（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もうすぐです。","answer":"Coming right up.","alts":[]},
  {"level":"A2","ja":"準備できました。","answer":"It's ready.","alts":[]},
  {"level":"A2","ja":"終わりました。","answer":"All done.","alts":[]},
  {"level":"A2","ja":"始めましょう。","answer":"Let's begin.","alts":[]},
  {"level":"A2","ja":"続けましょう。","answer":"Let's continue.","alts":[]},
  {"level":"A2","ja":"やめておきましょう。","answer":"Let's not.","alts":[]},
  {"level":"A2","ja":"もう一度。","answer":"One more time.","alts":[]},
  {"level":"A2","ja":"交代しましょう。","answer":"Let's switch.","alts":[]},
  {"level":"A2","ja":"手分けしましょう。","answer":"Let's split the work.","alts":[]},
  {"level":"A2","ja":"集まりましょう。","answer":"Let's gather.","alts":[]},
  {"level":"A2","ja":"休みましょう。","answer":"Let's rest.","alts":[]},
  {"level":"A2","ja":"急ぎましょう。","answer":"Let's hurry.","alts":[]},
  {"level":"A2","ja":"落ち着きましょう。","answer":"Let's calm down.","alts":[]},
  {"level":"A2","ja":"確かめましょう。","answer":"Let's make sure.","alts":[]},
  {"level":"A2","ja":"決めましょう。","answer":"Let's decide.","alts":[]},
  {"level":"B1","ja":"順番を決めましょう。","answer":"Let's decide the order.","alts":[]},
  {"level":"B1","ja":"役割を分けましょう。","answer":"Let's assign roles.","alts":[]},
  {"level":"B1","ja":"目標を立てましょう。","answer":"Let's set a goal.","alts":[]},
  {"level":"B1","ja":"計画を見直しましょう。","answer":"Let's review the plan.","alts":[]},
  {"level":"B1","ja":"時間を測りましょう。","answer":"Let's time it.","alts":[]},
  {"level":"B1","ja":"記録を取りましょう。","answer":"Let's keep a record.","alts":[]},
  {"level":"B1","ja":"意見を集めましょう。","answer":"Let's gather opinions.","alts":[]},
  {"level":"B1","ja":"結果を共有しましょう。","answer":"Let's share the results.","alts":[]},
  {"level":"B1","ja":"次に進みましょう。","answer":"Let's move on.","alts":[]},
  {"level":"B1","ja":"一旦止めましょう。","answer":"Let's pause for now.","alts":[]},
  {"level":"B1","ja":"もう少し粘りましょう。","answer":"Let's stick with it a bit.","alts":[]},
  {"level":"B1","ja":"別の方法を試しましょう。","answer":"Let's try another way.","alts":[]},
  {"level":"B1","ja":"原因を探しましょう。","answer":"Let's look for the cause.","alts":[]},
  {"level":"B1","ja":"改善点を挙げましょう。","answer":"Let's list improvements.","alts":[]},
  {"level":"B1","ja":"良かった点も挙げましょう。","answer":"Let's note what went well.","alts":[]},
  {"level":"B2","ja":"前提を洗い出しましょう。","answer":"Let's surface the assumptions.","alts":[]},
  {"level":"B2","ja":"論点を可視化しましょう。","answer":"Let's map out the issues.","alts":[]},
  {"level":"B2","ja":"優先度を合意しましょう。","answer":"Let's agree on priorities.","alts":[]},
  {"level":"B2","ja":"リスクを評価しましょう。","answer":"Let's assess the risks.","alts":[]},
  {"level":"B2","ja":"選択肢を比較しましょう。","answer":"Let's compare the options.","alts":[]},
  {"level":"B2","ja":"根拠を文書化しましょう。","answer":"Let's document the rationale.","alts":[]},
  {"level":"B2","ja":"担当を明記しましょう。","answer":"Let's spell out ownership.","alts":[]},
  {"level":"B2","ja":"期日を確定しましょう。","answer":"Let's lock in the date.","alts":[]},
  {"level":"B2","ja":"懸念を一覧化しましょう。","answer":"Let's list the concerns.","alts":[]},
  {"level":"B2","ja":"方針を文書化しましょう。","answer":"Let's put the approach in writing.","alts":[]},
  {"level":"B2","ja":"認識を文書で共有しましょう。","answer":"Let's share understanding in writing.","alts":[]},
  {"level":"B2","ja":"影響を試算しましょう。","answer":"Let's run the numbers on impact.","alts":[]},
  {"level":"B2","ja":"代替案を評価しましょう。","answer":"Let's evaluate alternatives.","alts":[]},
  {"level":"B2","ja":"手戻りの芽を摘みましょう。","answer":"Let's nip rework in the bud.","alts":[]},
  {"level":"B2","ja":"合意事項を記録しましょう。","answer":"Let's record what we agreed.","alts":[]},
  {"level":"B2","ja":"現状を棚卸ししましょう。","answer":"Let's take inventory of the status.","alts":[]},
  {"level":"B2","ja":"想定を明示しましょう。","answer":"Let's make assumptions explicit.","alts":[]},
  {"level":"B2","ja":"範囲を線引きしましょう。","answer":"Let's draw the line on scope.","alts":[]},
  {"level":"B2","ja":"前進を確認しましょう。","answer":"Let's confirm progress.","alts":[]},
  {"level":"B2","ja":"次回までに準備しましょう。","answer":"Let's prepare by next time.","alts":[]},
  {"level":"C1","ja":"可逆性を担保しましょう。","answer":"Let's ensure reversibility.","alts":[]},
  {"level":"C1","ja":"前提を再検証しましょう。","answer":"Let's re-validate the premise.","alts":[]},
  {"level":"C1","ja":"長期影響を見積もりましょう。","answer":"Let's estimate the long-term impact.","alts":[]},
  {"level":"C1","ja":"成功と失敗を定義しましょう。","answer":"Let's define success and failure.","alts":[]},
  {"level":"C1","ja":"不確実性を織り込みましょう。","answer":"Let's bake in uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を比べましょう。","answer":"Let's compare opportunity costs.","alts":[]},
  {"level":"C1","ja":"一方通行を見極めましょう。","answer":"Let's spot the one-way doors.","alts":[]},
  {"level":"C1","ja":"最悪を想定しましょう。","answer":"Let's assume the worst case.","alts":[]},
  {"level":"C1","ja":"短期と長期を分けましょう。","answer":"Let's separate horizons.","alts":[]},
  {"level":"C1","ja":"撤退条件を定めましょう。","answer":"Let's set exit criteria.","alts":[]},
  {"level":"C1","ja":"因果を確かめましょう。","answer":"Let's verify causation.","alts":[]},
  {"level":"C1","ja":"仮説を立てましょう。","answer":"Let's form a hypothesis.","alts":[]},
  {"level":"C1","ja":"前例を調べましょう。","answer":"Let's check for precedent.","alts":[]},
  {"level":"C1","ja":"想定外に備えましょう。","answer":"Let's prepare for surprises.","alts":[]},
  {"level":"C1","ja":"根本から直しましょう。","answer":"Let's fix it at the root.","alts":[]}
]);

/* 増量セットAS：高次スキル各種 仕上げ（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a habit of it.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a habit（習慣にする）。" },
  { level:"B2", text:"They ___ an exam.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take an exam（試験を受ける）。" },
  { level:"B2", text:"Let's ___ a phone call.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a call（電話する）。" },
  { level:"C1", text:"We should ___ stock of progress.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take stock（状況を見直す）。" },
  { level:"C1", text:"Let's ___ a turn for the better.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a turn（転じる）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「念のため確認ですが」を伝えるなら？", choices:["Just to confirm,","Confirm just now,","For sure ask yes,","Check please maybe,"], explain:"Just to confirm ＝ 念のため確認ですが。" },
  { level:"C1", ja:"", text:"「私の理解が正しければ」を伝えるなら？", choices:["If I understand correctly,","If know right I,","Maybe my understand,","Correct understand if,"], explain:"If I understand correctly ＝ 私の理解が正しければ。" },
  { level:"B2", ja:"", text:"「結局のところ」を伝えるなら？", choices:["At the end of the day,","End day at now,","Finally result yes,","After all maybe,"], explain:"At the end of the day ＝ 結局のところ。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を促して輪を広げる：", choices:["I'd like to hear from everyone.","Only I talk here.","No more input.","Stop sharing."], explain:"全員の発言を促す。" },
  { level:"C1", text:"建設的に決定へ導く：", choices:["Shall we decide and revisit if needed?","Never decide.","Argue forever.","No decision ever."], explain:"決定し必要なら見直す形で前進。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に確認を求める：", choices:["Would you mind confirming that?","Confirm it now.","You must confirm.","Why won't you confirm?"], explain:"Would you mind …? で丁寧に依頼。" },
  { level:"C1", text:"感謝を未来につなげる：", choices:["Thank you—I hope we can work together again.","Thanks, goodbye forever.","You owe me now.","That's the end."], explain:"感謝を将来の関係につなげる。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Absolutely!", q:"強い同意の調子は？", choices:["明るく強く言い切る","平坦に下げる","小さく言う","ためらう"], explain:"強い同意は明るく強く。" },
  { level:"C1", text:"Well, it depends.", q:"留保の調子は？", choices:["depends を伸ばし下げ気味","強く上げる","明るく上げる","速く言い切る"], explain:"留保は語を伸ばし下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's TALK about WHAT we can CONTROL.", q:"強く読む語は？", choices:["talk / what / control","let's / about / we / can","about / we","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"PROGRESS, not PERFECTION, is the GOAL.", q:"強く読む語は？", choices:["progress / perfection / goal","not / is / the","is / the","均等"], explain:"対比される内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"In any case, we tried.", q:"自然なチャンク区切りは？", choices:["In any case, / we tried","In / any case we / tried","In any / case we tried","In any case we / tried"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"All in all, it succeeded.", q:"自然なチャンク区切りは？", choices:["All in all, / it succeeded","All / in all it / succeeded","All in / all it succeeded","All in all it / succeeded"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"category", syl:["CAT","e","go","ry"], ans:0, ja:"分類" },
  { level:"B2", word:"ceremony", syl:["CER","e","mo","ny"], ans:0, ja:"儀式" },
  { level:"C1", word:"deteriorate", syl:["de","TE","ri","o","rate"], ans:1, ja:"悪化する" },
  { level:"B2", word:"discount (名詞)", syl:["DIS","count"], ans:0, ja:"割引（名詞）", say:"discount" },
  { level:"B2", word:"discount (動詞)", syl:["dis","COUNT"], ans:1, ja:"割り引く（動詞）", say:"discount" }
]);


/* 増量：瞬間英作文 大量13 仕上げ（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"はい、そうです。","answer":"Yes, that's right.","alts":[]},
  {"level":"A2","ja":"いいえ、違います。","answer":"No, that's not it.","alts":[]},
  {"level":"A2","ja":"どうぞ。","answer":"Go ahead.","alts":[]},
  {"level":"A2","ja":"どうも。","answer":"Thanks.","alts":[]},
  {"level":"A2","ja":"お願いします。","answer":"Please.","alts":[]},
  {"level":"B1","ja":"そうとも言えます。","answer":"You could say that.","alts":[]},
  {"level":"B1","ja":"一概には言えません。","answer":"It's hard to generalize.","alts":[]},
  {"level":"B1","ja":"場合によります。","answer":"It depends.","alts":[]},
  {"level":"B1","ja":"まさにその通り。","answer":"Exactly right.","alts":[]},
  {"level":"B1","ja":"ある意味では。","answer":"In a sense.","alts":[]},
  {"level":"B1","ja":"今のところは。","answer":"For the time being.","alts":[]},
  {"level":"B1","ja":"おそらくそうでしょう。","answer":"Most likely.","alts":[]},
  {"level":"B1","ja":"どちらとも言えます。","answer":"It could go either way.","alts":[]},
  {"level":"B1","ja":"まだ分かりません。","answer":"It's still unclear.","alts":[]},
  {"level":"B2","ja":"前提に依存します。","answer":"It hinges on the premise.","alts":[]},
  {"level":"B2","ja":"文脈によります。","answer":"It depends on context.","alts":[]},
  {"level":"B2","ja":"条件付きで賛成です。","answer":"I agree conditionally.","alts":[]},
  {"level":"B2","ja":"留保が必要です。","answer":"I have reservations.","alts":[]},
  {"level":"B2","ja":"検証が前提です。","answer":"It assumes verification.","alts":[]},
  {"level":"B2","ja":"根拠が鍵です。","answer":"The evidence is key.","alts":[]},
  {"level":"B2","ja":"範囲の問題です。","answer":"It's a matter of scope.","alts":[]},
  {"level":"B2","ja":"定義によります。","answer":"It depends on the definition.","alts":[]},
  {"level":"B2","ja":"程度の問題です。","answer":"It's a matter of degree.","alts":[]},
  {"level":"B2","ja":"解釈が分かれます。","answer":"Interpretations diverge.","alts":[]},
  {"level":"C1","ja":"可逆性が重要です。","answer":"Reversibility is key.","alts":[]},
  {"level":"C1","ja":"前提が崩れ得ます。","answer":"The premise may break.","alts":[]},
  {"level":"C1","ja":"長期で見るべきです。","answer":"We should take a long view.","alts":[]},
  {"level":"C1","ja":"成功基準次第です。","answer":"It depends on success criteria.","alts":[]},
  {"level":"C1","ja":"不確実性が前提です。","answer":"It assumes uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用が論点です。","answer":"Opportunity cost is the issue.","alts":[]},
  {"level":"C1","ja":"可逆か不可逆かです。","answer":"It's reversible or not.","alts":[]},
  {"level":"C1","ja":"最悪を想定すべきです。","answer":"We should assume the worst.","alts":[]},
  {"level":"C1","ja":"時間軸を分けるべきです。","answer":"We should separate horizons.","alts":[]},
  {"level":"C1","ja":"撤退条件が必要です。","answer":"We need exit criteria.","alts":[]},
  {"level":"C1","ja":"因果が論点です。","answer":"Causation is the issue.","alts":[]},
  {"level":"C1","ja":"仮説が要ります。","answer":"We need a hypothesis.","alts":[]},
  {"level":"C1","ja":"前例が参考になります。","answer":"Precedent is instructive.","alts":[]},
  {"level":"C1","ja":"想定外に備えるべきです。","answer":"We should expect surprises.","alts":[]},
  {"level":"C1","ja":"根本原因が鍵です。","answer":"The root cause is key.","alts":[]},
  {"level":"B1","ja":"それは助かります。","answer":"That would help.","alts":[]},
  {"level":"B1","ja":"それは困ります。","answer":"That would be a problem.","alts":[]},
  {"level":"B1","ja":"それは初耳です。","answer":"That's new to me.","alts":[]},
  {"level":"B1","ja":"それは妙ですね。","answer":"That's odd.","alts":[]},
  {"level":"B2","ja":"筋が通っています。","answer":"That holds together.","alts":[]},
  {"level":"B2","ja":"矛盾しています。","answer":"That's contradictory.","alts":[]},
  {"level":"B2","ja":"一貫しています。","answer":"That's consistent.","alts":[]},
  {"level":"B2","ja":"的を射ています。","answer":"That's on point.","alts":[]},
  {"level":"B2","ja":"的外れです。","answer":"That misses the point.","alts":[]}
]);


/* 増量：瞬間英作文 大量14（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"手伝いましょうか。","answer":"Can I help you?","alts":[]},
  {"level":"A2","ja":"急がないで。","answer":"Take your time.","alts":[]},
  {"level":"A2","ja":"少々お待ちを。","answer":"Just a moment.","alts":[]},
  {"level":"B1","ja":"よく考えてみます。","answer":"Let me think it over.","alts":[]},
  {"level":"B1","ja":"順番にやりましょう。","answer":"Let's take it step by step.","alts":[]},
  {"level":"B1","ja":"無理しないでね。","answer":"Don't push yourself too hard.","alts":[]},
  {"level":"B1","ja":"気が変わったら教えて。","answer":"Let me know if you change your mind.","alts":[]},
  {"level":"B1","ja":"ちょうど話していたところです。","answer":"We were just talking about that.","alts":[]},
  {"level":"B1","ja":"そう言ってもらえて嬉しいです。","answer":"It's nice of you to say that.","alts":[]},
  {"level":"B2","ja":"前向きに検討します。","answer":"I'll give it serious thought.","alts":[]},
  {"level":"B2","ja":"それは状況によります。","answer":"That depends on the situation.","alts":[]},
  {"level":"B2","ja":"要点をまとめましょう。","answer":"Let's sum up the main points.","alts":[]},
  {"level":"B2","ja":"誤解があったようです。","answer":"There seems to have been a misunderstanding.","alts":[]},
  {"level":"B2","ja":"代替案を提案します。","answer":"Let me suggest an alternative.","alts":[]},
  {"level":"B2","ja":"優先順位をつけましょう。","answer":"Let's set some priorities.","alts":[]},
  {"level":"B2","ja":"期待に応えられるよう努めます。","answer":"I'll do my best to meet expectations.","alts":[]},
  {"level":"B2","ja":"柔軟に対応します。","answer":"I'll be flexible about it.","alts":[]},
  {"level":"B2","ja":"建設的に話し合いましょう。","answer":"Let's discuss this constructively.","alts":[]},
  {"level":"B2","ja":"現実的に考えましょう。","answer":"Let's be realistic about this.","alts":[]},
  {"level":"B2","ja":"早めに対処しましょう。","answer":"Let's address it sooner rather than later.","alts":[]},
  {"level":"B2","ja":"根拠を示していただけますか。","answer":"Could you show me the basis for that?","alts":[]},
  {"level":"B2","ja":"結論を急がないでおきましょう。","answer":"Let's not jump to conclusions.","alts":[]},
  {"level":"B2","ja":"双方にとって良い案ですね。","answer":"It's a good outcome for both sides.","alts":[]},
  {"level":"B2","ja":"改善の余地があります。","answer":"There's room for improvement.","alts":[]},
  {"level":"B2","ja":"長い目で見ましょう。","answer":"Let's take the long view.","alts":[]},
  {"level":"B2","ja":"きちんと記録に残します。","answer":"I'll make sure it's documented.","alts":[]},
  {"level":"B2","ja":"筋が通っていますね。","answer":"That holds together well.","alts":[]},
  {"level":"C1","ja":"前提を見直す必要があります。","answer":"We need to re-examine the premise.","alts":[]},
  {"level":"C1","ja":"因果関係を確かめましょう。","answer":"Let's verify the causal link.","alts":[]},
  {"level":"C1","ja":"可逆的な判断を優先します。","answer":"I'll favor a reversible decision.","alts":[]},
  {"level":"C1","ja":"不確実性を織り込みましょう。","answer":"Let's account for the uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用も考慮すべきです。","answer":"We should weigh the opportunity cost too.","alts":[]},
  {"level":"C1","ja":"短期と長期を切り分けましょう。","answer":"Let's separate the short and long term.","alts":[]},
  {"level":"C1","ja":"撤退条件を定めておきましょう。","answer":"Let's set clear exit criteria.","alts":[]},
  {"level":"C1","ja":"根本原因にさかのぼりましょう。","answer":"Let's trace it to the root cause.","alts":[]},
  {"level":"C1","ja":"反証可能な形で述べてください。","answer":"Please frame it in a falsifiable way.","alts":[]},
  {"level":"C1","ja":"憶測ではなく証拠に基づきましょう。","answer":"Let's rely on evidence, not speculation.","alts":[]},
  {"level":"C1","ja":"論点を切り分けて議論しましょう。","answer":"Let's break the issue into parts.","alts":[]},
  {"level":"C1","ja":"前例にとらわれない発想が要ります。","answer":"We need to think beyond precedent.","alts":[]},
  {"level":"C1","ja":"想定の範囲を明確にしましょう。","answer":"Let's clarify the scope of our assumptions.","alts":[]}
]);


/* 増量：瞬間英作文 大量15（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"お会いできて嬉しいです。","answer":"Nice to meet you.","alts":[]},
  {"level":"A2","ja":"調子はどう？","answer":"How's it going?","alts":[]},
  {"level":"A2","ja":"まあまあです。","answer":"Not too bad.","alts":[]},
  {"level":"A2","ja":"元気です。","answer":"I'm doing well.","alts":[]},
  {"level":"A2","ja":"久しぶり。","answer":"Long time no see.","alts":[]},
  {"level":"A2","ja":"また会おうね。","answer":"Let's meet up again.","alts":[]},
  {"level":"A2","ja":"連絡してね。","answer":"Keep in touch.","alts":[]},
  {"level":"A2","ja":"よい週末を。","answer":"Have a good weekend.","alts":[]},
  {"level":"A2","ja":"気をつけて帰ってね。","answer":"Get home safe.","alts":[]},
  {"level":"A2","ja":"おめでとう。","answer":"Congratulations.","alts":[]},
  {"level":"A2","ja":"頑張ってね。","answer":"Good luck.","alts":[]},
  {"level":"A2","ja":"応援してるよ。","answer":"I'm rooting for you.","alts":[]},
  {"level":"A2","ja":"お疲れさま。","answer":"Good job today.","alts":[]},
  {"level":"B1","ja":"お手数おかけします。","answer":"Sorry for the trouble.","alts":[]},
  {"level":"B1","ja":"恩に着ます。","answer":"I owe you one.","alts":[]},
  {"level":"B1","ja":"無理のない範囲で。","answer":"Only if it's convenient.","alts":[]},
  {"level":"B1","ja":"そのうちにね。","answer":"Sometime soon.","alts":[]},
  {"level":"B1","ja":"念のためお伝えします。","answer":"Just so you know.","alts":[]},
  {"level":"B1","ja":"参考までに。","answer":"For what it's worth.","alts":[]},
  {"level":"B1","ja":"一応確認ですが。","answer":"Just to be sure.","alts":[]},
  {"level":"B1","ja":"私の理解では。","answer":"The way I see it.","alts":[]},
  {"level":"B1","ja":"正直なところ。","answer":"To be honest.","alts":[]},
  {"level":"B1","ja":"率直に言うと。","answer":"Frankly speaking.","alts":[]},
  {"level":"B2","ja":"論点を整理させてください。","answer":"Let me organize the points.","alts":[]},
  {"level":"B2","ja":"前提を確認しましょう。","answer":"Let's confirm the assumptions.","alts":[]},
  {"level":"B2","ja":"落としどころを探りましょう。","answer":"Let's look for a compromise.","alts":[]},
  {"level":"B2","ja":"影響を見極めましょう。","answer":"Let's assess the impact.","alts":[]},
  {"level":"B2","ja":"根拠を補強します。","answer":"Let me strengthen the basis.","alts":[]},
  {"level":"B2","ja":"別の見方もできます。","answer":"There's another way to see it.","alts":[]},
  {"level":"B2","ja":"分担を決めましょう。","answer":"Let's divide the work.","alts":[]},
  {"level":"B2","ja":"期日を再調整します。","answer":"I'll adjust the deadline.","alts":[]},
  {"level":"B2","ja":"懸念を明示します。","answer":"Let me make my concern clear.","alts":[]},
  {"level":"B2","ja":"慎重に進めます。","answer":"I'll proceed with care.","alts":[]},
  {"level":"B2","ja":"意見をすり合わせます。","answer":"Let me reconcile our views.","alts":[]},
  {"level":"B2","ja":"先手を打ちましょう。","answer":"Let's get ahead of it.","alts":[]},
  {"level":"B2","ja":"想定内の結果です。","answer":"It's within expectations.","alts":[]},
  {"level":"B2","ja":"合意としましょう。","answer":"Let's call it agreed.","alts":[]},
  {"level":"B2","ja":"現状維持も一案です。","answer":"The status quo is an option too.","alts":[]},
  {"level":"B2","ja":"影響範囲を確認します。","answer":"Let me check the scope.","alts":[]},
  {"level":"C1","ja":"成功条件を定義します。","answer":"Let me define success.","alts":[]},
  {"level":"C1","ja":"機会費用を比べます。","answer":"Let me compare opportunity costs.","alts":[]},
  {"level":"C1","ja":"最悪を想定します。","answer":"Let me assume the worst.","alts":[]},
  {"level":"C1","ja":"短期と長期を分けます。","answer":"Let me separate horizons.","alts":[]},
  {"level":"C1","ja":"因果を確かめます。","answer":"Let me confirm causation.","alts":[]},
  {"level":"C1","ja":"仮説を立てます。","answer":"Let me form a hypothesis.","alts":[]},
  {"level":"C1","ja":"前例を調べます。","answer":"Let me check for precedent.","alts":[]}
]);

/* 増量セットAV：高次スキル各種 大量7（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a decision.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a decision（決定に至る）。makeも可だがreachが自然。" },
  { level:"B2", text:"They ___ a risk.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take a risk（リスクを取る）。" },
  { level:"B2", text:"Let's ___ progress.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make progress（前進する）。" },
  { level:"B2", text:"We ___ a conclusion.", q:"自然な語は？", choices:["drew","made","did","took"], explain:"draw a conclusion（結論を導く）。" },
  { level:"B2", text:"Let's ___ attention to this.", q:"自然な語は？", choices:["draw","make","do","take"], explain:"draw attention（注意を引く）。" },
  { level:"B2", text:"They ___ an effort.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an effort（努力する）。" },
  { level:"B2", text:"Let's ___ a deadline.", q:"自然な語は？", choices:["set","make","do","give"], explain:"set a deadline（締切を設ける）。" },
  { level:"B2", text:"We ___ a profit.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a profit（利益を上げる）。" },
  { level:"C1", text:"Let's ___ ground.", q:"自然な語は？", choices:["break","make","do","take"], explain:"break ground（着工する・新境地を開く）。" },
  { level:"C1", text:"They ___ a stand on it.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take a stand（立場を取る）。" },
  { level:"C1", text:"Let's ___ light on the issue.", q:"自然な語は？", choices:["shed","make","do","take"], explain:"shed light（明らかにする）。" },
  { level:"C1", text:"We must ___ the consequences.", q:"自然な語は？", choices:["face","make","do","give"], explain:"face the consequences（結果に向き合う）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"photograph", syl:["PHO","to","graph"], ans:0, ja:"写真" },
  { level:"B2", word:"photographer", syl:["pho","TOG","ra","pher"], ans:1, ja:"写真家" },
  { level:"B2", word:"photographic", syl:["pho","to","GRAPH","ic"], ans:2, ja:"写真の" },
  { level:"B2", word:"economy", syl:["e","CON","o","my"], ans:1, ja:"経済" },
  { level:"B2", word:"economic", syl:["e","co","NOM","ic"], ans:2, ja:"経済の" },
  { level:"C1", word:"economical", syl:["e","co","NOM","i","cal"], ans:2, ja:"経済的な" },
  { level:"B2", word:"politics", syl:["POL","i","tics"], ans:0, ja:"政治" },
  { level:"B2", word:"political", syl:["po","LIT","i","cal"], ans:1, ja:"政治の" },
  { level:"B2", word:"politician", syl:["pol","i","TI","cian"], ans:2, ja:"政治家" },
  { level:"B2", word:"object (名詞)", syl:["OB","ject"], ans:0, ja:"物体（名詞）", say:"object" },
  { level:"B2", word:"object (動詞)", syl:["ob","JECT"], ans:1, ja:"反対する（動詞）", say:"object" },
  { level:"B2", word:"conduct (名詞)", syl:["CON","duct"], ans:0, ja:"行為（名詞）", say:"conduct" },
  { level:"B2", word:"conduct (動詞)", syl:["con","DUCT"], ans:1, ja:"行う（動詞）", say:"conduct" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"After all, we tried our best.", q:"自然なチャンク区切りは？", choices:["After all, / we tried our best","After / all we tried / our best","After all we / tried our best","After all we tried / our best"], explain:"前置きの句/主節、で区切る。" },
  { level:"B2", text:"In other words, it failed.", q:"自然なチャンク区切りは？", choices:["In other words, / it failed","In / other words it / failed","In other / words it failed","In other words it / failed"], explain:"談話標識/主節、で区切る。" },
  { level:"C1", text:"Granted that it's hard, we proceed.", q:"自然なチャンク区切りは？", choices:["Granted that it's hard, / we proceed","Granted / that it's hard we / proceed","Granted that / it's hard we proceed","Granted that it's hard we / proceed"], explain:"譲歩節/主節、で区切る。" },
  { level:"B2", text:"For the most part, it works.", q:"自然なチャンク区切りは？", choices:["For the most part, / it works","For / the most part it / works","For the / most part it works","For the most part it / works"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「念のため言っておくと」を伝えるなら？", choices:["Just to be clear,","Clear just now,","For sure say yes,","Note this please,"], explain:"Just to be clear ＝ 念のため明確にすると。" },
  { level:"B2", ja:"", text:"「言いにくいのですが」を伝えるなら？", choices:["I hate to say this, but","Hard say this now,","Difficult talk yes,","Bad news maybe,"], explain:"I hate to say this, but ＝ 言いにくいのですが。" },
  { level:"C1", ja:"", text:"「誤解のないように言うと」を伝えるなら？", choices:["To avoid any misunderstanding,","No mistake talk now,","Clear wrong yes,","Understand please maybe,"], explain:"To avoid any misunderstanding ＝ 誤解のないように。" },
  { level:"B2", ja:"", text:"「要するに」を伝えるなら？", choices:["The bottom line is,","Bottom say now,","End point yes,","Short talk maybe,"], explain:"The bottom line is ＝ 要するに。" },
  { level:"C1", ja:"", text:"「あくまで個人的見解ですが」を伝えるなら？", choices:["Speaking only for myself,","Only me talk now,","Personal alone yes,","I think maybe,"], explain:"Speaking only for myself ＝ あくまで個人的には。" },
  { level:"B2", ja:"", text:"「順を追って言うと」を伝えるなら？", choices:["Step by step,","Step talk now,","Order say yes,","One by maybe,"], explain:"Step by step ＝ 順を追って。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"会議で発言の順番を譲る：", choices:["Please, go ahead—I'll follow.","I talk first always.","Be quiet now.","Skip your turn."], explain:"相手に発言を譲る丁寧な表現。" },
  { level:"B2", text:"相手の懸念を受け止める：", choices:["I see where you're coming from.","You're overreacting.","That's irrelevant.","Stop worrying."], explain:"相手の立場を受け止める共感表現。" },
  { level:"C1", text:"反対意見を尊重しつつ述べる：", choices:["I respect that view, though I see it differently.","You're simply wrong.","That makes no sense.","Don't argue with me."], explain:"相手を尊重しつつ異なる見解を述べる。" },
  { level:"C1", text:"礼儀正しく催促する：", choices:["I just wanted to gently follow up.","Why so slow always?","Hurry up now.","You're too late."], explain:"gently follow up で柔らかく催促。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"全員の理解を確認する：", choices:["Are we all clear on this?","Only I understand.","No need to check.","Stop asking."], explain:"全員の理解を確認する。" },
  { level:"B2", text:"話を本筋に戻す：", choices:["Let's get back to the main point.","Keep going off topic.","No focus needed.","Talk about anything."], explain:"本筋に戻して議論を整える。" },
  { level:"C1", text:"建設的に異論を挟む：", choices:["I'd like to offer a different angle.","You're all wrong.","No other views allowed.","Stop thinking."], explain:"別角度を提示して議論を深める。" },
  { level:"C1", text:"合意点を明確にして前進する：", choices:["It sounds like we agree on the essentials.","We'll never agree.","Decide nothing.","Keep arguing."], explain:"合意点を明確にし前進する。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"Sounds good to me.", q:"賛同の調子は？", choices:["明るく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"賛同は明るく下げて。" },
  { level:"B2", text:"I'm not so sure about that.", q:"控えめな疑問の調子は？", choices:["sure を伸ばし下げ気味","強く言い切る","明るく上げる","速く下げる"], explain:"控えめな疑問は伸ばし＋下げ気味。" },
  { level:"C1", text:"Well, that's one way to put it.", q:"含みのある相づちの調子は？", choices:["ゆっくり下げ気味で含みを持たせる","明るく上げる","強く言い切る","速く上げる"], explain:"含みは間＋下げ気味で。" },
  { level:"B2", text:"Could you say that again?", q:"丁寧な聞き返しの調子は？", choices:["again を上げる↗","下げて終える","平坦に切る","小さく言う"], explain:"丁寧な聞き返しは語尾を上げ↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's FOCUS on what MATTERS most.", q:"強く読む語は？", choices:["focus / matters / most","let's / on / what","on / what","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"It's NOT about WINNING, it's about LEARNING.", q:"強く読む語は？", choices:["not / winning / learning","it's / about / it's","about / it's","均等"], explain:"対比される内容語を強く。" },
  { level:"B2", text:"We HAVE to MAKE a CHOICE now.", q:"強く読む語は？", choices:["have / make / choice / now","we / to / a","to / a","均等"], explain:"内容語を強く、機能語は弱く。" },
  { level:"C1", text:"LESS talk, MORE action.", q:"強く読む語は？", choices:["less / talk / more / action","none","the / a","均等"], explain:"対比の内容語を強く。" }
]);


/* 増量：瞬間英作文 大量16（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"ここで待ってます。","answer":"I'll wait here.","alts":[]},
  {"level":"A2","ja":"先に行ってて。","answer":"Go on ahead.","alts":[]},
  {"level":"A2","ja":"すぐ終わります。","answer":"I'll be done soon.","alts":[]},
  {"level":"A2","ja":"もう少しで着きます。","answer":"I'm almost there.","alts":[]},
  {"level":"A2","ja":"道に迷いました。","answer":"I got lost.","alts":[]},
  {"level":"A2","ja":"案内します。","answer":"Let me show you the way.","alts":[]},
  {"level":"A2","ja":"こっちです。","answer":"This way.","alts":[]},
  {"level":"A2","ja":"そこを左です。","answer":"Turn left there.","alts":[]},
  {"level":"A2","ja":"まっすぐ進んで。","answer":"Go straight ahead.","alts":[]},
  {"level":"A2","ja":"すぐそこです。","answer":"It's right over there.","alts":[]},
  {"level":"A2","ja":"時間どおりです。","answer":"We're on time.","alts":[]},
  {"level":"A2","ja":"少し遅れます。","answer":"I'll be a little late.","alts":[]},
  {"level":"A2","ja":"早めに着きました。","answer":"I arrived early.","alts":[]},
  {"level":"A2","ja":"ちょうど良かった。","answer":"Perfect timing.","alts":[]},
  {"level":"B1","ja":"順番に並びましょう。","answer":"Let's line up in order.","alts":[]},
  {"level":"B1","ja":"交代でやりましょう。","answer":"Let's take turns.","alts":[]},
  {"level":"B1","ja":"一緒に確認しましょう。","answer":"Let's check it together.","alts":[]},
  {"level":"B1","ja":"あとで合流します。","answer":"I'll catch up with you later.","alts":[]},
  {"level":"B1","ja":"準備はできています。","answer":"I'm all set.","alts":[]},
  {"level":"B1","ja":"まだ準備中です。","answer":"I'm still getting ready.","alts":[]},
  {"level":"B1","ja":"もう一度試してみます。","answer":"Let me try again.","alts":[]},
  {"level":"B1","ja":"うまくいきました。","answer":"It worked out.","alts":[]},
  {"level":"B1","ja":"残念ながらだめでした。","answer":"Unfortunately it didn't work.","alts":[]},
  {"level":"B1","ja":"次はうまくやります。","answer":"I'll do better next time.","alts":[]},
  {"level":"B1","ja":"あなたに任せます。","answer":"I'll leave it to you.","alts":[]},
  {"level":"B2","ja":"段取りを決めましょう。","answer":"Let's plan the steps.","alts":[]},
  {"level":"B2","ja":"役割を明確にしましょう。","answer":"Let's clarify the roles.","alts":[]},
  {"level":"B2","ja":"締切から逆算しましょう。","answer":"Let's work back from the deadline.","alts":[]},
  {"level":"B2","ja":"優先度の高い順にやりましょう。","answer":"Let's tackle the high-priority items first.","alts":[]},
  {"level":"B2","ja":"無駄を省きましょう。","answer":"Let's cut out the waste.","alts":[]},
  {"level":"B2","ja":"効率を上げましょう。","answer":"Let's improve efficiency.","alts":[]},
  {"level":"B2","ja":"品質を保ちましょう。","answer":"Let's maintain quality.","alts":[]},
  {"level":"B2","ja":"進捗を共有しましょう。","answer":"Let's share our progress.","alts":[]},
  {"level":"B2","ja":"課題を可視化しましょう。","answer":"Let's make the issues visible.","alts":[]},
  {"level":"B2","ja":"期待値をそろえましょう。","answer":"Let's align expectations.","alts":[]},
  {"level":"B2","ja":"前提を明示しましょう。","answer":"Let's state the assumptions.","alts":[]},
  {"level":"B2","ja":"合意事項を確認しましょう。","answer":"Let's confirm what we agreed.","alts":[]},
  {"level":"B2","ja":"次の一手を決めましょう。","answer":"Let's decide the next move.","alts":[]},
  {"level":"B2","ja":"教訓を残しましょう。","answer":"Let's capture the lessons.","alts":[]},
  {"level":"C1","ja":"可逆な選択を優先しましょう。","answer":"Let's prioritize reversible choices.","alts":[]},
  {"level":"C1","ja":"前提を疑いましょう。","answer":"Let's question the premise.","alts":[]},
  {"level":"C1","ja":"長期で最適化しましょう。","answer":"Let's optimize for the long run.","alts":[]},
  {"level":"C1","ja":"成功基準を先に決めましょう。","answer":"Let's define success criteria first.","alts":[]},
  {"level":"C1","ja":"不確実性を織り込みましょう。","answer":"Let's bake in the uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を見積もりましょう。","answer":"Let's estimate the opportunity cost.","alts":[]},
  {"level":"C1","ja":"時間軸を分けましょう。","answer":"Let's separate the time horizons.","alts":[]},
  {"level":"C1","ja":"因果を確かめましょう。","answer":"Let's verify the causation.","alts":[]},
  {"level":"C1","ja":"仮説を検証しましょう。","answer":"Let's test the hypothesis.","alts":[]},
  {"level":"C1","ja":"前例から学びましょう。","answer":"Let's learn from precedent.","alts":[]}
]);


/* 増量：瞬間英作文 大量17（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"これは何ですか。","answer":"What is this?","alts":[]},
  {"level":"A2","ja":"どこにありますか。","answer":"Where is it?","alts":[]},
  {"level":"A2","ja":"いつ始まりますか。","answer":"When does it start?","alts":[]},
  {"level":"A2","ja":"どうやって行きますか。","answer":"How do I get there?","alts":[]},
  {"level":"A2","ja":"いくらですか。","answer":"How much is it?","alts":[]},
  {"level":"A2","ja":"どちらですか。","answer":"Which one is it?","alts":[]},
  {"level":"A2","ja":"どのくらいかかりますか。","answer":"How long does it take?","alts":[]},
  {"level":"A2","ja":"何が必要ですか。","answer":"What do I need?","alts":[]},
  {"level":"A2","ja":"誰に聞けばいいですか。","answer":"Who should I ask?","alts":[]},
  {"level":"A2","ja":"どこで買えますか。","answer":"Where can I buy it?","alts":[]},
  {"level":"A2","ja":"何が問題ですか。","answer":"What's the problem?","alts":[]},
  {"level":"B1","ja":"もう少し詳しく。","answer":"A bit more detail, please.","alts":[]},
  {"level":"B1","ja":"どういう意味ですか。","answer":"What do you mean?","alts":[]},
  {"level":"B1","ja":"言い換えてもらえますか。","answer":"Could you rephrase that?","alts":[]},
  {"level":"B1","ja":"なぜそう思いますか。","answer":"Why do you think so?","alts":[]},
  {"level":"B1","ja":"根拠は何ですか。","answer":"What's your basis for that?","alts":[]},
  {"level":"B1","ja":"代わりに何ができますか。","answer":"What can we do instead?","alts":[]},
  {"level":"B1","ja":"どこから始めますか。","answer":"Where do we start?","alts":[]},
  {"level":"B1","ja":"何を優先しますか。","answer":"What do we prioritize?","alts":[]},
  {"level":"B1","ja":"誰が担当しますか。","answer":"Who's in charge?","alts":[]},
  {"level":"B1","ja":"いつまでに必要ですか。","answer":"By when do you need it?","alts":[]},
  {"level":"B1","ja":"どう進めますか。","answer":"How should we proceed?","alts":[]},
  {"level":"B1","ja":"何か懸念はありますか。","answer":"Are there any concerns?","alts":[]},
  {"level":"B2","ja":"前提は何ですか。","answer":"What are the assumptions?","alts":[]},
  {"level":"B2","ja":"どんなリスクがありますか。","answer":"What risks are involved?","alts":[]},
  {"level":"B2","ja":"成功の基準は何ですか。","answer":"What's the measure of success?","alts":[]},
  {"level":"B2","ja":"何を犠牲にしますか。","answer":"What are we giving up?","alts":[]},
  {"level":"B2","ja":"別の選択肢はありますか。","answer":"Are there other options?","alts":[]},
  {"level":"B2","ja":"なぜ今なのですか。","answer":"Why now?","alts":[]},
  {"level":"B2","ja":"誰が影響を受けますか。","answer":"Who's affected?","alts":[]},
  {"level":"B2","ja":"どう検証しますか。","answer":"How do we verify it?","alts":[]},
  {"level":"B2","ja":"何が変われば結論が変わりますか。","answer":"What would change the conclusion?","alts":[]},
  {"level":"B2","ja":"どこに不確実性がありますか。","answer":"Where's the uncertainty?","alts":[]},
  {"level":"B2","ja":"何を見落としていますか。","answer":"What are we missing?","alts":[]},
  {"level":"B2","ja":"最悪の場合どうなりますか。","answer":"What's the worst case?","alts":[]},
  {"level":"B2","ja":"それは可逆ですか。","answer":"Is that reversible?","alts":[]},
  {"level":"B2","ja":"根拠はどれくらい強いですか。","answer":"How strong is the evidence?","alts":[]},
  {"level":"B2","ja":"どう測定しますか。","answer":"How do we measure it?","alts":[]},
  {"level":"B2","ja":"誰が決定しますか。","answer":"Who makes the call?","alts":[]},
  {"level":"B2","ja":"いつ見直しますか。","answer":"When do we revisit it?","alts":[]},
  {"level":"B2","ja":"何が成功を妨げますか。","answer":"What's blocking success?","alts":[]},
  {"level":"B2","ja":"どこで妥協できますか。","answer":"Where can we compromise?","alts":[]},
  {"level":"B2","ja":"次は何をしますか。","answer":"What's the next step?","alts":[]},
  {"level":"C1","ja":"その前提は検証可能ですか。","answer":"Is that premise testable?","alts":[]},
  {"level":"C1","ja":"因果と相関を区別していますか。","answer":"Are we separating cause and correlation?","alts":[]},
  {"level":"C1","ja":"反証する証拠は何ですか。","answer":"What evidence would disprove it?","alts":[]},
  {"level":"C1","ja":"どんなバイアスがありますか。","answer":"What biases are at play?","alts":[]},
  {"level":"C1","ja":"機会費用はいくらですか。","answer":"What's the opportunity cost?","alts":[]},
  {"level":"C1","ja":"撤退条件は何ですか。","answer":"What are the exit criteria?","alts":[]},
  {"level":"C1","ja":"どの仮定が最も脆いですか。","answer":"Which assumption is weakest?","alts":[]},
  {"level":"C1","ja":"長期的な影響は何ですか。","answer":"What's the long-term impact?","alts":[]},
  {"level":"C1","ja":"前例はありますか。","answer":"Is there a precedent?","alts":[]},
  {"level":"C1","ja":"それは根本原因ですか。","answer":"Is that the root cause?","alts":[]},
  {"level":"C1","ja":"サンプルは代表的ですか。","answer":"Is the sample representative?","alts":[]},
  {"level":"C1","ja":"誰の視点が欠けていますか。","answer":"Whose perspective is missing?","alts":[]},
  {"level":"C1","ja":"どこで判断を保留すべきですか。","answer":"Where should we withhold judgment?","alts":[]},
  {"level":"C1","ja":"最も単純な説明は何ですか。","answer":"What's the simplest explanation?","alts":[]}
]);

/* 増量セットAY：高次スキル各種 大量8（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a compromise.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a compromise（妥協に至る）。" },
  { level:"B2", text:"They ___ an exception.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an exception（例外を設ける）。" },
  { level:"B2", text:"Let's ___ control of this.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take control（主導権を取る）。" },
  { level:"C1", text:"We ___ a breakthrough.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a breakthrough（突破口を開く）。" },
  { level:"C1", text:"Let's ___ a fine line.", q:"自然な語は？", choices:["tread","make","do","take"], explain:"tread a fine line（際どい線を行く）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「率直に申し上げると」を伝えるなら？", choices:["To be candid,","Candid talk now,","Honest alone yes,","Direct maybe,"], explain:"To be candid ＝ 率直に申し上げると。" },
  { level:"C1", ja:"", text:"「誤解を恐れずに言えば」を伝えるなら？", choices:["At the risk of being misunderstood,","Risk wrong talk now,","No fear say yes,","Brave word maybe,"], explain:"At the risk of being misunderstood ＝ 誤解を恐れずに言えば。" },
  { level:"B2", ja:"", text:"「言い方を変えると」を伝えるなら？", choices:["To put it differently,","Different say now,","Change word yes,","Other talk maybe,"], explain:"To put it differently ＝ 言い方を変えると。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言の意図を確認する：", choices:["If I understand you correctly, you mean...","I wasn't listening.","You're wrong.","No need to ask."], explain:"発言意図を確認して誤解を防ぐ。" },
  { level:"C1", text:"議論を一段深める：", choices:["Let's dig a little deeper into that.","Let's stay shallow.","No深掘り needed.","Move on quickly."], explain:"論点を深掘りする。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に異論を述べる：", choices:["I see it a little differently, if I may.","You're flat wrong.","That's nonsense.","Stop talking."], explain:"if I may で丁寧に異論を述べる。" },
  { level:"C1", text:"相手の貢献を称える：", choices:["Your input really shaped this outcome.","I did it all.","It was nothing special.","Anyone could."], explain:"具体的に貢献を称える。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That's a fair point.", q:"納得の調子は？", choices:["落ち着いて下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"納得は落ち着いて下げ↘。" },
  { level:"C1", text:"Hmm, I'd push back on that.", q:"穏やかな反論の調子は？", choices:["柔らかく始め push back を強める","明るく上げる","速く言い切る","小さく言う"], explain:"穏やかな反論は柔らかく始め要点を強める。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's THINK before we ACT.", q:"強く読む語は？", choices:["think / act","let's / before / we","before / we","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"FACTS first, OPINIONS later.", q:"強く読む語は？", choices:["facts / first / opinions / later","none","the / a","均等"], explain:"対比の内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To sum up, we agree.", q:"自然なチャンク区切りは？", choices:["To sum up, / we agree","To / sum up we / agree","To sum / up we agree","To sum up we / agree"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"That said, risks remain.", q:"自然なチャンク区切りは？", choices:["That said, / risks remain","That / said risks / remain","That said / risks remain","That said risks / remain"], explain:"談話標識/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"democracy", syl:["de","MOC","ra","cy"], ans:1, ja:"民主主義" },
  { level:"B2", word:"democratic", syl:["dem","o","CRAT","ic"], ans:2, ja:"民主的な" },
  { level:"B2", word:"analysis", syl:["a","NAL","y","sis"], ans:1, ja:"分析" },
  { level:"B2", word:"analytical", syl:["an","a","LYT","i","cal"], ans:2, ja:"分析的な" },
  { level:"B2", word:"protest (名詞)", syl:["PRO","test"], ans:0, ja:"抗議（名詞）", say:"protest" },
  { level:"B2", word:"protest (動詞)", syl:["pro","TEST"], ans:1, ja:"抗議する（動詞）", say:"protest" }
]);


/* 増量：瞬間英作文 大量18（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もう行かなきゃ。","answer":"I have to go now.","alts":[]},
  {"level":"A2","ja":"楽しんでね。","answer":"Enjoy yourself.","alts":[]},
  {"level":"A2","ja":"気をつけて。","answer":"Be careful.","alts":[]},
  {"level":"A2","ja":"ゆっくりして。","answer":"Make yourself at home.","alts":[]},
  {"level":"A2","ja":"何か飲みますか。","answer":"Would you like a drink?","alts":[]},
  {"level":"A2","ja":"手伝います。","answer":"Let me give you a hand.","alts":[]},
  {"level":"A2","ja":"心配しないで。","answer":"Don't worry.","alts":[]},
  {"level":"A2","ja":"落ち着いて。","answer":"Calm down.","alts":[]},
  {"level":"B1","ja":"気を遣わないで。","answer":"Don't go to any trouble.","alts":[]},
  {"level":"B1","ja":"遠慮しておきます。","answer":"I'll pass this time.","alts":[]},
  {"level":"B1","ja":"ぜひお願いします。","answer":"I'd love that.","alts":[]},
  {"level":"B1","ja":"またの機会に。","answer":"Maybe another time.","alts":[]},
  {"level":"B1","ja":"お任せします。","answer":"I'll leave it up to you.","alts":[]},
  {"level":"B1","ja":"どちらでもいいです。","answer":"Either is fine.","alts":[]},
  {"level":"B1","ja":"お気遣いなく。","answer":"Please don't worry about me.","alts":[]},
  {"level":"B1","ja":"助かりました。","answer":"You saved me.","alts":[]},
  {"level":"B1","ja":"恐れ入ります。","answer":"I appreciate it.","alts":[]},
  {"level":"B1","ja":"そうかもしれません。","answer":"That might be true.","alts":[]},
  {"level":"B1","ja":"たぶん大丈夫です。","answer":"It should be fine.","alts":[]},
  {"level":"B2","ja":"建設的に話しましょう。","answer":"Let's keep it constructive.","alts":[]},
  {"level":"B2","ja":"要点に絞りましょう。","answer":"Let's stick to the key points.","alts":[]},
  {"level":"B2","ja":"前向きに捉えましょう。","answer":"Let's look at the bright side.","alts":[]},
  {"level":"B2","ja":"冷静に考えましょう。","answer":"Let's think it through calmly.","alts":[]},
  {"level":"B2","ja":"事実を確認しましょう。","answer":"Let's check the facts.","alts":[]},
  {"level":"B2","ja":"時間を有効に使いましょう。","answer":"Let's make good use of the time.","alts":[]},
  {"level":"B2","ja":"柔軟に対応しましょう。","answer":"Let's stay flexible.","alts":[]},
  {"level":"B2","ja":"期待を明確にしましょう。","answer":"Let's set clear expectations.","alts":[]},
  {"level":"B2","ja":"懸念を共有しましょう。","answer":"Let's share any concerns.","alts":[]},
  {"level":"B2","ja":"合意を確認しましょう。","answer":"Let's confirm our agreement.","alts":[]},
  {"level":"B2","ja":"優先度を見直しましょう。","answer":"Let's revisit the priorities.","alts":[]},
  {"level":"B2","ja":"早めに相談しましょう。","answer":"Let's consult early.","alts":[]},
  {"level":"B2","ja":"状況を整理しましょう。","answer":"Let's organize the situation.","alts":[]},
  {"level":"B2","ja":"代替案を持ちましょう。","answer":"Let's have a backup plan.","alts":[]},
  {"level":"B2","ja":"根拠を共有しましょう。","answer":"Let's share the reasoning.","alts":[]},
  {"level":"B2","ja":"次の手を考えましょう。","answer":"Let's think about the next move.","alts":[]},
  {"level":"B2","ja":"教訓を活かしましょう。","answer":"Let's apply the lessons.","alts":[]},
  {"level":"C1","ja":"可逆性を重視しましょう。","answer":"Let's value reversibility.","alts":[]},
  {"level":"C1","ja":"長期で考えましょう。","answer":"Let's think long-term.","alts":[]},
  {"level":"C1","ja":"成功を定義しましょう。","answer":"Let's define success.","alts":[]},
  {"level":"C1","ja":"不確実性に備えましょう。","answer":"Let's prepare for uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用を考えましょう。","answer":"Let's weigh the opportunity cost.","alts":[]},
  {"level":"C1","ja":"一方通行を避けましょう。","answer":"Let's avoid irreversible moves.","alts":[]},
  {"level":"C1","ja":"最悪を想定しましょう。","answer":"Let's assume the worst.","alts":[]},
  {"level":"C1","ja":"時間軸を分けましょう。","answer":"Let's separate the horizons.","alts":[]},
  {"level":"C1","ja":"因果を検証しましょう。","answer":"Let's test the causation.","alts":[]}
]);

/* 増量セットBA：高次スキル各種 大量9（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a balance.", q:"自然な語は？", choices:["strike","make","do","take"], explain:"strike a balance（バランスを取る）。" },
  { level:"B2", text:"They ___ a difference.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a difference（違いを生む）。" },
  { level:"B2", text:"Let's ___ note of this.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take note（書き留める・注目する）。" },
  { level:"C1", text:"We ___ headway on it.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make headway（進展する）。" },
  { level:"C1", text:"Let's ___ the bullet.", q:"自然な語は？", choices:["bite","make","do","take"], explain:"bite the bullet（覚悟を決める）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「言うまでもなく」を伝えるなら？", choices:["Needless to say,","No say need now,","Of course talk yes,","Obvious maybe,"], explain:"Needless to say ＝ 言うまでもなく。" },
  { level:"C1", ja:"", text:"「公平を期すために言えば」を伝えるなら？", choices:["In all fairness,","Fair all talk now,","Just say yes,","Even word maybe,"], explain:"In all fairness ＝ 公平を期すために。" },
  { level:"B2", ja:"", text:"「ありていに言えば」を伝えるなら？", choices:["Plainly put,","Plain say now,","Simple talk yes,","Flat word maybe,"], explain:"Plainly put ＝ ありていに言えば。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を要約して返す：", choices:["So what you're saying is...","I didn't hear you.","You're wrong.","No need to recap."], explain:"発言を要約して理解を示す。" },
  { level:"C1", text:"対立を共通目標で束ねる：", choices:["We're ultimately after the same thing.","One must lose.","No common ground.","Let's just fight."], explain:"共通目標で対立を束ねる。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に時間を確認する：", choices:["Do you have a moment to talk?","Talk to me now.","You must listen.","Why so busy?"], explain:"Do you have a moment …? で丁寧に確認。" },
  { level:"C1", text:"謝意を具体的に伝える：", choices:["Thank you—your patience made this possible.","Thanks, bye.","You owe me.","It's nothing."], explain:"具体的に謝意を伝える。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"I appreciate that.", q:"感謝の調子は？", choices:["温かく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"感謝は温かく下げて。" },
  { level:"C1", text:"Let's not get ahead of ourselves.", q:"たしなめる調子は？", choices:["落ち着いてゆっくり下げる","明るく上げる","速く言い切る","強く上げる"], explain:"たしなめは落ち着いて下げて。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's KEEP it SHORT and SIMPLE.", q:"強く読む語は？", choices:["keep / short / simple","let's / it / and","it / and","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"SLOW and STEADY wins the RACE.", q:"強く読む語は？", choices:["slow / steady / wins / race","and / the","the / a","均等"], explain:"内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"By the way, did you finish?", q:"自然なチャンク区切りは？", choices:["By the way, / did you finish","By / the way did you / finish","By the / way did you finish","By the way did you / finish"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"Even so, we should try.", q:"自然なチャンク区切りは？", choices:["Even so, / we should try","Even / so we should / try","Even so / we should try","Even so we should / try"], explain:"談話標識/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"industry", syl:["IN","dus","try"], ans:0, ja:"産業" },
  { level:"B2", word:"industrial", syl:["in","DUS","tri","al"], ans:1, ja:"産業の" },
  { level:"C1", word:"industrious", syl:["in","DUS","tri","ous"], ans:1, ja:"勤勉な" },
  { level:"B2", word:"rebel (名詞)", syl:["REB","el"], ans:0, ja:"反逆者（名詞）", say:"rebel" },
  { level:"B2", word:"rebel (動詞)", syl:["re","BEL"], ans:1, ja:"反逆する（動詞）", say:"rebel" }
]);


/* 増量：瞬間英作文 大量19（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"今日は何曜日ですか。","answer":"What day is it today?","alts":[]},
  {"level":"A2","ja":"今、何時頃ですか。","answer":"About what time is it?","alts":[]},
  {"level":"A2","ja":"外は寒いですか。","answer":"Is it cold outside?","alts":[]},
  {"level":"A2","ja":"傘は要りますか。","answer":"Do I need an umbrella?","alts":[]},
  {"level":"A2","ja":"もう食べましたか。","answer":"Have you eaten yet?","alts":[]},
  {"level":"A2","ja":"これでいいですか。","answer":"Is this okay?","alts":[]},
  {"level":"A2","ja":"まだ時間ありますか。","answer":"Do we still have time?","alts":[]},
  {"level":"A2","ja":"手伝いましょうか。","answer":"Shall I help?","alts":[]},
  {"level":"A2","ja":"一緒に行きますか。","answer":"Shall we go together?","alts":[]},
  {"level":"A2","ja":"始めましょうか。","answer":"Shall we begin?","alts":[]},
  {"level":"A2","ja":"休みましょうか。","answer":"Shall we take a break?","alts":[]},
  {"level":"A2","ja":"帰りましょうか。","answer":"Shall we head back?","alts":[]},
  {"level":"A2","ja":"注文しましょうか。","answer":"Shall we order?","alts":[]},
  {"level":"A2","ja":"電気を消しましょうか。","answer":"Shall I turn off the lights?","alts":[]},
  {"level":"A2","ja":"窓を開けましょうか。","answer":"Shall I open the window?","alts":[]},
  {"level":"B1","ja":"そろそろ決めましょうか。","answer":"Shall we decide now?","alts":[]},
  {"level":"B1","ja":"先に進めましょうか。","answer":"Shall we move on?","alts":[]},
  {"level":"B1","ja":"確認しておきましょうか。","answer":"Shall we double-check?","alts":[]},
  {"level":"B1","ja":"もう一度やりましょうか。","answer":"Shall we try again?","alts":[]},
  {"level":"B1","ja":"分担しましょうか。","answer":"Shall we divide it up?","alts":[]},
  {"level":"B1","ja":"代わりましょうか。","answer":"Shall I take over?","alts":[]},
  {"level":"B1","ja":"まとめておきましょうか。","answer":"Shall I sum it up?","alts":[]},
  {"level":"B1","ja":"予定を立てましょうか。","answer":"Shall we make a plan?","alts":[]},
  {"level":"B1","ja":"連絡しておきましょうか。","answer":"Shall I reach out?","alts":[]},
  {"level":"B1","ja":"後で話しましょうか。","answer":"Shall we talk later?","alts":[]},
  {"level":"B1","ja":"資料を送りましょうか。","answer":"Shall I send the documents?","alts":[]},
  {"level":"B1","ja":"席を取りましょうか。","answer":"Shall I save a seat?","alts":[]},
  {"level":"B1","ja":"先に始めましょうか。","answer":"Shall we start without them?","alts":[]},
  {"level":"B1","ja":"確認を取りましょうか。","answer":"Shall I get confirmation?","alts":[]},
  {"level":"B2","ja":"論点を絞りましょうか。","answer":"Shall we narrow the focus?","alts":[]},
  {"level":"B2","ja":"優先順位をつけましょうか。","answer":"Shall we prioritize?","alts":[]},
  {"level":"B2","ja":"前提を共有しましょうか。","answer":"Shall we share the assumptions?","alts":[]},
  {"level":"B2","ja":"代替案を出しましょうか。","answer":"Shall I propose an alternative?","alts":[]},
  {"level":"B2","ja":"影響を試算しましょうか。","answer":"Shall we estimate the impact?","alts":[]},
  {"level":"B2","ja":"担当を決めましょうか。","answer":"Shall we assign owners?","alts":[]},
  {"level":"B2","ja":"期日を調整しましょうか。","answer":"Shall we adjust the timeline?","alts":[]},
  {"level":"B2","ja":"懸念を一覧化しましょうか。","answer":"Shall we list the concerns?","alts":[]},
  {"level":"B2","ja":"方針を文書化しましょうか。","answer":"Shall I document the approach?","alts":[]},
  {"level":"B2","ja":"合意を取りましょうか。","answer":"Shall we get sign-off?","alts":[]},
  {"level":"B2","ja":"現状を整理しましょうか。","answer":"Shall we take stock?","alts":[]},
  {"level":"B2","ja":"範囲を確認しましょうか。","answer":"Shall we confirm the scope?","alts":[]},
  {"level":"B2","ja":"リスクを評価しましょうか。","answer":"Shall we assess the risks?","alts":[]},
  {"level":"B2","ja":"根拠を補強しましょうか。","answer":"Shall I strengthen the rationale?","alts":[]},
  {"level":"B2","ja":"進捗を共有しましょうか。","answer":"Shall we share progress?","alts":[]},
  {"level":"B2","ja":"見直しを入れましょうか。","answer":"Shall we build in a review?","alts":[]},
  {"level":"B2","ja":"早めに着手しましょうか。","answer":"Shall we start early?","alts":[]},
  {"level":"B2","ja":"想定を確認しましょうか。","answer":"Shall we verify the assumptions?","alts":[]},
  {"level":"B2","ja":"教訓を残しましょうか。","answer":"Shall we capture the lessons?","alts":[]},
  {"level":"B2","ja":"次の手を決めましょうか。","answer":"Shall we decide the next step?","alts":[]},
  {"level":"C1","ja":"可逆性を確認しましょうか。","answer":"Shall we check reversibility?","alts":[]},
  {"level":"C1","ja":"前提を検証しましょうか。","answer":"Shall we validate the premise?","alts":[]},
  {"level":"C1","ja":"長期影響を見ましょうか。","answer":"Shall we look at the long-term impact?","alts":[]},
  {"level":"C1","ja":"成功条件を定めましょうか。","answer":"Shall we define success?","alts":[]},
  {"level":"C1","ja":"機会費用を比べましょうか。","answer":"Shall we compare opportunity costs?","alts":[]},
  {"level":"C1","ja":"最悪を想定しましょうか。","answer":"Shall we assume the worst?","alts":[]},
  {"level":"C1","ja":"撤退条件を決めましょうか。","answer":"Shall we set exit criteria?","alts":[]},
  {"level":"C1","ja":"因果を確かめましょうか。","answer":"Shall we verify causation?","alts":[]},
  {"level":"C1","ja":"仮説を立てましょうか。","answer":"Shall we form a hypothesis?","alts":[]},
  {"level":"C1","ja":"前例を調べましょうか。","answer":"Shall we check for precedent?","alts":[]},
  {"level":"C1","ja":"根本原因を探りましょうか。","answer":"Shall we find the root cause?","alts":[]},
  {"level":"C1","ja":"時間軸を分けましょうか。","answer":"Shall we separate the horizons?","alts":[]},
  {"level":"C1","ja":"不確実性に備えましょうか。","answer":"Shall we prepare for uncertainty?","alts":[]},
  {"level":"C1","ja":"一方通行を見極めましょうか。","answer":"Shall we spot the one-way doors?","alts":[]}
]);


/* 増量：瞬間英作文 大量20 仕上げ（5倍ペース達成） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"これでいいですよ。","answer":"This is fine.","alts":[]},
  {"level":"A2","ja":"よくわかりました。","answer":"I understand now.","alts":[]},
  {"level":"A2","ja":"やってみます。","answer":"I'll give it a try.","alts":[]},
  {"level":"A2","ja":"大丈夫です。","answer":"It's all right.","alts":[]},
  {"level":"B1","ja":"たぶんそうです。","answer":"Probably.","alts":[]},
  {"level":"B1","ja":"一理ありますね。","answer":"You have a point.","alts":[]},
  {"level":"B1","ja":"それは難しいですね。","answer":"That's tricky.","alts":[]},
  {"level":"B1","ja":"考えてみますね。","answer":"I'll consider it.","alts":[]},
  {"level":"B2","ja":"理にかなっています。","answer":"That's reasonable.","alts":[]},
  {"level":"B2","ja":"根拠が必要です。","answer":"We need evidence.","alts":[]},
  {"level":"B2","ja":"前提を確認したいです。","answer":"I'd like to check the premise.","alts":[]},
  {"level":"B2","ja":"別の見方もあります。","answer":"There's another perspective.","alts":[]},
  {"level":"B2","ja":"条件によります。","answer":"It depends on conditions.","alts":[]},
  {"level":"B2","ja":"範囲を絞りましょう。","answer":"Let's narrow the scope.","alts":[]},
  {"level":"B2","ja":"具体化しましょう。","answer":"Let's make it concrete.","alts":[]},
  {"level":"B2","ja":"検証が必要です。","answer":"It needs verification.","alts":[]},
  {"level":"C1","ja":"前提が揺らぎます。","answer":"The premise is shaky.","alts":[]},
  {"level":"C1","ja":"最も単純な説明を選びます。","answer":"Let's choose the simplest explanation.","alts":[]},
  {"level":"C1","ja":"前提を明示すべきです。","answer":"We should make the premise explicit.","alts":[]}
]);

/* 増量セットBC：高次スキル各種 最終仕上げ（5倍ペース達成） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ sense of this.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make sense of（理解する）。" },
  { level:"B2", text:"They ___ a point.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a point（主張する）。" },
  { level:"B2", text:"Let's ___ action.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take action（行動を起こす）。" },
  { level:"C1", text:"We ___ amends.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make amends（埋め合わせをする）。" },
  { level:"C1", text:"Let's ___ the initiative.", q:"自然な語は？", choices:["seize","make","do","give"], explain:"seize the initiative（主導権を握る）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「正直なところ」を伝えるなら？", choices:["To tell the truth,","Truth tell now,","Honest alone yes,","Real talk maybe,"], explain:"To tell the truth ＝ 正直なところ。" },
  { level:"C1", ja:"", text:"「結論を急げば」を伝えるなら？", choices:["To cut a long story short,","Cut long now,","Quick end yes,","Short talk maybe,"], explain:"To cut a long story short ＝ 結論を急げば。" },
  { level:"B2", ja:"", text:"「逆の見方をすれば」を伝えるなら？", choices:["Looked at another way,","Other look now,","Reverse see yes,","Back view maybe,"], explain:"Looked at another way ＝ 逆の見方をすれば。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を引き取って広げる：", choices:["Building on that, I'd add...","Stop right there.","You're wrong.","No more input."], explain:"発言を引き取り議論を広げる。" },
  { level:"C1", text:"決定の前に異論を募る：", choices:["Before we decide, any objections?","Decide now, no talk.","Objections banned.","Skip discussion."], explain:"決定前に異論を募り合意を固める。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に支援を申し出る：", choices:["Let me know if there's anything I can do.","I won't help.","Do it yourself.","Why ask me?"], explain:"控えめに支援を申し出る。" },
  { level:"C1", text:"批判を改善提案に変える：", choices:["One thing that might help is...","This is all wrong.","You failed badly.","Give up now."], explain:"批判を建設的な提案に変える。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That's a relief.", q:"安堵の調子は？", choices:["息を抜くように下げる↘","強く上げる↗","平坦に切る","ためらう"], explain:"安堵は息を抜くように下げて。" },
  { level:"C1", text:"Let's circle back to that.", q:"保留の調子は？", choices:["落ち着いて下げ気味で","明るく上げる","速く言い切る","強く上げる"], explain:"保留は落ち着いて下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's GIVE it our BEST shot.", q:"強く読む語は？", choices:["give / best / shot","let's / it / our","it / our","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"ACTIONS, not WORDS, define US.", q:"強く読む語は？", choices:["actions / words / define / us","not / the","the / a","均等"], explain:"対比の内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"In short, it succeeded.", q:"自然なチャンク区切りは？", choices:["In short, / it succeeded","In / short it / succeeded","In short it / succeeded","In short it succeeded /"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"Above all, stay honest.", q:"自然なチャンク区切りは？", choices:["Above all, / stay honest","Above / all stay / honest","Above all stay / honest","Above all / stay honest"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"history", syl:["HIS","to","ry"], ans:0, ja:"歴史" },
  { level:"B2", word:"historic", syl:["his","TOR","ic"], ans:1, ja:"歴史的な" },
  { level:"C1", word:"historical", syl:["his","TOR","i","cal"], ans:1, ja:"歴史の" },
  { level:"B2", word:"convert (名詞)", syl:["CON","vert"], ans:0, ja:"改宗者（名詞）", say:"convert" },
  { level:"B2", word:"convert (動詞)", syl:["con","VERT"], ans:1, ja:"変換する（動詞）", say:"convert" }
]);


/* 増量：瞬間英作文 大量21（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"ドアを閉めてもらえますか。","answer":"Could you close the door?","alts":[]},
  {"level":"A2","ja":"窓を開けてもいいですか。","answer":"May I open the window?","alts":[]},
  {"level":"A2","ja":"電気をつけてください。","answer":"Please turn on the light.","alts":[]},
  {"level":"A2","ja":"もう少しゆっくり話して。","answer":"Please speak more slowly.","alts":[]},
  {"level":"A2","ja":"見えますか。","answer":"Can you see it?","alts":[]},
  {"level":"A2","ja":"わかりますか。","answer":"Do you understand?","alts":[]},
  {"level":"A2","ja":"手伝ってくれますか。","answer":"Will you help me?","alts":[]},
  {"level":"A2","ja":"ここに座ってもいいですか。","answer":"May I sit here?","alts":[]},
  {"level":"A2","ja":"写真を撮ってもらえますか。","answer":"Could you take a photo?","alts":[]},
  {"level":"A2","ja":"道を教えてください。","answer":"Please tell me the way.","alts":[]},
  {"level":"A2","ja":"ちょっと待ってください。","answer":"Please wait a moment.","alts":[]},
  {"level":"A2","ja":"これをください。","answer":"I'll take this one.","alts":[]},
  {"level":"A2","ja":"お会計をお願いします。","answer":"Check, please.","alts":[]},
  {"level":"B1","ja":"それを確認してもらえますか。","answer":"Could you check that for me?","alts":[]},
  {"level":"B1","ja":"もう少し詳しく教えてください。","answer":"Could you tell me more?","alts":[]},
  {"level":"B1","ja":"代わりに行ってもらえますか。","answer":"Could you go instead?","alts":[]},
  {"level":"B1","ja":"今やる必要がありますか。","answer":"Do we need to do it now?","alts":[]},
  {"level":"B1","ja":"後でやってもいいですか。","answer":"May I do it later?","alts":[]},
  {"level":"B1","ja":"手順を教えてください。","answer":"Please show me the steps.","alts":[]},
  {"level":"B1","ja":"いつ届きますか。","answer":"When will it arrive?","alts":[]},
  {"level":"B1","ja":"どのくらいかかりますか。","answer":"How long will it take?","alts":[]},
  {"level":"B1","ja":"別の方法はありますか。","answer":"Is there another way?","alts":[]},
  {"level":"B1","ja":"これで合っていますか。","answer":"Is this correct?","alts":[]},
  {"level":"B1","ja":"変更してもらえますか。","answer":"Could you change it?","alts":[]},
  {"level":"B1","ja":"もう終わりましたか。","answer":"Are you done yet?","alts":[]},
  {"level":"B2","ja":"期限を延ばしてもらえますか。","answer":"Could you extend the deadline?","alts":[]},
  {"level":"B2","ja":"優先順位を見直しましょう。","answer":"Let's reprioritize.","alts":[]},
  {"level":"B2","ja":"根拠を示してもらえますか。","answer":"Could you show the rationale?","alts":[]},
  {"level":"B2","ja":"前提を確認させてください。","answer":"Let me confirm the assumptions.","alts":[]},
  {"level":"B2","ja":"合意を文書化しましょう。","answer":"Let's document the agreement.","alts":[]},
  {"level":"B2","ja":"懸念を共有させてください。","answer":"Let me share a concern.","alts":[]},
  {"level":"B2","ja":"手戻りを避けましょう。","answer":"Let's avoid rework.","alts":[]},
  {"level":"B2","ja":"状況を整理しましょう。","answer":"Let's take stock.","alts":[]},
  {"level":"C1","ja":"長期で最適化しましょう。","answer":"Let's optimize for the long term.","alts":[]},
  {"level":"C1","ja":"成功基準を定義しましょう。","answer":"Let's define the success criteria.","alts":[]},
  {"level":"C1","ja":"不確実性を織り込みましょう。","answer":"Let's account for uncertainty.","alts":[]},
  {"level":"C1","ja":"一方通行を見極めましょう。","answer":"Let's identify one-way doors.","alts":[]},
  {"level":"C1","ja":"前例を調べましょう。","answer":"Let's look for precedent.","alts":[]}
]);


/* 増量：瞬間英作文 大量22（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"気に入りました。","answer":"I like it.","alts":[]},
  {"level":"A2","ja":"問題ないです。","answer":"That's fine.","alts":[]},
  {"level":"A2","ja":"難しいですね。","answer":"That's hard.","alts":[]},
  {"level":"A2","ja":"簡単です。","answer":"It's easy.","alts":[]},
  {"level":"A2","ja":"楽しかったです。","answer":"That was fun.","alts":[]},
  {"level":"A2","ja":"疲れました。","answer":"I'm tired.","alts":[]},
  {"level":"A2","ja":"お腹が空きました。","answer":"I'm hungry.","alts":[]},
  {"level":"A2","ja":"喉が渇きました。","answer":"I'm thirsty.","alts":[]},
  {"level":"A2","ja":"眠いです。","answer":"I'm sleepy.","alts":[]},
  {"level":"A2","ja":"寒いです。","answer":"I'm cold.","alts":[]},
  {"level":"A2","ja":"暑いです。","answer":"I'm hot.","alts":[]},
  {"level":"A2","ja":"忙しいです。","answer":"I'm busy.","alts":[]},
  {"level":"B1","ja":"あとで連絡します。","answer":"I'll contact you later.","alts":[]},
  {"level":"B1","ja":"すぐに対応します。","answer":"I'll handle it right away.","alts":[]},
  {"level":"B1","ja":"確認してから返事します。","answer":"I'll reply after checking.","alts":[]},
  {"level":"B1","ja":"担当者につなぎます。","answer":"I'll connect you to the right person.","alts":[]},
  {"level":"B1","ja":"少々お待ちください。","answer":"Please hold on a moment.","alts":[]},
  {"level":"B1","ja":"お役に立てず申し訳ありません。","answer":"Sorry I couldn't help.","alts":[]},
  {"level":"B1","ja":"何かあれば言ってください。","answer":"Let me know if you need anything.","alts":[]},
  {"level":"B1","ja":"よく考えてから決めます。","answer":"I'll decide after thinking it over.","alts":[]},
  {"level":"B1","ja":"まだ確定していません。","answer":"It's not finalized yet.","alts":[]},
  {"level":"B1","ja":"予定通りです。","answer":"It's on schedule.","alts":[]},
  {"level":"B2","ja":"論点を明確にしましょう。","answer":"Let's clarify the issue.","alts":[]},
  {"level":"B2","ja":"具体例を挙げてもらえますか。","answer":"Could you give a concrete example?","alts":[]},
  {"level":"B2","ja":"前提条件を確認しましょう。","answer":"Let's confirm the prerequisites.","alts":[]},
  {"level":"B2","ja":"影響範囲を見積もりましょう。","answer":"Let's estimate the scope of impact.","alts":[]},
  {"level":"B2","ja":"期待値をすり合わせましょう。","answer":"Let's align on expectations.","alts":[]},
  {"level":"B2","ja":"懸念点を整理しましょう。","answer":"Let's organize the concerns.","alts":[]},
  {"level":"B2","ja":"決定の根拠を残しましょう。","answer":"Let's record the rationale.","alts":[]},
  {"level":"B2","ja":"手順を文書化しましょう。","answer":"Let's document the procedure.","alts":[]},
  {"level":"B2","ja":"早期にフィードバックをもらいましょう。","answer":"Let's get feedback early.","alts":[]},
  {"level":"B2","ja":"優先度を再評価しましょう。","answer":"Let's re-evaluate the priorities.","alts":[]},
  {"level":"B2","ja":"リスクに備えましょう。","answer":"Let's prepare for the risks.","alts":[]},
  {"level":"B2","ja":"想定外に対応できるようにしましょう。","answer":"Let's be ready for surprises.","alts":[]},
  {"level":"B2","ja":"合意事項を再確認しましょう。","answer":"Let's reconfirm what we agreed.","alts":[]},
  {"level":"B2","ja":"無駄な作業を省きましょう。","answer":"Let's cut unnecessary work.","alts":[]},
  {"level":"B2","ja":"品質基準を満たしましょう。","answer":"Let's meet the quality bar.","alts":[]},
  {"level":"B2","ja":"進め方を見直しましょう。","answer":"Let's rethink the approach.","alts":[]},
  {"level":"B2","ja":"次のステップを明確にしましょう。","answer":"Let's clarify the next steps.","alts":[]},
  {"level":"B2","ja":"学んだことを共有しましょう。","answer":"Let's share what we learned.","alts":[]},
  {"level":"C1","ja":"前提の妥当性を検証しましょう。","answer":"Let's test the validity of the premise.","alts":[]},
  {"level":"C1","ja":"因果関係を切り分けましょう。","answer":"Let's separate cause from effect.","alts":[]},
  {"level":"C1","ja":"反証となる証拠を探しましょう。","answer":"Let's look for disconfirming evidence.","alts":[]},
  {"level":"C1","ja":"バイアスの影響を確認しましょう。","answer":"Let's check for bias.","alts":[]},
  {"level":"C1","ja":"撤退基準を明確にしましょう。","answer":"Let's clarify the exit criteria.","alts":[]},
  {"level":"C1","ja":"最も脆い仮定を特定しましょう。","answer":"Let's identify the weakest assumption.","alts":[]},
  {"level":"C1","ja":"長期的な影響を評価しましょう。","answer":"Let's evaluate the long-term impact.","alts":[]},
  {"level":"C1","ja":"サンプルの代表性を確認しましょう。","answer":"Let's check the sample's representativeness.","alts":[]},
  {"level":"C1","ja":"欠けている視点を探しましょう。","answer":"Let's look for missing perspectives.","alts":[]},
  {"level":"C1","ja":"判断を保留すべき点を見極めましょう。","answer":"Let's find where to withhold judgment.","alts":[]}
]);

/* 増量セットBF：高次スキル各種 大量10（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a risk assessment.", q:"自然な語は？", choices:["conduct","make","do","take"], explain:"conduct an assessment（評価を行う）。" },
  { level:"B2", text:"They ___ a promise.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a promise（約束する）。" },
  { level:"B2", text:"Let's ___ a risk.", q:"自然な語は？", choices:["run","make","do","give"], explain:"run a risk（危険を冒す）。" },
  { level:"B2", text:"We ___ an impression.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an impression（印象を与える）。" },
  { level:"B2", text:"Let's ___ a commitment.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a commitment（約束する）。" },
  { level:"B2", text:"They ___ responsibility.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take responsibility（責任を取る）。" },
  { level:"B2", text:"Let's ___ a comparison.", q:"自然な語は？", choices:["draw","make","do","take"], explain:"draw a comparison（比較する）。" },
  { level:"B2", text:"We ___ an exception.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an exception（例外を設ける）。" },
  { level:"C1", text:"Let's ___ inroads into the market.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make inroads（食い込む）。" },
  { level:"C1", text:"They ___ a toll on us.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take a toll（打撃を与える）。" },
  { level:"C1", text:"Let's ___ the groundwork.", q:"自然な語は？", choices:["lay","make","do","take"], explain:"lay the groundwork（下準備をする）。" },
  { level:"C1", text:"We must ___ the gauntlet.", q:"自然な語は？", choices:["run","make","do","give"], explain:"run the gauntlet（試練を受ける）。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"comfortable", syl:["COM","fort","a","ble"], ans:0, ja:"快適な" },
  { level:"B2", word:"comparable", syl:["COM","pa","ra","ble"], ans:0, ja:"比較できる" },
  { level:"B2", word:"available", syl:["a","VAIL","a","ble"], ans:1, ja:"利用できる" },
  { level:"B2", word:"reliable", syl:["re","LI","a","ble"], ans:1, ja:"信頼できる" },
  { level:"B2", word:"necessary", syl:["NEC","es","sar","y"], ans:0, ja:"必要な" },
  { level:"C1", word:"necessity", syl:["ne","CES","si","ty"], ans:1, ja:"必要性" },
  { level:"B2", word:"category", syl:["CAT","e","go","ry"], ans:0, ja:"分類" },
  { level:"C1", word:"categorical", syl:["cat","e","GOR","i","cal"], ans:2, ja:"断定的な" },
  { level:"B2", word:"present (名詞)", syl:["PRES","ent"], ans:0, ja:"贈り物（名詞）", say:"present" },
  { level:"B2", word:"present (動詞)", syl:["pre","SENT"], ans:1, ja:"提示する（動詞）", say:"present" },
  { level:"B2", word:"contrast (名詞)", syl:["CON","trast"], ans:0, ja:"対比（名詞）", say:"contrast" },
  { level:"B2", word:"contrast (動詞)", syl:["con","TRAST"], ans:1, ja:"対比する（動詞）", say:"contrast" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"As a matter of fact, it works.", q:"自然なチャンク区切りは？", choices:["As a matter of fact, / it works","As a / matter of fact it / works","As a matter / of fact it works","As a matter of fact it / works"], explain:"談話標識/主節、で区切る。" },
  { level:"B2", text:"To be fair, they tried.", q:"自然なチャンク区切りは？", choices:["To be fair, / they tried","To / be fair they / tried","To be / fair they tried","To be fair they / tried"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"Given the time, we postponed it.", q:"自然なチャンク区切りは？", choices:["Given the time, / we postponed it","Given / the time we / postponed it","Given the / time we postponed it","Given the time we / postponed it"], explain:"分詞句/主節、で区切る。" },
  { level:"B2", text:"At the end of the day, it matters.", q:"自然なチャンク区切りは？", choices:["At the end of the day, / it matters","At the / end of the day it / matters","At the end / of the day it matters","At the end of the day it / matters"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「正直に言うと」を伝えるなら？", choices:["To be honest with you,","Honest you talk now,","True alone yes,","Real word maybe,"], explain:"To be honest with you ＝ 正直に言うと。" },
  { level:"B2", ja:"", text:"「念のため確認ですが」を伝えるなら？", choices:["Just to make sure,","Sure make now,","Check alone yes,","Be word maybe,"], explain:"Just to make sure ＝ 念のため確認ですが。" },
  { level:"C1", ja:"", text:"「誤解を招かないように言うと」を伝えるなら？", choices:["Lest there be any confusion,","No confuse talk now,","Clear wrong yes,","Avoid word maybe,"], explain:"Lest there be any confusion ＝ 誤解を招かないように。" },
  { level:"B2", ja:"", text:"「端的に言えば」を伝えるなら？", choices:["Simply put,","Simple say now,","Short talk yes,","Plain word maybe,"], explain:"Simply put ＝ 端的に言えば。" },
  { level:"C1", ja:"", text:"「言わせてもらえば」を伝えるなら？", choices:["If I may say so,","Say I may now,","Talk me yes,","Word allow maybe,"], explain:"If I may say so ＝ 言わせてもらえば。" },
  { level:"B2", ja:"", text:"「結局のところ」を伝えるなら？", choices:["At the end of the day,","End day talk now,","Final say yes,","Last word maybe,"], explain:"At the end of the day ＝ 結局のところ。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に意見を求める：", choices:["I'd love to hear your thoughts.","Tell me now.","You must answer.","Why silent?"], explain:"相手の意見を丁寧に求める。" },
  { level:"B2", text:"反対を和らげて伝える：", choices:["I see it slightly differently.","You're totally wrong.","That's absurd.","Stop talking."], explain:"slightly differently で反対を和らげる。" },
  { level:"C1", text:"相手の労をねぎらう：", choices:["I know how much work this took.","That was easy for you.","Anyone could do it.","It's nothing special."], explain:"相手の労を具体的にねぎらう。" },
  { level:"C1", text:"丁寧に再考を促す：", choices:["Might it be worth reconsidering?","You must change it.","That's final, no.","Why even think?"], explain:"Might it be worth …? で丁寧に再考を促す。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"論点を一つに絞る：", choices:["Let's focus on one thing at a time.","Talk about everything.","No focus needed.","Skip the point."], explain:"一度に一つの論点に絞る。" },
  { level:"B2", text:"全員に発言を促す：", choices:["I'd like to hear from everyone.","Only I speak.","No need to share.","Stay quiet all."], explain:"全員の発言を促す。" },
  { level:"C1", text:"前提を共有してから議論する：", choices:["Let's agree on the basics first.","Skip the basics.","No common ground.","Just argue."], explain:"前提を共有してから議論する。" },
  { level:"C1", text:"異論を歓迎する姿勢を示す：", choices:["Push back if you disagree.","No disagreement allowed.","Only agree with me.","Stop objecting."], explain:"異論を歓迎する姿勢を示す。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That makes sense.", q:"納得の調子は？", choices:["落ち着いて下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"納得は落ち着いて下げ↘。" },
  { level:"B2", text:"Wait, really?", q:"驚きの調子は？", choices:["really を上げる↗","下げて終える","平坦に切る","小さく言う"], explain:"驚きは語尾を上げ↗。" },
  { level:"C1", text:"Hmm, I'm not so sure.", q:"控えめな疑念の調子は？", choices:["ゆっくり下げ気味で含みを持たせる","明るく上げる","強く言い切る","速く下げる"], explain:"控えめな疑念は下げ気味＋間。" },
  { level:"B2", text:"Could you repeat that?", q:"丁寧な聞き返しの調子は？", choices:["that を上げる↗","下げて終える","平坦に切る","小さく言う"], explain:"丁寧な聞き返しは語尾を上げ↗。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's MAKE every MOMENT count.", q:"強く読む語は？", choices:["make / moment / count","let's / every","every / the","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"PROGRESS, not PERFECTION, is the GOAL.", q:"強く読む語は？", choices:["progress / perfection / goal","not / is / the","is / the","均等"], explain:"対比の内容語を強く。" },
  { level:"B2", text:"We LEARN by DOING things.", q:"強く読む語は？", choices:["learn / doing / things","we / by","by / the","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"THINK big, START small.", q:"強く読む語は？", choices:["think / big / start / small","none","the / a","均等"], explain:"対比の内容語を強く。" }
]);


/* 増量：瞬間英作文 大量23（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"今何をしていますか。","answer":"What are you doing now?","alts":[]},
  {"level":"A2","ja":"どこへ行きますか。","answer":"Where are you going?","alts":[]},
  {"level":"A2","ja":"何が欲しいですか。","answer":"What do you want?","alts":[]},
  {"level":"A2","ja":"誰と来ましたか。","answer":"Who did you come with?","alts":[]},
  {"level":"A2","ja":"いつ帰りますか。","answer":"When are you going home?","alts":[]},
  {"level":"A2","ja":"どうやって知りましたか。","answer":"How did you find out?","alts":[]},
  {"level":"A2","ja":"なぜ遅れましたか。","answer":"Why were you late?","alts":[]},
  {"level":"A2","ja":"どこに住んでいますか。","answer":"Where do you live?","alts":[]},
  {"level":"A2","ja":"何時に始まりますか。","answer":"What time does it start?","alts":[]},
  {"level":"A2","ja":"誰が作りましたか。","answer":"Who made it?","alts":[]},
  {"level":"A2","ja":"どれが好きですか。","answer":"Which one do you like?","alts":[]},
  {"level":"A2","ja":"いくつ必要ですか。","answer":"How many do you need?","alts":[]},
  {"level":"A2","ja":"何を持っていきますか。","answer":"What should I bring?","alts":[]},
  {"level":"A2","ja":"誰に聞きましたか。","answer":"Who did you ask?","alts":[]},
  {"level":"B1","ja":"どうしてそう思いますか。","answer":"Why do you think that?","alts":[]},
  {"level":"B1","ja":"何が起きたのですか。","answer":"What happened?","alts":[]},
  {"level":"B1","ja":"誰が決めるのですか。","answer":"Who decides?","alts":[]},
  {"level":"B1","ja":"どう進めればいいですか。","answer":"How should I proceed?","alts":[]},
  {"level":"B1","ja":"何を優先すべきですか。","answer":"What should I prioritize?","alts":[]},
  {"level":"B1","ja":"どこを直せばいいですか。","answer":"What should I fix?","alts":[]},
  {"level":"B1","ja":"なぜ変更したのですか。","answer":"Why did you change it?","alts":[]},
  {"level":"B1","ja":"どのくらい時間がありますか。","answer":"How much time do we have?","alts":[]},
  {"level":"B1","ja":"何か手伝えますか。","answer":"Can I help with anything?","alts":[]},
  {"level":"B1","ja":"どこから始めますか。","answer":"Where do we begin?","alts":[]},
  {"level":"B1","ja":"誰が担当ですか。","answer":"Who's responsible?","alts":[]},
  {"level":"B1","ja":"何を確認すべきですか。","answer":"What should I check?","alts":[]},
  {"level":"B2","ja":"前提条件は何ですか。","answer":"What are the conditions?","alts":[]},
  {"level":"B2","ja":"どんなリスクがありますか。","answer":"What are the risks?","alts":[]},
  {"level":"B2","ja":"成功の基準は何ですか。","answer":"What defines success?","alts":[]},
  {"level":"B2","ja":"何を犠牲にしますか。","answer":"What do we sacrifice?","alts":[]},
  {"level":"B2","ja":"代替案は何ですか。","answer":"What's the alternative?","alts":[]},
  {"level":"B2","ja":"なぜ今やるのですか。","answer":"Why do it now?","alts":[]},
  {"level":"B2","ja":"どう検証しますか。","answer":"How do we verify?","alts":[]},
  {"level":"B2","ja":"何が結論を変えますか。","answer":"What changes the conclusion?","alts":[]},
  {"level":"B2","ja":"何を見落としていますか。","answer":"What are we overlooking?","alts":[]},
  {"level":"B2","ja":"それは可逆ですか。","answer":"Is it reversible?","alts":[]},
  {"level":"B2","ja":"根拠はどれだけ強いですか。","answer":"How strong is the basis?","alts":[]},
  {"level":"B2","ja":"誰が最終判断しますか。","answer":"Who makes the final call?","alts":[]},
  {"level":"B2","ja":"いつ見直しますか。","answer":"When do we review?","alts":[]},
  {"level":"B2","ja":"何が前進を妨げますか。","answer":"What blocks progress?","alts":[]},
  {"level":"B2","ja":"次の一手は何ですか。","answer":"What's the next move?","alts":[]},
  {"level":"C1","ja":"前提は反証可能ですか。","answer":"Is the premise falsifiable?","alts":[]},
  {"level":"C1","ja":"何が反証になりますか。","answer":"What would count as disproof?","alts":[]},
  {"level":"C1","ja":"長期的影響は何ですか。","answer":"What's the long-term effect?","alts":[]},
  {"level":"C1","ja":"これは根本原因ですか。","answer":"Is this the root cause?","alts":[]},
  {"level":"C1","ja":"誰の視点が欠けていますか。","answer":"Whose view is missing?","alts":[]},
  {"level":"C1","ja":"判断を保留すべきはどこですか。","answer":"Where should we hold off?","alts":[]}
]);

/* 増量セットBH：高次スキル各種 大量11（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ progress on this.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make progress（前進する）。" },
  { level:"B2", text:"They ___ an effort to improve.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make an effort（努力する）。" },
  { level:"B2", text:"Let's ___ a closer look.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a look（見る）。" },
  { level:"C1", text:"We ___ a calculated risk.", q:"自然な語は？", choices:["took","made","did","gave"], explain:"take a risk（リスクを取る）。" },
  { level:"C1", text:"Let's ___ common cause with them.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make common cause（共闘する）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「言うなれば」を伝えるなら？", choices:["So to speak,","Speak so now,","Say like yes,","Talk as maybe,"], explain:"So to speak ＝ 言うなれば。" },
  { level:"C1", ja:"", text:"「率直に申し上げにくいのですが」を伝えるなら？", choices:["This is hard to say, but","Hard talk now me,","Difficult say yes,","Bad word maybe,"], explain:"This is hard to say, but ＝ 申し上げにくいのですが。" },
  { level:"B2", ja:"", text:"「言ってみれば」を伝えるなら？", choices:["In a sense,","Sense in now,","Way some yes,","Like talk maybe,"], explain:"In a sense ＝ ある意味では。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を促し沈黙を破る：", choices:["What's everyone thinking?","Only I think.","No thoughts needed.","Stay silent."], explain:"全員に発言を促す。" },
  { level:"C1", text:"議論の前提を明確にする：", choices:["Let's be clear on what we're solving.","Skip the problem.","No clarity needed.","Just react."], explain:"何を解こうとしているか明確にする。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に確認を求める：", choices:["Just so I'm clear, you mean...?","I don't care.","You're confusing.","Why unclear?"], explain:"Just so I'm clear で丁寧に確認。" },
  { level:"C1", text:"相手の努力を認める：", choices:["You clearly put a lot into this.","You barely tried.","It shows no effort.","Anyone could."], explain:"相手の努力を具体的に認める。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"I'm on board with that.", q:"賛同の調子は？", choices:["明るく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"賛同は明るく下げて。" },
  { level:"C1", text:"Let me play devil's advocate.", q:"あえて反論する調子は？", choices:["軽やかに始め論点を強める","暗く言う","速く言い切る","小さく言う"], explain:"あえての反論は軽やかに始め要点を強める。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"We GROW through what we GO through.", q:"強く読む語は？", choices:["grow / go","we / through / we","through / we","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"DREAM big, WORK hard, STAY humble.", q:"強く読む語は？", choices:["dream / big / work / hard / stay / humble","none","the / a","均等"], explain:"内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"All in all, it went well.", q:"自然なチャンク区切りは？", choices:["All in all, / it went well","All / in all it / went well","All in / all it went well","All in all it / went well"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"That being said, risks remain.", q:"自然なチャンク区切りは？", choices:["That being said, / risks remain","That / being said risks / remain","That being / said risks remain","That being said risks / remain"], explain:"分詞句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"origin", syl:["OR","i","gin"], ans:0, ja:"起源" },
  { level:"B2", word:"original", syl:["o","RIG","i","nal"], ans:1, ja:"独創的な" },
  { level:"C1", word:"originality", syl:["o","rig","i","NAL","i","ty"], ans:3, ja:"独創性" },
  { level:"B2", word:"insult (名詞)", syl:["IN","sult"], ans:0, ja:"侮辱（名詞）", say:"insult" },
  { level:"B2", word:"insult (動詞)", syl:["in","SULT"], ans:1, ja:"侮辱する（動詞）", say:"insult" }
]);


/* 増量：瞬間英作文 大量24（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もう少しいかがですか。","answer":"Would you like some more?","alts":[]},
  {"level":"A2","ja":"手伝いましょうか。","answer":"Shall I help you?","alts":[]},
  {"level":"A2","ja":"窓を閉めましょうか。","answer":"Shall I close the window?","alts":[]},
  {"level":"A2","ja":"タクシーを呼びましょうか。","answer":"Shall I call a taxi?","alts":[]},
  {"level":"A2","ja":"お茶を入れましょうか。","answer":"Shall I make some tea?","alts":[]},
  {"level":"A2","ja":"これを運びましょうか。","answer":"Shall I carry this?","alts":[]},
  {"level":"A2","ja":"席を替わりましょうか。","answer":"Shall I switch seats?","alts":[]},
  {"level":"A2","ja":"もう帰りましょうか。","answer":"Shall we head home?","alts":[]},
  {"level":"A2","ja":"写真を撮りましょうか。","answer":"Shall I take a photo?","alts":[]},
  {"level":"A2","ja":"何か飲みましょうか。","answer":"Shall we get a drink?","alts":[]},
  {"level":"A2","ja":"始めましょうか。","answer":"Shall we get started?","alts":[]},
  {"level":"A2","ja":"地図を見ましょうか。","answer":"Shall we check the map?","alts":[]},
  {"level":"A2","ja":"休みましょうか。","answer":"Shall we take a rest?","alts":[]},
  {"level":"B1","ja":"予約を取りましょうか。","answer":"Shall I make a reservation?","alts":[]},
  {"level":"B1","ja":"もう一度説明しましょうか。","answer":"Shall I explain again?","alts":[]},
  {"level":"B1","ja":"資料を共有しましょうか。","answer":"Shall I share the materials?","alts":[]},
  {"level":"B1","ja":"候補を挙げましょうか。","answer":"Shall I list some options?","alts":[]},
  {"level":"B1","ja":"スケジュールを組みましょうか。","answer":"Shall we set a schedule?","alts":[]},
  {"level":"B1","ja":"チームに確認しましょうか。","answer":"Shall I check with the team?","alts":[]},
  {"level":"B1","ja":"代案を考えましょうか。","answer":"Shall we think of alternatives?","alts":[]},
  {"level":"B1","ja":"要点をまとめましょうか。","answer":"Shall I sum up the points?","alts":[]},
  {"level":"B1","ja":"先に始めましょうか。","answer":"Shall we start first?","alts":[]},
  {"level":"B1","ja":"手順を見直しましょうか。","answer":"Shall we review the steps?","alts":[]},
  {"level":"B1","ja":"サンプルを送りましょうか。","answer":"Shall I send a sample?","alts":[]},
  {"level":"B1","ja":"会議を設定しましょうか。","answer":"Shall I set up a meeting?","alts":[]},
  {"level":"B2","ja":"論点を整理しましょうか。","answer":"Shall we organize the points?","alts":[]},
  {"level":"B2","ja":"優先順位をつけましょうか。","answer":"Shall we set priorities?","alts":[]},
  {"level":"B2","ja":"前提を共有しましょうか。","answer":"Shall we share assumptions?","alts":[]},
  {"level":"B2","ja":"代替案を比較しましょうか。","answer":"Shall we compare alternatives?","alts":[]},
  {"level":"B2","ja":"期日を調整しましょうか。","answer":"Shall we adjust the deadline?","alts":[]},
  {"level":"C1","ja":"長期影響を見ましょうか。","answer":"Shall we examine the long-term impact?","alts":[]},
  {"level":"C1","ja":"前例を調べましょうか。","answer":"Shall we look for precedent?","alts":[]},
  {"level":"C1","ja":"時間軸を分けましょうか。","answer":"Shall we separate horizons?","alts":[]},
  {"level":"C1","ja":"不確実性に備えましょうか。","answer":"Shall we hedge against uncertainty?","alts":[]},
  {"level":"C1","ja":"盲点を探しましょうか。","answer":"Shall we look for blind spots?","alts":[]}
]);

/* 増量セットBJ：高次スキル各種 大量12（5倍ペース） */
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a decision by Friday.", q:"自然な語は？", choices:["reach","make","do","take"], explain:"reach a decision（決定に至る）。" },
  { level:"B2", text:"They ___ progress quickly.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make progress（前進する）。" },
  { level:"B2", text:"Let's ___ a chance.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take a chance（賭けてみる）。" },
  { level:"C1", text:"We ___ allowances for delays.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make allowances（考慮する）。" },
  { level:"C1", text:"Let's ___ stock of where we are.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take stock（状況を見直す）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「言いかえると」を伝えるなら？", choices:["Put another way,","Way put now,","Other say yes,","Change talk maybe,"], explain:"Put another way ＝ 言いかえると。" },
  { level:"C1", ja:"", text:"「率直なところ申し上げると」を伝えるなら？", choices:["In all candor,","Candor all now,","True alone yes,","Real word maybe,"], explain:"In all candor ＝ 率直なところ。" },
  { level:"B2", ja:"", text:"「具体的に言うと」を伝えるなら？", choices:["To be specific,","Specific be now,","Detail say yes,","Clear talk maybe,"], explain:"To be specific ＝ 具体的に言うと。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"発言を簡潔にまとめ直す：", choices:["So, in short, you're suggesting...","I missed it all.","You're wrong.","No recap needed."], explain:"発言を簡潔にまとめ直す。" },
  { level:"C1", text:"合意と相違を切り分ける：", choices:["We agree on the goal, but differ on the method.","We agree on nothing.","No difference exists.","Let's just fight."], explain:"合意点と相違点を切り分ける。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に提案する：", choices:["Would it help if I...?","I'll just do it.","You need my help.","Why bother asking?"], explain:"Would it help if …? で丁寧に提案。" },
  { level:"C1", text:"成果を他者と分かち合う：", choices:["This was truly a team effort.","I did it alone.","No one else helped.","It was all me."], explain:"成果をチームと分かち合う。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That's reassuring.", q:"安心の調子は？", choices:["やわらかく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"安心はやわらかく下げて。" },
  { level:"C1", text:"Let's not jump ahead.", q:"たしなめる調子は？", choices:["落ち着いてゆっくり下げる","明るく上げる","速く言い切る","強く上げる"], explain:"たしなめは落ち着いて下げて。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's TAKE it ONE step at a TIME.", q:"強く読む語は？", choices:["take / one / time","let's / it / at","at / a","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"DONE is better than PERFECT.", q:"強く読む語は？", choices:["done / better / perfect","is / than","than / the","均等"], explain:"対比の内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"For now, let's pause.", q:"自然なチャンク区切りは？", choices:["For now, / let's pause","For / now let's / pause","For now let's / pause","For now / let's pause /"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"With that in mind, we proceed.", q:"自然なチャンク区切りは？", choices:["With that in mind, / we proceed","With / that in mind we / proceed","With that / in mind we proceed","With that in mind we / proceed"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"educate", syl:["ED","u","cate"], ans:0, ja:"教育する" },
  { level:"B2", word:"education", syl:["ed","u","CA","tion"], ans:2, ja:"教育" },
  { level:"C1", word:"educational", syl:["ed","u","CA","tion","al"], ans:2, ja:"教育の" },
  { level:"B2", word:"export (名詞)", syl:["EX","port"], ans:0, ja:"輸出（名詞）", say:"export" },
  { level:"B2", word:"export (動詞)", syl:["ex","PORT"], ans:1, ja:"輸出する（動詞）", say:"export" }
]);


/* 増量：瞬間英作文 大量25（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"今日は楽しかったです。","answer":"I had a great day.","alts":[]},
  {"level":"A2","ja":"また会いたいです。","answer":"I want to see you again.","alts":[]},
  {"level":"A2","ja":"変わりないですか。","answer":"Anything new?","alts":[]},
  {"level":"A2","ja":"お世話になりました。","answer":"Thank you for everything.","alts":[]},
  {"level":"A2","ja":"気をつけて帰ってください。","answer":"Get home safely.","alts":[]},
  {"level":"A2","ja":"ただいま。","answer":"I'm home.","alts":[]},
  {"level":"A2","ja":"おかえりなさい。","answer":"Welcome back.","alts":[]},
  {"level":"B1","ja":"お時間ありがとうございました。","answer":"Thank you for your time.","alts":[]},
  {"level":"B1","ja":"またの機会によろしく。","answer":"I hope we can do this again.","alts":[]},
  {"level":"B1","ja":"助かりました、ありがとう。","answer":"Thanks, that really helped.","alts":[]},
  {"level":"B1","ja":"お大事にしてください。","answer":"Take good care of yourself.","alts":[]},
  {"level":"B1","ja":"落ち着いたら連絡します。","answer":"I'll reach out once things settle.","alts":[]},
  {"level":"B1","ja":"ぜひお願いします。","answer":"I'd really appreciate that.","alts":[]},
  {"level":"B1","ja":"頼りにしています。","answer":"I'm counting on you.","alts":[]},
  {"level":"B1","ja":"期待しています。","answer":"I have high hopes.","alts":[]},
  {"level":"B1","ja":"お疲れさまでした。","answer":"Good work today.","alts":[]},
  {"level":"B2","ja":"貴重なご意見ありがとうございます。","answer":"Thank you for your valuable input.","alts":[]},
  {"level":"B2","ja":"前向きに検討いたします。","answer":"I'll give it serious consideration.","alts":[]},
  {"level":"B2","ja":"改めてご連絡いたします。","answer":"I'll get back to you in due course.","alts":[]},
  {"level":"B2","ja":"ご確認のほどお願いします。","answer":"Please confirm at your convenience.","alts":[]},
  {"level":"B2","ja":"ご都合をお聞かせください。","answer":"Please let me know what suits you.","alts":[]},
  {"level":"B2","ja":"引き続きよろしくお願いします。","answer":"I look forward to continuing.","alts":[]},
  {"level":"B2","ja":"お力添えに感謝します。","answer":"I appreciate your support.","alts":[]},
  {"level":"B2","ja":"ご配慮いただき感謝します。","answer":"Thank you for your consideration.","alts":[]},
  {"level":"B2","ja":"率直なご意見を歓迎します。","answer":"I welcome your honest feedback.","alts":[]},
  {"level":"B2","ja":"建設的な議論に感謝します。","answer":"Thank you for the constructive discussion.","alts":[]},
  {"level":"B2","ja":"今後の参考にいたします。","answer":"I'll keep that in mind going forward.","alts":[]},
  {"level":"B2","ja":"認識を共有できてよかったです。","answer":"I'm glad we're on the same page.","alts":[]},
  {"level":"B2","ja":"誤解を解けてよかったです。","answer":"I'm glad we cleared that up.","alts":[]},
  {"level":"B2","ja":"柔軟にご対応いただき感謝します。","answer":"Thank you for being flexible.","alts":[]},
  {"level":"B2","ja":"迅速なご対応に感謝します。","answer":"Thank you for your prompt response.","alts":[]},
  {"level":"B2","ja":"お手数をおかけして恐縮です。","answer":"I'm sorry to trouble you.","alts":[]},
  {"level":"B2","ja":"ご無理を承知でお願いします。","answer":"I know it's a lot to ask.","alts":[]},
  {"level":"B2","ja":"改善に努めます。","answer":"I'll strive to improve.","alts":[]},
  {"level":"B2","ja":"教訓として生かします。","answer":"I'll learn from this.","alts":[]},
  {"level":"C1","ja":"論拠を明確にいたします。","answer":"Let me clarify my reasoning.","alts":[]},
  {"level":"C1","ja":"可逆な判断を優先します。","answer":"I'll favor reversible decisions.","alts":[]},
  {"level":"C1","ja":"不確実性を踏まえて進めます。","answer":"I'll proceed mindful of uncertainty.","alts":[]},
  {"level":"C1","ja":"機会費用も考慮いたします。","answer":"I'll factor in opportunity cost.","alts":[]},
  {"level":"C1","ja":"長期的視点で判断します。","answer":"I'll judge with a long-term view.","alts":[]},
  {"level":"C1","ja":"根拠に基づいて議論します。","answer":"I'll argue from evidence.","alts":[]},
  {"level":"C1","ja":"反証可能な形で述べます。","answer":"I'll state it in a falsifiable way.","alts":[]},
  {"level":"C1","ja":"前例を踏まえて検討します。","answer":"I'll consider the precedent.","alts":[]},
  {"level":"C1","ja":"根本原因を特定します。","answer":"I'll identify the root cause.","alts":[]},
  {"level":"C1","ja":"想定の範囲を明示します。","answer":"I'll make my assumptions explicit.","alts":[]},
  {"level":"C1","ja":"撤退基準を定めておきます。","answer":"I'll set clear exit criteria.","alts":[]},
  {"level":"C1","ja":"交絡要因を確認します。","answer":"I'll check for confounding factors.","alts":[]},
  {"level":"C1","ja":"最も単純な説明を採ります。","answer":"I'll go with the simplest explanation.","alts":[]}
]);


/* 増量：瞬間英作文 大量26（5倍ペース） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"手を貸してもらえますか。","answer":"Could you lend me a hand?","alts":[]},
  {"level":"A2","ja":"電話してもいいですか。","answer":"May I make a call?","alts":[]},
  {"level":"A2","ja":"席を立ってもいいですか。","answer":"May I leave my seat?","alts":[]},
  {"level":"A2","ja":"それを見せてください。","answer":"Please show me that.","alts":[]},
  {"level":"A2","ja":"もう少し近づいてください。","answer":"Please come a bit closer.","alts":[]},
  {"level":"A2","ja":"静かにしてください。","answer":"Please be quiet.","alts":[]},
  {"level":"A2","ja":"急いでください。","answer":"Please hurry.","alts":[]},
  {"level":"A2","ja":"気をつけてください。","answer":"Please be careful.","alts":[]},
  {"level":"A2","ja":"ゆっくりしてください。","answer":"Please take your time.","alts":[]},
  {"level":"A2","ja":"楽にしてください。","answer":"Please relax.","alts":[]},
  {"level":"A2","ja":"入ってもいいですか。","answer":"May I come in?","alts":[]},
  {"level":"A2","ja":"出てもいいですか。","answer":"May I leave?","alts":[]},
  {"level":"A2","ja":"始めてもいいですか。","answer":"May I begin?","alts":[]},
  {"level":"A2","ja":"これを試してもいいですか。","answer":"May I try this?","alts":[]},
  {"level":"A2","ja":"借りてもいいですか。","answer":"May I borrow it?","alts":[]},
  {"level":"B1","ja":"それを後回しにできますか。","answer":"Could we postpone that?","alts":[]},
  {"level":"B1","ja":"これを優先できますか。","answer":"Could we prioritize this?","alts":[]},
  {"level":"B1","ja":"もう一度確認できますか。","answer":"Could we double-check?","alts":[]},
  {"level":"B1","ja":"時間をいただけますか。","answer":"Could you spare a moment?","alts":[]},
  {"level":"B1","ja":"代わりにやってもらえますか。","answer":"Could you do it instead?","alts":[]},
  {"level":"B1","ja":"これを手伝ってもらえますか。","answer":"Could you help with this?","alts":[]},
  {"level":"B1","ja":"意見を聞かせてもらえますか。","answer":"Could you share your opinion?","alts":[]},
  {"level":"B1","ja":"例を見せてもらえますか。","answer":"Could you show an example?","alts":[]},
  {"level":"B1","ja":"手順を教えてもらえますか。","answer":"Could you explain the steps?","alts":[]},
  {"level":"B1","ja":"締切を教えてもらえますか。","answer":"Could you tell me the deadline?","alts":[]},
  {"level":"B1","ja":"担当者を教えてもらえますか。","answer":"Could you tell me who's in charge?","alts":[]},
  {"level":"B1","ja":"資料を送ってもらえますか。","answer":"Could you send the documents?","alts":[]},
  {"level":"B1","ja":"確認を取ってもらえますか。","answer":"Could you get confirmation?","alts":[]},
  {"level":"B1","ja":"要点をまとめてもらえますか。","answer":"Could you summarize the points?","alts":[]},
  {"level":"B2","ja":"論点を絞ってもらえますか。","answer":"Could you narrow the focus?","alts":[]},
  {"level":"B2","ja":"前提を明確にしてもらえますか。","answer":"Could you clarify the premise?","alts":[]},
  {"level":"B2","ja":"代替案を提示してもらえますか。","answer":"Could you propose an alternative?","alts":[]},
  {"level":"B2","ja":"影響を見積もってもらえますか。","answer":"Could you estimate the impact?","alts":[]},
  {"level":"B2","ja":"リスクを洗い出してもらえますか。","answer":"Could you identify the risks?","alts":[]},
  {"level":"B2","ja":"根拠を補強してもらえますか。","answer":"Could you strengthen the rationale?","alts":[]},
  {"level":"B2","ja":"範囲を確認してもらえますか。","answer":"Could you confirm the scope?","alts":[]},
  {"level":"B2","ja":"担当を割り当ててもらえますか。","answer":"Could you assign owners?","alts":[]},
  {"level":"B2","ja":"期日を調整してもらえますか。","answer":"Could you adjust the timeline?","alts":[]},
  {"level":"B2","ja":"合意を取り付けてもらえますか。","answer":"Could you get sign-off?","alts":[]},
  {"level":"B2","ja":"懸念を整理してもらえますか。","answer":"Could you organize the concerns?","alts":[]},
  {"level":"B2","ja":"方針を文書化してもらえますか。","answer":"Could you document the approach?","alts":[]},
  {"level":"B2","ja":"見直しを入れてもらえますか。","answer":"Could you build in a review?","alts":[]},
  {"level":"B2","ja":"想定を確認してもらえますか。","answer":"Could you verify the assumptions?","alts":[]},
  {"level":"B2","ja":"教訓をまとめてもらえますか。","answer":"Could you capture the lessons?","alts":[]},
  {"level":"B2","ja":"次の手を決めてもらえますか。","answer":"Could you decide the next step?","alts":[]},
  {"level":"B2","ja":"優先度を見直してもらえますか。","answer":"Could you revisit the priorities?","alts":[]},
  {"level":"B2","ja":"状況を整理してもらえますか。","answer":"Could you take stock?","alts":[]},
  {"level":"B2","ja":"認識を合わせてもらえますか。","answer":"Could you get us aligned?","alts":[]},
  {"level":"C1","ja":"前提を検証してもらえますか。","answer":"Could you validate the premise?","alts":[]},
  {"level":"C1","ja":"因果を切り分けてもらえますか。","answer":"Could you separate cause from effect?","alts":[]},
  {"level":"C1","ja":"反証を探してもらえますか。","answer":"Could you look for counterevidence?","alts":[]},
  {"level":"C1","ja":"バイアスを確認してもらえますか。","answer":"Could you check for bias?","alts":[]},
  {"level":"C1","ja":"機会費用を見積もってもらえますか。","answer":"Could you estimate the opportunity cost?","alts":[]},
  {"level":"C1","ja":"撤退条件を定めてもらえますか。","answer":"Could you set exit criteria?","alts":[]},
  {"level":"C1","ja":"最弱の仮定を特定してもらえますか。","answer":"Could you identify the weakest assumption?","alts":[]},
  {"level":"C1","ja":"長期影響を評価してもらえますか。","answer":"Could you evaluate the long-term impact?","alts":[]},
  {"level":"C1","ja":"前例を調べてもらえますか。","answer":"Could you check for precedent?","alts":[]},
  {"level":"C1","ja":"根本原因を探ってもらえますか。","answer":"Could you find the root cause?","alts":[]},
  {"level":"C1","ja":"標本の偏りを確認してもらえますか。","answer":"Could you check for sampling bias?","alts":[]},
  {"level":"C1","ja":"欠けた視点を探してもらえますか。","answer":"Could you look for missing perspectives?","alts":[]},
  {"level":"C1","ja":"判断の保留点を示してもらえますか。","answer":"Could you flag where to withhold judgment?","alts":[]},
  {"level":"C1","ja":"最も単純な説明を選んでもらえますか。","answer":"Could you choose the simplest explanation?","alts":[]}
]);

/* 増量セットBM：高次スキル各種 最終仕上げ（5倍ペース達成）*/
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a plan.", q:"自然な語は？", choices:["draw up","make do","do take","give in"], explain:"draw up a plan（計画を立てる）。" },
  { level:"B2", text:"They ___ a fortune.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a fortune（大金を稼ぐ）。" },
  { level:"B2", text:"Let's ___ the lead.", q:"自然な語は？", choices:["take","make","do","give"], explain:"take the lead（主導する）。" },
  { level:"C1", text:"We ___ a sacrifice.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a sacrifice（犠牲を払う）。" },
  { level:"C1", text:"Let's ___ a precedent.", q:"自然な語は？", choices:["set","make","do","take"], explain:"set a precedent（前例を作る）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「言い直すと」を伝えるなら？", choices:["To rephrase,","Rephrase to now,","Change say yes,","Other word maybe,"], explain:"To rephrase ＝ 言い直すと。" },
  { level:"C1", ja:"", text:"「誤解を恐れずに申し上げれば」を伝えるなら？", choices:["At the risk of overstating it,","Risk over now,","Bold say yes,","Brave word maybe,"], explain:"At the risk of overstating it ＝ 誇張を恐れずに言えば。" },
  { level:"B2", ja:"", text:"「結論から言うと」を伝えるなら？", choices:["To get to the point,","Point get now,","End say yes,","Quick talk maybe,"], explain:"To get to the point ＝ 結論から言うと。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"建設的に話を進める：", choices:["Let's build on that idea.","Let's drop it.","No ideas allowed.","Stop talking."], explain:"相手の案を発展させる。" },
  { level:"C1", text:"対立を解像度高く扱う：", choices:["Where exactly do we disagree?","We disagree on all.","No disagreement.","Just fight."], explain:"対立点を具体的に特定する。" }
]);
window.EigoData.cultureItems = window.EigoData.cultureItems.concat([
  { level:"B2", text:"丁寧に手助けを申し出る：", choices:["Is there anything I can do to help?","Do it yourself.","I won't help.","Why ask me?"], explain:"控えめに手助けを申し出る。" },
  { level:"C1", text:"批判より改善に焦点を当てる：", choices:["What would make this even stronger?","This is all bad.","You failed.","Give up now."], explain:"批判より改善に焦点を当てる。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That's encouraging.", q:"励ましの調子は？", choices:["明るく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"励ましは明るく下げて。" },
  { level:"C1", text:"Let's take a step back.", q:"落ち着かせる調子は？", choices:["ゆっくり下げ気味で","明るく上げる","速く言い切る","強く上げる"], explain:"落ち着かせるのは下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's KEEP it SIMPLE and CLEAR.", q:"強く読む語は？", choices:["keep / simple / clear","let's / it / and","and / it","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"MEASURE twice, CUT once.", q:"強く読む語は？", choices:["measure / twice / cut / once","none","the / a","均等"], explain:"内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"To begin with, let's plan.", q:"自然なチャンク区切りは？", choices:["To begin with, / let's plan","To / begin with let's / plan","To begin / with let's plan","To begin with let's / plan"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"On balance, it's worth it.", q:"自然なチャンク区切りは？", choices:["On balance, / it's worth it","On / balance it's / worth it","On balance it's / worth it","On balance / it's worth it"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"create", syl:["cre","ATE"], ans:1, ja:"創造する" },
  { level:"B2", word:"creative", syl:["cre","A","tive"], ans:1, ja:"創造的な" },
  { level:"C1", word:"creativity", syl:["cre","a","TIV","i","ty"], ans:2, ja:"創造性" },
  { level:"B2", word:"survey (名詞)", syl:["SUR","vey"], ans:0, ja:"調査（名詞）", say:"survey" },
  { level:"B2", word:"survey (動詞)", syl:["sur","VEY"], ans:1, ja:"調査する（動詞）", say:"survey" }
]);


/* 増量：瞬間英作文 大量27 仕上げ（5倍ペース達成） */
window.EigoData.qrtItems = window.EigoData.qrtItems.concat([
  {"level":"A2","ja":"もちろんいいですよ。","answer":"Sure, that's fine.","alts":[]},
  {"level":"A2","ja":"喜んで。","answer":"I'd be glad to.","alts":[]},
  {"level":"A2","ja":"あとでやります。","answer":"I'll do it later.","alts":[]},
  {"level":"A2","ja":"もう終わりました。","answer":"I've already finished.","alts":[]},
  {"level":"A2","ja":"まだ途中です。","answer":"I'm still working on it.","alts":[]},
  {"level":"A2","ja":"うまくいきました。","answer":"It went well.","alts":[]},
  {"level":"B1","ja":"状況を見て判断します。","answer":"I'll decide based on the situation.","alts":[]},
  {"level":"B1","ja":"それなら大丈夫です。","answer":"In that case, it's fine.","alts":[]},
  {"level":"B1","ja":"もう少し様子を見ます。","answer":"Let's wait and see a bit.","alts":[]},
  {"level":"B1","ja":"早めに対応します。","answer":"I'll address it soon.","alts":[]},
  {"level":"B1","ja":"前向きに考えます。","answer":"I'll think positively about it.","alts":[]},
  {"level":"B1","ja":"柔軟に対応します。","answer":"I'll be flexible.","alts":[]},
  {"level":"B2","ja":"事実と意見を分けましょう。","answer":"Let's separate facts from opinions.","alts":[]},
  {"level":"B2","ja":"根拠を示してから議論しましょう。","answer":"Let's argue with evidence.","alts":[]},
  {"level":"B2","ja":"前提を確認してから進めましょう。","answer":"Let's confirm the premise first.","alts":[]},
  {"level":"B2","ja":"具体例で説明しましょう。","answer":"Let's explain with examples.","alts":[]},
  {"level":"B2","ja":"代替案も用意しましょう。","answer":"Let's prepare a backup.","alts":[]},
  {"level":"B2","ja":"懸念を率直に共有しましょう。","answer":"Let's share concerns openly.","alts":[]},
  {"level":"C1","ja":"反証を探してから結論づけましょう。","answer":"Let's seek counterevidence before concluding.","alts":[]},
  {"level":"C1","ja":"因果を確かめてから判断しましょう。","answer":"Let's verify causation before deciding.","alts":[]},
  {"level":"C1","ja":"不確実性を明示しましょう。","answer":"Let's make the uncertainty explicit.","alts":[]},
  {"level":"C1","ja":"機会費用を比較しましょう。","answer":"Let's weigh the opportunity costs.","alts":[]},
  {"level":"C1","ja":"最弱の前提を検証しましょう。","answer":"Let's test the weakest premise.","alts":[]},
  {"level":"C1","ja":"前例を踏まえましょう。","answer":"Let's draw on precedent.","alts":[]},
  {"level":"C1","ja":"根本原因を突き止めましょう。","answer":"Let's pinpoint the root cause.","alts":[]},
  {"level":"C1","ja":"盲点を洗い出しましょう。","answer":"Let's surface the blind spots.","alts":[]}
]);

/* 増量セットBO：高次スキル各種 最終達成（5倍ペース）*/
window.EigoData.collocationItems = window.EigoData.collocationItems.concat([
  { level:"B2", text:"Let's ___ a habit of it.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make a habit（習慣にする）。" },
  { level:"B2", text:"They ___ a living.", q:"自然な語は？", choices:["made","did","took","gave"], explain:"make a living（生計を立てる）。" },
  { level:"C1", text:"Let's ___ the most of it.", q:"自然な語は？", choices:["make","do","take","give"], explain:"make the most of（最大限活用する）。" }
]);
window.EigoData.thinkingItems = window.EigoData.thinkingItems.concat([
  { level:"B2", ja:"", text:"「まとめると」を伝えるなら？", choices:["To sum up,","Sum to now,","End say yes,","Close talk maybe,"], explain:"To sum up ＝ まとめると。" },
  { level:"C1", ja:"", text:"「あえて言うなら」を伝えるなら？", choices:["If anything,","Any thing now,","Maybe say yes,","Bold word maybe,"], explain:"If anything ＝ あえて言うなら。" }
]);
window.EigoData.discussionItems = window.EigoData.discussionItems.concat([
  { level:"B2", text:"次に進む合意を取る：", choices:["Shall we move forward, then?","Stop everything.","No moving on.","Stay stuck."], explain:"次に進む合意を取る。" },
  { level:"C1", text:"判断を保留する合意を取る：", choices:["Let's park this until we know more.","Decide now blindly.","Never revisit.","Force a choice."], explain:"情報が増えるまで判断を保留する。" }
]);
window.EigoData.intonationItems = window.EigoData.intonationItems.concat([
  { level:"B2", text:"That sounds promising.", q:"期待の調子は？", choices:["明るく下げて言い切る↘","強く上げる↗","平坦に切る","ためらう"], explain:"期待は明るく下げて。" },
  { level:"C1", text:"Let's keep an open mind.", q:"穏やかに促す調子は？", choices:["落ち着いて下げ気味で","強く上げる","速く言い切る","小さく言う"], explain:"穏やかに促すのは下げ気味で。" }
]);
window.EigoData.rhythmItems = window.EigoData.rhythmItems.concat([
  { level:"B2", text:"Let's FOCUS on the BIG picture.", q:"強く読む語は？", choices:["focus / big / picture","let's / on / the","on / the","均等"], explain:"内容語を強く。" },
  { level:"C1", text:"LISTEN more, ASSUME less.", q:"強く読む語は？", choices:["listen / more / assume / less","none","the / a","均等"], explain:"対比の内容語を強く。" }
]);
window.EigoData.chunkItems = window.EigoData.chunkItems.concat([
  { level:"B2", text:"In any case, we'll try.", q:"自然なチャンク区切りは？", choices:["In any case, / we'll try","In / any case we'll / try","In any / case we'll try","In any case we'll / try"], explain:"前置きの句/主節、で区切る。" },
  { level:"C1", text:"All told, it succeeded.", q:"自然なチャンク区切りは？", choices:["All told, / it succeeded","All / told it / succeeded","All told it / succeeded","All / told it succeeded"], explain:"前置き句/主節、で区切る。" }
]);
window.EigoData.stressItems = window.EigoData.stressItems.concat([
  { level:"B2", word:"decide", syl:["de","CIDE"], ans:1, ja:"決める" },
  { level:"B2", word:"decision", syl:["de","CI","sion"], ans:1, ja:"決定" },
  { level:"C1", word:"decisive", syl:["de","CI","sive"], ans:1, ja:"決定的な" }
]);

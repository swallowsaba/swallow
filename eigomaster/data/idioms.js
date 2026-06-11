/* ============================================================
   data/idioms.js — 熟語・句動詞（イディオム）教材
   各項目：{ id, en(熟語), ja(意味), ex(例文), exja(例文訳), level, kind }
   kind: "句動詞" | "イディオム"
   カタカナは描画時に Katakana.toKatakana で動的生成する（手書き不要）。
   window.EigoData.idioms に登録。同形式で拡張可能。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.idioms = [
  // ---- A2 句動詞 ----
  { id: "i_lookfor",   en: "look for",      ja: "〜を探す",            ex: "I'm looking for the file.",            exja: "ファイルを探しています。", level: "A2", kind: "句動詞" },
  { id: "i_giveup",    en: "give up",       ja: "あきらめる",          ex: "Don't give up so soon.",               exja: "そんなに早くあきらめないで。", level: "A2", kind: "句動詞" },
  { id: "i_findout",   en: "find out",      ja: "突き止める・知る",    ex: "Let's find out what happened.",        exja: "何が起きたか突き止めよう。", level: "A2", kind: "句動詞" },
  { id: "i_pickup",    en: "pick up",       ja: "拾う・受け取る",      ex: "Can you pick up the package?",         exja: "荷物を受け取ってもらえますか？", level: "A2", kind: "句動詞" },
  { id: "i_turnon",    en: "turn on",       ja: "（電源を）入れる",    ex: "Please turn on the projector.",        exja: "プロジェクターをつけてください。", level: "A2", kind: "句動詞" },
  { id: "i_turnoff",   en: "turn off",      ja: "（電源を）切る",      ex: "Turn off the lights when you leave.",  exja: "出るとき電気を消して。", level: "A2", kind: "句動詞" },
  { id: "i_setup",     en: "set up",        ja: "設定する・手配する",  ex: "Let's set up a call for tomorrow.",    exja: "明日の通話を手配しよう。", level: "A2", kind: "句動詞" },
  { id: "i_fillout",   en: "fill out",      ja: "（書類に）記入する",  ex: "Please fill out this form.",           exja: "この用紙にご記入ください。", level: "A2", kind: "句動詞" },

  // ---- B1 句動詞 ----
  { id: "i_followup",  en: "follow up",     ja: "あとで確認する・追う", ex: "I'll follow up with the client.",      exja: "顧客にあとで確認します。", level: "B1", kind: "句動詞" },
  { id: "i_catchup",   en: "catch up",      ja: "追いつく・近況を話す", ex: "Let's catch up over coffee.",          exja: "コーヒーでも飲みながら近況を話そう。", level: "B1", kind: "句動詞" },
  { id: "i_carryout",  en: "carry out",     ja: "実行する",            ex: "We carried out the plan on time.",     exja: "計画を予定通り実行した。", level: "B1", kind: "句動詞" },
  { id: "i_pointout",  en: "point out",     ja: "指摘する",            ex: "She pointed out a small error.",       exja: "彼女は小さな誤りを指摘した。", level: "B1", kind: "句動詞" },
  { id: "i_bringup",   en: "bring up",      ja: "（話題を）持ち出す",  ex: "He brought up the budget issue.",      exja: "彼は予算の問題を持ち出した。", level: "B1", kind: "句動詞" },
  { id: "i_workout",   en: "work out",      ja: "うまくいく・解決する", ex: "I'm sure it will work out.",           exja: "きっとうまくいくよ。", level: "B1", kind: "句動詞" },
  { id: "i_runout",    en: "run out of",    ja: "〜を切らす",          ex: "We ran out of time.",                  exja: "時間切れになった。", level: "B1", kind: "句動詞" },
  { id: "i_comeup",    en: "come up with",  ja: "（案を）思いつく",    ex: "She came up with a great idea.",       exja: "彼女は素晴らしい案を思いついた。", level: "B1", kind: "句動詞" },

  // ---- B1 イディオム ----
  { id: "i_onthesame", en: "on the same page", ja: "認識が一致している", ex: "Let's make sure we're on the same page.", exja: "認識を合わせておこう。", level: "B1", kind: "イディオム" },
  { id: "i_keepinmind",en: "keep in mind",  ja: "心に留めておく",      ex: "Keep in mind the deadline is Friday.", exja: "締め切りが金曜だと覚えておいて。", level: "B1", kind: "イディオム" },
  { id: "i_atthemoment",en:"at the moment", ja: "今のところ",          ex: "I'm busy at the moment.",              exja: "今のところ手が離せません。", level: "B1", kind: "イディオム" },
  { id: "i_asap",      en: "as soon as possible", ja: "できるだけ早く", ex: "Please reply as soon as possible.",    exja: "できるだけ早くお返事ください。", level: "B1", kind: "イディオム" },

  // ---- B2 句動詞 ----
  { id: "i_lookinto",  en: "look into",     ja: "調査する",            ex: "We'll look into the problem.",         exja: "その問題を調査します。", level: "B2", kind: "句動詞" },
  { id: "i_figureout", en: "figure out",    ja: "理解する・解決する",  ex: "I can't figure out this error.",       exja: "このエラーが分からない。", level: "B2", kind: "句動詞" },
  { id: "i_cutdown",   en: "cut down on",   ja: "減らす",              ex: "We need to cut down on costs.",        exja: "コストを減らす必要がある。", level: "B2", kind: "句動詞" },
  { id: "i_takeover",  en: "take over",     ja: "引き継ぐ",            ex: "She'll take over the project.",        exja: "彼女がプロジェクトを引き継ぐ。", level: "B2", kind: "句動詞" },
  { id: "i_putoff",    en: "put off",       ja: "延期する",            ex: "Let's not put off the decision.",      exja: "決定を先延ばしにしないようにしよう。", level: "B2", kind: "句動詞" },
  { id: "i_standout",  en: "stand out",     ja: "目立つ・際立つ",      ex: "Your proposal really stands out.",     exja: "あなたの提案は際立っている。", level: "B2", kind: "句動詞" },

  // ---- B2 イディオム ----
  { id: "i_ballpark",  en: "ballpark figure", ja: "おおよその数字",    ex: "Can you give me a ballpark figure?",   exja: "おおよその数字をもらえますか？", level: "B2", kind: "イディオム" },
  { id: "i_touchbase", en: "touch base",    ja: "連絡を取り合う",      ex: "Let's touch base next week.",          exja: "来週、連絡を取り合いましょう。", level: "B2", kind: "イディオム" },
  { id: "i_bigpicture",en: "the big picture", ja: "全体像",            ex: "Let's focus on the big picture.",      exja: "全体像に集中しよう。", level: "B2", kind: "イディオム" },
  { id: "i_uptospeed", en: "up to speed",   ja: "最新の状況に追いついた", ex: "Let me get you up to speed.",        exja: "最新の状況をお伝えします。", level: "B2", kind: "イディオム" },
  { id: "i_inthelong", en: "in the long run", ja: "長い目で見れば",    ex: "It pays off in the long run.",         exja: "長い目で見れば報われる。", level: "B2", kind: "イディオム" },

  // ---- C1 イディオム ----
  { id: "i_lowhanging",en: "low-hanging fruit", ja: "簡単に達成できること", ex: "Let's start with the low-hanging fruit.", exja: "まず簡単に手が届くものから始めよう。", level: "C1", kind: "イディオム" },
  { id: "i_movetheneedle",en:"move the needle", ja: "大きな変化を生む", ex: "This change could move the needle.",   exja: "この変更は状況を大きく動かしうる。", level: "C1", kind: "イディオム" },
  { id: "i_backburner",en: "on the back burner", ja: "後回しにして",   ex: "That project is on the back burner.",  exja: "そのプロジェクトは後回しになっている。", level: "C1", kind: "イディオム" },
  { id: "i_circleback",en: "circle back",   ja: "あとで戻って話す",    ex: "Let's circle back on this later.",     exja: "これは後ほど改めて話そう。", level: "C1", kind: "イディオム" },
  { id: "i_bottomline",en: "the bottom line", ja: "要点・結論",        ex: "The bottom line is we need more time.", exja: "要するに、もっと時間が必要だ。", level: "C1", kind: "イディオム" }
];

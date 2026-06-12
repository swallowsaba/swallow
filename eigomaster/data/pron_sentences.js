/* ============================================================
   発音・スピーキング練習文データ
   - 発音チェック / 統合レッスン / シャドーイングで共用する
   - cat: basic(基本) meeting(会議) email(メール読み上げ) presentation(プレゼン)
          negotiation(交渉) smalltalk(スモールトーク) th(TH) rl(R/L)
          darkl(ダークL) linking(リンキング/リダクション) stress(強勢・リズム)
   - tip: 言うときのコツ（日本語）
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.pronSentences = [
  /* ---- 基本 ---- */
  { cat: "basic", en: "Could you say that again, please?", ja: "もう一度言っていただけますか。", tip: "Could you は「クッジュ」と連結。文末は上げ調子。" },
  { cat: "basic", en: "Let me check and get back to you.", ja: "確認して折り返します。", tip: "get back to は「ゲッバック トゥ」。tは飲み込む。" },
  { cat: "basic", en: "That sounds good to me.", ja: "それでいいと思います。", tip: "sounds の s と good をなめらかに。" },
  { cat: "basic", en: "I see what you mean.", ja: "おっしゃることは分かります。", tip: "what you は「ワチュ」。" },
  { cat: "basic", en: "Thanks for your help today.", ja: "今日は助かりました。", tip: "Thanks の th は舌先を軽く噛む。" },
  { cat: "basic", en: "I'll send it over right away.", ja: "すぐにお送りします。", tip: "send it over は「センディットウヴァ」と連結。" },
  { cat: "basic", en: "Do you have a minute to talk?", ja: "少しお話しできますか。", tip: "have a は「ハヴァ」。" },
  { cat: "basic", en: "Let's figure it out together.", ja: "一緒に解決しましょう。", tip: "figure it out は「フィギャリラウト」。" },
  { cat: "basic", en: "I'm not sure I follow you.", ja: "話についていけていません。", tip: "not sure を強く、文末は下げる。" },
  { cat: "basic", en: "Can I ask a quick question?", ja: "簡単な質問をしてもいいですか。", tip: "ask a は「アスカ」。" },
  { cat: "basic", en: "It works for me either way.", ja: "どちらでも大丈夫です。", tip: "works for は「ワークスファ」。" },
  { cat: "basic", en: "I really appreciate your time.", ja: "お時間ありがとうございます。", tip: "appreciate の強勢は pre。" },

  /* ---- 会議 ---- */
  { cat: "meeting", en: "Let's get started, shall we?", ja: "では始めましょうか。", tip: "get started の t は弱く。" },
  { cat: "meeting", en: "Could you walk us through the numbers?", ja: "数字を順に説明していただけますか。", tip: "walk us は「ウォーカス」。" },
  { cat: "meeting", en: "I'd like to add one point here.", ja: "ここで一点付け加えたいです。", tip: "I'd like to は「アイドライクトゥ」。" },
  { cat: "meeting", en: "Can we move on to the next item?", ja: "次の議題に移ってもいいですか。", tip: "move on は「ムーヴォン」。" },
  { cat: "meeting", en: "Let's take a five-minute break.", ja: "5分休憩にしましょう。", tip: "take a は「テイカ」。" },
  { cat: "meeting", en: "Who's going to own this task?", ja: "このタスクは誰が担当しますか。", tip: "going to は「ゴナ」でも可。" },
  { cat: "meeting", en: "Just to confirm, the deadline is Friday.", ja: "確認ですが、締切は金曜です。", tip: "Just to は「ジャストゥ」。" },
  { cat: "meeting", en: "Let's park that and follow up later.", ja: "それは保留にして後で対応しましょう。", tip: "park that の k-th をはっきり区切る。" },
  { cat: "meeting", en: "Does anyone have any objections?", ja: "異議のある方はいますか。", tip: "objections の強勢は jec。" },
  { cat: "meeting", en: "Let me share my screen.", ja: "画面を共有します。", tip: "Let me は「レミ」。" },
  { cat: "meeting", en: "We're running out of time.", ja: "時間が無くなってきました。", tip: "out of は「アウラヴ」。" },
  { cat: "meeting", en: "I'll send the minutes after the call.", ja: "通話後に議事録を送ります。", tip: "minutes（議事録）は「ミニッツ」。" },

  /* ---- メール読み上げ（書き言葉を口慣らし） ---- */
  { cat: "email", en: "I hope this email finds you well.", ja: "お元気でお過ごしのことと思います。", tip: "finds you は「ファインジュ」。" },
  { cat: "email", en: "I'm writing to follow up on my previous message.", ja: "前回のご連絡の件でメールしています。", tip: "follow up on をひとかたまりで。" },
  { cat: "email", en: "Please find the attached file for your reference.", ja: "ご参考までに添付ファイルをご覧ください。", tip: "attached の -ed は t 音。" },
  { cat: "email", en: "Could you confirm receipt of this document?", ja: "本書類の受領をご確認いただけますか。", tip: "receipt の p は発音しない。" },
  { cat: "email", en: "I apologize for the late reply.", ja: "返信が遅れて申し訳ありません。", tip: "apologize の強勢は po。" },
  { cat: "email", en: "Please let me know if you have any questions.", ja: "ご不明点があればお知らせください。", tip: "let me know をリズムよく。" },
  { cat: "email", en: "I look forward to hearing from you.", ja: "ご連絡をお待ちしております。", tip: "forward to は「フォワートゥ」。" },
  { cat: "email", en: "Thank you in advance for your cooperation.", ja: "ご協力のほどよろしくお願いします。", tip: "in advance は「イナドヴァンス」。" },

  /* ---- プレゼン ---- */
  { cat: "presentation", en: "Today, I'm going to talk about three key points.", ja: "本日は3つの要点についてお話しします。", tip: "three の th をしっかり。" },
  { cat: "presentation", en: "Let's start with a quick overview.", ja: "まず概要から始めます。", tip: "start with は「スターウィズ」。" },
  { cat: "presentation", en: "As you can see on this slide, sales are growing.", ja: "このスライドの通り、売上は伸びています。", tip: "As you は「アジュ」。" },
  { cat: "presentation", en: "This brings me to my next point.", ja: "これが次のポイントにつながります。", tip: "brings me をなめらかに。" },
  { cat: "presentation", en: "Let me give you a concrete example.", ja: "具体例を挙げます。", tip: "give you は「ギヴュ」。" },
  { cat: "presentation", en: "To sum up, we should invest in training.", ja: "まとめると、研修に投資すべきです。", tip: "sum up は「サマップ」。" },
  { cat: "presentation", en: "I'm happy to take any questions now.", ja: "ご質問をお受けします。", tip: "take any は「テイケニ」。" },
  { cat: "presentation", en: "Thank you all for your attention.", ja: "ご清聴ありがとうございました。", tip: "all を長めに伸ばす。" },

  /* ---- 交渉 ---- */
  { cat: "negotiation", en: "We're looking for a win-win solution.", ja: "双方に利のある解決策を探しています。", tip: "win-win は両方強く。" },
  { cat: "negotiation", en: "Could you be more flexible on the price?", ja: "価格をもう少し柔軟にできませんか。", tip: "flexible の強勢は flex。" },
  { cat: "negotiation", en: "That's a bit beyond our budget.", ja: "それは予算を少し超えています。", tip: "bit beyond の b を続けて。" },
  { cat: "negotiation", en: "If you order more, we can offer a discount.", ja: "数量を増やせば割引できます。", tip: "offer a は「オファラ」。" },
  { cat: "negotiation", en: "Let me run it by my manager first.", ja: "まず上司に確認させてください。", tip: "run it by は「ラニッバイ」。" },
  { cat: "negotiation", en: "Can we meet in the middle?", ja: "間を取りませんか。", tip: "meet in は「ミーティン」。" },
  { cat: "negotiation", en: "We have a deal.", ja: "それで決まりです。", tip: "deal を長く強く。" },
  { cat: "negotiation", en: "I'll need that in writing, please.", ja: "書面でお願いします。", tip: "need that の d-th を丁寧に。" },

  /* ---- スモールトーク ---- */
  { cat: "smalltalk", en: "How was your weekend?", ja: "週末はどうでしたか。", tip: "was your は「ワジュア」。" },
  { cat: "smalltalk", en: "It's getting colder these days, isn't it?", ja: "最近寒くなってきましたね。", tip: "isn't it? は軽く上げる。" },
  { cat: "smalltalk", en: "Did you catch the game last night?", ja: "昨夜の試合は見ましたか。", tip: "Did you は「ディジュ」。" },
  { cat: "smalltalk", en: "How's the new project going?", ja: "新しいプロジェクトはどうですか。", tip: "How's the をひと息で。" },
  { cat: "smalltalk", en: "Any plans for the holidays?", ja: "休暇の予定はありますか。", tip: "plans for は「プランズファ」。" },
  { cat: "smalltalk", en: "I love your presentation slides, by the way.", ja: "ところで、スライド素敵でした。", tip: "by the way は前置きの定番。軽く。" },
  { cat: "smalltalk", en: "Long time no see! How have you been?", ja: "お久しぶり！元気でしたか。", tip: "have you は「ハヴュ」。" },
  { cat: "smalltalk", en: "It was great catching up with you.", ja: "話せてよかったです。", tip: "catching up を一気に。" },

  /* ---- TH ---- */
  { cat: "th", en: "I think this is the third one.", ja: "これは3つ目だと思います。", tip: "think/third/the すべて舌先を歯に。" },
  { cat: "th", en: "Thank you for thinking it through.", ja: "よく考えてくれてありがとう。", tip: "through の th＋r が難所。" },
  { cat: "th", en: "There's something worth mentioning.", ja: "言及する価値のあることがあります。", tip: "There's の th は有声、worth は無声。" },
  { cat: "th", en: "They gathered together on Thursday.", ja: "彼らは木曜に集まりました。", tip: "有声th（They/gathered/together）の練習。" },
  { cat: "th", en: "Both methods are worth a thousand words.", ja: "どちらの方法も大いに語る価値があります。", tip: "Both/methods/thousand を丁寧に。" },
  { cat: "th", en: "My birthday is on the thirtieth.", ja: "誕生日は30日です。", tip: "thirtieth は th-r-t-th の連続。ゆっくりから。" },

  /* ---- R / L ---- */
  { cat: "rl", en: "The library is really crowded today.", ja: "今日は図書館がとても混んでいます。", tip: "library は l→r の切替。舌先を付けて、離す。" },
  { cat: "rl", en: "Please collect the correct reports.", ja: "正しい報告書を集めてください。", tip: "collect(L)とcorrect(R)の対比。" },
  { cat: "rl", en: "The flight was delayed due to rain.", ja: "雨でフライトが遅れました。", tip: "flight の fl、rain の r を区別。" },
  { cat: "rl", en: "Her brilliant role in the play was praised.", ja: "彼女の見事な役は称賛されました。", tip: "brilliant は br と ll の両方。" },
  { cat: "rl", en: "I'd rather rely on the local rules.", ja: "現地のルールに従いたいです。", tip: "rather/rely(R)、local/rules(L+R)。" },
  { cat: "rl", en: "Larry rarely orders regular lattes.", ja: "ラリーは普通のラテをめったに頼みません。", tip: "早口言葉風。ゆっくり正確に。" },

  /* ---- ダークL（語末・子音前のL） ---- */
  { cat: "darkl", en: "I'll call you when the deal is final.", ja: "取引が確定したら電話します。", tip: "I'll/call/deal/final の L は「ウ」に近い暗いL。舌先は奥に。" },
  { cat: "darkl", en: "Fill the bottle with cold milk.", ja: "ボトルに冷たい牛乳を入れて。", tip: "Fill/bottle/cold/milk すべてダークL。" },
  { cat: "darkl", en: "The hotel bill was full of small details.", ja: "ホテルの請求書は細かい項目だらけでした。", tip: "hotel/bill/full/small/details。語末Lを「ル」と言わない。" },
  { cat: "darkl", en: "We'll handle the schedule as a whole.", ja: "スケジュール全体をこちらで対応します。", tip: "We'll/handle/schedule/whole。Lの前で舌の奥を持ち上げる。" },
  { cat: "darkl", en: "The final result will tell all.", ja: "最終結果がすべてを物語ります。", tip: "final/result/will/tell/all の暗いLを連続練習。" },
  { cat: "darkl", en: "People still feel the old model is simple.", ja: "旧モデルが簡単だと今も感じられています。", tip: "People/still/feel/old/model/simple。" },

  /* ---- リンキング・リダクション ---- */
  { cat: "linking", en: "Check it out as soon as possible.", ja: "できるだけ早く確認して。", tip: "Check it out＝チェッキラウト。as soon as＝アスーナズ。" },
  { cat: "linking", en: "I should have told you about it.", ja: "それについて言うべきでした。", tip: "should have＝シュダヴ。about it＝アバウリッ。" },
  { cat: "linking", en: "What do you want to do tonight?", ja: "今夜は何をしたい？", tip: "What do you＝ワダヤ。want to＝ワナ。" },
  { cat: "linking", en: "There's a lot of work to catch up on.", ja: "追いつくべき仕事が山ほどあります。", tip: "lot of＝ロラヴ。catch up on＝キャッチャポン。" },
  { cat: "linking", en: "Could you pick him up at the airport?", ja: "空港で彼を拾ってもらえますか。", tip: "pick him up＝ピッキマップ（hが落ちる）。" },
  { cat: "linking", en: "Let me know when you find out.", ja: "分かったら教えてください。", tip: "Let me＝レミ。find out＝ファインダウト。" },
  { cat: "linking", en: "It's kind of hard to explain.", ja: "説明がちょっと難しいです。", tip: "kind of＝カインダ。" },
  { cat: "linking", en: "We ran out of time again.", ja: "また時間切れになりました。", tip: "ran out of＝ラナウラヴ。" },

  /* ---- 強勢・リズム・イントネーション ---- */
  { cat: "stress", en: "I didn't say he stole the money.", ja: "（強調する語で意味が変わる文）", tip: "強調する単語を変えて7通り言い分けてみよう。" },
  { cat: "stress", en: "We need to focus on quality, not quantity.", ja: "量ではなく質に集中すべきです。", tip: "quality と quantity を強く対比。" },
  { cat: "stress", en: "It's not what you said, it's how you said it.", ja: "何を言ったかでなく、どう言ったかです。", tip: "what と how を強く。" },
  { cat: "stress", en: "Would you prefer coffee or tea?", ja: "コーヒーと紅茶どちらにしますか。", tip: "coffee↗ or tea↘ の選択イントネーション。" },
  { cat: "stress", en: "The record shows a new record.", ja: "記録は新記録を示しています。", tip: "動詞 reCORD と名詞 REcord の強勢の違い。" },
  { cat: "stress", en: "I can do it. I can't do it.", ja: "できます。できません。", tip: "can は弱く「クン」、can't は強く長く。" },
  { cat: "stress", en: "Absolutely. That's exactly what I meant.", ja: "その通り。まさにそういう意味です。", tip: "Ab-so-lute-ly のリズム。ex-ACT-ly。" },
  { cat: "stress", en: "We met in person for the first time.", ja: "初めて直接会いました。", tip: "first time をひとかたまりで強く。" }
];

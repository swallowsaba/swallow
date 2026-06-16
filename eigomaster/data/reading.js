/* ============================================================
   data/reading.js — リーディング用サンプル文（自作・権利フリー）
   ※ 著作権のある字幕・記事は同梱しない。ユーザーは自分のテキストを貼り付け可能。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.readingSamples = [
  {
    id: "r_email",
    title: "ビジネスメール（依頼）",
    level: "A2",
    text: "Hi Mei. Thank you for your message. I was wondering if you could send me the latest figures by Friday. " +
          "We have a meeting with the client on Monday morning. Please let me know if you need anything from my side. " +
          "I really appreciate your help. Best regards, Ken."
  },
  {
    id: "r_update",
    title: "プロジェクト進捗の共有",
    level: "B1",
    text: "Our team has made good progress this week. We finished the first version of the app and started testing it. " +
          "The client gave us helpful feedback, and we are now fixing a few small issues. " +
          "If everything goes well, we will release the update before the end of the month. " +
          "Thanks to everyone who worked late to meet the deadline."
  },
  {
    id: "r_strategy",
    title: "市場戦略の要点",
    level: "B2",
    text: "To grow in a competitive market, we should prioritize the products that bring the most revenue. " +
          "At the same time, we need a contingency plan in case demand drops. " +
          "By leveraging our existing network, we can reach new customers without raising overhead costs. " +
          "If we align the team around clear goals, we can move faster and reduce risk."
  }
];

/* ---- 追加サンプル（解説つき学習向け） ---- */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {
    id: "r_meeting",
    title: "会議の議事録（要約）",
    level: "B1",
    text: "We held our weekly meeting on Tuesday. First, Maria shared the sales numbers, which were higher than expected. " +
          "Next, we discussed the new website design. Although most members liked it, some asked for a simpler layout. " +
          "Finally, we agreed to test both versions with real users before making a decision."
  },
  {
    id: "r_apology",
    title: "障害のお詫びと報告",
    level: "B2",
    text: "We sincerely apologize for the service interruption that occurred last night. " +
          "The issue was caused by a configuration error during a routine update, not by a security problem. " +
          "Our engineers identified the cause within an hour and restored the service shortly afterward. " +
          "To prevent this from happening again, we have added extra checks to our release process."
  }
]);

/* ---- 各サンプルの学習解説（全訳・語句・文法ポイント） ---- */
window.EigoData.readingNotes = {
  r_email: {
    ja: "メイさん、こんにちは。ご連絡ありがとうございます。金曜日までに最新の数値を送っていただけないでしょうか。月曜の朝にクライアントとの会議があります。私の側で必要なものがあれば知らせてください。ご協力に本当に感謝します。よろしくお願いします。ケン",
    vocab: [
      { en: "I was wondering if you could ...", ja: "〜していただけないでしょうか（とても丁寧な依頼）" },
      { en: "the latest figures", ja: "最新の数値・データ（figure=数値）" },
      { en: "from my side", ja: "私の側から（協力の申し出で頻出）" },
      { en: "I appreciate your help", ja: "ご協力に感謝します（thank youより丁寧）" },
      { en: "Best regards", ja: "結びの定型（ビジネスメールの「敬具」）" }
    ],
    grammar: [
      { point: "I was wondering if S could ...", ja: "過去進行形 was wondering を使うと依頼がやわらかく丁寧になります（現在形 I wonder より控えめ）。if節の中は could で依頼の丁寧さを保ちます。" },
      { point: "let me know if ...", ja: "let＋人＋動詞の原形「人に〜させる」。Please let me know＝「お知らせください」はメール定番表現です。" }
    ]
  },
  r_update: {
    ja: "私たちのチームは今週、良い進捗を上げました。アプリの最初のバージョンを完成させ、テストを開始しました。クライアントから有益なフィードバックをもらい、現在いくつかの小さな問題を修正しています。すべて順調にいけば、月末までにアップデートを公開します。締め切りに間に合わせるため遅くまで働いてくれた皆さんに感謝します。",
    vocab: [
      { en: "make progress", ja: "進捗する・はかどる（progressは不可算）" },
      { en: "helpful feedback", ja: "有益なフィードバック（give feedbackで「意見を伝える」）" },
      { en: "fix issues", ja: "問題を修正する（bug fixの fix）" },
      { en: "meet the deadline", ja: "締め切りに間に合わせる（meet＝満たす）" },
      { en: "thanks to ...", ja: "〜のおかげで／〜に感謝して" }
    ],
    grammar: [
      { point: "現在完了 has made / 過去形 finished の使い分け", ja: "「今週の成果」を今に引きつけて言うときは現在完了（has made progress）、完了した個々の出来事は過去形（finished, started）で並べます。" },
      { point: "条件のif＋will", ja: "If everything goes well, we will release ...：if節の中は現在形（goes）、結果の節に will を置きます（if節にwillは入れない）。" }
    ]
  },
  r_strategy: {
    ja: "競争の激しい市場で成長するためには、最も収益をもたらす製品を優先すべきです。同時に、需要が落ち込んだ場合に備えた代替案も必要です。既存のネットワークを活用すれば、間接費を増やさずに新しい顧客に届きます。チームの足並みを明確な目標にそろえれば、より速く動き、リスクを減らせます。",
    vocab: [
      { en: "prioritize", ja: "優先する（priority の動詞形）" },
      { en: "contingency plan", ja: "不測の事態への代替案・コンティンジェンシープラン" },
      { en: "in case ...", ja: "〜の場合に備えて" },
      { en: "leverage", ja: "（資産・強みを）活用する" },
      { en: "overhead costs", ja: "間接費（家賃・光熱費など売上に直接結びつかない費用）" },
      { en: "align the team around ...", ja: "チームを〜のもとに一致させる" }
    ],
    grammar: [
      { point: "目的の to不定詞（文頭）", ja: "To grow in a competitive market, ...：文頭の to不定詞で「〜するためには」。主節の主語（we）が grow する人と一致している点に注意。" },
      { point: "By -ing「〜することによって」", ja: "By leveraging our existing network, we can ...：前置詞 by＋動名詞で手段を表します。" },
      { point: "in case＋現在形", ja: "in case demand drops：「需要が落ちた場合に備えて」。in caseの節は現在形で書きます。" }
    ]
  },
  r_meeting: {
    ja: "火曜日に週次会議を行いました。最初にマリアが売上の数字を共有し、それは予想より高いものでした。次に新しいウェブサイトのデザインについて話し合いました。ほとんどのメンバーは気に入りましたが、より簡素なレイアウトを求める声もありました。最後に、決定の前に両方の案を実際のユーザーでテストすることで合意しました。",
    vocab: [
      { en: "hold a meeting", ja: "会議を開く（held は hold の過去形）" },
      { en: "higher than expected", ja: "予想より高い（than expected＝予想と比べて）" },
      { en: "ask for ...", ja: "〜を求める" },
      { en: "agree to do", ja: "〜することに合意する" },
      { en: "make a decision", ja: "決定を下す" }
    ],
    grammar: [
      { point: "非制限用法の which", ja: "..., which were higher than expected：コンマ＋which で直前の内容（sales numbers）に補足説明を加えます。訳は「〜だが、それは…だった」。" },
      { point: "譲歩の Although", ja: "Although most members liked it, some asked ...：「〜だけれども」。Althoughの節と主節をコンマでつなぎ、butは併用しません。" },
      { point: "First / Next / Finally", ja: "順序を示すつなぎ言葉。議事録や手順説明の基本形です。" }
    ]
  },
  r_apology: {
    ja: "昨夜発生したサービス停止について心よりお詫び申し上げます。問題はセキュリティ上の問題ではなく、定期更新中の設定ミスによるものでした。当社のエンジニアは1時間以内に原因を特定し、その後まもなくサービスを復旧させました。再発を防ぐため、リリース手順に追加のチェックを加えました。",
    vocab: [
      { en: "sincerely apologize for ...", ja: "〜について心からお詫びする" },
      { en: "service interruption", ja: "サービス停止・中断" },
      { en: "be caused by ...", ja: "〜が原因である（受動態）" },
      { en: "identify the cause", ja: "原因を特定する" },
      { en: "restore the service", ja: "サービスを復旧させる" },
      { en: "prevent A from -ing", ja: "Aが〜するのを防ぐ" }
    ],
    grammar: [
      { point: "関係代名詞 that＋過去形", ja: "the service interruption that occurred last night：that以下が直前の名詞を説明します（昨夜発生した停止）。" },
      { point: "not A but B の対比", ja: "..., not by a security problem：原因を「セキュリティではなく設定ミス」と対比して明確化しています。" },
      { point: "prevent this from happening", ja: "prevent＋目的語＋from＋動名詞で「〜が起こるのを防ぐ」。再発防止の定番表現です。" }
    ]
  }
};

/* ---- 増量：リーディング教材（解説つき） ---- */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_proposal", title:"提案書の要旨", level:"B2",
    text:"We propose launching a pilot program in three cities before a full rollout. " +
         "This approach lets us gather real user feedback while keeping initial costs low. " +
         "If the results meet our targets, we will expand nationwide within six months. " +
         "Otherwise, we will revise the plan based on what we learn." },
  { id:"r_review", title:"業績レビュー", level:"B2",
    text:"Overall, the team exceeded its goals this quarter. Revenue grew by twelve percent, " +
         "driven mainly by repeat customers. However, response times slipped during peak weeks, " +
         "so we plan to add staff before the next busy season." },
  { id:"r_onboarding", title:"新人向け案内", level:"B1",
    text:"Welcome to the team! For your first week, focus on meeting your colleagues and learning our tools. " +
         "Don't worry about being productive right away. If anything is unclear, just ask. " +
         "We would rather you ask early than guess." },
  { id:"r_announcement", title:"社内アナウンス", level:"B1",
    text:"Starting next month, the office will switch to a hybrid schedule. " +
         "Everyone is expected on site Tuesdays and Thursdays, and may work remotely on other days. " +
         "Meeting rooms can be booked through the new portal." },
  { id:"r_caution", title:"注意喚起メール", level:"B2",
    text:"We have noticed an increase in phishing emails pretending to be from our IT department. " +
         "Never share your password by email. If a message feels off, report it rather than clicking any links. " +
         "When in doubt, contact the help desk directly." }
]);

/* 追加サンプルの解説 */
Object.assign(window.EigoData.readingNotes, {
  r_proposal: {
    ja:"私たちは、全面展開の前に3都市で試験プログラムを始めることを提案します。この方法なら、初期費用を抑えつつ実際の利用者の声を集められます。結果が目標を満たせば、6か月以内に全国展開します。そうでなければ、得た学びをもとに計画を見直します。",
    vocab:[{en:"pilot program",ja:"試験的プログラム"},{en:"rollout",ja:"展開・導入"},{en:"gather feedback",ja:"意見を集める"},{en:"meet our targets",ja:"目標を満たす"},{en:"nationwide",ja:"全国規模で"}],
    grammar:[{point:"条件のIf / Otherwise",ja:"If the results meet … / Otherwise … で「満たせば〜／そうでなければ〜」と条件分岐を示します。Otherwiseは「さもなければ」。"},{point:"let O do",ja:"This approach lets us gather …：let＋目的語＋動詞の原形で「〜が…するのを可能にする」。"}]
  },
  r_review: {
    ja:"全体として、チームは今四半期の目標を上回りました。収益は主にリピート顧客により12%伸びました。しかし繁忙期に応答時間が落ちたため、次の繁忙期前に人員を増やす予定です。",
    vocab:[{en:"exceed goals",ja:"目標を上回る"},{en:"repeat customers",ja:"リピート顧客"},{en:"response time",ja:"応答時間"},{en:"slip",ja:"低下する"},{en:"peak weeks",ja:"繁忙期"}],
    grammar:[{point:"分詞構文 driven by",ja:"…, driven mainly by repeat customers：過去分詞で「〜によって牽引されて」と理由・要因を補足します。"},{point:"逆接の However",ja:"文頭のHoweverはコンマを伴い「しかし」と前文に対する転換を示します。"}]
  },
  r_onboarding: {
    ja:"チームへようこそ！最初の一週間は、同僚と顔を合わせ、ツールを覚えることに集中してください。すぐに成果を出そうと気負う必要はありません。不明な点があれば、遠慮なく聞いてください。当てずっぽうより、早めに質問してもらう方がありがたいです。",
    vocab:[{en:"focus on -ing",ja:"〜に集中する"},{en:"right away",ja:"すぐに"},{en:"unclear",ja:"はっきりしない"},{en:"would rather A than B",ja:"BよりむしろAしたい"},{en:"guess",ja:"推測する"}],
    grammar:[{point:"would rather A than B",ja:"We would rather you ask early than guess：「BするよりAしてほしい」。A/Bは動詞の原形。"},{point:"命令文 + 理由",ja:"just ask（ただ聞いて）のように命令文で柔らかく促す。Don't worry about -ing は「〜を気にしないで」。"}]
  },
  r_announcement: {
    ja:"来月から、オフィスはハイブリッド勤務に切り替わります。全員が火曜と木曜は出社し、それ以外の日は在宅勤務が可能です。会議室は新しいポータルから予約できます。",
    vocab:[{en:"hybrid schedule",ja:"ハイブリッド勤務"},{en:"on site",ja:"職場で・現地で"},{en:"remotely",ja:"遠隔で"},{en:"book",ja:"予約する"},{en:"portal",ja:"ポータル(入口サイト)"}],
    grammar:[{point:"be expected to / 省略",ja:"Everyone is expected on site …：be expected (to be) on site の簡略表現で「出社が求められる」。"},{point:"助動詞 may",ja:"may work remotely：許可の may「〜してよい」。"}]
  },
  r_caution: {
    ja:"当社IT部門を装ったフィッシングメールの増加を確認しています。パスワードをメールで共有しないでください。不審に感じたら、リンクをクリックせず報告してください。迷ったら、ヘルプデスクに直接連絡してください。",
    vocab:[{en:"phishing",ja:"フィッシング詐欺"},{en:"pretend to be",ja:"〜を装う"},{en:"feel off",ja:"不審に感じる"},{en:"report",ja:"報告する"},{en:"when in doubt",ja:"迷ったときは"}],
    grammar:[{point:"現在完了 have noticed",ja:"We have noticed an increase …：最近気づいて今に至る、を現在完了で表す。"},{point:"分詞 pretending to be",ja:"emails pretending to be from …：現在分詞で「〜を装っているメール」と後ろから名詞を修飾。"},{point:"命令の Never + 動詞",ja:"Never share … で強い禁止「決して〜するな」。"}]
  }
});

/* 増量：リーディング教材（解説つき）第2弾 */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_feedback", title:"フィードバックの依頼", level:"B2",
    text:"I'd really value your honest feedback on the draft. Please don't hold back— " +
         "I'd rather hear the hard truths now than after we ship. " +
         "Feel free to comment directly in the document, and flag anything that feels unclear." },
  { id:"r_decline", title:"丁重なお断り", level:"B2",
    text:"Thank you so much for thinking of me for this. After careful thought, " +
         "I've decided I can't take it on right now, as my plate is already full. " +
         "I hope we can find another time to work together." },
  { id:"r_update", title:"進捗アップデート", level:"B1",
    text:"Quick update: we're on track to finish by Friday. " +
         "The design is done, and testing starts tomorrow. " +
         "One small risk is the vendor's delivery, but we have a backup plan." },
  { id:"r_apology", title:"お詫びと対応", level:"B2",
    text:"I'm sorry for the mix-up with your order. We've already shipped the correct item, " +
         "and it should arrive within two days. As a small token, " +
         "we've added a discount to your next purchase." },
  { id:"r_intro", title:"自己紹介メール", level:"B1",
    text:"Hi everyone, I'm Mia, the new project coordinator. " +
         "I'll be your point of contact for scheduling and updates. " +
         "I'm looking forward to working with you, so please reach out anytime." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_feedback: {
    ja:"草案について、率直なフィードバックをぜひいただきたいです。遠慮なさらないでください。リリース後より、今厳しい真実を聞く方がいいです。文書に直接コメントいただき、分かりにくい点があれば指摘してください。",
    vocab:[{en:"value feedback",ja:"意見を重んじる"},{en:"hold back",ja:"遠慮する"},{en:"hard truths",ja:"厳しい真実"},{en:"ship",ja:"リリースする"},{en:"flag",ja:"指摘する"}],
    grammar:[{point:"would rather A than B",ja:"I'd rather hear … than … で『BよりAしたい』。"},{point:"命令文 Feel free to",ja:"Feel free to … は『遠慮なく〜してください』の丁寧な促し。"}]
  },
  r_decline: {
    ja:"このお話で私を思い浮かべてくださり本当にありがとうございます。よく考えた結果、今は手一杯のため引き受けられないと決めました。また別の機会に一緒に働ければと思います。",
    vocab:[{en:"think of me for",ja:"〜で私を候補に考える"},{en:"take it on",ja:"引き受ける"},{en:"my plate is full",ja:"手一杯だ"},{en:"another time",ja:"別の機会"}],
    grammar:[{point:"現在完了 I've decided",ja:"熟考の結果いま決めた、を現在完了で表す。"},{point:"理由の as",ja:"as my plate is already full で『〜なので』と理由を示す。"}]
  },
  r_update: {
    ja:"簡単な進捗です。金曜までに終わる見込みです。デザインは完了し、明日からテストが始まります。一つ小さなリスクは業者の納品ですが、予備案があります。",
    vocab:[{en:"on track",ja:"順調で"},{en:"risk",ja:"リスク"},{en:"vendor",ja:"業者"},{en:"backup plan",ja:"予備案"}],
    grammar:[{point:"be on track to do",ja:"on track to finish で『〜する見込みで順調』。"},{point:"現在進行形の予定",ja:"testing starts tomorrow のように確定予定は現在形でも表せる。"}]
  },
  r_apology: {
    ja:"ご注文の手違いをお詫びします。すでに正しい品を発送済みで、2日以内に届くはずです。ささやかですが、次回のお買い物に割引を付けました。",
    vocab:[{en:"mix-up",ja:"手違い"},{en:"ship",ja:"発送する"},{en:"as a token",ja:"気持ちとして"},{en:"discount",ja:"割引"}],
    grammar:[{point:"現在完了 We've shipped",ja:"already + 現在完了で『すでに〜済み』。"},{point:"助動詞 should",ja:"should arrive は『〜のはず』という見込みの should。"}]
  },
  r_intro: {
    ja:"皆さんこんにちは、新しいプロジェクトコーディネーターのミアです。日程調整や更新の窓口を務めます。一緒に働けるのを楽しみにしていますので、いつでもご連絡ください。",
    vocab:[{en:"coordinator",ja:"調整役"},{en:"point of contact",ja:"窓口"},{en:"reach out",ja:"連絡する"},{en:"anytime",ja:"いつでも"}],
    grammar:[{point:"未来の will",ja:"I'll be your point of contact で役割の宣言。"},{point:"look forward to -ing",ja:"to の後は動名詞（working）。"}]
  }
});

/* 増量：リーディング教材 第3弾（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_negotiation", title:"価格交渉のメール", level:"B2",
    text:"Thank you for the quote. The proposal looks solid, but the price is a little above our budget. " +
         "Would you be open to a small discount if we commit to a longer contract? " +
         "We're keen to make this work and start as soon as possible." },
  { id:"r_thanks", title:"感謝のメッセージ", level:"B1",
    text:"I just wanted to say thank you for all your help last week. " +
         "You went out of your way to support the team, and it really made a difference. " +
         "I'm grateful to have you as a colleague." },
  { id:"r_request", title:"締切延長の依頼", level:"B2",
    text:"I'm writing to ask for a short extension on the report. " +
         "A key data source was delayed, which pushed back our analysis. " +
         "Could we move the deadline to Thursday? I'll make sure the quality doesn't suffer." },
  { id:"r_meeting", title:"会議の議事メモ", level:"B2",
    text:"In today's meeting, we agreed on three points. First, we'll launch the beta next month. " +
         "Second, marketing will prepare a short demo video. " +
         "Third, we'll review feedback in two weeks before the full release." },
  { id:"r_welcome", title:"新規顧客への案内", level:"B1",
    text:"Welcome aboard! We're thrilled to have you with us. " +
         "Your account is now active, and you can log in anytime. " +
         "If you have any questions, our support team is here to help around the clock." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_negotiation: {
    ja:"お見積りありがとうございます。提案はしっかりしていますが、価格が予算を少し上回ります。長期契約を結ぶなら、少し値引きしていただけますか。ぜひ実現させ、できるだけ早く始めたいです。",
    vocab:[{en:"quote",ja:"見積り"},{en:"above our budget",ja:"予算を上回って"},{en:"be open to",ja:"〜に前向きである"},{en:"commit to",ja:"〜を約束する"},{en:"keen to",ja:"〜したがって"}],
    grammar:[{point:"仮定の if",ja:"a discount if we commit … で『〜するなら値引き』の条件提示。"},{point:"Would you be open to …",ja:"丁寧に打診する定型。"}]
  },
  r_thanks: {
    ja:"先週は色々と助けてくれて、ありがとうと言いたかったんです。あなたはわざわざチームを支えてくれて、本当に大きな違いを生みました。あなたが同僚でいてくれて感謝しています。",
    vocab:[{en:"go out of one's way",ja:"わざわざ尽くす"},{en:"make a difference",ja:"大きな違いを生む"},{en:"grateful",ja:"感謝して"},{en:"colleague",ja:"同僚"}],
    grammar:[{point:"I just wanted to …",ja:"控えめに用件を伝える定型。"},{point:"to have you as …",ja:"to不定詞で感謝の理由を示す。"}]
  },
  r_request: {
    ja:"報告書の締切を少し延ばしていただけないかご相談です。重要なデータ源が遅れ、分析が後ろ倒しになりました。締切を木曜に移せますか。品質は落とさないようにします。",
    vocab:[{en:"extension",ja:"延長"},{en:"data source",ja:"データ源"},{en:"push back",ja:"後ろ倒しにする"},{en:"suffer",ja:"損なわれる"}],
    grammar:[{point:"I'm writing to ask …",ja:"用件を切り出すメールの定型。"},{point:"make sure (that) …",ja:"『確実に〜する』。"}]
  },
  r_meeting: {
    ja:"本日の会議で3点合意しました。第一に、来月ベータ版を公開します。第二に、マーケティングが短いデモ動画を用意します。第三に、本公開の前に2週間でフィードバックを確認します。",
    vocab:[{en:"agree on",ja:"〜で合意する"},{en:"launch",ja:"公開する"},{en:"demo video",ja:"デモ動画"},{en:"full release",ja:"本公開"}],
    grammar:[{point:"First/Second/Third",ja:"列挙の談話標識で論点を整理。"},{point:"未来の will",ja:"we'll launch … で決定事項を表す。"}]
  },
  r_welcome: {
    ja:"ようこそ！お迎えできて大変嬉しいです。アカウントは有効になり、いつでもログインできます。ご質問があれば、サポートチームが24時間体制でお手伝いします。",
    vocab:[{en:"welcome aboard",ja:"ようこそ（仲間入り）"},{en:"thrilled",ja:"とても嬉しい"},{en:"active",ja:"有効な"},{en:"around the clock",ja:"24時間体制で"}],
    grammar:[{point:"be thrilled to have …",ja:"to不定詞で喜びの理由を示す。"},{point:"命令文 + anytime",ja:"log in anytime で気軽な促し。"}]
  }
});

/* 増量：リーディング教材 第4弾（6倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_proposal2", title:"改善提案", level:"B2",
    text:"I'd like to suggest a small change to our review process. " +
         "Right now, feedback often arrives too late to act on. " +
         "If we review drafts midway instead of only at the end, we can catch issues early and save rework." },
  { id:"r_status", title:"週次ステータス", level:"B1",
    text:"This week went smoothly. We completed the first module and started testing. " +
         "There were no major blockers. Next week, we'll focus on the second module " +
         "and aim to finish initial testing by Friday." },
  { id:"r_handover", title:"引き継ぎメモ", level:"B2",
    text:"As I'll be away next week, here's a quick handover. " +
         "The main task is to follow up with the vendor about delivery. " +
         "All the relevant files are in the shared folder, and Sam can help if anything urgent comes up." },
  { id:"r_invite", title:"イベント案内", level:"B1",
    text:"We're hosting a small workshop next Thursday at 2 PM. " +
         "It's open to anyone interested in learning the basics of data analysis. " +
         "No prior experience is needed, so feel free to join and bring a colleague." },
  { id:"r_reminder", title:"リマインドメール", level:"B1",
    text:"Just a friendly reminder that the survey closes this Friday. " +
         "It only takes about five minutes, and your feedback really helps us improve. " +
         "If you've already responded, thank you so much." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_proposal2: {
    ja:"レビュー手順に小さな変更を提案したいです。今はフィードバックが遅すぎて対応できないことが多いです。最後だけでなく途中でも草案をレビューすれば、早く問題に気づき、やり直しを減らせます。",
    vocab:[{en:"suggest a change",ja:"変更を提案する"},{en:"act on",ja:"〜に基づいて行動する"},{en:"midway",ja:"途中で"},{en:"rework",ja:"やり直し"}],
    grammar:[{point:"仮定の if + 現在形",ja:"If we review …, we can catch … で実現可能な条件。"},{point:"instead of -ing",ja:"動名詞で『〜する代わりに』。"}]
  },
  r_status: {
    ja:"今週は順調でした。最初のモジュールを完了しテストを開始しました。大きな障害はありませんでした。来週は第二モジュールに集中し、金曜までに初期テストを終える予定です。",
    vocab:[{en:"go smoothly",ja:"順調に進む"},{en:"blocker",ja:"障害"},{en:"focus on",ja:"集中する"},{en:"aim to",ja:"〜を目指す"}],
    grammar:[{point:"過去形の報告",ja:"completed / started で完了した作業を述べる。"},{point:"未来の will",ja:"we'll focus … で予定を示す。"}]
  },
  r_handover: {
    ja:"来週不在のため、簡単に引き継ぎます。主な仕事は納品について業者に確認することです。関連ファイルは共有フォルダにあり、急ぎの件はサムが手伝えます。",
    vocab:[{en:"be away",ja:"不在である"},{en:"handover",ja:"引き継ぎ"},{en:"follow up with",ja:"〜に確認する"},{en:"come up",ja:"発生する"}],
    grammar:[{point:"As + 理由",ja:"As I'll be away … で『〜なので』。"},{point:"if anything urgent comes up",ja:"条件節で『急ぎの件があれば』。"}]
  },
  r_invite: {
    ja:"来週木曜午後2時に小さなワークショップを開きます。データ分析の基礎を学びたい方ならどなたでも参加できます。経験は不要なので、気軽に同僚を連れて参加してください。",
    vocab:[{en:"host",ja:"主催する"},{en:"open to",ja:"〜に開かれている"},{en:"prior experience",ja:"事前の経験"},{en:"feel free to",ja:"気軽に〜する"}],
    grammar:[{point:"現在進行形の予定",ja:"We're hosting … で確定した予定。"},{point:"命令文 feel free to",ja:"気軽な促し。"}]
  },
  r_reminder: {
    ja:"アンケートが今週金曜に締め切られることを念のためお知らせします。5分ほどで終わり、皆さんの意見が改善に大変役立ちます。すでに回答済みの方はありがとうございます。",
    vocab:[{en:"friendly reminder",ja:"念のためのお知らせ"},{en:"survey",ja:"アンケート"},{en:"respond",ja:"回答する"},{en:"improve",ja:"改善する"}],
    grammar:[{point:"that節",ja:"reminder that … で『〜という知らせ』。"},{point:"現在完了 If you've already responded",ja:"すでに回答済みを現在完了で。"}]
  }
});

/* 増量：リーディング教材 第5弾（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_followup", title:"商談後のフォロー", level:"B2",
    text:"It was great speaking with you yesterday. As promised, I've attached the detailed proposal. " +
         "I've highlighted the points we discussed, especially the timeline and pricing. " +
         "Please take your time, and let me know if any questions come up." },
  { id:"r_offer", title:"内定通知", level:"B2",
    text:"We're delighted to offer you the position of Marketing Lead. " +
         "Your experience and energy stood out throughout the process. " +
         "Please review the attached details, and feel free to reach out with any questions before deciding." },
  { id:"r_complaint", title:"クレーム対応", level:"B2",
    text:"I'm sorry to hear about your experience, and I completely understand your frustration. " +
         "We're looking into what went wrong and will make it right. " +
         "In the meantime, I've issued a full refund to your account." },
  { id:"r_summary", title:"プロジェクト総括", level:"C1",
    text:"Looking back, the project succeeded largely because we kept the scope tight. " +
         "When new ideas surfaced, we logged them for later instead of expanding mid-stream. " +
         "That discipline let us ship on time without burning out the team." },
  { id:"r_advice", title:"アドバイス", level:"B1",
    text:"If I could give one piece of advice, it would be to start small. " +
         "Trying to do everything at once usually leads to burnout. " +
         "Pick one habit, stick with it, and build from there." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_followup: {
    ja:"昨日はお話しできて良かったです。お約束通り、詳細な提案書を添付しました。話し合った点、特にスケジュールと価格を強調しています。どうぞごゆっくり、ご質問があればお知らせください。",
    vocab:[{en:"as promised",ja:"約束通り"},{en:"highlight",ja:"強調する"},{en:"timeline",ja:"スケジュール"},{en:"come up",ja:"生じる"}],
    grammar:[{point:"現在完了 I've attached",ja:"添付済みを現在完了で。"},{point:"if any questions come up",ja:"条件節で『質問があれば』。"}]
  },
  r_offer: {
    ja:"マーケティングリードの職をご提示できることを大変嬉しく思います。あなたの経験と活力は選考を通じて際立っていました。添付の詳細をご確認いただき、決定前にご質問があれば気軽にご連絡ください。",
    vocab:[{en:"be delighted to",ja:"〜できて嬉しい"},{en:"stand out",ja:"際立つ"},{en:"reach out",ja:"連絡する"},{en:"before deciding",ja:"決める前に"}],
    grammar:[{point:"be delighted to offer",ja:"to不定詞で喜びの内容を示す。"},{point:"before -ing",ja:"動名詞で『〜する前に』。"}]
  },
  r_complaint: {
    ja:"あなたのご経験を伺い申し訳なく、ご不満は完全に理解しています。何が問題だったか調査し、必ず正します。その間、口座へ全額返金を処理しました。",
    vocab:[{en:"frustration",ja:"不満"},{en:"look into",ja:"調査する"},{en:"make it right",ja:"正す"},{en:"issue a refund",ja:"返金する"}],
    grammar:[{point:"I'm sorry to hear …",ja:"共感を示す定型。"},{point:"in the meantime",ja:"談話標識で『その間』。"}]
  },
  r_summary: {
    ja:"振り返ると、このプロジェクトが成功したのは主に範囲を絞り続けたからです。新しい案が出ても、途中で広げず後回しに記録しました。その規律のおかげで、チームを疲弊させず期限内に出せました。",
    vocab:[{en:"looking back",ja:"振り返ると"},{en:"keep the scope tight",ja:"範囲を絞る"},{en:"surface",ja:"現れる"},{en:"burn out",ja:"疲弊させる"}],
    grammar:[{point:"分詞 Looking back",ja:"分詞構文で『振り返ると』。"},{point:"instead of -ing",ja:"動名詞で『〜する代わりに』。"}]
  },
  r_advice: {
    ja:"一つだけ助言できるなら、小さく始めることです。一度に全部やろうとすると、たいてい燃え尽きます。一つの習慣を選び、続け、そこから積み上げましょう。",
    vocab:[{en:"a piece of advice",ja:"一つの助言"},{en:"start small",ja:"小さく始める"},{en:"burnout",ja:"燃え尽き"},{en:"stick with",ja:"続ける"}],
    grammar:[{point:"仮定法 If I could …, it would be …",ja:"控えめな助言を仮定法で。"},{point:"動名詞主語 Trying …",ja:"動名詞句が主語。"}]
  }
});

/* 増量：リーディング教材 第6弾（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_onboard", title:"オンボーディング案内", level:"B1",
    text:"Welcome to the team! For your first week, focus on getting set up and meeting people. " +
         "There's no pressure to deliver yet. Your buddy will walk you through our tools, " +
         "and feel free to ask questions—no question is too small." },
  { id:"r_pitch", title:"短いピッチ", level:"B2",
    text:"Most small shops struggle to manage online orders. Our tool brings every order " +
         "into one simple dashboard, so owners spend less time switching apps. " +
         "Early users have cut their admin time roughly in half." },
  { id:"r_review", title:"フィードバックの返信", level:"B2",
    text:"Thanks for the honest feedback on the draft. You're right that the intro drags, " +
         "so I'll tighten it and lead with the key point. " +
         "I'll keep the examples you liked and send a revised version by Friday." },
  { id:"r_escalation", title:"問題のエスカレーション", level:"C1",
    text:"I want to flag a risk before it grows. The vendor has missed two checkpoints, " +
         "and at this pace we won't hit the launch date. " +
         "I'd suggest we either add resources or move the date—waiting will only narrow our options." },
  { id:"r_recap", title:"会議後のまとめ", level:"B2",
    text:"Quick recap of today's call. We agreed to ship the beta on the 15th, " +
         "Maria will own marketing, and we'll meet again next Tuesday to review progress. " +
         "Let me know if I missed anything." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_onboard: {
    ja:"チームへようこそ！最初の週は、環境を整えることと人と会うことに集中してください。まだ成果を出す必要はありません。バディがツールを案内します。どんな小さなことでも気軽に質問してください。",
    vocab:[{en:"get set up",ja:"環境を整える"},{en:"no pressure",ja:"プレッシャーはない"},{en:"buddy",ja:"相棒・指導役"},{en:"walk through",ja:"案内する"}],
    grammar:[{point:"命令文 focus on -ing",ja:"動名詞で『〜に集中する』。"},{point:"too … to の変形",ja:"no question is too small で『どんな質問も小さすぎない』。"}]
  },
  r_pitch: {
    ja:"多くの小店はオンライン注文の管理に苦労しています。当社のツールは全注文を一つのシンプルな画面にまとめ、店主がアプリ切り替えに使う時間を減らします。初期ユーザーは事務時間をおよそ半分に削減しました。",
    vocab:[{en:"struggle to",ja:"〜に苦労する"},{en:"dashboard",ja:"管理画面"},{en:"switch apps",ja:"アプリを切り替える"},{en:"cut in half",ja:"半分にする"}],
    grammar:[{point:"so that の省略",ja:"so owners spend less time … で結果を示す。"},{point:"現在完了 have cut",ja:"成果を現在完了で示す。"}]
  },
  r_review: {
    ja:"草案への率直なご意見ありがとうございます。導入が冗長というのはその通りなので、引き締めて要点から始めます。気に入っていただいた例は残し、金曜までに改訂版をお送りします。",
    vocab:[{en:"honest feedback",ja:"率直な意見"},{en:"drag",ja:"冗長になる"},{en:"tighten",ja:"引き締める"},{en:"revised version",ja:"改訂版"}],
    grammar:[{point:"You're right that …",ja:"相手の指摘を認める定型。"},{point:"未来の will",ja:"I'll tighten … で対応を示す。"}]
  },
  r_escalation: {
    ja:"大きくなる前にリスクを指摘したいです。業者は2回チェックポイントを逃しており、このペースではローンチ日に間に合いません。人員を増やすか日程を動かすかを提案します。待つほど選択肢は狭まります。",
    vocab:[{en:"flag a risk",ja:"リスクを指摘する"},{en:"miss a checkpoint",ja:"節目を逃す"},{en:"at this pace",ja:"このペースでは"},{en:"narrow options",ja:"選択肢を狭める"}],
    grammar:[{point:"either … or …",ja:"二択を示す相関接続詞。"},{point:"動名詞主語 waiting",ja:"Waiting will … で動名詞が主語。"}]
  },
  r_recap: {
    ja:"本日の通話の簡単なまとめです。15日にベータを公開すること、マリアがマーケティングを担当すること、来週火曜に再度集まり進捗を確認することで合意しました。漏れがあれば教えてください。",
    vocab:[{en:"recap",ja:"要約"},{en:"ship",ja:"公開する"},{en:"own",ja:"担当する"},{en:"miss",ja:"見落とす"}],
    grammar:[{point:"agree to do",ja:"agreed to ship … で『〜することで合意』。"},{point:"if I missed anything",ja:"条件節で『漏れがあれば』。"}]
  }
});

/* 増量：リーディング教材 第7弾（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_intro2", title:"製品紹介", level:"B1",
    text:"Our new app helps you track daily habits in seconds. " +
         "Just tap once when you finish a task, and watch your streak grow. " +
         "It's simple, free, and works offline, so you can use it anywhere." },
  { id:"r_followup2", title:"面接後のお礼", level:"B2",
    text:"Thank you for taking the time to meet with me today. " +
         "I enjoyed learning about the team and the challenges ahead. " +
         "Our conversation only strengthened my interest, and I'd be glad to provide anything else you need." },
  { id:"r_policy", title:"在宅勤務方針", level:"B2",
    text:"Starting next month, the team can work remotely up to three days a week. " +
         "Core hours remain ten to four so we can collaborate easily. " +
         "Please update your calendar so others know when you're available." },
  { id:"r_feedback2", title:"建設的フィードバック", level:"C1",
    text:"Your presentation was clear and well-paced. " +
         "One area to strengthen is the opening—leading with the key result would grab attention faster. " +
         "Overall, though, the structure was solid and easy to follow." },
  { id:"r_thankyou2", title:"支援への感謝", level:"B1",
    text:"I really appreciate everyone who pitched in during the busy week. " +
         "Thanks to your effort, we met the deadline without cutting corners. " +
         "Let's celebrate properly once things calm down." },
  { id:"r_decline2", title:"丁重な辞退", level:"B2",
    text:"Thank you for considering me for the role. " +
         "After much thought, I've decided to stay in my current position for now. " +
         "I hope we can keep in touch, as I have great respect for your team." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_intro2: {
    ja:"当社の新しいアプリは、日々の習慣を数秒で記録できます。タスクを終えたら一度タップするだけで、連続記録が伸びます。シンプルで無料、オフラインでも動くのでどこでも使えます。",
    vocab:[{en:"track habits",ja:"習慣を記録する"},{en:"streak",ja:"連続記録"},{en:"offline",ja:"オフライン"},{en:"anywhere",ja:"どこでも"}],
    grammar:[{point:"命令文 Just tap …",ja:"使い方を命令文で簡潔に。"},{point:"so + 結果",ja:"so you can use it anywhere で結果を示す。"}]
  },
  r_followup2: {
    ja:"本日はお時間をいただきありがとうございました。チームや今後の課題について知れて楽しかったです。お話しして関心がさらに高まりました。必要なものがあれば何でもお出しします。",
    vocab:[{en:"take the time to",ja:"わざわざ時間を取る"},{en:"challenges ahead",ja:"今後の課題"},{en:"strengthen interest",ja:"関心を高める"},{en:"provide",ja:"提供する"}],
    grammar:[{point:"動名詞 learning about",ja:"enjoyed の後は動名詞。"},{point:"would be glad to",ja:"丁寧な申し出。"}]
  },
  r_policy: {
    ja:"来月から、チームは週3日まで在宅勤務ができます。協力しやすいよう、コアタイムは10時〜16時のままです。在席時間が他の人に分かるよう、カレンダーを更新してください。",
    vocab:[{en:"work remotely",ja:"在宅勤務する"},{en:"core hours",ja:"コアタイム"},{en:"collaborate",ja:"協力する"},{en:"available",ja:"対応可能な"}],
    grammar:[{point:"Starting next month",ja:"分詞で時点を示す。"},{point:"so + 主語 + can",ja:"目的を示す。"}]
  },
  r_feedback2: {
    ja:"プレゼンは明快でテンポも良かったです。強化点は冒頭で、要点となる結果から始めるとより早く注意を引けます。ただ全体として構成は堅実で分かりやすかったです。",
    vocab:[{en:"well-paced",ja:"テンポが良い"},{en:"lead with",ja:"〜から始める"},{en:"grab attention",ja:"注意を引く"},{en:"structure",ja:"構成"}],
    grammar:[{point:"動名詞主語 leading with …",ja:"動名詞句が主語。"},{point:"though の譲歩",ja:"Overall, though, … で『ただ全体としては』。"}]
  },
  r_thankyou2: {
    ja:"忙しい一週間に手を貸してくれた皆に本当に感謝します。皆の頑張りのおかげで、手を抜かずに締切に間に合いました。落ち着いたらきちんとお祝いしましょう。",
    vocab:[{en:"pitch in",ja:"手を貸す"},{en:"cut corners",ja:"手を抜く"},{en:"calm down",ja:"落ち着く"},{en:"celebrate",ja:"祝う"}],
    grammar:[{point:"Thanks to + 名詞",ja:"『〜のおかげで』。"},{point:"without -ing",ja:"動名詞で『〜せずに』。"}]
  },
  r_decline2: {
    ja:"この職に私を検討してくださりありがとうございます。よく考えた結果、今は現職にとどまることにしました。あなたのチームを深く尊敬しているので、今後も連絡を取り合えれば幸いです。",
    vocab:[{en:"consider me for",ja:"〜に私を検討する"},{en:"current position",ja:"現職"},{en:"keep in touch",ja:"連絡を取り合う"},{en:"respect",ja:"尊敬"}],
    grammar:[{point:"現在完了 I've decided",ja:"熟考の結果いま決めた、を現在完了で。"},{point:"as + 理由",ja:"as I have great respect … で理由。"}]
  }
});

/* 増量：リーディング教材 第8弾（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  { id:"r_kickoff", title:"プロジェクト開始連絡", level:"B2",
    text:"I'm excited to kick off this project with all of you. " +
         "Our goal is clear, but the path will need adjusting as we learn. " +
         "Let's start small, share progress often, and raise blockers early so nothing festers." },
  { id:"r_nudge", title:"やんわりした催促", level:"B1",
    text:"Just a gentle nudge on the report due tomorrow. " +
         "No rush if you're on track—I only want to make sure nothing slipped through. " +
         "Let me know if you need anything from my side." },
  { id:"r_retro", title:"振り返りメモ", level:"B2",
    text:"What went well: we shipped on time and communication was clear. " +
         "What to improve: estimates were too optimistic, and testing started late. " +
         "Next time, let's pad the schedule and test in parallel from the start." },
  { id:"r_boundary", title:"境界線を引く", level:"B2",
    text:"I'm happy to help with this, but my plate is full until Thursday. " +
         "If it's urgent, I can suggest someone who's free sooner. " +
         "Otherwise, I'll give it proper attention once my current task wraps up." },
  { id:"r_gratitude2", title:"チームへの感謝", level:"B1",
    text:"I want to take a moment to thank everyone for a great quarter. " +
         "We hit our targets without burning out, and that balance matters. " +
         "Take some time to recharge—you've earned it." },
  { id:"r_clarify", title:"認識のすり合わせ", level:"C1",
    text:"Before we go further, let's make sure we mean the same thing by 'done.' " +
         "To me, it includes testing and documentation, not just working code. " +
         "If our definitions differ, now is the moment to align, not after we ship." }
]);
Object.assign(window.EigoData.readingNotes, {
  r_kickoff: {
    ja:"皆さんとこのプロジェクトを始められて嬉しいです。目標は明確ですが、学びながら道筋は調整が必要です。小さく始め、進捗をこまめに共有し、障害は早めに挙げて問題が長引かないようにしましょう。",
    vocab:[{en:"kick off",ja:"開始する"},{en:"adjust",ja:"調整する"},{en:"raise blockers",ja:"障害を挙げる"},{en:"fester",ja:"こじれる"}],
    grammar:[{point:"be excited to do",ja:"to不定詞で喜びの内容。"},{point:"so + 主語 + 否定",ja:"so nothing festers で目的。"}]
  },
  r_nudge: {
    ja:"明日締切の報告書について、軽くお知らせです。順調なら急ぎませんが、抜けがないか確認したいだけです。こちらで必要なことがあれば教えてください。",
    vocab:[{en:"gentle nudge",ja:"やんわりした催促"},{en:"on track",ja:"順調で"},{en:"slip through",ja:"抜け落ちる"},{en:"from my side",ja:"こちら側で"}],
    grammar:[{point:"No rush if …",ja:"条件節で『順調なら急がない』。"},{point:"make sure (that)",ja:"『確実に〜』。"}]
  },
  r_retro: {
    ja:"良かった点：期限通りに出せ、連絡も明確だった。改善点：見積もりが楽観的すぎ、テスト開始が遅れた。次回はスケジュールに余裕を持たせ、最初から並行してテストしよう。",
    vocab:[{en:"ship on time",ja:"期限通りに出す"},{en:"optimistic",ja:"楽観的な"},{en:"pad the schedule",ja:"日程に余裕を持たせる"},{en:"in parallel",ja:"並行して"}],
    grammar:[{point:"What went well / to improve",ja:"名詞節で論点を整理。"},{point:"let's + 原形",ja:"次回の提案。"}]
  },
  r_boundary: {
    ja:"喜んでお手伝いしたいのですが、木曜まで手一杯です。急ぎなら、もっと早く空いている人を紹介できます。そうでなければ、今の作業が片付き次第きちんと取り組みます。",
    vocab:[{en:"my plate is full",ja:"手一杯だ"},{en:"urgent",ja:"急ぎの"},{en:"free",ja:"空いている"},{en:"wrap up",ja:"片付ける"}],
    grammar:[{point:"happy to help, but …",ja:"快諾しつつ制約を示す。"},{point:"once + 節",ja:"『〜したら』。"}]
  },
  r_gratitude2: {
    ja:"少し時間を取って、素晴らしい四半期だった皆に感謝したいです。燃え尽きずに目標を達成できた、そのバランスが大切です。少し休んで充電してください。十分その資格があります。",
    vocab:[{en:"take a moment",ja:"少し時間を取る"},{en:"burn out",ja:"燃え尽きる"},{en:"recharge",ja:"充電する"},{en:"earn",ja:"値する"}],
    grammar:[{point:"without -ing",ja:"動名詞で『〜せずに』。"},{point:"現在完了 you've earned it",ja:"努力の結果を現在完了で。"}]
  },
  r_clarify: {
    ja:"先に進む前に、『完了』の意味を合わせましょう。私にとっては、動くコードだけでなくテストと文書化を含みます。定義が違うなら、リリース後ではなく今こそ合わせる時です。",
    vocab:[{en:"mean the same thing",ja:"同じ意味を指す"},{en:"documentation",ja:"文書化"},{en:"differ",ja:"異なる"},{en:"align",ja:"認識を合わせる"}],
    grammar:[{point:"make sure we mean …",ja:"認識合わせの定型。"},{point:"now is the moment to do",ja:"『今こそ〜する時』。"}]
  }
});


/* 増量：リーディング教材 第9弾 大量（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"r_remind","title":"支払いリマインド","level":"B1","text":"This is a friendly reminder that invoice 204 is due this Friday. If you've already sent payment, please disregard this note. Otherwise, let me know if you need anything to process it."},
  {"id":"r_product","title":"製品案内","level":"B2","text":"I'm reaching out to introduce our latest update, which cuts setup time in half. Existing customers get it free, and onboarding takes under five minutes. I'd be glad to walk your team through it."},
  {"id":"r_interview","title":"面接日程の調整","level":"B2","text":"Thank you for your interest in the role. We'd like to invite you to a first interview next week. Could you share a few time slots that work for you? The conversation should take about forty-five minutes."},
  {"id":"r_decline_vendor","title":"見積もりのお断り","level":"B2","text":"Thank you for the detailed proposal. After careful review, we've decided to go in a different direction for now. We were impressed by your work and hope to keep the door open for future projects."},
  {"id":"r_extension","title":"締切延長の依頼","level":"B1","text":"I'm writing to ask for a short extension on the report. A few data sources came in late, and I want to make sure the analysis is solid. Would Wednesday instead of Monday work for you?"},
  {"id":"r_event","title":"イベント招待","level":"B1","text":"You're invited to our annual customer meetup on the 20th. We'll share product updates, swap ideas, and enjoy some good food. Spaces are limited, so please RSVP by the 15th if you'd like to join."},
  {"id":"r_weekly","title":"週次報告","level":"B2","text":"Quick update for the week. We shipped the login fix, started the search feature, and closed five support tickets. Next week we'll focus on testing and aim to demo search by Friday. No major blockers right now."},
  {"id":"r_thankclient","title":"顧客への感謝","level":"B1","text":"Thank you for trusting us with your project this year. Your feedback shaped many of our improvements, and we're grateful for the partnership. We look forward to building on this in the year ahead."},
  {"id":"r_apology_biz","title":"遅延のお詫び","level":"B2","text":"I sincerely apologize for the delay in delivery. A supplier issue held us up, but your order shipped this morning and should arrive by Thursday. As a gesture of goodwill, we've added a small discount to your next purchase."},
  {"id":"r_feedback_req","title":"意見の依頼","level":"B1","text":"We'd love your thoughts on our new layout. It only takes two minutes, and your input directly shapes what we build next. There are no wrong answers—we just want to hear how it feels to use."},
  {"id":"r_intro_email","title":"紹介の取り次ぎ","level":"B2","text":"I'd like to introduce you two, as I think you'll have a lot to discuss. Sara leads design at her company, and you're both exploring similar ideas. I'll step back and let you take it from here."},
  {"id":"r_checkin","title":"近況確認","level":"B1","text":"Just checking in to see how things are going on your end. No pressure to reply quickly—I know you're busy. Whenever you have a moment, I'd love a quick update on the project."},
  {"id":"r_followup_meeting","title":"会議のフォロー","level":"B1","text":"Great talking today. To recap, you'll send the budget figures, and I'll draft the timeline. Let's reconnect on Thursday to finalize. Thanks again for making time on short notice."},
  {"id":"r_escalate2","title":"上司への上申","level":"C1","text":"I want to raise a concern before it grows. The current timeline assumes no further delays, which now seems unlikely. I'd recommend we either add a developer or move the date. Waiting will only narrow our choices."},
  {"id":"r_reschedule","title":"予定変更の連絡","level":"B1","text":"Apologies, but I need to move our call. Something urgent came up on my side. Could we shift to the same time tomorrow? If that doesn't work, send me a couple of options and I'll make it fit."},
  {"id":"r_recommendation","title":"推薦文","level":"C1","text":"I recommend Kenji without reservation. Over two years, he consistently turned vague problems into clear plans and delivered on every commitment. Any team would be fortunate to have someone so reliable and thoughtful."},
  {"id":"r_survey","title":"アンケート依頼","level":"B1","text":"We're running a short survey to improve our service. It has just five questions and takes about three minutes. Your honest answers help us focus on what matters most to you. Thank you in advance for your time."},
  {"id":"r_outage","title":"障害のお知らせ","level":"B2","text":"We experienced a brief service outage this morning and have now fully restored access. The cause was a configuration error, which we've corrected and added safeguards against. We apologize for any disruption this caused."},
  {"id":"r_quote","title":"見積もりの提示","level":"B2","text":"Thanks for your inquiry. Based on your requirements, the estimated cost is outlined in the attached quote. It includes setup, training, and three months of support. The quote is valid for thirty days—happy to adjust the scope if needed."},
  {"id":"r_congrats_team","title":"チームへの祝辞","level":"B1","text":"Huge congratulations to the whole team on launching on time. It took long hours and real teamwork, and it shows in the result. Take a well-earned break this weekend—you've all earned it."},
  {"id":"r_clarify_scope","title":"範囲のすり合わせ","level":"C1","text":"Before we commit, let's align on scope. I'm reading this as the front end only, with the API handled by another team. If that's wrong, now is the time to correct it—surprises after sign-off are far costlier."},
  {"id":"r_referral","title":"紹介のお願い","level":"B1","text":"If you've enjoyed working with us, we'd be grateful for a referral. A quick introduction to anyone who might benefit means a lot to a small team like ours. No pressure at all—only if it feels right."},
  {"id":"r_renewal","title":"契約更新の案内","level":"B2","text":"Your subscription renews next month. Nothing is needed on your part—it will continue automatically at the current rate. If you'd like to change your plan or have questions, just reach out and we'll sort it out."},
  {"id":"r_onboarding2","title":"新人初日の案内","level":"B1","text":"Welcome to your first day! This morning, you'll meet the team and set up your accounts. There's no pressure to be productive yet—just focus on settling in. Your buddy, Tom, will guide you through everything."},
  {"id":"r_boundary2","title":"負荷の調整","level":"B2","text":"I want to be upfront: my plate is full through next week. I can take this on after that, or if it's urgent, I can help you find someone sooner. I'd rather set a realistic expectation than overpromise."}
]);
Object.assign(window.EigoData.readingNotes, {
  "r_remind": {"ja":"請求書204の支払いが今週金曜締めであることをお知らせします。すでにお支払い済みなら本通知は無視してください。そうでなければ、処理に必要なものがあればお知らせください。","vocab":[{"en":"friendly reminder","ja":"やんわりした催促"},{"en":"invoice","ja":"請求書"},{"en":"due","ja":"期限の"},{"en":"disregard","ja":"無視する"}],"grammar":[{"point":"This is a reminder that …","ja":"『〜をお知らせします』の定型。"},{"point":"if you've already …","ja":"現在完了で『すでに〜なら』。"}]},
  "r_product": {"ja":"設定時間を半分に短縮する最新アップデートをご紹介したくご連絡しました。既存のお客様は無料で、導入は5分以内です。御社チームへのご案内も喜んで行います。","vocab":[{"en":"reach out","ja":"連絡する"},{"en":"cut in half","ja":"半分にする"},{"en":"onboarding","ja":"導入"},{"en":"walk through","ja":"案内する"}],"grammar":[{"point":"which cuts …","ja":"関係代名詞 which で補足説明。"},{"point":"I'd be glad to …","ja":"丁寧な申し出。"}]},
  "r_interview": {"ja":"この職へのご関心ありがとうございます。来週、一次面接にお招きしたいです。ご都合のよい時間帯をいくつか教えていただけますか。所要時間は45分ほどの見込みです。","vocab":[{"en":"interest in","ja":"〜への関心"},{"en":"invite","ja":"招く"},{"en":"time slots","ja":"時間帯"},{"en":"take about","ja":"約〜かかる"}],"grammar":[{"point":"We'd like to invite you …","ja":"丁寧な招待。"},{"point":"Could you share …?","ja":"依頼の丁寧表現。"}]},
  "r_decline_vendor": {"ja":"詳細なご提案ありがとうございます。慎重に検討した結果、今回は別の方向で進めることにしました。御社のお仕事には感銘を受けており、今後の案件でご縁が続くことを願っています。","vocab":[{"en":"detailed proposal","ja":"詳細な提案"},{"en":"go in a different direction","ja":"別の方向に進む"},{"en":"impressed","ja":"感銘を受けた"},{"en":"keep the door open","ja":"可能性を残す"}],"grammar":[{"point":"After careful review,","ja":"『慎重な検討の結果』。"},{"point":"hope to keep …","ja":"to不定詞で希望の内容。"}]},
  "r_extension": {"ja":"報告書の締切を少し延ばしていただけないかご相談です。いくつかのデータが遅れて届き、分析をしっかり仕上げたいのです。月曜ではなく水曜でご都合いかがでしょうか。","vocab":[{"en":"extension","ja":"延長"},{"en":"data sources","ja":"データ源"},{"en":"solid","ja":"しっかりした"},{"en":"instead of","ja":"〜の代わりに"}],"grammar":[{"point":"I'm writing to ask …","ja":"用件を切り出す定型。"},{"point":"Would … work for you?","ja":"丁寧な提案。"}]},
  "r_event": {"ja":"20日の年次顧客交流会にご招待します。製品の最新情報を共有し、アイデアを交換し、おいしい食事も楽しみます。席に限りがあるため、ご参加希望なら15日までにご返答ください。","vocab":[{"en":"meetup","ja":"交流会"},{"en":"swap ideas","ja":"アイデアを交換する"},{"en":"spaces are limited","ja":"席に限りがある"},{"en":"RSVP","ja":"出欠を返答する"}],"grammar":[{"point":"You're invited to …","ja":"招待の定型。"},{"point":"so please RSVP …","ja":"結果・依頼を示す so。"}]},
  "r_weekly": {"ja":"今週の簡単な報告です。ログイン修正を出し、検索機能に着手し、サポート案件を5件解決しました。来週はテストに注力し、金曜までに検索のデモを目指します。今のところ大きな障害はありません。","vocab":[{"en":"ship","ja":"出す・公開する"},{"en":"close a ticket","ja":"案件を解決する"},{"en":"demo","ja":"実演する"},{"en":"blockers","ja":"障害"}],"grammar":[{"point":"Next week we'll focus on …","ja":"未来の予定。"},{"point":"aim to demo …","ja":"『〜を目指す』。"}]},
  "r_thankclient": {"ja":"今年は私たちにプロジェクトを任せていただきありがとうございました。皆様のご意見が多くの改善を形作り、この協力関係に感謝しています。来年もこれを土台に発展させていけることを楽しみにしています。","vocab":[{"en":"trust ... with","ja":"〜を任せる"},{"en":"shape","ja":"形作る"},{"en":"partnership","ja":"協力関係"},{"en":"build on","ja":"土台にする"}],"grammar":[{"point":"Thank you for trusting …","ja":"感謝の定型。"},{"point":"look forward to building","ja":"look forward to + 動名詞。"}]},
  "r_apology_biz": {"ja":"配送の遅れを心よりお詫びします。仕入先の問題で遅延しましたが、ご注文は今朝発送し、木曜までに届く見込みです。お詫びのしるしとして、次回購入時に少額の割引を追加しました。","vocab":[{"en":"sincerely apologize","ja":"心からお詫びする"},{"en":"held us up","ja":"遅らせた"},{"en":"gesture of goodwill","ja":"誠意の表れ"},{"en":"discount","ja":"割引"}],"grammar":[{"point":"I sincerely apologize for …","ja":"謝罪の定型。"},{"point":"As a gesture of goodwill,","ja":"『誠意として』。"}]},
  "r_feedback_req": {"ja":"新しいレイアウトについてぜひご意見を伺いたいです。2分しかかからず、皆様の声が次に作るものを直接形作ります。正解はありません。使ってみてどう感じるかを聞きたいだけです。","vocab":[{"en":"thoughts","ja":"意見"},{"en":"input","ja":"意見・入力"},{"en":"shape","ja":"形作る"},{"en":"no wrong answers","ja":"正解はない"}],"grammar":[{"point":"It only takes two minutes","ja":"所要時間の案内。"},{"point":"how it feels to use","ja":"間接疑問。"}]},
  "r_intro_email": {"ja":"お二人を紹介したいです。話が弾むと思います。サラは自社でデザインを率いており、お二人とも似たアイデアを探っています。私はここで引き、あとはお任せします。","vocab":[{"en":"introduce","ja":"紹介する"},{"en":"lead","ja":"率いる"},{"en":"explore","ja":"探る"},{"en":"take it from here","ja":"あとを引き継ぐ"}],"grammar":[{"point":"I'd like to introduce you two","ja":"紹介の取り次ぎ定型。"},{"point":"let you take it from here","ja":"使役 let + 原形。"}]},
  "r_checkin": {"ja":"そちらの様子はどうかなと思い、ちょっと確認です。すぐ返信しなくて大丈夫、お忙しいのは承知しています。お手すきの時に、プロジェクトの近況を少し教えてもらえると嬉しいです。","vocab":[{"en":"check in","ja":"近況を確認する"},{"en":"on your end","ja":"そちら側で"},{"en":"no pressure","ja":"急がなくていい"},{"en":"update","ja":"近況"}],"grammar":[{"point":"Just checking in to see …","ja":"軽い確認の定型。"},{"point":"Whenever you have a moment,","ja":"『お手すきの時に』。"}]},
  "r_followup_meeting": {"ja":"本日はお話しできてよかったです。整理すると、あなたが予算の数字を送り、私が日程案を作ります。木曜に再度集まって確定しましょう。急なお願いに時間を取っていただき重ねて感謝します。","vocab":[{"en":"recap","ja":"要約する"},{"en":"draft","ja":"下書きする"},{"en":"reconnect","ja":"再度連絡を取る"},{"en":"on short notice","ja":"急な知らせで"}],"grammar":[{"point":"To recap, …","ja":"要約の切り出し。"},{"point":"Thanks again for …","ja":"重ねての感謝。"}]},
  "r_escalate2": {"ja":"大きくなる前に懸念を上げておきたいです。今の日程はこれ以上の遅延がない前提ですが、それは今や考えにくいです。開発者を増やすか日程を動かすかを勧めます。待つほど選択肢は狭まります。","vocab":[{"en":"raise a concern","ja":"懸念を上げる"},{"en":"assume","ja":"前提とする"},{"en":"unlikely","ja":"ありそうにない"},{"en":"narrow","ja":"狭める"}],"grammar":[{"point":"which now seems unlikely","ja":"関係代名詞 which で補足。"},{"point":"either … or …","ja":"二択の相関接続詞。"}]},
  "r_reschedule": {"ja":"申し訳ありませんが、通話の予定を変更する必要があります。こちらで急ぎの用件が出てしまいました。明日の同じ時間にずらせますか。難しければ候補をいくつか送ってください、合わせます。","vocab":[{"en":"move","ja":"変更する"},{"en":"came up","ja":"持ち上がった"},{"en":"shift to","ja":"〜にずらす"},{"en":"make it fit","ja":"都合をつける"}],"grammar":[{"point":"Something urgent came up","ja":"『急用ができた』。"},{"point":"If that doesn't work,","ja":"条件節。"}]},
  "r_recommendation": {"ja":"ケンジを留保なく推薦します。2年間、彼は曖昧な問題を一貫して明確な計画に変え、すべての約束を果たしました。これほど信頼でき思慮深い人材を迎えられるチームは幸運でしょう。","vocab":[{"en":"without reservation","ja":"留保なく"},{"en":"consistently","ja":"一貫して"},{"en":"deliver on","ja":"果たす"},{"en":"fortunate","ja":"幸運な"}],"grammar":[{"point":"I recommend … without reservation","ja":"強い推薦の定型。"},{"point":"Any team would be fortunate to …","ja":"仮定的な称賛。"}]},
  "r_survey": {"ja":"サービス改善のため短いアンケートを実施しています。質問は5問だけで、約3分で終わります。率直なご回答が、最も大切なことに集中する助けになります。お時間に前もって感謝します。","vocab":[{"en":"run a survey","ja":"アンケートを実施する"},{"en":"honest answers","ja":"率直な回答"},{"en":"focus on","ja":"集中する"},{"en":"in advance","ja":"前もって"}],"grammar":[{"point":"It has just five questions","ja":"数量の案内。"},{"point":"what matters most","ja":"関係代名詞 what。"}]},
  "r_outage": {"ja":"本朝、短時間のサービス障害が発生しましたが、現在はアクセスを完全に復旧しました。原因は設定ミスで、修正のうえ再発防止策を追加しました。これによりご迷惑をおかけしたことをお詫びします。","vocab":[{"en":"outage","ja":"障害・停止"},{"en":"restore","ja":"復旧する"},{"en":"configuration error","ja":"設定ミス"},{"en":"safeguards","ja":"防止策"}],"grammar":[{"point":"have now fully restored","ja":"現在完了で復旧を示す。"},{"point":"which we've corrected","ja":"関係代名詞で補足。"}]},
  "r_quote": {"ja":"お問い合わせありがとうございます。ご要望に基づき、概算費用を添付の見積書にまとめました。設定、研修、3か月のサポートを含みます。見積もりは30日間有効です。必要なら範囲の調整も喜んで承ります。","vocab":[{"en":"inquiry","ja":"問い合わせ"},{"en":"estimated cost","ja":"概算費用"},{"en":"valid for","ja":"〜間有効"},{"en":"adjust the scope","ja":"範囲を調整する"}],"grammar":[{"point":"Based on your requirements,","ja":"『ご要望に基づき』。"},{"point":"happy to adjust …","ja":"申し出の省略形。"}]},
  "r_congrats_team": {"ja":"期限通りのローンチ、チーム全員に大きなおめでとうを。長時間の労力と本物のチームワークがかかり、それが結果に表れています。今週末はしっかり休んでください。皆その資格があります。","vocab":[{"en":"launch on time","ja":"期限通りに公開する"},{"en":"long hours","ja":"長時間"},{"en":"it shows","ja":"それが表れている"},{"en":"well-earned","ja":"当然得るべき"}],"grammar":[{"point":"It took … and …","ja":"『〜と〜がかかった』。"},{"point":"you've all earned it","ja":"現在完了で資格を示す。"}]},
  "r_clarify_scope": {"ja":"約束する前に範囲を合わせましょう。私はこれをフロントエンドのみで、APIは別チーム担当と理解しています。違っていれば今こそ正す時です。承認後の想定外ははるかに高くつきます。","vocab":[{"en":"commit","ja":"約束する"},{"en":"align on","ja":"〜で認識を合わせる"},{"en":"sign-off","ja":"承認"},{"en":"costly","ja":"高くつく"}],"grammar":[{"point":"I'm reading this as …","ja":"『〜と理解している』。"},{"point":"now is the time to …","ja":"『今こそ〜する時』。"}]},
  "r_referral": {"ja":"私たちとのお仕事を気に入っていただけたなら、ご紹介いただけると大変ありがたいです。役立ちそうな方への簡単なお取り次ぎが、私たちのような小さなチームには大きな意味を持ちます。決して無理にとは言いません。気が向いたときだけで結構です。","vocab":[{"en":"referral","ja":"紹介"},{"en":"introduction","ja":"取り次ぎ"},{"en":"benefit","ja":"恩恵を受ける"},{"en":"no pressure","ja":"無理にとは言わない"}],"grammar":[{"point":"we'd be grateful for …","ja":"丁寧な依頼。"},{"point":"only if it feels right","ja":"条件を和らげる表現。"}]},
  "r_renewal": {"ja":"ご契約は来月更新されます。お客様側で必要な手続きはありません。現在の料金で自動的に継続します。プラン変更のご希望やご質問があれば、ご連絡いただければ対応します。","vocab":[{"en":"subscription","ja":"契約・購読"},{"en":"renew","ja":"更新する"},{"en":"automatically","ja":"自動的に"},{"en":"sort out","ja":"対応する"}],"grammar":[{"point":"Nothing is needed on your part","ja":"『手続き不要』。"},{"point":"just reach out","ja":"気軽な案内。"}]},
  "r_onboarding2": {"ja":"初日へようこそ！午前中はチームと顔合わせをして、アカウントを設定します。まだ成果を出す必要はありません。慣れることに集中してください。バディのトムが全部案内します。","vocab":[{"en":"set up","ja":"設定する"},{"en":"productive","ja":"生産的な"},{"en":"settle in","ja":"慣れる"},{"en":"buddy","ja":"指導役"}],"grammar":[{"point":"There's no pressure to …","ja":"『〜する必要はない』。"},{"point":"guide you through","ja":"『順に案内する』。"}]},
  "r_boundary2": {"ja":"率直に申し上げます。来週いっぱいまで手一杯です。その後なら引き受けられますし、急ぎなら早く対応できる人を探すお手伝いもできます。安請け合いするより現実的な期待を設定したいのです。","vocab":[{"en":"upfront","ja":"率直に"},{"en":"my plate is full","ja":"手一杯だ"},{"en":"take on","ja":"引き受ける"},{"en":"overpromise","ja":"安請け合いする"}],"grammar":[{"point":"I want to be upfront","ja":"率直さを示す前置き。"},{"point":"I'd rather … than …","ja":"『〜より〜したい』。"}]}
});


/* 増量：リーディング教材 第9弾追補（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"r_thanks_help","title":"支援への礼","level":"B1","text":"Thank you for stepping in yesterday. You saved me a lot of stress, and the client never noticed a thing. I owe you one, so let me know how I can return the favor."},
  {"id":"r_decline_invite","title":"招待の辞退","level":"B1","text":"Thank you so much for the invitation. Sadly, I have a prior commitment that evening and won't be able to make it. I hope it goes wonderfully, and let's catch up soon afterward."},
  {"id":"r_intro_self","title":"自己紹介メール","level":"B2","text":"I'm writing to introduce myself as your new point of contact. I'll be handling your account going forward, and my goal is to make the transition seamless. Feel free to reach out anytime with questions."},
  {"id":"r_nudge2","title":"丁寧な再催促","level":"B1","text":"Following up on my last note in case it slipped through. No worries if you've been busy. Whenever you get a chance, I'd appreciate a quick reply so I can plan accordingly."},
  {"id":"r_scope_change","title":"仕様変更の連絡","level":"B2","text":"I want to flag a change in scope before we go further. The client added two features, which will push the deadline back by about a week. I'll send a revised plan today so we can re-align."}
]);
Object.assign(window.EigoData.readingNotes, {
  "r_thanks_help": {"ja":"昨日は助けに入ってくれてありがとう。おかげでずいぶん気が楽になり、顧客は何も気づきませんでした。借りができたので、どう恩返しできるか教えてください。","vocab":[{"en":"step in","ja":"助けに入る"},{"en":"save stress","ja":"気を楽にする"},{"en":"owe one","ja":"借りがある"},{"en":"return the favor","ja":"恩返しする"}],"grammar":[{"point":"You saved me …","ja":"『〜を救ってくれた』。"},{"point":"how I can return …","ja":"間接疑問。"}]},
  "r_decline_invite": {"ja":"お招きありがとうございます。残念ながらその晩は先約があり、伺えません。素晴らしい会になることを願っています。後日ぜひ近況を話しましょう。","vocab":[{"en":"invitation","ja":"招待"},{"en":"prior commitment","ja":"先約"},{"en":"make it","ja":"参加する"},{"en":"catch up","ja":"近況を話す"}],"grammar":[{"point":"won't be able to make it","ja":"『参加できない』。"},{"point":"let's catch up …","ja":"提案。"}]},
  "r_intro_self": {"ja":"新しい窓口として自己紹介のためご連絡しました。今後はあなたの担当を務め、引き継ぎを滑らかにすることを目指します。ご質問があればいつでもご連絡ください。","vocab":[{"en":"point of contact","ja":"窓口"},{"en":"handle","ja":"担当する"},{"en":"going forward","ja":"今後は"},{"en":"seamless","ja":"滑らかな"}],"grammar":[{"point":"I'm writing to introduce myself","ja":"自己紹介の定型。"},{"point":"Feel free to reach out","ja":"気軽な案内。"}]},
  "r_nudge2": {"ja":"前回の連絡が埋もれていたといけないのでフォローします。お忙しかったのなら気にしないでください。お手すきの際に短いお返事をいただけると、こちらで段取りを立てられて助かります。","vocab":[{"en":"follow up","ja":"フォローする"},{"en":"slip through","ja":"埋もれる"},{"en":"get a chance","ja":"機会がある"},{"en":"accordingly","ja":"それに応じて"}],"grammar":[{"point":"in case it slipped through","ja":"『埋もれた場合に備えて』。"},{"point":"so I can plan …","ja":"目的を示す。"}]},
  "r_scope_change": {"ja":"さらに進む前に仕様変更をお知らせします。顧客が機能を2つ追加し、締切が約1週間後ろにずれます。本日改訂版の計画を送りますので、再度すり合わせましょう。","vocab":[{"en":"flag","ja":"指摘する"},{"en":"scope","ja":"範囲"},{"en":"push back","ja":"後ろにずらす"},{"en":"re-align","ja":"再調整する"}],"grammar":[{"point":"which will push …","ja":"関係代名詞で結果を補足。"},{"point":"so we can re-align","ja":"目的を示す。"}]}
});


/* 増量：リーディング教材 第10弾 大量（5倍ペース完全維持） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"rb_proposal2","title":"業務提案","level":"C1","text":"I'd like to float an idea for streamlining our weekly reports. Currently, three people compile overlapping data, which wastes hours. If one shared dashboard pulled the numbers automatically, we'd cut prep time and reduce errors. I'm happy to build a prototype to test the concept."},
  {"id":"rb_decline2","title":"丁重なお断り","level":"B2","text":"Thank you for thinking of me for this project. After careful consideration, I have to decline, as my current workload wouldn't let me give it the attention it deserves. I'd hate to take it on and fall short. Please do keep me in mind for future opportunities."},
  {"id":"rb_feedback2","title":"建設的なフィードバック","level":"B2","text":"Your presentation was clear and well-structured. One area to strengthen is the opening—it took a while to reach the main point. Starting with your key finding would hook the audience right away. The data slides, by contrast, were excellent and easy to follow."},
  {"id":"rb_request2","title":"協力のお願い","level":"B1","text":"I'm reaching out because I could really use your expertise. We're stuck on a design decision, and your experience with similar projects would be invaluable. Could you spare thirty minutes this week to talk it through? I'd be very grateful."},
  {"id":"rb_update2","title":"進捗の共有","level":"B1","text":"Here's where things stand. We've finished the research phase and started drafting. The first section is nearly done, and I expect a full draft by next Friday. One small risk: the survey data is delayed, but it shouldn't affect the timeline much."},
  {"id":"rb_thanks2","title":"支援への感謝","level":"B1","text":"I just wanted to say a proper thank you. Your guidance last month made a real difference, and the project succeeded largely because of your input. I've learned a lot from working with you, and I hope we get to collaborate again soon."},
  {"id":"rb_apology2","title":"遅延のお詫び","level":"B2","text":"I owe you an apology for the late response. Things got hectic on my end, but that's no excuse for leaving you waiting. I've now reviewed your proposal in full, and my comments are below. Thank you for your patience, and I'll be quicker going forward."},
  {"id":"rb_intro2","title":"新任の挨拶","level":"B2","text":"Hello everyone, I'm excited to be joining the team as your new project lead. I've spent the past few years in similar roles and care deeply about clear communication and steady progress. Over the next week, I'd love to meet each of you and hear your perspective."},
  {"id":"rb_reminder2","title":"締切のリマインド","level":"B1","text":"Just a quick reminder that the budget figures are due this Thursday. If you're on track, no need to reply. If you're running into any snags, let me know early so we can sort them out together. Thanks for keeping this moving."},
  {"id":"rb_escalate3","title":"上司への相談","level":"C1","text":"I want to raise something before it becomes a bigger issue. Two key tasks now depend on a vendor who keeps missing deadlines. If this continues, our launch will slip. I see two paths: switch vendors now, or build in a buffer and accept the risk. I'd value your steer."},
  {"id":"rb_welcome2","title":"新規顧客歓迎","level":"B1","text":"Welcome aboard, and thank you for choosing us! Your account is all set up and ready to go. We've attached a short guide to help you get started in just a few minutes. If you ever get stuck, our support team is one quick message away."},
  {"id":"rb_meeting_fu2","title":"会議のフォロー","level":"B1","text":"Thanks for a productive meeting today. To recap: you'll draft the proposal, I'll gather the cost estimates, and we'll reconvene Thursday to finalize. Please flag any blockers before then. I appreciate everyone's focus and good ideas."},
  {"id":"rb_referral2","title":"紹介のお願い","level":"B1","text":"If you've found our service helpful, would you consider referring a friend or colleague? A short introduction means the world to a growing team like ours. There's absolutely no obligation—only if you feel it's a good fit for someone you know."},
  {"id":"rb_survey2","title":"アンケート依頼","level":"B1","text":"We're always trying to improve, and your opinion would help a lot. Our quick survey takes about three minutes and covers just a few topics. Every response is read carefully and shapes what we do next. Thank you for lending us your voice."},
  {"id":"rb_notice2","title":"障害のお知らせ","level":"B2","text":"We want to let you know about a brief service interruption earlier today. From roughly 9 to 9:30 a.m., some users couldn't log in. The issue has been fully resolved, and no data was affected. We've added safeguards to prevent a recurrence and apologize for the inconvenience."},
  {"id":"rb_quote2","title":"見積もりの提示","level":"B2","text":"Thank you for your interest. Based on the scope you described, our estimate is detailed in the attached quote. It covers design, development, and one month of post-launch support. The figure is valid for thirty days, and we're glad to adjust the scope if your needs change."},
  {"id":"rb_congrats2","title":"昇進の祝辞","level":"B1","text":"Congratulations on your well-deserved promotion! Your hard work and steady leadership have clearly paid off, and no one is surprised to see you rise. I'm genuinely happy for you and excited to see what you'll do in this new role."},
  {"id":"rb_clarify2","title":"認識のすり合わせ","level":"C1","text":"Before we move forward, I want to make sure we're aligned. My understanding is that we're delivering the design only, with development handled separately. If that differs from your expectation, let's clear it up now—mismatched assumptions are far more costly to fix later."},
  {"id":"rb_invite2","title":"イベント招待","level":"B1","text":"You're warmly invited to our team celebration next Friday evening. We'll share good food, look back on a great quarter, and unwind together. It would be lovely to see you there. Please let me know by Wednesday if you can make it."},
  {"id":"rb_handover2","title":"引き継ぎの連絡","level":"B2","text":"As I'll be out next week, I'm handing my open tasks to Kenji. He's fully briefed and has all the relevant files. For anything urgent, please reach him directly; for non-urgent items, they can wait until I'm back. Thanks for your understanding."},
  {"id":"rb_proposal3","title":"改善の提案","level":"C1","text":"I'd like to suggest a small experiment. Right now, decisions often stall because feedback comes too late. If we set a 24-hour response norm for reviews, momentum would build and fewer tasks would sit idle. Let's try it on one project and measure the difference."},
  {"id":"rb_thanks_team2","title":"チームへの感謝","level":"B1","text":"I just want to thank everyone for the effort this past month. It wasn't easy, but you pulled together and delivered something we can all be proud of. Take some time to recharge this weekend—you've more than earned it."},
  {"id":"rb_reschedule2","title":"予定変更の連絡","level":"B1","text":"I'm sorry for the short notice, but I need to move our Tuesday call. Something came up that I can't reschedule. Would Wednesday or Thursday afternoon work instead? If neither suits you, just send a few options and I'll fit around your schedule."},
  {"id":"rb_recommend2","title":"推薦文","level":"C1","text":"I recommend Aya wholeheartedly. In two years, she turned a struggling process into a model others now copy, all while mentoring junior staff with patience and grace. She combines sharp judgment with genuine warmth—a rare and valuable mix in any team."},
  {"id":"rb_renewal2","title":"契約更新の案内","level":"B2","text":"Your annual plan is set to renew next month. There's nothing you need to do—it continues automatically at your current rate. If you'd like to change tiers or have any questions, just reply here and we'll take care of it. Thank you for being with us."},
  {"id":"rb_onboard2","title":"新人初日の案内","level":"B1","text":"Welcome to your first day with us! This morning you'll get set up and meet the team; this afternoon is a gentle introduction to our tools. Don't worry about being productive yet—just focus on settling in. Mia will be your guide for anything you need."},
  {"id":"rb_boundary3","title":"負荷の調整","level":"B2","text":"I want to be honest about my capacity. My week is full, so taking this on now would mean rushing it or dropping something else. I can give it proper attention starting Monday, or help you find someone sooner if it's urgent. I'd rather set realistic expectations than overpromise."},
  {"id":"rb_status2","title":"近況の確認","level":"B1","text":"Just checking in to see how the report is coming along. No rush at all—I know you've had a lot on. If you're on track, a one-line reply is plenty. If anything's gotten in the way, let me know and we'll figure it out together."},
  {"id":"rb_offer2","title":"内定の通知","level":"B2","text":"We're thrilled to offer you the role. Your skills and energy stood out throughout the process, and we're confident you'll thrive on the team. The attached letter has all the details. Please take your time to review it, and reach out with any questions before you decide."}
]);
Object.assign(window.EigoData.readingNotes, {
  "rb_proposal2": {"ja":"週次報告を効率化する案を出してみたいです。現在は3人が重複データをまとめており、何時間も無駄にしています。共有ダッシュボードが自動で数字を集めれば、準備時間を削り誤りも減らせます。概念検証のため試作も喜んで作ります。","vocab":[{"en":"float an idea","ja":"案を出してみる"},{"en":"compile","ja":"まとめる"},{"en":"overlapping","ja":"重複した"},{"en":"prototype","ja":"試作"}],"grammar":[{"point":"If one shared dashboard …, we'd …","ja":"仮定法で効果を示す。"},{"point":"I'm happy to …","ja":"申し出の表現。"}]},
  "rb_decline2": {"ja":"このプロジェクトで私を考えてくださりありがとうございます。よく考えた結果、今の業務量ではふさわしい注力ができないため、お断りせざるを得ません。引き受けて期待に届かないのは避けたいのです。今後の機会にはぜひまた声をかけてください。","vocab":[{"en":"thinking of me","ja":"私を考えてくれる"},{"en":"decline","ja":"断る"},{"en":"workload","ja":"業務量"},{"en":"fall short","ja":"期待に届かない"}],"grammar":[{"point":"wouldn't let me give …","ja":"使役 let の否定。"},{"point":"I'd hate to …","ja":"『〜したくない』の婉曲表現。"}]},
  "rb_feedback2": {"ja":"あなたの発表は明確でよく構成されていました。強化すべき点は冒頭です。要点に達するまで時間がかかりました。重要な発見から始めれば、聴衆をすぐ引き込めます。一方、データのスライドは秀逸で分かりやすかったです。","vocab":[{"en":"well-structured","ja":"よく構成された"},{"en":"strengthen","ja":"強化する"},{"en":"hook","ja":"引き込む"},{"en":"by contrast","ja":"対照的に"}],"grammar":[{"point":"One area to strengthen is …","ja":"改善点の切り出し。"},{"point":"Starting with …, would …","ja":"動名詞主語で効果を示す。"}]},
  "rb_request2": {"ja":"あなたの専門知識をぜひお借りしたくご連絡しました。設計上の判断で行き詰まっており、類似案件でのご経験が非常に貴重です。今週30分ほど、話し合うお時間をいただけますか。とても助かります。","vocab":[{"en":"reach out","ja":"連絡する"},{"en":"expertise","ja":"専門知識"},{"en":"invaluable","ja":"非常に貴重な"},{"en":"spare","ja":"割く"}],"grammar":[{"point":"I could really use …","ja":"『〜がぜひ欲しい』。"},{"point":"Could you spare …?","ja":"丁寧な依頼。"}]},
  "rb_update2": {"ja":"現状をお伝えします。調査段階を終え、執筆に入りました。最初の節はほぼ完成し、来週金曜までに全体の草案ができる見込みです。小さな懸念として調査データが遅れていますが、日程に大きな影響はないはずです。","vocab":[{"en":"where things stand","ja":"現状"},{"en":"drafting","ja":"執筆"},{"en":"timeline","ja":"日程"},{"en":"delayed","ja":"遅れた"}],"grammar":[{"point":"Here's where things stand","ja":"現状報告の定型。"},{"point":"it shouldn't affect …","ja":"推量の should。"}]},
  "rb_thanks2": {"ja":"改めてきちんとお礼を言いたかったのです。先月のご指導は本当に大きな違いを生み、プロジェクトが成功したのはあなたの助言のおかげが大きいです。ご一緒して多くを学びました。近いうちにまた協働できることを願っています。","vocab":[{"en":"proper","ja":"きちんとした"},{"en":"guidance","ja":"指導"},{"en":"make a difference","ja":"違いを生む"},{"en":"collaborate","ja":"協働する"}],"grammar":[{"point":"made a real difference","ja":"『本当に効果があった』。"},{"point":"I hope we get to …","ja":"『〜できることを願う』。"}]},
  "rb_apology2": {"ja":"返信が遅れたことをお詫びします。こちらが慌ただしくなったのですが、お待たせした言い訳にはなりません。今、ご提案を全て拝見し、コメントを以下に記しました。お待ちいただき感謝します。今後はより迅速に対応します。","vocab":[{"en":"owe an apology","ja":"謝るべきだ"},{"en":"hectic","ja":"慌ただしい"},{"en":"no excuse","ja":"言い訳にならない"},{"en":"going forward","ja":"今後は"}],"grammar":[{"point":"that's no excuse for …","ja":"『〜の言い訳にならない』。"},{"point":"I'll be quicker going forward","ja":"今後の改善を約束。"}]},
  "rb_intro2": {"ja":"皆さん、こんにちは。新しいプロジェクトリーダーとしてチームに加わることをうれしく思います。ここ数年は似た役割を務め、明確な意思疎通と着実な前進を大切にしています。来週にかけて、お一人ずつお会いしてご意見を伺いたいです。","vocab":[{"en":"project lead","ja":"プロジェクト責任者"},{"en":"care deeply","ja":"深く大切にする"},{"en":"steady progress","ja":"着実な前進"},{"en":"perspective","ja":"視点"}],"grammar":[{"point":"I'm excited to be joining …","ja":"着任の挨拶。"},{"point":"I'd love to meet …","ja":"『ぜひ会いたい』。"}]},
  "rb_reminder2": {"ja":"予算の数字が今週木曜締めであることを軽くお知らせします。順調なら返信は不要です。何か支障があれば、一緒に解決できるよう早めに教えてください。前に進めてくれて感謝します。","vocab":[{"en":"due","ja":"期限の"},{"en":"on track","ja":"順調で"},{"en":"snags","ja":"支障"},{"en":"sort out","ja":"解決する"}],"grammar":[{"point":"Just a quick reminder that …","ja":"軽い催促の定型。"},{"point":"If you're running into …","ja":"条件節。"}]},
  "rb_escalate3": {"ja":"大きな問題になる前にご相談したいことがあります。重要な2タスクが、締切を守らない業者に依存しています。これが続けばローンチがずれます。今すぐ業者を替えるか、余裕を設けてリスクを受け入れるか、二つの道が見えます。ご判断を仰ぎたいです。","vocab":[{"en":"raise something","ja":"問題提起する"},{"en":"depend on","ja":"依存する"},{"en":"slip","ja":"ずれる"},{"en":"steer","ja":"判断・指示"}],"grammar":[{"point":"before it becomes …","ja":"『〜になる前に』。"},{"point":"I see two paths","ja":"選択肢の提示。"}]},
  "rb_welcome2": {"ja":"ようこそ、そして私たちをお選びいただきありがとうございます。アカウントの設定は完了し、すぐ使えます。数分で始められるよう短いガイドを添付しました。もし行き詰まったら、サポートチームへひとメッセージですぐつながります。","vocab":[{"en":"welcome aboard","ja":"ようこそ"},{"en":"all set up","ja":"設定完了"},{"en":"get started","ja":"始める"},{"en":"get stuck","ja":"行き詰まる"}],"grammar":[{"point":"ready to go","ja":"『すぐ使える』。"},{"point":"one quick message away","ja":"『ひと連絡ですぐ』。"}]},
  "rb_meeting_fu2": {"ja":"本日は実りある会議をありがとうございました。整理すると、あなたが提案を起草し、私が費用見積もりを集め、木曜に再度集まって確定します。それまでに支障があれば挙げてください。皆さんの集中と良いアイデアに感謝します。","vocab":[{"en":"productive","ja":"生産的な"},{"en":"recap","ja":"要約する"},{"en":"reconvene","ja":"再び集まる"},{"en":"blockers","ja":"支障"}],"grammar":[{"point":"To recap: …","ja":"要約の切り出し。"},{"point":"Please flag any blockers","ja":"『支障を挙げて』。"}]},
  "rb_referral2": {"ja":"私たちのサービスがお役に立っていれば、友人や同僚をご紹介いただけませんか。短いお取り次ぎが、成長中の私たちのチームには非常に大きな意味を持ちます。義務は一切ありません。お知り合いに合うと感じた場合だけで結構です。","vocab":[{"en":"refer","ja":"紹介する"},{"en":"introduction","ja":"取り次ぎ"},{"en":"mean the world","ja":"非常に大きな意味を持つ"},{"en":"obligation","ja":"義務"}],"grammar":[{"point":"would you consider …?","ja":"丁寧な依頼。"},{"point":"only if you feel …","ja":"条件を和らげる表現。"}]},
  "rb_survey2": {"ja":"私たちは常に改善を目指しており、あなたのご意見が大いに役立ちます。短いアンケートは約3分で、いくつかの話題だけを扱います。すべての回答を丁寧に読み、次の取り組みを形作ります。お声を貸してくださり感謝します。","vocab":[{"en":"improve","ja":"改善する"},{"en":"covers","ja":"扱う"},{"en":"shape","ja":"形作る"},{"en":"lend a voice","ja":"意見を寄せる"}],"grammar":[{"point":"your opinion would help …","ja":"仮定的な効果。"},{"point":"Every response is read …","ja":"受動態で丁寧に。"}]},
  "rb_notice2": {"ja":"本日早く、短時間のサービス中断があったことをお知らせします。午前9時頃から9時半頃まで、一部のユーザーがログインできませんでした。問題は完全に解決し、データへの影響はありませんでした。再発防止策を追加し、ご不便をお詫びします。","vocab":[{"en":"interruption","ja":"中断"},{"en":"resolved","ja":"解決した"},{"en":"safeguards","ja":"防止策"},{"en":"recurrence","ja":"再発"}],"grammar":[{"point":"We want to let you know …","ja":"告知の定型。"},{"point":"no data was affected","ja":"受動態で安心を伝える。"}]},
  "rb_quote2": {"ja":"ご関心ありがとうございます。ご説明いただいた範囲に基づき、見積もりを添付書面に詳述しました。設計、開発、公開後1か月のサポートを含みます。金額は30日間有効で、ご要望が変われば範囲の調整も喜んで承ります。","vocab":[{"en":"scope","ja":"範囲"},{"en":"estimate","ja":"見積もり"},{"en":"valid for","ja":"〜間有効"},{"en":"adjust","ja":"調整する"}],"grammar":[{"point":"Based on the scope …","ja":"『範囲に基づき』。"},{"point":"we're glad to adjust …","ja":"申し出の表現。"}]},
  "rb_congrats2": {"ja":"ご昇進、本当におめでとうございます。あなたの努力と着実なリーダーシップが明らかに報われ、あなたの昇進に驚く人はいません。心から嬉しく思い、新しい役割でのご活躍を楽しみにしています。","vocab":[{"en":"well-deserved","ja":"当然の"},{"en":"pay off","ja":"報われる"},{"en":"rise","ja":"昇進する"},{"en":"genuinely","ja":"心から"}],"grammar":[{"point":"no one is surprised to see …","ja":"『〜に驚く人はいない』。"},{"point":"excited to see what …","ja":"間接疑問。"}]},
  "rb_clarify2": {"ja":"前に進む前に、認識が一致しているか確認したいです。私の理解では、納品はデザインのみで、開発は別途対応されるはずです。もしご期待と異なるなら、今すり合わせましょう。前提の食い違いは後で直す方がはるかに高くつきます。","vocab":[{"en":"aligned","ja":"一致して"},{"en":"differs from","ja":"〜と異なる"},{"en":"clear up","ja":"解消する"},{"en":"mismatched","ja":"食い違った"}],"grammar":[{"point":"My understanding is that …","ja":"『私の理解では』。"},{"point":"mismatched assumptions are … costly","ja":"比較級で警告。"}]},
  "rb_invite2": {"ja":"来週金曜の夜、チームのお祝いに心からご招待します。おいしい食事を囲み、素晴らしい四半期を振り返り、一緒にくつろぎます。お越しいただけたら嬉しいです。参加できるか水曜までにお知らせください。","vocab":[{"en":"warmly invited","ja":"心から招待された"},{"en":"look back on","ja":"振り返る"},{"en":"unwind","ja":"くつろぐ"},{"en":"make it","ja":"参加する"}],"grammar":[{"point":"You're warmly invited to …","ja":"招待の定型。"},{"point":"It would be lovely to …","ja":"『〜できたら嬉しい』。"}]},
  "rb_handover2": {"ja":"来週不在のため、未処理のタスクをケンジに引き継ぎます。彼には十分に共有済みで、関連ファイルもすべて渡してあります。急ぎの件は直接彼に、急ぎでない件は私の復帰までお待ちいただけます。ご理解に感謝します。","vocab":[{"en":"out","ja":"不在で"},{"en":"hand to","ja":"引き継ぐ"},{"en":"briefed","ja":"共有された"},{"en":"urgent","ja":"急ぎの"}],"grammar":[{"point":"As I'll be out …","ja":"理由を示す as。"},{"point":"please reach him directly","ja":"『直接連絡を』。"}]},
  "rb_proposal3": {"ja":"小さな実験を提案したいです。今は意見が遅すぎて判断が滞りがちです。レビューに24時間以内の返答という規範を設ければ、勢いがつき、放置されるタスクが減ります。一つのプロジェクトで試し、違いを測りましょう。","vocab":[{"en":"stall","ja":"滞る"},{"en":"norm","ja":"規範"},{"en":"momentum","ja":"勢い"},{"en":"sit idle","ja":"放置される"}],"grammar":[{"point":"If we set …, momentum would …","ja":"仮定法で効果を示す。"},{"point":"measure the difference","ja":"『違いを測る』。"}]},
  "rb_thanks_team2": {"ja":"この一か月の努力に、皆さんへ感謝を伝えたいです。簡単ではありませんでしたが、力を合わせ、皆が誇れるものを届けてくれました。今週末は少し充電してください。十分すぎるほどその資格があります。","vocab":[{"en":"effort","ja":"努力"},{"en":"pull together","ja":"力を合わせる"},{"en":"recharge","ja":"充電する"},{"en":"earn","ja":"値する"}],"grammar":[{"point":"something we can all be proud of","ja":"関係代名詞の省略。"},{"point":"you've more than earned it","ja":"現在完了で資格を示す。"}]},
  "rb_reschedule2": {"ja":"急なお知らせで申し訳ありませんが、火曜の通話を動かす必要があります。動かせない用件が入ってしまいました。代わりに水曜か木曜の午後はいかがでしょうか。どちらも合わなければ、候補をいくつか送ってください、ご都合に合わせます。","vocab":[{"en":"short notice","ja":"急な知らせ"},{"en":"came up","ja":"持ち上がった"},{"en":"suits you","ja":"都合が合う"},{"en":"fit around","ja":"合わせる"}],"grammar":[{"point":"Something came up that …","ja":"関係代名詞で補足。"},{"point":"I'll fit around your schedule","ja":"『予定に合わせる』。"}]},
  "rb_recommend2": {"ja":"アヤを心から推薦します。2年間で、彼女は苦戦していた手順を、今や他者が手本とするものに変え、その間ずっと忍耐と優雅さで後輩を指導しました。鋭い判断力と本物の温かさを兼ね備えています。どのチームでも稀で貴重な組み合わせです。","vocab":[{"en":"wholeheartedly","ja":"心から"},{"en":"struggling","ja":"苦戦している"},{"en":"mentor","ja":"指導する"},{"en":"judgment","ja":"判断力"}],"grammar":[{"point":"all while mentoring …","ja":"付帯状況の while。"},{"point":"a rare and valuable mix","ja":"同格で補足。"}]},
  "rb_renewal2": {"ja":"年間プランは来月更新予定です。お客様側で必要な手続きはなく、現在の料金で自動的に継続します。プラン変更のご希望やご質問があれば、こちらに返信いただければ対応します。ご愛顧に感謝します。","vocab":[{"en":"set to renew","ja":"更新予定"},{"en":"automatically","ja":"自動的に"},{"en":"tiers","ja":"プラン段階"},{"en":"take care of","ja":"対応する"}],"grammar":[{"point":"There's nothing you need to do","ja":"『手続き不要』。"},{"point":"just reply here","ja":"気軽な案内。"}]},
  "rb_onboard2": {"ja":"入社初日へようこそ！午前は環境設定とチームとの顔合わせ、午後はツールの軽い紹介です。まだ成果を出すことは気にせず、慣れることに集中してください。必要なことは何でもミアが案内します。","vocab":[{"en":"get set up","ja":"環境を整える"},{"en":"gentle introduction","ja":"軽い紹介"},{"en":"productive","ja":"生産的な"},{"en":"settle in","ja":"慣れる"}],"grammar":[{"point":"Don't worry about being …","ja":"『〜を気にしないで』。"},{"point":"Mia will be your guide","ja":"『ミアが案内する』。"}]},
  "rb_boundary3": {"ja":"自分の対応可能量について正直にお伝えします。今週は手一杯で、今これを引き受けると雑になるか、別の何かを落とすことになります。月曜からならきちんと注力できますし、急ぎなら早く対応できる人を探すお手伝いもします。安請け合いより現実的な期待を設定したいのです。","vocab":[{"en":"capacity","ja":"対応可能量"},{"en":"take on","ja":"引き受ける"},{"en":"proper attention","ja":"適切な注力"},{"en":"overpromise","ja":"安請け合いする"}],"grammar":[{"point":"taking this on … would mean …","ja":"動名詞主語で結果を示す。"},{"point":"I'd rather … than …","ja":"『〜より〜したい』。"}]},
  "rb_status2": {"ja":"報告書の進み具合はどうかなと思い、軽く確認です。まったく急ぎません。いろいろ抱えていたのは承知しています。順調なら一行の返信で十分です。何か妨げがあれば教えてください、一緒に解決しましょう。","vocab":[{"en":"checking in","ja":"近況を確認する"},{"en":"coming along","ja":"進む"},{"en":"had a lot on","ja":"多くを抱えていた"},{"en":"get in the way","ja":"妨げになる"}],"grammar":[{"point":"see how the report is coming along","ja":"間接疑問。"},{"point":"a one-line reply is plenty","ja":"『一行で十分』。"}]},
  "rb_offer2": {"ja":"あなたにこの職をご提示できることを大変うれしく思います。選考を通じてご経験と活力が際立ち、チームで活躍されると確信しています。添付の書面に詳細をすべて記しています。じっくりご確認いただき、決める前に質問があればご連絡ください。","vocab":[{"en":"thrilled","ja":"大変うれしい"},{"en":"stood out","ja":"際立った"},{"en":"thrive","ja":"活躍する"},{"en":"take your time","ja":"じっくりやる"}],"grammar":[{"point":"We're thrilled to offer …","ja":"内定通知の定型。"},{"point":"before you decide","ja":"『決める前に』。"}]}
});


/* 増量：リーディング教材 第10弾追補（5倍ペース） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"rb_close2","title":"案件完了の報告","level":"B1","text":"Good news—the project is officially complete. Everything was delivered on time and within budget, and the client is delighted with the result. Thank you all for your dedication. I'll schedule a short wrap-up to capture what we learned for next time."}
]);
Object.assign(window.EigoData.readingNotes, {
  "rb_close2": {"ja":"良い知らせです。プロジェクトが正式に完了しました。すべて期限内・予算内で納品され、顧客は結果に大変満足しています。皆さんの献身に感謝します。次回に活かす学びをまとめるため、短い振り返りを設定します。","vocab":[{"en":"officially","ja":"正式に"},{"en":"within budget","ja":"予算内で"},{"en":"delighted","ja":"大満足の"},{"en":"wrap-up","ja":"振り返り"}],"grammar":[{"point":"within budget","ja":"『予算内で』。"},{"point":"capture what we learned","ja":"関係代名詞 what。"}]}
});


/* 増量：リーディング教材 第11弾 大量（5倍ペース完全維持） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"rc_remote2","title":"リモートワークの工夫","level":"B2","text":"Working from home blurs the line between work and rest. Setting a clear start and stop time helps. So does a dedicated workspace, even a small corner. Short walks between tasks reset your focus. The goal is not to work more hours, but to protect the hours you do work."},
  {"id":"rc_habit2","title":"習慣の作り方","level":"B1","text":"Big changes are hard to keep. Tiny ones are not. Instead of vowing to read an hour a day, start with one page. Once the habit feels automatic, it grows on its own. The secret is to make the first step so small that you cannot say no."},
  {"id":"rc_feedback3","title":"フィードバックの受け方","level":"B2","text":"Hearing criticism is never easy, but it is often a gift. The instinct is to defend yourself. Resist it. Instead, ask questions to understand. Separate the message from the tone. Even clumsy feedback may contain something true and useful if you look for it."},
  {"id":"rc_decision3","title":"決断のコツ","level":"B2","text":"Many decisions feel huge but are easily reversed. For those, decide fast and move on. A few decisions are truly one-way doors. For those, slow down and gather more input. The mistake is treating every choice as if it were permanent, which paralyzes you."},
  {"id":"rc_time2","title":"時間管理","level":"B1","text":"Time feels scarce, but much of it leaks away unnoticed. Try tracking how you spend a single day. The results often surprise people. Small habits—checking your phone, switching tasks—add up fast. Awareness alone, before any system, already changes behavior."},
  {"id":"rc_listen2","title":"聞き上手になる","level":"B1","text":"Good listening is rarer than good speaking. Most people wait for their turn instead of truly hearing. Try this: before you reply, summarize what the other person said. It feels slow at first, but it makes people feel understood—and that changes every conversation."},
  {"id":"rc_focus2","title":"集中力を保つ","level":"B2","text":"Focus is a muscle that distraction weakens. Every notification trains your brain to crave interruption. The fix is not willpower but design: silence alerts, close extra tabs, keep your phone in another room. Make the distraction harder to reach than the work."},
  {"id":"rc_goal2","title":"目標設定","level":"B1","text":"Vague goals are easy to ignore. 'Get fit' means nothing your body can act on. 'Walk twenty minutes after lunch' does. The clearer and smaller the goal, the more likely you are to start—and starting, not planning, is what actually builds momentum."},
  {"id":"rc_email3","title":"メールの書き方","level":"B2","text":"A good email respects the reader's time. Lead with the point, not the backstory. Use short paragraphs and a clear request. If you need something, say exactly what and by when. A reader should never have to guess what you want or scroll to find it."},
  {"id":"rc_learn3","title":"効果的な学習","level":"B2","text":"Re-reading feels productive but teaches little. Testing yourself, by contrast, forces your brain to retrieve, which strengthens memory. Struggle a little before checking the answer. The discomfort is the learning. Easy review only builds the illusion of knowing."},
  {"id":"rc_money2","title":"お金との付き合い方","level":"B1","text":"Saving is less about income than habit. People who earn more often spend more, too. The trick is to save first, before you see the money—set aside a fixed amount automatically. What you never see, you rarely miss, and small amounts grow over years."},
  {"id":"rc_stress2","title":"ストレス対処","level":"B2","text":"Stress is not always the enemy. In small doses, it sharpens focus and drives action. The problem is chronic stress with no recovery. Build in real breaks, sleep enough, and move your body. Managing stress is less about removing it than balancing it with rest."},
  {"id":"rc_team2","title":"チームで働く","level":"B2","text":"Great teams are not just talented; they are safe. People share half-formed ideas, admit mistakes, and ask 'dumb' questions without fear. That safety, more than raw skill, is what lets a group think better than any individual in it."},
  {"id":"rc_change2","title":"変化への適応","level":"B2","text":"Change feels threatening because it trades the known for the uncertain. But clinging to the familiar has costs too, often hidden ones. Ask not only 'What might I lose?' but 'What does staying the same cost me?' The safer-seeming path is not always safer."},
  {"id":"rc_creativity2","title":"創造性の育て方","level":"B2","text":"Creativity is not a gift reserved for a few. It is mostly the result of combining old ideas in new ways. Expose yourself to many fields, take notes, and let ideas collide. The more varied your inputs, the more original your outputs tend to be."},
  {"id":"rc_sleep2","title":"睡眠の質を上げる","level":"B1","text":"Good sleep starts hours before bed. Caffeine lingers in your body far longer than you think. Screens trick your brain into staying alert. Try dimming the lights, putting your phone away, and keeping a regular bedtime. The body loves rhythm more than rules."},
  {"id":"rc_public2","title":"人前で話す","level":"B2","text":"Stage fright never fully disappears, even for experts. The trick is to channel the nerves, not erase them. Prepare thoroughly, breathe slowly, and focus on the message, not yourself. Audiences forgive imperfect delivery; what they remember is whether you helped them."},
  {"id":"rc_negotiate2","title":"交渉の基本","level":"B2","text":"The best negotiators listen more than they talk. They ask questions to learn what the other side truly needs, which is often different from what they demand. Find the shared interest beneath the stated positions, and a deal that felt impossible can suddenly appear."},
  {"id":"rc_curiosity2","title":"好奇心を保つ","level":"B1","text":"Children ask 'why' constantly; adults often stop. But curiosity is what keeps the mind young and learning alive. Make a habit of asking one real question a day about something you take for granted. The answers, and the new questions they raise, keep life interesting."},
  {"id":"rc_failure2","title":"失敗から学ぶ","level":"B2","text":"Failure stings, but it is rich with information that success rarely gives. When something goes wrong, resist the urge to forget it quickly. Instead, ask what you would do differently and write it down. A failure examined becomes a lesson; one ignored becomes a habit."},
  {"id":"rc_kindness2","title":"親切の力","level":"B1","text":"Small kindnesses cost little but ripple far. A genuine thank-you, a held door, a patient reply—these moments lift the other person and, oddly, lift you too. Kindness is rarely wasted. Even when it is not returned, it slowly shapes the kind of person you become."},
  {"id":"rc_focus3","title":"深い仕事","level":"B2","text":"Shallow tasks—email, chats, quick replies—feel busy but rarely create lasting value. Deep work does, yet it demands long, uninterrupted stretches that are increasingly rare. Protect a block of time each day, guard it fiercely, and use it for the work that truly matters."},
  {"id":"rc_growth2","title":"成長思考","level":"B2","text":"People with a fixed mindset see ability as set in stone; a setback feels like proof of their limits. Those with a growth mindset see ability as trainable; a setback is just feedback. The belief itself shapes effort, and effort, over time, shapes the outcome."},
  {"id":"rc_simplicity2","title":"シンプルさの価値","level":"B2","text":"Adding features is easy; removing them takes courage. Yet the best products, essays, and plans are often those stripped to their essence. Before adding more, ask what you can take away. Simplicity is not the absence of effort—it is the result of a great deal of it."},
  {"id":"rc_patience2","title":"忍耐の意味","level":"B1","text":"We overvalue speed and undervalue patience. Many good things—skill, trust, health—grow slowly and cannot be rushed. Plant the seed, do the daily work, and resist checking for results too often. Quiet, consistent effort usually beats bursts of frantic activity."},
  {"id":"rc_honesty2","title":"誠実であること","level":"B2","text":"Honesty is uncomfortable in the moment but cheap in the long run. Small lies seem harmless, yet each one adds weight you must carry and remember. Telling the truth, even when awkward, frees you from that burden and builds the rarest, most valuable thing: trust."},
  {"id":"rc_attention2","title":"注意を向ける","level":"B1","text":"Attention is the most valuable thing you own, yet you give it away cheaply all day. Every app competes for it. Decide what deserves your focus and protect it like money. Where your attention goes, your life follows—so spend it on what you would not regret."},
  {"id":"rc_comparison2","title":"比較をやめる","level":"B2","text":"Comparing yourself to others is a trap with no exit. There is always someone ahead, and social media shows only the highlights. A better measure is yourself yesterday. Progress, however small, against your own past is real; rank against strangers is mostly noise."},
  {"id":"rc_rest2","title":"休息の技術","level":"B1","text":"Rest is not laziness; it is part of the work. The mind solves problems in the background while you walk, nap, or do nothing. Pushing without pause leads to worse decisions and slower progress. Schedule rest as deliberately as you schedule tasks, and protect it."},
  {"id":"rc_question2","title":"問いを立てる","level":"B2","text":"The quality of your thinking depends on the quality of your questions. A vague question yields a vague answer. Sharpen it: instead of 'How do I get better?' ask 'What is the one weakness holding me back most?' A precise question often contains half the solution."}
]);
Object.assign(window.EigoData.readingNotes, {
  "rc_remote2": {"ja":"在宅勤務は仕事と休息の境界を曖昧にします。明確な始業・終業時刻を決めると役立ちます。小さな一角でも専用の作業空間も同様です。タスク間の短い散歩が集中を回復させます。目標は長く働くことではなく、働く時間を守ることです。","vocab":[{"en":"blur","ja":"曖昧にする"},{"en":"dedicated","ja":"専用の"},{"en":"reset","ja":"回復させる"},{"en":"protect","ja":"守る"}],"grammar":[{"point":"The goal is not to …, but to …","ja":"not A but B の構文。"},{"point":"So does …","ja":"倒置で『〜も同様』。"}]},
  "rc_habit2": {"ja":"大きな変化は続けにくいものです。小さな変化はそうではありません。1日1時間読むと誓う代わりに、1ページから始めましょう。習慣が自動的に感じられれば、自然に育ちます。秘訣は、最初の一歩を断れないほど小さくすることです。","vocab":[{"en":"vow","ja":"誓う"},{"en":"automatic","ja":"自動的な"},{"en":"on its own","ja":"ひとりでに"},{"en":"secret","ja":"秘訣"}],"grammar":[{"point":"so small that you cannot …","ja":"so … that 構文。"},{"point":"Once …, it grows","ja":"時を表す once。"}]},
  "rc_feedback3": {"ja":"批判を聞くのは決して楽ではありませんが、しばしば贈り物です。本能は自己弁護に走ります。それに抵抗しましょう。代わりに、理解するために質問を。メッセージを口調から切り離しましょう。不器用な意見でも、探せば真実で有益な何かを含むことがあります。","vocab":[{"en":"criticism","ja":"批判"},{"en":"instinct","ja":"本能"},{"en":"resist","ja":"抵抗する"},{"en":"clumsy","ja":"不器用な"}],"grammar":[{"point":"The instinct is to …","ja":"be + to不定詞。"},{"point":"Separate A from B","ja":"『AをBから切り離す』。"}]},
  "rc_decision3": {"ja":"多くの決断は重大に感じても簡単に取り消せます。それらは素早く決めて進みましょう。一部の決断は本当に一方通行の扉です。それらは速度を落とし、より多くの意見を集めましょう。誤りはあらゆる選択を永続的であるかのように扱い、身動きが取れなくなることです。","vocab":[{"en":"reversed","ja":"取り消される"},{"en":"one-way door","ja":"一方通行の扉"},{"en":"gather","ja":"集める"},{"en":"paralyze","ja":"麻痺させる"}],"grammar":[{"point":"as if it were …","ja":"as if + 仮定法。"},{"point":"The mistake is treating …","ja":"動名詞を補語に。"}]},
  "rc_time2": {"ja":"時間は乏しく感じますが、その多くは気づかぬうちに漏れ出ています。1日の使い方を記録してみましょう。結果はしばしば人を驚かせます。スマホの確認やタスクの切り替えといった小さな習慣がすぐに積み重なります。どんな仕組みより前に、気づくだけで行動が変わります。","vocab":[{"en":"scarce","ja":"乏しい"},{"en":"leak away","ja":"漏れ出る"},{"en":"add up","ja":"積み重なる"},{"en":"awareness","ja":"気づき"}],"grammar":[{"point":"much of it leaks away","ja":"部分を表す much of。"},{"point":"Awareness alone … changes","ja":"強調の alone。"}]},
  "rc_listen2": {"ja":"聞き上手は話し上手より稀です。多くの人は本当に聞く代わりに自分の番を待ちます。試してみてください。返事の前に、相手が言ったことを要約するのです。最初は遅く感じますが、相手に理解されたと感じさせ、それがあらゆる会話を変えます。","vocab":[{"en":"rarer","ja":"より稀な"},{"en":"truly","ja":"本当に"},{"en":"summarize","ja":"要約する"},{"en":"understood","ja":"理解された"}],"grammar":[{"point":"rarer than …","ja":"比較級。"},{"point":"instead of …ing","ja":"『〜する代わりに』。"}]},
  "rc_focus2": {"ja":"集中力は気が散ることで弱る筋肉です。あらゆる通知が、脳に中断を渇望するよう訓練します。解決は意志力ではなく設計です。通知を消し、余分なタブを閉じ、スマホを別室に置く。気を散らすものを、仕事より手の届きにくい場所に置きましょう。","vocab":[{"en":"distraction","ja":"気を散らすもの"},{"en":"crave","ja":"渇望する"},{"en":"willpower","ja":"意志力"},{"en":"alert","ja":"通知"}],"grammar":[{"point":"not A but B","ja":"not willpower but design。"},{"point":"harder to reach than …","ja":"比較級＋to不定詞。"}]},
  "rc_goal2": {"ja":"曖昧な目標は無視しやすいものです。『健康になる』は体が実行できる意味を持ちません。『昼食後に20分歩く』は持ちます。目標が明確で小さいほど、始めやすくなります。そして計画ではなく始めることこそが、実際に勢いを生みます。","vocab":[{"en":"vague","ja":"曖昧な"},{"en":"act on","ja":"実行する"},{"en":"likely","ja":"ありそうな"},{"en":"momentum","ja":"勢い"}],"grammar":[{"point":"The clearer …, the more …","ja":"the 比較級, the 比較級。"},{"point":"starting, not planning, is …","ja":"挿入で対比。"}]},
  "rc_email3": {"ja":"良いメールは読み手の時間を尊重します。経緯ではなく要点から始めましょう。短い段落と明確な依頼を使いましょう。何か必要なら、何を、いつまでに、を正確に述べましょう。読み手があなたの望みを推測したり、探してスクロールしたりする必要は決してあってはなりません。","vocab":[{"en":"respect","ja":"尊重する"},{"en":"backstory","ja":"経緯"},{"en":"request","ja":"依頼"},{"en":"scroll","ja":"スクロールする"}],"grammar":[{"point":"Lead with …, not …","ja":"対比の命令文。"},{"point":"say exactly what and by when","ja":"間接疑問の省略形。"}]},
  "rc_learn3": {"ja":"再読は生産的に感じますが、ほとんど身につきません。対照的に、自分を試すことは脳に思い出すことを強い、記憶を強化します。答えを確認する前に少し苦しみましょう。その不快さが学びです。楽な復習は、分かっているという錯覚を生むだけです。","vocab":[{"en":"productive","ja":"生産的な"},{"en":"retrieve","ja":"思い出す"},{"en":"discomfort","ja":"不快さ"},{"en":"illusion","ja":"錯覚"}],"grammar":[{"point":"by contrast","ja":"『対照的に』。"},{"point":"The discomfort is the learning","ja":"be動詞で同一視。"}]},
  "rc_money2": {"ja":"貯蓄は収入よりも習慣の問題です。より多く稼ぐ人は、より多く使うことも多いのです。コツは、お金を見る前にまず貯めること。一定額を自動的に取り分けるのです。決して見ないものは、めったに恋しくならず、小さな額が何年もかけて育ちます。","vocab":[{"en":"income","ja":"収入"},{"en":"set aside","ja":"取り分ける"},{"en":"fixed","ja":"一定の"},{"en":"miss","ja":"恋しく思う"}],"grammar":[{"point":"less about A than B","ja":"『AよりむしろB』。"},{"point":"What you never see, you rarely miss","ja":"関係代名詞 what が主語。"}]},
  "rc_stress2": {"ja":"ストレスは常に敵とは限りません。少量なら集中を研ぎ澄まし、行動を促します。問題は回復のない慢性的なストレスです。本物の休憩を組み込み、十分に眠り、体を動かしましょう。ストレス管理は、取り除くことより休息と釣り合わせることです。","vocab":[{"en":"dose","ja":"量"},{"en":"chronic","ja":"慢性の"},{"en":"recovery","ja":"回復"},{"en":"balance","ja":"釣り合わせる"}],"grammar":[{"point":"In small doses, …","ja":"条件を表す前置詞句。"},{"point":"less about A than B","ja":"『AよりむしろB』。"}]},
  "rc_team2": {"ja":"優れたチームは才能があるだけでなく、安全です。人々は未完成のアイデアを共有し、過ちを認め、恐れずに『ばかげた』質問をします。その安全性こそが、生のスキル以上に、集団をその中のどの個人よりも賢く考えさせるものです。","vocab":[{"en":"talented","ja":"才能のある"},{"en":"half-formed","ja":"未完成の"},{"en":"admit","ja":"認める"},{"en":"raw","ja":"生の"}],"grammar":[{"point":"not just …; they are …","ja":"対比のセミコロン。"},{"point":"more than raw skill","ja":"挿入で比較。"}]},
  "rc_change2": {"ja":"変化は、既知のものを不確実なものと交換するため、脅威に感じられます。しかし慣れ親しんだものにしがみつくことにも、しばしば隠れた代償があります。『何を失うか』だけでなく『同じままでいることの代償は何か』も問いましょう。安全に見える道が常に安全とは限りません。","vocab":[{"en":"threatening","ja":"脅威的な"},{"en":"cling to","ja":"しがみつく"},{"en":"familiar","ja":"慣れ親しんだ"},{"en":"cost","ja":"代償"}],"grammar":[{"point":"trades A for B","ja":"『AをBと交換する』。"},{"point":"not only … but …","ja":"not only but の構文。"}]},
  "rc_creativity2": {"ja":"創造性は少数の人に取っておかれた才能ではありません。それは主に、古いアイデアを新しい方法で組み合わせた結果です。多くの分野に触れ、メモを取り、アイデアを衝突させましょう。入力が多様であるほど、出力は独創的になる傾向があります。","vocab":[{"en":"reserved","ja":"取っておかれた"},{"en":"expose","ja":"触れさせる"},{"en":"collide","ja":"衝突する"},{"en":"varied","ja":"多様な"}],"grammar":[{"point":"reserved for a few","ja":"過去分詞の後置修飾。"},{"point":"The more …, the more …","ja":"the 比較級構文。"}]},
  "rc_sleep2": {"ja":"良い睡眠は就寝の何時間も前から始まります。カフェインは思うよりずっと長く体に残ります。画面は脳をだまして覚醒させ続けます。照明を落とし、スマホを片付け、規則的な就寝時刻を保ちましょう。体は規則よりリズムを好みます。","vocab":[{"en":"linger","ja":"残る"},{"en":"alert","ja":"覚醒した"},{"en":"dim","ja":"暗くする"},{"en":"rhythm","ja":"リズム"}],"grammar":[{"point":"far longer than you think","ja":"比較級の強調。"},{"point":"trick … into …ing","ja":"『〜をだまして…させる』。"}]},
  "rc_public2": {"ja":"あがり症は専門家でさえ完全には消えません。コツは緊張を消すのではなく、向けることです。入念に準備し、ゆっくり呼吸し、自分ではなくメッセージに集中しましょう。聴衆は不完全な話し方を許します。彼らが覚えているのは、あなたが役に立ったかどうかです。","vocab":[{"en":"stage fright","ja":"あがり症"},{"en":"channel","ja":"向ける"},{"en":"thoroughly","ja":"入念に"},{"en":"forgive","ja":"許す"}],"grammar":[{"point":"not erase them","ja":"not で対比。"},{"point":"what they remember is whether …","ja":"関係詞 what と間接疑問。"}]},
  "rc_negotiate2": {"ja":"最高の交渉者は話すより多く聞きます。相手が本当に必要とするものを知るために質問し、それはしばしば要求と異なります。表明された立場の下にある共通の利益を見つければ、不可能に思えた取引が突然現れることがあります。","vocab":[{"en":"negotiator","ja":"交渉者"},{"en":"demand","ja":"要求する"},{"en":"beneath","ja":"〜の下に"},{"en":"position","ja":"立場"}],"grammar":[{"point":"more than they talk","ja":"比較級。"},{"point":"a deal that felt impossible","ja":"関係代名詞 that。"}]},
  "rc_curiosity2": {"ja":"子供は絶えず『なぜ』と尋ねますが、大人はしばしばやめてしまいます。しかし好奇心こそが心を若く保ち、学びを生き生きとさせます。当たり前と思っていることについて、1日1つ本物の問いを尋ねる習慣を作りましょう。その答えと、それが生む新たな問いが、人生を面白く保ちます。","vocab":[{"en":"constantly","ja":"絶えず"},{"en":"take for granted","ja":"当たり前と思う"},{"en":"raise","ja":"生む"},{"en":"alive","ja":"生き生きとした"}],"grammar":[{"point":"what keeps the mind young","ja":"関係詞 what。"},{"point":"the new questions they raise","ja":"関係詞の省略。"}]},
  "rc_failure2": {"ja":"失敗は痛みますが、成功がめったに与えない情報に富んでいます。何かがうまくいかないとき、すぐ忘れたい衝動に抵抗しましょう。代わりに、次は何を変えるかを問い、書き留めましょう。検証された失敗は教訓になり、無視された失敗は習慣になります。","vocab":[{"en":"sting","ja":"痛む"},{"en":"urge","ja":"衝動"},{"en":"examine","ja":"検証する"},{"en":"ignore","ja":"無視する"}],"grammar":[{"point":"rich with …","ja":"『〜に富む』。"},{"point":"A failure examined …; one ignored …","ja":"過去分詞の後置修飾で対比。"}]},
  "rc_kindness2": {"ja":"小さな親切はほとんど費用がかからないのに、遠くまで波及します。心からの感謝、開けて待つドア、辛抱強い返事。こうした瞬間は相手を高め、不思議なことにあなたも高めます。親切が無駄になることはめったにありません。返されなくても、あなたがなる人柄を少しずつ形作ります。","vocab":[{"en":"ripple","ja":"波及する"},{"en":"genuine","ja":"心からの"},{"en":"oddly","ja":"不思議なことに"},{"en":"shape","ja":"形作る"}],"grammar":[{"point":"cost little but ripple far","ja":"対比の but。"},{"point":"the kind of person you become","ja":"関係詞の省略。"}]},
  "rc_focus3": {"ja":"浅い仕事、つまりメールやチャットや素早い返信は、忙しく感じてもめったに永続的な価値を生みません。深い仕事は生みますが、ますます稀になる長く中断のない時間を要します。毎日ひとまとまりの時間を確保し、激しく守り、本当に重要な仕事に使いましょう。","vocab":[{"en":"shallow","ja":"浅い"},{"en":"uninterrupted","ja":"中断のない"},{"en":"stretch","ja":"ひと続きの時間"},{"en":"fiercely","ja":"激しく"}],"grammar":[{"point":"feel busy but rarely create","ja":"対比の but。"},{"point":"the work that truly matters","ja":"関係代名詞 that。"}]},
  "rc_growth2": {"ja":"固定思考の人は能力を石に刻まれたものと見ます。挫折は限界の証明に感じられます。成長思考の人は能力を訓練可能なものと見ます。挫折は単なるフィードバックです。信念そのものが努力を形作り、努力が時間をかけて結果を形作ります。","vocab":[{"en":"fixed mindset","ja":"固定思考"},{"en":"set in stone","ja":"変えられない"},{"en":"setback","ja":"挫折"},{"en":"trainable","ja":"訓練可能な"}],"grammar":[{"point":"see A as B","ja":"『AをBと見なす』。"},{"point":"effort, over time, shapes …","ja":"挿入句。"}]},
  "rc_simplicity2": {"ja":"機能を追加するのは簡単で、取り除くには勇気が要ります。しかし最高の製品、エッセイ、計画は、しばしば本質まで削ぎ落とされたものです。追加する前に、何を取り除けるかを問いましょう。シンプルさは努力の欠如ではなく、多大な努力の結果です。","vocab":[{"en":"feature","ja":"機能"},{"en":"courage","ja":"勇気"},{"en":"strip","ja":"削ぎ落とす"},{"en":"essence","ja":"本質"}],"grammar":[{"point":"those stripped to …","ja":"過去分詞の後置修飾。"},{"point":"not the absence … it is the result","ja":"not A, it is B。"}]},
  "rc_patience2": {"ja":"私たちは速さを過大評価し、忍耐を過小評価します。技能、信頼、健康など、多くの良いものはゆっくり育ち、急ぐことはできません。種をまき、日々の作業をし、頻繁に結果を確認したい気持ちに抵抗しましょう。静かで一貫した努力は、たいてい必死の活動の爆発に勝ります。","vocab":[{"en":"overvalue","ja":"過大評価する"},{"en":"rush","ja":"急ぐ"},{"en":"consistent","ja":"一貫した"},{"en":"frantic","ja":"必死の"}],"grammar":[{"point":"cannot be rushed","ja":"受動態の助動詞。"},{"point":"Quiet, consistent effort … beats …","ja":"無生物主語。"}]},
  "rc_honesty2": {"ja":"誠実さはその場では気まずいですが、長い目で見れば安上がりです。小さな嘘は無害に見えますが、一つ一つが背負って覚えておく重みを加えます。気まずくても真実を語ることは、その重荷から解放し、最も稀で最も価値あるもの、つまり信頼を築きます。","vocab":[{"en":"uncomfortable","ja":"気まずい"},{"en":"harmless","ja":"無害な"},{"en":"burden","ja":"重荷"},{"en":"valuable","ja":"価値ある"}],"grammar":[{"point":"cheap in the long run","ja":"『長い目で見れば』。"},{"point":"the rarest, most valuable thing: trust","ja":"コロンで具体化。"}]},
  "rc_attention2": {"ja":"注意はあなたが持つ最も価値あるものですが、一日中安く手放しています。あらゆるアプリがそれを奪い合います。何が集中に値するかを決め、お金のように守りましょう。注意が向かう先に人生は従います。だから後悔しないものに使いましょう。","vocab":[{"en":"valuable","ja":"価値ある"},{"en":"compete","ja":"奪い合う"},{"en":"deserve","ja":"値する"},{"en":"regret","ja":"後悔する"}],"grammar":[{"point":"give it away cheaply","ja":"副詞の位置。"},{"point":"Where your attention goes, your life follows","ja":"関係副詞 where。"}]},
  "rc_comparison2": {"ja":"自分を他人と比べるのは、出口のない罠です。常に先を行く誰かがいて、SNSはハイライトしか見せません。より良い基準は昨日の自分です。どんなに小さくとも自分の過去に対する前進は本物で、他人との順位はほとんど雑音です。","vocab":[{"en":"trap","ja":"罠"},{"en":"highlight","ja":"良いところ"},{"en":"measure","ja":"基準"},{"en":"noise","ja":"雑音"}],"grammar":[{"point":"however small","ja":"譲歩の however。"},{"point":"A better measure is yourself yesterday","ja":"be動詞で同一視。"}]},
  "rc_rest2": {"ja":"休息は怠惰ではなく、仕事の一部です。あなたが歩いたり、昼寝したり、何もしない間に、心は背後で問題を解いています。休みなく押し進めると、より悪い決定と遅い進展を招きます。タスクと同じくらい意図的に休息を予定し、それを守りましょう。","vocab":[{"en":"laziness","ja":"怠惰"},{"en":"in the background","ja":"背後で"},{"en":"pause","ja":"休止"},{"en":"deliberately","ja":"意図的に"}],"grammar":[{"point":"not laziness; it is …","ja":"セミコロンで対比。"},{"point":"as deliberately as …","ja":"as … as 構文。"}]},
  "rc_question2": {"ja":"思考の質は問いの質に左右されます。曖昧な問いは曖昧な答えを生みます。それを研ぎましょう。『どうすれば上達するか』ではなく『私を最も妨げている一つの弱点は何か』と問うのです。的確な問いはしばしば解決の半分を含んでいます。","vocab":[{"en":"quality","ja":"質"},{"en":"vague","ja":"曖昧な"},{"en":"yield","ja":"生む"},{"en":"precise","ja":"的確な"}],"grammar":[{"point":"depends on …","ja":"『〜に左右される』。"},{"point":"the one weakness holding me back","ja":"現在分詞の後置修飾。"}]}
});


/* 増量：リーディング教材 第12弾 大量（5倍ペース完全維持） */
window.EigoData.readingSamples = window.EigoData.readingSamples.concat([
  {"id":"rc_meeting2","title":"会議を効率化する","level":"B2","text":"Most meetings run long because no one owns the clock. A clear agenda, a timekeeper, and a hard stop change everything. End with who does what by when. A meeting without an action item was usually an email in disguise."},
  {"id":"rc_feedback4","title":"建設的に意見する","level":"B2","text":"Vague praise feels nice but teaches nothing. Useful feedback is specific, timely, and tied to behavior, not character. Say 'the intro ran long,' not 'you talk too much.' People can change what they did far more easily than who they are."},
  {"id":"rc_priorities2","title":"優先順位のつけ方","level":"B2","text":"Everything feels urgent, but few things are truly important. The trap is letting the loudest task win instead of the most valuable one. Each morning, pick the one task that would make the day a success—and protect time for it before the noise begins."},
  {"id":"rc_listening3","title":"本当に聞くこと","level":"B2","text":"We often listen to reply, not to understand. The difference shows: one waits for a pause to talk, the other asks a question that goes deeper. Real listening is rare and disarming. When people feel heard, they relax, open up, and trust you more."},
  {"id":"rc_writing2","title":"明快に書く","level":"B2","text":"Good writing is mostly rewriting. The first draft exists to be cut. Remove every word that does no work, every sentence that repeats. Read it aloud; if you stumble, so will the reader. Clarity is a kindness you offer the person on the other side."},
  {"id":"rc_habits3","title":"習慣を変える","level":"B2","text":"Willpower is unreliable; design is not. To build a habit, make it obvious, easy, and rewarding. To break one, add friction—hide the trigger, raise the effort. You don't rise to your goals; you fall to your systems, so build systems worth falling into."},
  {"id":"rc_money3","title":"賢いお金の使い方","level":"B1","text":"Spending on things rarely brings lasting joy; spending on experiences often does. A new gadget thrills for a week, then fades into the background. A trip or a shared meal becomes a memory you revisit for years. Buy moments more than objects."},
  {"id":"rc_teamwork2","title":"信頼を築く","level":"B2","text":"Trust is built in small moments, not grand gestures. Do what you said you would. Admit when you're wrong. Give credit generously and take blame readily. These habits cost little day to day, yet over time they make you someone others rely on."},
  {"id":"rc_change3","title":"不確実性に備える","level":"B2","text":"No plan survives contact with reality intact. The skill is not to predict perfectly but to adapt quickly. Keep some slack in your schedule, some savings in reserve, and some humility about what you don't know. Flexibility beats forecasting."},
  {"id":"rc_focus4","title":"注意を守る","level":"B2","text":"Attention is now the scarcest resource, and everything is designed to take it. Each notification fractures your focus and costs minutes to recover. Protect deep work like a budget: schedule it, silence interruptions, and treat that time as non-negotiable."},
  {"id":"rc_decision4","title":"決断を下す","level":"B2","text":"Indecision is itself a decision, usually the worst one. Gather enough information to be reasonable, not perfect, then commit. Most choices can be adjusted later. Waiting for certainty wastes the very time that could be spent learning from action."},
  {"id":"rc_growth3","title":"学び続ける","level":"B1","text":"The moment you think you know enough, you stop growing. The most capable people stay curious and treat every project as a chance to learn something new. Skills fade if unused, but a habit of learning compounds, quietly making you better year after year."},
  {"id":"rc_kindness3","title":"親切が返ってくる","level":"B1","text":"Kindness is rarely wasted, even when it seems to vanish. A small gesture can change someone's whole day, and that ripple spreads further than you'll ever see. You may never get thanked, but the habit shapes you into the kind of person worth being."},
  {"id":"rc_stress3","title":"ストレスと共に生きる","level":"B2","text":"Stress isn't the problem; the absence of recovery is. Short bursts of pressure can sharpen you, but without rest they wear you down. Treat recovery as part of performance, not a reward for it. Even athletes know the gains happen during rest."},
  {"id":"rc_simplicity3","title":"シンプルに保つ","level":"B2","text":"Complexity is easy to add and hard to remove. Every feature, rule, or step you add has a hidden cost others must carry. Before adding, ask what you could take away instead. The best solutions often look obvious only after someone did the hard work of simplifying."},
  {"id":"rc_sleep3","title":"睡眠を整える","level":"B1","text":"Your body craves rhythm. Going to bed and waking at the same time, even on weekends, steadies your internal clock. Light is the strongest signal: bright mornings and dim evenings tell your body when to be alert and when to wind down."},
  {"id":"rc_public3","title":"堂々と話す","level":"B2","text":"The audience wants you to succeed; they're not your enemy. Nerves shrink when you focus outward, on serving the listener, rather than inward, on judging yourself. Prepare your opening cold, breathe before you start, and remember: they came to hear the message, not to grade you."},
  {"id":"rc_negotiate3","title":"交渉でまとめる","level":"B2","text":"Behind every demand is a need. A skilled negotiator listens past the position to the interest beneath it. 'I need this price' may really mean 'I need to look good to my boss.' Solve the real need, and rigid demands often soften on their own."},
  {"id":"rc_curiosity3","title":"問い続ける","level":"B1","text":"Curiosity fades not because the world runs out of mysteries but because we stop noticing them. The cure is simple: ask 'why' about one ordinary thing each day. Why is the sky blue? Why do we shake hands? Wonder is a muscle, and questions keep it strong."},
  {"id":"rc_failure3","title":"失敗を糧にする","level":"B2","text":"A failure you examine becomes data; a failure you bury becomes a habit. The instinct is to move on quickly and forget the discomfort. Resist it. Ask plainly what went wrong and what you'd change. The lesson is worth far more than the lost effort it cost."},
  {"id":"rc_attention3","title":"集中を選ぶ","level":"B1","text":"Where your attention goes, your energy flows. Spend it on outrage and you feel drained; spend it on creation and you feel alive. You can't control every demand on your focus, but you can choose, again and again, what deserves a place in your mind."},
  {"id":"rc_comparison3","title":"比較から自由になる","level":"B2","text":"Comparison steals joy quietly. Online, you see others' highlights against your own behind-the-scenes, and the math never favors you. A fairer measure is your past self. Progress against yesterday is real and within reach; ranking against strangers is mostly illusion."},
  {"id":"rc_rest3","title":"休む技術","level":"B1","text":"Resting well is a skill, not a default. Scrolling a phone tires the mind as much as work does. True rest restores: a walk, a nap, time with people you love, or simply doing nothing. Schedule it on purpose, or the busy world will fill every gap for you."},
  {"id":"rc_question3","title":"良い問いを立てる","level":"B2","text":"The answer you get depends on the question you ask. 'Why am I so unproductive?' invites excuses; 'What one change would help most?' invites action. Sharpen the question and the path forward often appears. A precise question already contains half its answer."},
  {"id":"rc_creativity3","title":"創造を生む","level":"B2","text":"Originality is mostly recombination. New ideas come from old ones colliding in unexpected ways, so feed your mind widely—read outside your field, talk to different people, keep a notebook of fragments. The more varied the inputs, the more surprising the outputs."},
  {"id":"rc_patience3","title":"忍耐を養う","level":"B1","text":"We overrate fast results and underrate slow ones. A skill practiced daily, a friendship tended over years, a tree planted long ago—these reward patience, not haste. Do the small work today and trust it to add up. Most lasting things grow quietly, out of sight."},
  {"id":"rc_honesty3","title":"誠実でいる","level":"B2","text":"Honesty is costly in the moment but cheap over a lifetime. Each small lie demands a memory and a follow-up; the truth needs neither. Telling it, even when awkward, frees you from that quiet burden and earns the one thing you can't buy back once lost: trust."},
  {"id":"rc_email4","title":"効果的なメール","level":"B2","text":"A reader skims; write for that. Lead with the request, not the windup. Put the deadline where it can't be missed. One clear ask beats three vague ones. If your email needs a second read to be understood, it needed a rewrite before you sent it."},
  {"id":"rc_learn4","title":"効果的に学ぶ","level":"B2","text":"Rereading feels productive but builds little. Testing yourself feels harder because it is—and that difficulty is exactly what strengthens memory. Struggle a little before checking. Space your practice over days, not hours. Comfort is the enemy of durable learning."},
  {"id":"rc_goals2","title":"目標を立てる","level":"B1","text":"A goal you can't picture, you can't pursue. 'Be healthier' is a wish; 'walk thirty minutes after dinner' is a plan. The clearer and smaller the first step, the sooner you start—and starting, far more than planning, is what builds real momentum over time."}
]);
Object.assign(window.EigoData.readingNotes, {
  "rc_meeting2": {"ja":"多くの会議が長引くのは、時間を管理する人がいないからです。明確な議題、時間係、厳格な終了時刻がすべてを変えます。誰が何をいつまでにやるかで締めくくりましょう。行動項目のない会議は、たいていメールで済んだものです。","vocab":[{"en":"agenda","ja":"議題"},{"en":"timekeeper","ja":"時間係"},{"en":"hard stop","ja":"厳格な終了時刻"},{"en":"in disguise","ja":"変装した"}],"grammar":[{"point":"who does what by when","ja":"間接疑問の連続。"},{"point":"A meeting without … was usually …","ja":"無生物主語。"}]},
  "rc_feedback4": {"ja":"曖昧な称賛は心地よいですが、何も教えません。有益なフィードバックは具体的で、タイムリーで、人格ではなく行動に結びついています。『話しすぎる』ではなく『導入が長かった』と言いましょう。人は自分が何をしたかを、自分が何者かよりずっと簡単に変えられます。","vocab":[{"en":"vague","ja":"曖昧な"},{"en":"timely","ja":"タイムリーな"},{"en":"behavior","ja":"行動"},{"en":"character","ja":"人格"}],"grammar":[{"point":"tied to A, not B","ja":"対比。"},{"point":"what they did … who they are","ja":"関係詞 what の対比。"}]},
  "rc_priorities2": {"ja":"すべてが緊急に感じられますが、本当に重要なものはわずかです。罠は、最も価値あるタスクではなく、最も声の大きいタスクを勝たせることです。毎朝、その日を成功にする一つのタスクを選び、雑音が始まる前にそのための時間を守りましょう。","vocab":[{"en":"urgent","ja":"緊急の"},{"en":"trap","ja":"罠"},{"en":"valuable","ja":"価値ある"},{"en":"noise","ja":"雑音"}],"grammar":[{"point":"the loudest … instead of the most valuable","ja":"対比。"},{"point":"that would make the day a success","ja":"関係代名詞 that。"}]},
  "rc_listening3": {"ja":"私たちはしばしば理解するためでなく、返答するために聞きます。その違いは表れます。一方は話すための間を待ち、もう一方はより深くに踏み込む質問をします。本物の傾聴は稀で、心を開かせます。人は聞いてもらえたと感じると、リラックスし、心を開き、より信頼します。","vocab":[{"en":"reply","ja":"返答する"},{"en":"disarming","ja":"警戒を解く"},{"en":"heard","ja":"聞いてもらえた"},{"en":"open up","ja":"心を開く"}],"grammar":[{"point":"to reply, not to understand","ja":"目的の対比。"},{"point":"a question that goes deeper","ja":"関係代名詞 that。"}]},
  "rc_writing2": {"ja":"良い文章はほとんどが書き直しです。最初の草稿は削るために存在します。働いていない語、繰り返す文をすべて取り除きましょう。声に出して読み、つまずくなら読み手もつまずきます。明快さは、向こう側にいる人に贈る親切です。","vocab":[{"en":"draft","ja":"草稿"},{"en":"cut","ja":"削る"},{"en":"stumble","ja":"つまずく"},{"en":"clarity","ja":"明快さ"}],"grammar":[{"point":"exists to be cut","ja":"be + to不定詞の受動。"},{"point":"if you stumble, so will the reader","ja":"so + 倒置。"}]},
  "rc_habits3": {"ja":"意志力は当てになりませんが、設計はそうではありません。習慣を作るには、明白で、簡単で、報われるものにします。習慣を断つには、摩擦を加えます。きっかけを隠し、手間を増やすのです。人は目標まで上がるのではなく、仕組みまで落ちます。だから落ちる価値のある仕組みを作りましょう。","vocab":[{"en":"unreliable","ja":"当てにならない"},{"en":"friction","ja":"摩擦"},{"en":"trigger","ja":"きっかけ"},{"en":"systems","ja":"仕組み"}],"grammar":[{"point":"You don't rise … you fall …","ja":"対比。"},{"point":"worth falling into","ja":"worth + 動名詞。"}]},
  "rc_money3": {"ja":"物にお金を使っても永続的な喜びはめったに得られませんが、経験に使えばしばしば得られます。新しい機器は1週間わくわくさせ、やがて背景に消えます。旅行や食事の共有は、何年も思い返す記憶になります。物よりも瞬間を買いましょう。","vocab":[{"en":"lasting","ja":"永続的な"},{"en":"gadget","ja":"機器"},{"en":"fade","ja":"消える"},{"en":"revisit","ja":"思い返す"}],"grammar":[{"point":"rarely … ; often …","ja":"対比のセミコロン。"},{"point":"a memory you revisit","ja":"関係詞の省略。"}]},
  "rc_teamwork2": {"ja":"信頼は壮大な行為でなく、小さな瞬間に築かれます。言ったことを実行しましょう。間違ったら認めましょう。功績は惜しみなく与え、非難は進んで引き受けましょう。これらの習慣は日々ほとんど費用がかからないのに、時とともにあなたを他者が頼る人にします。","vocab":[{"en":"grand","ja":"壮大な"},{"en":"admit","ja":"認める"},{"en":"credit","ja":"功績"},{"en":"blame","ja":"非難"}],"grammar":[{"point":"not grand gestures","ja":"対比。"},{"point":"someone others rely on","ja":"関係詞の省略。"}]},
  "rc_change3": {"ja":"現実との接触を無傷で生き延びる計画はありません。技術は完璧に予測することではなく、素早く適応することです。予定にゆとりを、貯蓄に蓄えを、知らないことへの謙虚さを残しましょう。柔軟性は予測に勝ります。","vocab":[{"en":"intact","ja":"無傷で"},{"en":"adapt","ja":"適応する"},{"en":"slack","ja":"ゆとり"},{"en":"humility","ja":"謙虚さ"}],"grammar":[{"point":"not to predict … but to adapt","ja":"not A but B。"},{"point":"what you don't know","ja":"関係詞 what。"}]},
  "rc_focus4": {"ja":"注意は今や最も希少な資源で、あらゆるものがそれを奪うよう設計されています。各通知は集中を砕き、回復に数分かかります。深い仕事を予算のように守りましょう。予定に入れ、中断を消し、その時間を交渉の余地のないものとして扱うのです。","vocab":[{"en":"scarcest","ja":"最も希少な"},{"en":"fracture","ja":"砕く"},{"en":"recover","ja":"回復する"},{"en":"non-negotiable","ja":"交渉の余地のない"}],"grammar":[{"point":"everything is designed to take it","ja":"受動態。"},{"point":"like a budget","ja":"直喩。"}]},
  "rc_decision4": {"ja":"優柔不断はそれ自体が決断で、たいてい最悪のものです。完璧でなく妥当である程度の情報を集め、それから決断しましょう。たいていの選択は後で調整できます。確実性を待つことは、行動から学ぶのに使えるはずの時間を無駄にします。","vocab":[{"en":"indecision","ja":"優柔不断"},{"en":"reasonable","ja":"妥当な"},{"en":"commit","ja":"決断する"},{"en":"certainty","ja":"確実性"}],"grammar":[{"point":"Indecision is itself a decision","ja":"強調の itself。"},{"point":"the very time that could be spent","ja":"関係代名詞 that。"}]},
  "rc_growth3": {"ja":"もう十分知っていると思った瞬間、成長は止まります。最も有能な人々は好奇心を保ち、あらゆるプロジェクトを何か新しいことを学ぶ機会として扱います。技能は使わなければ衰えますが、学ぶ習慣は積み重なり、年々静かにあなたを向上させます。","vocab":[{"en":"capable","ja":"有能な"},{"en":"curious","ja":"好奇心のある"},{"en":"fade","ja":"衰える"},{"en":"compound","ja":"積み重なる"}],"grammar":[{"point":"The moment you think …","ja":"接続詞的な the moment。"},{"point":"if unused","ja":"分詞構文の省略。"}]},
  "rc_kindness3": {"ja":"親切はめったに無駄になりません。消えたように見えてもです。小さな行為が誰かの一日全体を変え、その波紋はあなたが決して見られないほど遠くまで広がります。感謝されないかもしれませんが、その習慣はあなたを、なる価値のある人柄に形作ります。","vocab":[{"en":"vanish","ja":"消える"},{"en":"gesture","ja":"行為"},{"en":"ripple","ja":"波紋"},{"en":"shape","ja":"形作る"}],"grammar":[{"point":"even when it seems to vanish","ja":"譲歩。"},{"point":"the kind of person worth being","ja":"worth + 動名詞。"}]},
  "rc_stress3": {"ja":"ストレスが問題なのではなく、回復の欠如が問題です。短い圧力の波はあなたを研ぎ澄ますことができますが、休息がなければすり減らします。回復を、業績への報酬でなく業績の一部として扱いましょう。アスリートでさえ、向上は休息中に起こると知っています。","vocab":[{"en":"absence","ja":"欠如"},{"en":"burst","ja":"波"},{"en":"wear down","ja":"すり減らす"},{"en":"recovery","ja":"回復"}],"grammar":[{"point":"not the problem; … is","ja":"対比のセミコロン。"},{"point":"not a reward for it","ja":"対比。"}]},
  "rc_simplicity3": {"ja":"複雑さは加えるのは簡単で、取り除くのは難しいものです。加える機能、規則、手順のすべてに、他者が背負わねばならない隠れた代償があります。加える前に、代わりに何を取り除けるかを問いましょう。最良の解決策は、誰かが単純化する難しい作業をした後でのみ、当たり前に見えることが多いのです。","vocab":[{"en":"complexity","ja":"複雑さ"},{"en":"feature","ja":"機能"},{"en":"hidden cost","ja":"隠れた代償"},{"en":"simplify","ja":"単純化する"}],"grammar":[{"point":"easy to add and hard to remove","ja":"対比。"},{"point":"only after someone did …","ja":"強調の only。"}]},
  "rc_sleep3": {"ja":"体はリズムを欲します。週末でも同じ時間に寝起きすることが体内時計を安定させます。光は最も強い信号です。明るい朝と暗い夜が、いつ覚醒し、いつ落ち着くべきかを体に伝えます。","vocab":[{"en":"crave","ja":"欲する"},{"en":"steady","ja":"安定させる"},{"en":"alert","ja":"覚醒した"},{"en":"wind down","ja":"落ち着く"}],"grammar":[{"point":"even on weekends","ja":"譲歩。"},{"point":"when to be alert and when to wind down","ja":"間接疑問の連続。"}]},
  "rc_public3": {"ja":"聴衆はあなたの成功を願っています。彼らは敵ではありません。自分を裁くという内向きでなく、聞き手に尽くすという外向きに集中すると、緊張は縮みます。冒頭をしっかり準備し、始める前に呼吸し、覚えておきましょう。彼らはメッセージを聞きに来たのであり、あなたを採点しに来たのではありません。","vocab":[{"en":"audience","ja":"聴衆"},{"en":"nerves","ja":"緊張"},{"en":"outward","ja":"外向きに"},{"en":"grade","ja":"採点する"}],"grammar":[{"point":"outward … rather than inward","ja":"対比。"},{"point":"not to grade you","ja":"対比。"}]},
  "rc_negotiate3": {"ja":"あらゆる要求の背後には必要があります。熟練した交渉者は立場を越えて、その下にある利益に耳を傾けます。『この価格が必要だ』は実は『上司に良く見られたい』を意味するかもしれません。本当の必要を解決すれば、硬い要求はしばしばひとりでに和らぎます。","vocab":[{"en":"demand","ja":"要求"},{"en":"position","ja":"立場"},{"en":"interest","ja":"利益"},{"en":"soften","ja":"和らぐ"}],"grammar":[{"point":"Behind every demand is a need","ja":"倒置。"},{"point":"the interest beneath it","ja":"前置詞句の後置修飾。"}]},
  "rc_curiosity3": {"ja":"好奇心が薄れるのは、世界が謎を切らすからでなく、私たちが気づくのをやめるからです。治療は単純です。毎日一つの普通のことについて『なぜ』と尋ねるのです。なぜ空は青いのか。なぜ握手するのか。驚きは筋肉であり、問いがそれを強く保ちます。","vocab":[{"en":"fade","ja":"薄れる"},{"en":"mystery","ja":"謎"},{"en":"ordinary","ja":"普通の"},{"en":"wonder","ja":"驚き"}],"grammar":[{"point":"not because … but because …","ja":"not A but B。"},{"point":"Wonder is a muscle","ja":"隠喩。"}]},
  "rc_failure3": {"ja":"検証する失敗はデータになり、葬る失敗は習慣になります。本能はすぐ次へ進み、不快さを忘れることです。それに抵抗しましょう。何が悪かったか、何を変えるかを率直に問いましょう。その教訓は、それが費やした失われた労力よりはるかに価値があります。","vocab":[{"en":"examine","ja":"検証する"},{"en":"bury","ja":"葬る"},{"en":"instinct","ja":"本能"},{"en":"discomfort","ja":"不快さ"}],"grammar":[{"point":"A failure you examine … ; a failure you bury …","ja":"対比。"},{"point":"worth far more than …","ja":"比較級の強調。"}]},
  "rc_attention3": {"ja":"注意が向かう先に、エネルギーが流れます。怒りに使えば消耗し、創造に使えば生き生きします。集中へのあらゆる要求を制御することはできませんが、何が心に居場所を得るに値するかを、何度でも選ぶことができます。","vocab":[{"en":"attention","ja":"注意"},{"en":"drained","ja":"消耗した"},{"en":"creation","ja":"創造"},{"en":"deserve","ja":"値する"}],"grammar":[{"point":"Where … goes, … flows","ja":"関係副詞 where。"},{"point":"what deserves a place","ja":"関係詞 what。"}]},
  "rc_comparison3": {"ja":"比較は静かに喜びを奪います。オンラインでは、自分の舞台裏に対して他人のハイライトを見ることになり、計算は決してあなたに有利になりません。より公平な基準は過去の自分です。昨日に対する前進は本物で手の届く範囲にあり、他人との順位はほとんど錯覚です。","vocab":[{"en":"steal","ja":"奪う"},{"en":"highlight","ja":"良いところ"},{"en":"measure","ja":"基準"},{"en":"illusion","ja":"錯覚"}],"grammar":[{"point":"the math never favors you","ja":"無生物主語。"},{"point":"within reach","ja":"『手の届く範囲』。"}]},
  "rc_rest3": {"ja":"上手に休むのは技術であり、初期設定ではありません。スマホをスクロールすることは、仕事と同じくらい心を疲れさせます。本当の休息は回復させます。散歩、昼寝、愛する人との時間、あるいは単に何もしないこと。意図して予定に入れましょう。さもなければ忙しい世界がすべての隙間を埋めてしまいます。","vocab":[{"en":"default","ja":"初期設定"},{"en":"scroll","ja":"スクロールする"},{"en":"restore","ja":"回復させる"},{"en":"on purpose","ja":"意図的に"}],"grammar":[{"point":"as much as work does","ja":"as … as 構文。"},{"point":"the busy world will fill every gap","ja":"無生物主語。"}]},
  "rc_question3": {"ja":"得る答えは、尋ねる問いに左右されます。『なぜこんなに非生産的なのか』は言い訳を招き、『最も役立つ一つの変化は何か』は行動を招きます。問いを研げば、前進の道がしばしば現れます。的確な問いはすでに答えの半分を含んでいます。","vocab":[{"en":"depend on","ja":"左右される"},{"en":"invite","ja":"招く"},{"en":"sharpen","ja":"研ぐ"},{"en":"precise","ja":"的確な"}],"grammar":[{"point":"the question you ask","ja":"関係詞の省略。"},{"point":"What one change would help most","ja":"間接疑問。"}]},
  "rc_creativity3": {"ja":"独創性はほとんど再結合です。新しいアイデアは、古いものが予期せぬ形で衝突することから生まれます。だから心に幅広く栄養を与えましょう。専門外を読み、異なる人々と話し、断片のノートをつけるのです。入力が多様であるほど、出力は驚くべきものになります。","vocab":[{"en":"recombination","ja":"再結合"},{"en":"collide","ja":"衝突する"},{"en":"fragment","ja":"断片"},{"en":"varied","ja":"多様な"}],"grammar":[{"point":"old ones colliding","ja":"現在分詞の後置修飾。"},{"point":"The more …, the more …","ja":"the 比較級構文。"}]},
  "rc_patience3": {"ja":"私たちは速い結果を過大評価し、遅い結果を過小評価します。毎日練習した技能、何年もかけて育てた友情、ずっと前に植えた木。これらは焦りでなく忍耐に報います。今日小さな作業をし、それが積み重なると信じましょう。永続するものの多くは、見えない所で静かに育ちます。","vocab":[{"en":"overrate","ja":"過大評価する"},{"en":"tend","ja":"育てる"},{"en":"haste","ja":"焦り"},{"en":"add up","ja":"積み重なる"}],"grammar":[{"point":"practiced daily","ja":"過去分詞の後置修飾。"},{"point":"out of sight","ja":"『見えない所で』。"}]},
  "rc_honesty3": {"ja":"誠実さはその場では高くつきますが、生涯では安上がりです。小さな嘘の一つ一つが記憶とその後の対応を求めますが、真実はどちらも要しません。気まずくても真実を語ることは、その静かな重荷から解放し、失えば買い戻せない唯一のもの、つまり信頼を得させます。","vocab":[{"en":"costly","ja":"高くつく"},{"en":"follow-up","ja":"その後の対応"},{"en":"awkward","ja":"気まずい"},{"en":"burden","ja":"重荷"}],"grammar":[{"point":"the truth needs neither","ja":"neither の用法。"},{"point":"you can't buy back once lost","ja":"分詞構文の省略。"}]},
  "rc_email4": {"ja":"読み手は流し読みします。それを前提に書きましょう。前置きでなく依頼から始めましょう。締切は見逃せない場所に置きましょう。明確な一つの依頼は、曖昧な三つに勝ります。理解するのに二度読みが必要なメールは、送る前に書き直しが必要だったのです。","vocab":[{"en":"skim","ja":"流し読みする"},{"en":"windup","ja":"前置き"},{"en":"ask","ja":"依頼"},{"en":"rewrite","ja":"書き直し"}],"grammar":[{"point":"Lead with A, not B","ja":"対比。"},{"point":"where it can't be missed","ja":"関係副詞 where。"}]},
  "rc_learn4": {"ja":"再読は生産的に感じますが、ほとんど身につきません。自分を試すのはより難しく感じます。実際そうだからで、その難しさこそが記憶を強化します。確認する前に少し苦しみましょう。練習は数時間でなく数日にわたって間隔をあけましょう。快適さは永続的な学びの敵です。","vocab":[{"en":"reread","ja":"再読する"},{"en":"strengthen","ja":"強化する"},{"en":"space","ja":"間隔をあける"},{"en":"durable","ja":"永続的な"}],"grammar":[{"point":"because it is","ja":"省略（harder than it feels）。"},{"point":"what strengthens memory","ja":"関係詞 what。"}]},
  "rc_goals2": {"ja":"思い描けない目標は、追求できません。『もっと健康に』は願いで、『夕食後に30分歩く』は計画です。最初の一歩が明確で小さいほど、早く始められます。そして計画よりはるかに、始めることこそが、時とともに本当の勢いを生みます。","vocab":[{"en":"picture","ja":"思い描く"},{"en":"pursue","ja":"追求する"},{"en":"wish","ja":"願い"},{"en":"momentum","ja":"勢い"}],"grammar":[{"point":"A goal you can't picture, you can't pursue","ja":"目的語の前置。"},{"point":"far more than planning","ja":"挿入の比較。"}]}
});

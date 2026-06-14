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

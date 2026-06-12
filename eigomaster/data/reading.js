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

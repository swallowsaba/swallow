/* ============================================================
   data/words.js — 単語教材（NGSL＋ビジネス頻出語のサンプル）
   各語：{ id, en, pos(品詞), ipa, kata(参考カタカナ), ja(訳), ex(例文), exja(例文訳), level }
   fetch の CORS を避けるため window.EigoData に直接登録する。
   構造は拡張可能。実運用では同形式で語数を増やせる。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.words = [
  // ---- A1 ----
  { id: "w_time",    en: "time",      pos: "noun", ipa: "/taɪm/",       kata: "タイム",      ja: "時間",        ex: "Do you have time now?",            exja: "今お時間ありますか？", level: "A1" },
  { id: "w_people",  en: "people",    pos: "noun", ipa: "/ˈpiːpəl/",    kata: "ピープォ",    ja: "人々",        ex: "Many people joined the meeting.",  exja: "多くの人が会議に参加した。", level: "A1" },
  { id: "w_work",    en: "work",      pos: "verb", ipa: "/wɜːrk/",      kata: "ワーク",      ja: "働く・仕事",  ex: "I work from home on Fridays.",     exja: "金曜は在宅で働く。", level: "A1" },
  { id: "w_help",    en: "help",      pos: "verb", ipa: "/help/",       kata: "ヘォプ",      ja: "助ける",      ex: "How can I help you?",              exja: "どうされましたか？", level: "A1" },
  { id: "w_call",    en: "call",      pos: "verb", ipa: "/kɔːl/",       kata: "コーォ",      ja: "電話する",    ex: "I'll call you back later.",        exja: "あとで折り返します。", level: "A1" },
  { id: "w_send",    en: "send",      pos: "verb", ipa: "/send/",       kata: "センド",      ja: "送る",        ex: "Please send me the file.",         exja: "ファイルを送ってください。", level: "A1" },
  { id: "w_team",    en: "team",      pos: "noun", ipa: "/tiːm/",       kata: "ティーム",    ja: "チーム",      ex: "Our team is small but fast.",      exja: "私たちのチームは小さいが速い。", level: "A1" },
  { id: "w_week",    en: "week",      pos: "noun", ipa: "/wiːk/",       kata: "ウィーク",    ja: "週",          ex: "See you next week.",               exja: "また来週。", level: "A1" },

  // ---- A2 ----
  { id: "w_meeting", en: "meeting",   pos: "noun", ipa: "/ˈmiːtɪŋ/",    kata: "ミーティン",  ja: "会議",        ex: "Let's set up a meeting tomorrow.", exja: "明日、会議を設定しましょう。", level: "A2" },
  { id: "w_report",  en: "report",    pos: "noun", ipa: "/rɪˈpɔːrt/",   kata: "リポート",    ja: "報告書",      ex: "I finished the monthly report.",   exja: "月次報告書を仕上げた。", level: "A2" },
  { id: "w_decide",  en: "decide",    pos: "verb", ipa: "/dɪˈsaɪd/",    kata: "ディサイド",  ja: "決める",      ex: "We need to decide today.",         exja: "今日中に決める必要がある。", level: "A2" },
  { id: "w_agree",   en: "agree",     pos: "verb", ipa: "/əˈɡriː/",     kata: "アグリー",    ja: "同意する",    ex: "I agree with your point.",         exja: "あなたの意見に賛成です。", level: "A2" },
  { id: "w_provide", en: "provide",   pos: "verb", ipa: "/prəˈvaɪd/",   kata: "プロヴァイド", ja: "提供する",    ex: "We provide 24-hour support.",      exja: "24時間サポートを提供します。", level: "A2" },
  { id: "w_client",  en: "client",    pos: "noun", ipa: "/ˈklaɪənt/",   kata: "クライアン",  ja: "顧客",        ex: "The client liked our proposal.",   exja: "顧客は提案を気に入った。", level: "A2" },
  { id: "w_budget",  en: "budget",    pos: "noun", ipa: "/ˈbʌdʒɪt/",    kata: "バジェッ",    ja: "予算",        ex: "The budget is tight this quarter.", exja: "今四半期は予算が厳しい。", level: "A2" },
  { id: "w_offer",   en: "offer",     pos: "verb", ipa: "/ˈɔːfər/",     kata: "オファー",    ja: "申し出る",    ex: "They offered a better price.",     exja: "彼らはより良い価格を提示した。", level: "A2" },

  // ---- B1 ----
  { id: "w_schedule",en: "schedule",  pos: "noun", ipa: "/ˈskedʒuːl/",  kata: "スケジューォ",ja: "予定",        ex: "Let's check the schedule.",        exja: "予定を確認しましょう。", level: "B1" },
  { id: "w_approve", en: "approve",   pos: "verb", ipa: "/əˈpruːv/",    kata: "アプルーヴ",  ja: "承認する",    ex: "The manager approved the plan.",   exja: "上司が計画を承認した。", level: "B1" },
  { id: "w_deadline",en: "deadline",  pos: "noun", ipa: "/ˈdedlaɪn/",   kata: "デッドライン",ja: "締め切り",    ex: "We can't miss the deadline.",      exja: "締め切りは外せない。", level: "B1" },
  { id: "w_invoice", en: "invoice",   pos: "noun", ipa: "/ˈɪnvɔɪs/",    kata: "インヴォイス",ja: "請求書",      ex: "Please review the invoice.",       exja: "請求書をご確認ください。", level: "B1" },
  { id: "w_estimate",en: "estimate",  pos: "noun", ipa: "/ˈestɪmət/",   kata: "エスティメッ",ja: "見積もり",    ex: "Can you send an estimate?",        exja: "見積もりを送ってもらえますか？", level: "B1" },
  { id: "w_feedback",en: "feedback",  pos: "noun", ipa: "/ˈfiːdbæk/",   kata: "フィードバッ",ja: "意見・評価",  ex: "Thanks for the honest feedback.",  exja: "率直な意見をありがとう。", level: "B1" },
  { id: "w_assign",  en: "assign",    pos: "verb", ipa: "/əˈsaɪn/",     kata: "アサイン",    ja: "割り当てる",  ex: "I'll assign this task to Mei.",    exja: "このタスクはメイに任せます。", level: "B1" },
  { id: "w_revenue", en: "revenue",   pos: "noun", ipa: "/ˈrevənuː/",   kata: "レヴェニュー",ja: "売上・収益",  ex: "Revenue grew ten percent.",        exja: "売上は10%伸びた。", level: "B1" },

  // ---- B2 ----
  { id: "w_negotiate",en:"negotiate", pos: "verb", ipa: "/nɪˈɡoʊʃieɪt/",kata: "ニゴウシエイ",ja: "交渉する",    ex: "We negotiated a longer contract.", exja: "より長い契約を交渉した。", level: "B2" },
  { id: "w_leverage",en: "leverage",  pos: "verb", ipa: "/ˈlevərɪdʒ/",  kata: "レヴァリッジ",ja: "活用する",    ex: "Let's leverage our network.",      exja: "人脈を活用しよう。", level: "B2" },
  { id: "w_align",   en: "align",     pos: "verb", ipa: "/əˈlaɪn/",     kata: "アライン",    ja: "足並みを揃える",ex: "We should align on the goals.",   exja: "目標について認識を合わせよう。", level: "B2" },
  { id: "w_streamline",en:"streamline",pos:"verb", ipa: "/ˈstriːmlaɪn/",kata: "ストリームライン",ja:"効率化する",ex: "We streamlined the process.",     exja: "工程を効率化した。", level: "B2" },
  { id: "w_stakeholder",en:"stakeholder",pos:"noun",ipa:"/ˈsteɪkhoʊldər/",kata:"ステイクホウルダー",ja:"利害関係者",ex:"Keep stakeholders informed.",   exja: "関係者に情報共有を。", level: "B2" },
  { id: "w_prioritize",en:"prioritize",pos:"verb", ipa:"/praɪˈɔːrətaɪz/",kata:"プライオリタイズ",ja:"優先順位をつける",ex:"Let's prioritize the bugs.",  exja: "バグの優先順位をつけよう。", level: "B2" },
  { id: "w_overhead",en: "overhead",  pos: "noun", ipa: "/ˈoʊvərhed/",  kata: "オウヴァヘッ",ja: "間接費・諸経費",ex:"We cut overhead costs.",         exja: "間接費を削減した。", level: "B2" },

  // ---- C1 ----
  { id: "w_contingency",en:"contingency",pos:"noun",ipa:"/kənˈtɪndʒənsi/",kata:"カンティンジェンシー",ja:"不測の事態",ex:"We need a contingency plan.", exja:"不測の事態への計画が必要だ。", level:"C1" },
  { id: "w_synergy", en: "synergy",   pos: "noun", ipa: "/ˈsɪnərdʒi/",  kata: "シナジー",    ja: "相乗効果",    ex: "The merger created synergy.",      exja: "合併は相乗効果を生んだ。", level: "C1" },
  { id: "w_mitigate",en: "mitigate",  pos: "verb", ipa: "/ˈmɪtɪɡeɪt/",  kata: "ミティゲイト",ja: "緩和する",    ex: "We can mitigate the risk.",        exja: "リスクを緩和できる。", level: "C1" },
  { id: "w_robust",  en: "robust",    pos: "adj",  ipa: "/roʊˈbʌst/",   kata: "ロウバスト",  ja: "頑健な",      ex: "We built a robust system.",        exja: "頑健なシステムを作った。", level: "C1" },
  { id: "w_outset",  en: "outset",    pos: "noun", ipa: "/ˈaʊtset/",    kata: "アウトセッ",  ja: "最初",        ex: "Clear from the outset.",           exja: "最初から明確に。", level: "C1" }
];

/* ---- 増補セット：日常・ビジネス頻出語を追加（同形式で更に拡張可能） ---- */
window.EigoData.words = window.EigoData.words.concat([
  // ---- A1 追加 ----
  { id: "w_today",   en: "today",     pos: "noun", ipa: "/təˈdeɪ/",     kata: "トゥデイ",    ja: "今日",       ex: "Can we talk today?",                exja: "今日話せますか？", level: "A1" },
  { id: "w_email",   en: "email",     pos: "noun", ipa: "/ˈiːmeɪl/",    kata: "イーメイォ",  ja: "メール",     ex: "I'll send you an email.",           exja: "メールを送ります。", level: "A1" },
  { id: "w_ask",     en: "ask",       pos: "verb", ipa: "/æsk/",        kata: "アスク",      ja: "尋ねる",     ex: "Can I ask a question?",             exja: "質問してもいいですか？", level: "A1" },
  { id: "w_start",   en: "start",     pos: "verb", ipa: "/stɑːrt/",     kata: "スタート",    ja: "始める",     ex: "Let's start the meeting.",          exja: "会議を始めましょう。", level: "A1" },
  { id: "w_finish",  en: "finish",    pos: "verb", ipa: "/ˈfɪnɪʃ/",     kata: "フィニッシュ",ja: "終える",     ex: "I'll finish it by noon.",           exja: "昼までに終えます。", level: "A1" },
  { id: "w_money",   en: "money",     pos: "noun", ipa: "/ˈmʌni/",      kata: "マニー",      ja: "お金",       ex: "How much money do we need?",        exja: "いくら必要ですか？", level: "A1" },
  { id: "w_place",   en: "place",     pos: "noun", ipa: "/pleɪs/",      kata: "プレイス",    ja: "場所",       ex: "This is a good place to meet.",     exja: "ここは集合に良い場所だ。", level: "A1" },
  { id: "w_question",en: "question",  pos: "noun", ipa: "/ˈkwestʃən/",  kata: "クエスチョン",ja: "質問",       ex: "That's a good question.",           exja: "良い質問ですね。", level: "A1" },
  { id: "w_answer",  en: "answer",    pos: "noun", ipa: "/ˈænsər/",     kata: "アンサー",    ja: "答え",       ex: "I don't know the answer yet.",      exja: "まだ答えが分かりません。", level: "A1" },
  { id: "w_buy",     en: "buy",       pos: "verb", ipa: "/baɪ/",        kata: "バイ",        ja: "買う",       ex: "We need to buy new chairs.",        exja: "新しい椅子を買う必要がある。", level: "A1" },
  { id: "w_open",    en: "open",      pos: "verb", ipa: "/ˈoʊpən/",     kata: "オウプン",    ja: "開く",       ex: "Please open the file.",             exja: "ファイルを開いてください。", level: "A1" },
  { id: "w_phone",   en: "phone",     pos: "noun", ipa: "/foʊn/",       kata: "フォウン",    ja: "電話",       ex: "My phone is on the desk.",          exja: "電話は机の上にある。", level: "A1" },

  // ---- A2 追加 ----
  { id: "w_customer",en: "customer",  pos: "noun", ipa: "/ˈkʌstəmər/",  kata: "カスタマー",  ja: "客",         ex: "The customer is always busy.",      exja: "その客はいつも忙しい。", level: "A2" },
  { id: "w_order",   en: "order",     pos: "noun", ipa: "/ˈɔːrdər/",    kata: "オーダー",    ja: "注文",       ex: "We received a large order.",        exja: "大口の注文を受けた。", level: "A2" },
  { id: "w_deliver", en: "deliver",   pos: "verb", ipa: "/dɪˈlɪvər/",   kata: "デリヴァー",  ja: "届ける",     ex: "We deliver within two days.",       exja: "2日以内にお届けします。", level: "A2" },
  { id: "w_improve", en: "improve",   pos: "verb", ipa: "/ɪmˈpruːv/",   kata: "インプルーヴ",ja: "改善する",   ex: "We want to improve the service.",   exja: "サービスを改善したい。", level: "A2" },
  { id: "w_explain", en: "explain",   pos: "verb", ipa: "/ɪkˈspleɪn/",  kata: "イクスプレイン",ja: "説明する", ex: "Could you explain it again?",       exja: "もう一度説明してもらえますか？", level: "A2" },
  { id: "w_prepare", en: "prepare",   pos: "verb", ipa: "/prɪˈper/",    kata: "プリペア",    ja: "準備する",   ex: "I'll prepare the slides.",          exja: "スライドを準備します。", level: "A2" },
  { id: "w_share",   en: "share",     pos: "verb", ipa: "/ʃer/",        kata: "シェア",      ja: "共有する",   ex: "Please share the document.",        exja: "資料を共有してください。", level: "A2" },
  { id: "w_support", en: "support",   pos: "noun", ipa: "/səˈpɔːrt/",   kata: "サポート",    ja: "支援",       ex: "Thanks for your support.",          exja: "ご支援ありがとうございます。", level: "A2" },
  { id: "w_arrive",  en: "arrive",    pos: "verb", ipa: "/əˈraɪv/",     kata: "アライヴ",    ja: "到着する",   ex: "The goods will arrive on Friday.",  exja: "商品は金曜に届きます。", level: "A2" },
  { id: "w_increase",en: "increase",  pos: "verb", ipa: "/ɪnˈkriːs/",   kata: "インクリース",ja: "増える",     ex: "Sales increased last month.",       exja: "先月、売上が増えた。", level: "A2" },
  { id: "w_reduce",  en: "reduce",    pos: "verb", ipa: "/rɪˈduːs/",    kata: "リドゥース",  ja: "減らす",     ex: "We must reduce costs.",             exja: "コストを減らさなければ。", level: "A2" },
  { id: "w_available",en:"available", pos: "adj",  ipa: "/əˈveɪləbəl/", kata: "アヴェイラボォ",ja:"利用できる", ex: "Are you available at three?",       exja: "3時は空いていますか？", level: "A2" },

  // ---- B1 追加 ----
  { id: "w_confirm", en: "confirm",   pos: "verb", ipa: "/kənˈfɜːrm/",  kata: "コンファーム",ja: "確認する",   ex: "Please confirm the booking.",       exja: "予約をご確認ください。", level: "B1" },
  { id: "w_attach",  en: "attach",    pos: "verb", ipa: "/əˈtætʃ/",     kata: "アタッチ",    ja: "添付する",   ex: "I attached the report.",            exja: "報告書を添付しました。", level: "B1" },
  { id: "w_postpone",en: "postpone",  pos: "verb", ipa: "/poʊstˈpoʊn/", kata: "ポウストポウン",ja:"延期する",  ex: "We postponed the launch.",          exja: "発売を延期した。", level: "B1" },
  { id: "w_proposal",en: "proposal",  pos: "noun", ipa: "/prəˈpoʊzəl/", kata: "プロポウザォ",ja: "提案",       ex: "Your proposal looks great.",        exja: "あなたの提案は素晴らしい。", level: "B1" },
  { id: "w_contract",en: "contract",  pos: "noun", ipa: "/ˈkɑːntrækt/", kata: "コントラクト",ja: "契約",       ex: "We signed the contract.",           exja: "契約に署名した。", level: "B1" },
  { id: "w_apologize",en:"apologize", pos: "verb", ipa: "/əˈpɑːlədʒaɪz/",kata:"アポロジャイズ",ja:"謝罪する",  ex: "I apologize for the delay.",        exja: "遅れて申し訳ありません。", level: "B1" },
  { id: "w_attend",  en: "attend",    pos: "verb", ipa: "/əˈtend/",     kata: "アテンド",    ja: "出席する",   ex: "Can you attend the workshop?",      exja: "研修に出席できますか？", level: "B1" },
  { id: "w_require", en: "require",   pos: "verb", ipa: "/rɪˈkwaɪər/",  kata: "リクワイア",  ja: "必要とする", ex: "This task requires care.",          exja: "この作業は注意が必要だ。", level: "B1" },
  { id: "w_solution",en: "solution",  pos: "noun", ipa: "/səˈluːʃən/",  kata: "ソルーション",ja: "解決策",     ex: "We found a simple solution.",       exja: "簡単な解決策を見つけた。", level: "B1" },
  { id: "w_summary", en: "summary",   pos: "noun", ipa: "/ˈsʌməri/",    kata: "サマリー",    ja: "要約",       ex: "I'll send a short summary.",        exja: "短い要約を送ります。", level: "B1" },
  { id: "w_efficient",en:"efficient", pos: "adj",  ipa: "/ɪˈfɪʃənt/",   kata: "イフィシェント",ja:"効率的な",  ex: "The new process is efficient.",     exja: "新しい工程は効率的だ。", level: "B1" },
  { id: "w_urgent",  en: "urgent",    pos: "adj",  ipa: "/ˈɜːrdʒənt/",  kata: "アージェント",ja: "緊急の",     ex: "This is an urgent request.",        exja: "これは緊急の依頼です。", level: "B1" },

  // ---- B2 追加 ----
  { id: "w_implement",en:"implement", pos: "verb", ipa: "/ˈɪmplɪment/", kata: "インプリメント",ja:"実施する",  ex: "We implemented the new policy.",    exja: "新方針を実施した。", level: "B2" },
  { id: "w_evaluate",en: "evaluate",  pos: "verb", ipa: "/ɪˈvæljueɪt/", kata: "イヴァリュエイト",ja:"評価する",ex: "Let's evaluate the results.",       exja: "結果を評価しよう。", level: "B2" },
  { id: "w_allocate",en: "allocate",  pos: "verb", ipa: "/ˈæləkeɪt/",   kata: "アロケイト",  ja: "配分する",   ex: "We allocated more budget.",         exja: "予算を多めに配分した。", level: "B2" },
  { id: "w_milestone",en:"milestone", pos: "noun", ipa: "/ˈmaɪlstoʊn/", kata: "マイォストウン",ja:"節目",      ex: "We hit a key milestone.",           exja: "重要な節目を達成した。", level: "B2" },
  { id: "w_forecast",en: "forecast",  pos: "noun", ipa: "/ˈfɔːrkæst/",  kata: "フォアキャスト",ja:"予測",      ex: "The sales forecast looks strong.",  exja: "売上予測は好調だ。", level: "B2" },
  { id: "w_outcome", en: "outcome",   pos: "noun", ipa: "/ˈaʊtkʌm/",    kata: "アウトカム",  ja: "成果・結果", ex: "We expect a positive outcome.",     exja: "良い結果を期待している。", level: "B2" },
  { id: "w_insight", en: "insight",   pos: "noun", ipa: "/ˈɪnsaɪt/",    kata: "インサイト",  ja: "洞察",       ex: "The data gave us new insights.",    exja: "データが新しい洞察をくれた。", level: "B2" },
  { id: "w_constraint",en:"constraint",pos:"noun", ipa: "/kənˈstreɪnt/",kata: "コンストレイント",ja:"制約",    ex: "Time is our biggest constraint.",   exja: "時間が最大の制約だ。", level: "B2" },
  { id: "w_facilitate",en:"facilitate",pos:"verb", ipa: "/fəˈsɪlɪteɪt/",kata: "ファシリテイト",ja:"円滑にする",ex:"She facilitated the discussion.",    exja: "彼女が議論を円滑に進めた。", level: "B2" },
  { id: "w_comprehensive",en:"comprehensive",pos:"adj",ipa:"/ˌkɑːmprɪˈhensɪv/",kata:"コンプリヘンシヴ",ja:"包括的な",ex:"We made a comprehensive plan.",exja:"包括的な計画を立てた。", level: "B2" },

  // ---- C1 追加 ----
  { id: "w_leverage_n",en:"feasibility",pos:"noun",ipa:"/ˌfiːzəˈbɪləti/",kata:"フィーザビリティ",ja:"実現可能性",ex:"We ran a feasibility study.",     exja: "実現可能性調査を行った。", level: "C1" },
  { id: "w_discrepancy",en:"discrepancy",pos:"noun",ipa:"/dɪˈskrepənsi/",kata:"ディスクレパンシー",ja:"食い違い",ex:"We found a discrepancy in the data.",exja:"データに食い違いを見つけた。", level: "C1" },
  { id: "w_consolidate",en:"consolidate",pos:"verb",ipa:"/kənˈsɑːlɪdeɪt/",kata:"コンソリデイト",ja:"統合する",ex:"We consolidated the two teams.",   exja: "2チームを統合した。", level: "C1" },
  { id: "w_unprecedented",en:"unprecedented",pos:"adj",ipa:"/ʌnˈpresɪdentɪd/",kata:"アンプレシデンティッド",ja:"前例のない",ex:"Demand grew at an unprecedented pace.",exja:"需要は前例のない速さで伸びた。", level: "C1" },
  { id: "w_scrutinize",en:"scrutinize",pos:"verb",ipa:"/ˈskruːtənaɪz/",kata:"スクルータナイズ",ja:"精査する",ex:"Auditors scrutinized the accounts.",exja:"監査人が帳簿を精査した。", level: "C1" },
  { id: "w_pivotal", en: "pivotal",   pos: "adj",  ipa: "/ˈpɪvətəl/",   kata: "ピヴォタォ",  ja: "極めて重要な",ex:"This quarter is pivotal for us.",   exja: "今四半期は我々にとって極めて重要だ。", level: "C1" }
]);

/* ============================================================
   学習マップ（#/skills）
   ご要望の40項目超のスキルが「どこで学べるか」を一覧で示す。
   各スキルに、対応する画面へのリンク（レッスン内出題か専用画面か）を付ける。
   ============================================================ */
(function () {
  "use strict";

  // group: 表示見出し / items: [スキル名, どこで学ぶか, リンク(任意)]
  var MAP = [
    { group: "総合（流れで反復）", items: [
      ["統合レッスン", "語彙→文法→英作文→聞取→発音→高次スキルを1本で反復", "#/lesson"],
      ["CEFRレベル別学習", "レッスン開始時にA2/B1/B2/C1を選択", "#/lesson"],
      ["アクティブリコール", "レッスンで誤答を列の最後に再出題", "#/lesson"],
      ["間隔反復学習(SRS)", "単語の正誤が自動で復習間隔に反映", "#/vocab"]
    ]},
    { group: "語彙・表現", items: [
      ["語彙(Vocabulary)", "単語：4択／タイピング＋🎤発音チェック", "#/vocab"],
      ["熟語・イディオム", "熟語：4択＋🎤発音チェック", "#/idioms"],
      ["コロケーション", "レッスン内『コロケーション』問題", "#/lesson"],
      ["ビジネス定型表現", "レッスンの会議/メール/交渉コース", "#/lesson"]
    ]},
    { group: "文法・英作文", items: [
      ["文法(Grammar)", "文法レッスン（教科書解説つき）＋レッスン穴埋め", "#/grammar"],
      ["英作文/語順感覚", "レッスン『並べ替え英作文』", "#/lesson"],
      ["瞬間英作文", "レッスン『瞬間英作文』（和文→英文を入力）", "#/lesson"],
      ["チャンク学習", "レッスン『チャンク』問題", "#/lesson"],
      ["精読・英文解釈", "レッスン『精読』問題＋リーディング解説", "#/reading"],
      ["多読(Extensive)", "レッスン『多読』問題＋リーディング", "#/reading"]
    ]},
    { group: "リスニング・音声変化", items: [
      ["リスニング(Listening)", "リスニング：書き取り・内容理解", "#/listening"],
      ["ディクテーション", "リスニングの書き取り＋レッスン", "#/listening"],
      ["リンキング(Linking)", "リンキング：クイズ／解析／ルール", "#/linking"],
      ["リダクション/音声変化", "リンキングの解析タブ＋リスニング解説", "#/linking"],
      ["シャドーイング", "動画シャドーイング（YouTube字幕）", "#/video"],
      ["音読(Reading Aloud)", "リーディングの文タップ再生／発音チェック", "#/reading"]
    ]},
    { group: "発音", items: [
      ["発音(Pronunciation)", "発音チェック（🎤一致率判定）", "#/pron-check"],
      ["フォニックス(Phonics)", "44音素グリッド", "#/phonics"],
      ["アクセント(Word Stress)", "レッスン『アクセント』問題", "#/lesson"],
      ["イントネーション", "レッスン『イントネーション』問題", "#/lesson"],
      ["リズム(Rhythm)", "レッスン『リズム』問題", "#/lesson"],
      ["ダークL(Dark L)", "発音チェック＋リンキングのダークL", "#/pron-check"],
      ["R/L発音区別", "発音チェックのR/Lカテゴリ", "#/pron-check"],
      ["TH発音", "発音チェックのTHカテゴリ", "#/pron-check"]
    ]},
    { group: "ビジネス場面別", items: [
      ["会議英語", "レッスン『会議英語』コース", "#/lesson"],
      ["プレゼンテーション英語", "レッスン『プレゼン英語』コース", "#/lesson"],
      ["メール英語", "レッスン『メール英語』コース", "#/lesson"],
      ["交渉英語", "レッスン『交渉英語』コース", "#/lesson"],
      ["スモールトーク", "レッスン『スモールトーク』コース", "#/lesson"]
    ]},
    { group: "コミュニケーション力", items: [
      ["ディスカッション", "レッスン『ディスカッション』問題", "#/lesson"],
      ["要約力(Summarization)", "レッスン『要約』問題", "#/lesson"],
      ["パラフレーズ", "レッスン『言い換え』問題", "#/lesson"],
      ["異文化コミュニケーション", "レッスン『異文化』問題", "#/lesson"],
      ["英語思考", "レッスン『英語思考』問題", "#/lesson"],
      ["即答力(Response Speed)", "レッスン『即答』問題", "#/lesson"],
      ["質問力(Questioning)", "レッスン『質問力』問題", "#/lesson"],
      ["スピーキング(Speaking)", "レッスン『発音』＋各🎤、発音チェック", "#/pron-check"]
    ]}
  ];

  function render() {
    var html = '<section class="stack-md view-enter">' +
      '<p class="home-hero__eyebrow" style="color:var(--c-ink-soft)">SKILL MAP · 学習マップ</p>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>学べる40以上のスキルと、それぞれ<strong>どこで学べるか</strong>の一覧です。多くは<strong>今日のレッスン</strong>の中で他のスキルと混ざって出題されます。</span></div>' +
      '<a class="cta-card cta-card--big" href="#/lesson"><span class="cta-card__emoji">🎯</span>' +
        '<div class="cta-card__main"><p class="cta-card__title">今日のレッスンを始める</p>' +
        '<p class="cta-card__desc">下のスキルがひとつの流れで反復できます</p></div>' +
        '<span class="cta-card__arrow">→</span></a>';

    MAP.forEach(function (g) {
      html += '<div class="hub-section"><div class="hub-section__head">' +
        '<span class="hub-section__title">' + EM.escapeHtml(g.group) + '</span>' +
        '<span class="hub-section__count">' + g.items.length + '</span></div>' +
        '<div class="hub-list">' +
        g.items.map(function (it) {
          var link = it[2] || "#/lesson";
          return '<a class="skill-row" href="' + link + '">' +
            '<span class="skill-row__main"><span class="skill-row__name">' + EM.escapeHtml(it[0]) + '</span>' +
            '<span class="skill-row__where">' + EM.escapeHtml(it[1]) + '</span></span>' +
            '<span class="hub-row__arrow">›</span></a>';
        }).join("") +
        '</div></div>';
    });

    html += '</section>';
    return { html: html };
  }

  EM.registerView("#/skills", { title: "学習マップ", tab: "learn", render: render });
})();

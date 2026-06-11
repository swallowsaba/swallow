/* ============================================================
   diagnosis.js — レベル診断（#/diagnosis）
   10問の選択式 → 正答数からレベル(A1〜C1)を判定し、profile.level に保存。
   結果に応じた学習パスを提示する。
   ============================================================ */
(function () {
  "use strict";

  var st = { idx: 0, correct: 0, started: false };

  // 正答数 → レベルと助言
  var BANDS = [
    { min: 9, level: "C1", advice: "高度な語彙と仮定法も安定。シャドーイングとリンキングで自然さを磨き、専門分野の多読に進みましょう。" },
    { min: 7, level: "B2", advice: "実務に必要な土台は十分。発音チェックとリンキングで「通じる」から「自然」へ。B2〜C1の語彙を増やしましょう。" },
    { min: 5, level: "B1", advice: "基礎は固まりつつあります。現在完了・関係詞を復習し、単語SRSとシャドーイングを習慣化しましょう。" },
    { min: 3, level: "A2", advice: "簡単なやり取りはOK。前置詞と冠詞を重点的に、フォニックスで音の基礎も整えましょう。" },
    { min: 0, level: "A1", advice: "ここがスタート地点。単語SRSとフォニックスから始め、短い文の音読を毎日少しずつ。" }
  ];

  function questions() { return (window.EigoData && window.EigoData.diagnosis) || []; }

  function render() {
    return { html: '<section id="diag-root" class="view-enter"></section>', onMount: drawIntro };
  }
  function root() { return document.getElementById("diag-root"); }

  function drawIntro() {
    var saved = Storage.getState().profile.level;
    root().innerHTML =
      '<p class="section-title">レベル診断</p>' +
      '<div class="card"><p style="line-height:var(--lh-base)">10問の選択問題であなたの目安レベル（CEFR A1〜C1）を判定します。所要時間は約2分です。</p>' +
        (saved ? '<div class="kv mt-4"><span class="kv__k">現在の記録</span><span class="kv__v">' + EM.escapeHtml(saved) + "</span></div>" : "") +
      "</div>" +
      '<button class="btn btn--primary btn--block mt-4" id="diag-start" type="button">診断をはじめる</button>';
    document.getElementById("diag-start").addEventListener("click", function () {
      st.idx = 0; st.correct = 0; st.started = true; drawQuestion();
    });
  }

  function drawQuestion() {
    var qs = questions();
    if (st.idx >= qs.length) return drawResult();
    var q = qs[st.idx];
    var pct = Math.round((st.idx / qs.length) * 100);

    root().innerHTML =
      '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
      '<p class="center text-soft" style="font-size:var(--fs-tiny);margin-bottom:var(--space-3)">' + (st.idx + 1) + " / " + qs.length + "</p>" +
      '<div class="card"><p class="flashcard__ja" style="font-size:var(--fs-h2)">' + EM.escapeHtml(q.q) + "</p></div>" +
      '<div class="mt-4" id="diag-opts">' +
        q.options.map(function (o, i) {
          return '<button class="choice-btn" type="button" data-i="' + i + '">' + EM.escapeHtml(o) + "</button>";
        }).join("") +
      "</div>";

    root().querySelectorAll("[data-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var pick = parseInt(b.getAttribute("data-i"), 10);
        var ok = pick === q.answer;
        if (ok) st.correct += 1;
        root().querySelectorAll("[data-i]").forEach(function (x, xi) {
          x.disabled = true;
          if (xi === q.answer) x.classList.add("choice-btn--ok");
          else if (x === b) x.classList.add("choice-btn--ng");
        });
        var next = document.createElement("button");
        next.className = "btn btn--primary btn--block mt-4";
        next.textContent = st.idx + 1 >= qs.length ? "結果を見る" : "次の問題へ";
        next.addEventListener("click", function () { st.idx += 1; drawQuestion(); });
        root().appendChild(next);
      });
    });
  }

  function drawResult() {
    var band = BANDS.find(function (b) { return st.correct >= b.min; });
    Storage.update(function (s) { s.profile.level = band.level; return s; });
    Storage.recordStudy(2);
    Storage.incTotals({ sessions: 1 });
    EM.refreshStreakBadge();

    root().innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state__icon">' + EM.escapeHtml(band.level) + "</div>" +
        '<p class="empty-state__title">あなたの目安レベルは ' + EM.escapeHtml(band.level) + "</p>" +
        '<p class="empty-state__body">' + st.correct + " / " + questions().length + " 問正解</p>" +
      "</div>" +
      '<div class="card"><p class="section-eyebrow">これからの学習パス</p><p style="line-height:var(--lh-base)">' + EM.escapeHtml(band.advice) + "</p></div>" +
      '<a class="btn btn--primary btn--block mt-4" href="#/vocab">単語学習へ</a>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/home">ホームへ戻る</a>';
  }

  EM.registerView("#/diagnosis", { title: "レベル診断", tab: "learn", render: render });
})();

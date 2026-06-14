/* ============================================================
   idioms.js — 熟語・句動詞（#/idioms）
   レベル選択 ＋ 2モード（フラッシュカード / 4択）。単語と同じく SRS で出題。
   カタカナは Katakana.toKatakana で動的生成（データに持たせない）。
   ============================================================ */
(function () {
  "use strict";

  var LEVELS = ["A2", "B1", "B2", "C1"];
  var MODES = [
    { id: "flash", label: "フラッシュ" },
    { id: "quiz", label: "4択" }
  ];
  var SESSION_SIZE = 8;
  var MIN_PER_ITEM = 0.4;

  var st = { level: "A2", mode: "flash", session: [], idx: 0, flipped: false, learnedNew: 0 };

  function pool(level) {
    var all = (window.EigoData && window.EigoData.idioms) || [];
    return all.filter(function (x) { return x.level === level; });
  }
  function kata(phrase) { return window.Katakana ? window.Katakana.toKatakana(phrase) : ""; }

  function render() {
    return { html: '<section id="idioms-root" class="view-enter"></section>', onMount: drawSetup };
  }
  function root() { return document.getElementById("idioms-root"); }

  /* ---------- セットアップ ---------- */
  function drawSetup() {
    var p = pool(st.level);
    var dueCount = p.filter(function (x) { return SRS.getCard(x.id) && SRS.isDue(x.id); }).length;
    var newCount = p.filter(function (x) { return !SRS.getCard(x.id); }).length;

    var levelChips = LEVELS.map(function (lv) {
      return '<button class="chip" type="button" data-level="' + lv + '" aria-pressed="' + (st.level === lv) + '">' + lv + "</button>";
    }).join("");
    var modeChips = MODES.map(function (m) {
      return '<button class="chip" type="button" data-mode="' + m.id + '" aria-pressed="' + (st.mode === m.id) + '">' + m.label + "</button>";
    }).join("");

    root().innerHTML =
      EM.backLink("#/vocab", "単語学習") +
      '<p class="section-title">熟語・句動詞</p>' +
      '<p class="text-soft" style="font-size:var(--fs-small);margin-bottom:var(--space-4)">ビジネスでよく使う句動詞とイディオムを、意味と例文でまとめて覚えます。</p>' +
      '<div class="field"><span class="field__label">レベル</span><div class="chip-group">' + levelChips + "</div></div>" +
      '<div class="field"><span class="field__label">モード</span><div class="chip-group">' + modeChips + "</div></div>" +
      '<div class="card">' +
        '<div class="kv"><span class="kv__k">復習が必要</span><span class="kv__v">' + dueCount + " 件</span></div>" +
        '<div class="kv"><span class="kv__k">未学習</span><span class="kv__v">' + newCount + " 件</span></div>" +
        '<div class="kv"><span class="kv__k">このレベルの総数</span><span class="kv__v">' + p.length + " 件</span></div>" +
      "</div>" +
      '<button class="btn btn--primary btn--block mt-4" id="start-btn" type="button">学習をはじめる（最大' + SESSION_SIZE + "件）</button>";

    root().querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { st.level = b.getAttribute("data-level"); drawSetup(); });
    });
    root().querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { st.mode = b.getAttribute("data-mode"); drawSetup(); });
    });
    document.getElementById("start-btn").addEventListener("click", startSession);
  }

  function startSession() {
    st.session = SRS.buildSession(pool(st.level), SESSION_SIZE);
    if (!st.session.length) { EM.showToast("学習できる項目がありません", true); return; }
    st.idx = 0; st.flipped = false; st.learnedNew = 0;
    drawCard();
  }

  function progressHtml() {
    var pct = Math.round((st.idx / st.session.length) * 100);
    return '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
      '<p class="center text-soft" style="font-size:var(--fs-tiny);margin-bottom:var(--space-3)">' + (st.idx + 1) + " / " + st.session.length + "</p>";
  }

  function drawCard() {
    if (st.idx >= st.session.length) return drawSummary();
    return drawQuiz();
  }

  /* ---------- 4択（熟語→意味） ---------- */
  function drawQuiz() {
    var x = st.session[st.idx];
    var others = pool(st.level).filter(function (y) { return y.id !== x.id; });
    var choices = shuffle(others).slice(0, 3).map(function (y) { return y.ja; });
    choices.push(x.ja);
    choices = shuffle(choices);

    root().innerHTML = progressHtml() +
      '<div class="flashcard" style="min-height:140px">' +
        '<div class="flashcard__pos">' + EM.escapeHtml(x.kind) + "</div>" +
        '<div class="flashcard__word" style="font-size:var(--fs-h1)">' + EM.escapeHtml(x.en) + "</div>" +
        '<div id="id-chip" class="mt-4"></div>' +
        '<div class="center mt-4"><button class="audio-btn" id="say" type="button" aria-label="再生">▶</button> <button class="audio-btn" id="mic" type="button" aria-label="発音チェック">🎤</button></div>' +
      "</div>" +
      '<p class="field__label mt-4">意味として正しいものは？</p>' +
      '<div id="choices">' + choices.map(function (c) {
        return '<button class="choice-btn" type="button" data-ja="' + EM.escapeHtml(c) + '">' + EM.escapeHtml(c) + "</button>";
      }).join("") + "</div>";

    if (EM.audioChip) EM.audioChip(document.getElementById("id-chip"), x.en);
    document.getElementById("say").addEventListener("click", function () { EM.speak(x.en); });
    var mic2 = document.getElementById("mic");
    if (mic2) mic2.addEventListener("click", function () { EM.micCheck(x.en); });
    EM.speak(x.en);

    root().querySelectorAll(".choice-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var correct = b.getAttribute("data-ja") === x.ja;
        root().querySelectorAll(".choice-btn").forEach(function (z) {
          z.disabled = true;
          if (z.getAttribute("data-ja") === x.ja) z.classList.add("choice-btn--ok");
          else if (z === b) z.classList.add("choice-btn--ng");
        });
        var next = document.createElement("button");
        next.className = "btn btn--primary btn--block mt-4";
        next.textContent = st.idx + 1 >= st.session.length ? "結果を見る" : "次へ";
        next.addEventListener("click", function () { grade(x, correct ? "good" : "again"); });
        root().appendChild(next);
      });
    });
  }

  /* ---------- 採点 ---------- */
  function grade(x, g) {
    var isNew = !SRS.getCard(x.id);
    SRS.review(x.id, g);
    if (isNew && g !== "again") st.learnedNew += 1;
    if (g === "again") st.session.push(x);
    st.idx += 1; st.flipped = false;
    drawCard();
  }

  /* ---------- 結果 ---------- */
  function drawSummary() {
    var total = st.session.length;
    var minutes = Math.max(1, Math.round(total * MIN_PER_ITEM));
    Storage.recordStudy(minutes);
    Storage.incTotals({ sessions: 1, wordsLearned: st.learnedNew });
    EM.refreshStreakBadge();

    root().innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state__icon">✓</div>' +
        '<p class="empty-state__title">おつかれさまでした</p>' +
        '<p class="empty-state__body">' + total + "件を学習しました（新規 " + st.learnedNew + " 件）。<br>" +
          "学習時間に約 " + minutes + " 分を記録しました。</p>" +
      "</div>" +
      '<button class="btn btn--primary btn--block" id="again-btn" type="button">同じ設定でもう一度</button>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/home">ホームへ戻る</a>';
    document.getElementById("again-btn").addEventListener("click", drawSetup);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  EM.registerView("#/idioms", { title: "熟語・句動詞", tab: "learn", render: render });
})();

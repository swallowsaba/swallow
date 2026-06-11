/* ============================================================
   vocab.js — 単語学習（#/vocab）
   レベル選択 ＋ 3モード（フラッシュカード / 4択 / タイピング）。
   SRS.buildSession でセッションを組み、採点を SRS に反映。
   学習量は Storage.recordStudy / incTotals に記録する。
   ============================================================ */
(function () {
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  var MODES = [
    { id: "flash", label: "フラッシュ" },
    { id: "quiz", label: "4択" },
    { id: "type", label: "タイピング" }
  ];
  var SESSION_SIZE = 10;            // 1セッションの語数
  var MIN_PER_WORD = 0.4;          // 学習時間の概算（分/語）

  var st = { level: "A1", mode: "flash", session: [], idx: 0, flipped: false,
             learnedNew: 0, answered: false };

  function wordsOfLevel(level) {
    var all = (window.EigoData && window.EigoData.words) || [];
    return all.filter(function (w) { return w.level === level; });
  }

  function render() {
    return { html: '<section id="vocab-root" class="view-enter"></section>', onMount: drawSetup };
  }
  function root() { return document.getElementById("vocab-root"); }

  /* ---------- セットアップ画面 ---------- */
  function drawSetup() {
    var pool = wordsOfLevel(st.level);
    var dueCount = pool.filter(function (w) { return SRS.getCard(w.id) && SRS.isDue(w.id); }).length;
    var newCount = pool.filter(function (w) { return !SRS.getCard(w.id); }).length;

    var levelChips = LEVELS.map(function (lv) {
      return '<button class="chip" type="button" data-level="' + lv + '" aria-pressed="' + (st.level === lv) + '">' + lv + "</button>";
    }).join("");
    var modeChips = MODES.map(function (m) {
      return '<button class="chip" type="button" data-mode="' + m.id + '" aria-pressed="' + (st.mode === m.id) + '">' + m.label + "</button>";
    }).join("");

    root().innerHTML =
      '<p class="section-title">単語学習</p>' +
      '<div class="field"><span class="field__label">レベル</span><div class="chip-group">' + levelChips + "</div></div>" +
      '<div class="field"><span class="field__label">モード</span><div class="chip-group">' + modeChips + "</div></div>" +
      '<div class="card">' +
        '<div class="kv"><span class="kv__k">復習が必要</span><span class="kv__v">' + dueCount + " 語</span></div>" +
        '<div class="kv"><span class="kv__k">未学習</span><span class="kv__v">' + newCount + " 語</span></div>" +
        '<div class="kv"><span class="kv__k">このレベルの総数</span><span class="kv__v">' + pool.length + " 語</span></div>" +
      "</div>" +
      '<button class="btn btn--primary btn--block mt-4" id="start-btn" type="button">学習をはじめる（最大' + SESSION_SIZE + "語）</button>" +
      '<a class="btn btn--ghost btn--block mt-4" href="#/idioms">熟語・句動詞へ</a>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/wordbook">単語帳を見る</a>';

    root().querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { st.level = b.getAttribute("data-level"); drawSetup(); });
    });
    root().querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { st.mode = b.getAttribute("data-mode"); drawSetup(); });
    });
    document.getElementById("start-btn").addEventListener("click", startSession);
  }

  /* ---------- セッション開始 ---------- */
  function startSession() {
    var pool = wordsOfLevel(st.level);
    st.session = SRS.buildSession(pool, SESSION_SIZE);
    if (!st.session.length) { EM.showToast("学習できる単語がありません", true); return; }
    st.idx = 0; st.flipped = false; st.learnedNew = 0; st.answered = false;
    drawCard();
  }

  function progressHtml() {
    var pct = Math.round((st.idx / st.session.length) * 100);
    return '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
           '<p class="center text-soft" style="font-size:var(--fs-tiny);margin-bottom:var(--space-3)">' +
           (st.idx + 1) + " / " + st.session.length + "</p>";
  }

  /* ---------- 各モードの描画 ---------- */
  function drawCard() {
    if (st.idx >= st.session.length) return drawSummary();
    if (st.mode === "flash") return drawFlash();
    if (st.mode === "quiz") return drawQuiz();
    return drawType();
  }

  // フラッシュカード
  function drawFlash() {
    var w = st.session[st.idx];
    var front =
      '<div class="flashcard">' +
        '<div class="flashcard__word">' + EM.escapeHtml(w.en) + "</div>" +
        '<div class="flashcard__ipa">' + EM.escapeHtml(w.ipa) + "</div>" +
        '<div class="flashcard__kata">' + EM.escapeHtml(w.kata) + "</div>" +
        '<div class="center mt-4"><button class="audio-btn" id="say" type="button" aria-label="再生">▶</button></div>' +
      "</div>";
    var back =
      '<div class="flashcard">' +
        '<div class="flashcard__pos">' + EM.escapeHtml(w.pos) + "</div>" +
        '<div class="flashcard__ja">' + EM.escapeHtml(w.ja) + "</div>" +
        '<div class="flashcard__ex"><em>' + EM.escapeHtml(w.en) + "</em> — " + EM.escapeHtml(w.ex) + "</div>" +
        '<div class="flashcard__ex">' + EM.escapeHtml(w.exja) + "</div>" +
      "</div>";

    root().innerHTML = progressHtml() +
      (st.flipped ? back : front) +
      (st.flipped
        ? gradeRowHtml()
        : '<button class="btn btn--primary btn--block mt-4" id="flip" type="button">意味を見る</button>');

    var say = document.getElementById("say");
    if (say) say.addEventListener("click", function () { EM.speak(w.en); });
    EM.speak(w.en); // 自動で1回読み上げ

    var flip = document.getElementById("flip");
    if (flip) flip.addEventListener("click", function () { st.flipped = true; drawFlash(); });
    bindGradeRow(w);
  }

  function gradeRowHtml() {
    return '<div class="grade-row">' +
      '<button class="grade-btn" data-g="again" type="button">もう一度<small>すぐ再出題</small></button>' +
      '<button class="grade-btn" data-g="hard" type="button">難しい<small>短め</small></button>' +
      '<button class="grade-btn" data-g="good" type="button">できた<small>標準</small></button>' +
      '<button class="grade-btn" data-g="easy" type="button">余裕<small>長め</small></button>' +
      "</div>";
  }
  function bindGradeRow(w) {
    root().querySelectorAll(".grade-btn").forEach(function (b) {
      b.addEventListener("click", function () { grade(w, b.getAttribute("data-g")); });
    });
  }

  // 4択（英単語→意味）
  function drawQuiz() {
    var w = st.session[st.idx];
    var pool = wordsOfLevel(st.level).filter(function (x) { return x.id !== w.id; });
    var choices = shuffle(pool).slice(0, 3).map(function (x) { return x.ja; });
    choices.push(w.ja);
    choices = shuffle(choices);

    root().innerHTML = progressHtml() +
      '<div class="flashcard" style="min-height:150px">' +
        '<div class="flashcard__word">' + EM.escapeHtml(w.en) + "</div>" +
        '<div class="flashcard__ipa">' + EM.escapeHtml(w.ipa) + "</div>" +
        '<div class="center mt-4"><button class="audio-btn" id="say" type="button" aria-label="再生">▶</button></div>' +
      "</div>" +
      '<p class="field__label mt-4">意味として正しいものは？</p>' +
      '<div id="choices">' + choices.map(function (c) {
        return '<button class="choice-btn" type="button" data-ja="' + EM.escapeHtml(c) + '">' + EM.escapeHtml(c) + "</button>";
      }).join("") + "</div>";

    document.getElementById("say").addEventListener("click", function () { EM.speak(w.en); });
    EM.speak(w.en);

    root().querySelectorAll(".choice-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var correct = b.getAttribute("data-ja") === w.ja;
        root().querySelectorAll(".choice-btn").forEach(function (x) {
          x.disabled = true;
          if (x.getAttribute("data-ja") === w.ja) x.classList.add("choice-btn--ok");
          else if (x === b) x.classList.add("choice-btn--ng");
        });
        showNext(w, correct ? "good" : "again");
      });
    });
  }

  // タイピング（意味→スペル入力）
  function drawType() {
    var w = st.session[st.idx];
    root().innerHTML = progressHtml() +
      '<div class="flashcard" style="min-height:150px">' +
        '<div class="flashcard__pos">' + EM.escapeHtml(w.pos) + "</div>" +
        '<div class="flashcard__ja">' + EM.escapeHtml(w.ja) + "</div>" +
        '<div class="flashcard__ipa">' + EM.escapeHtml(w.ipa) + "</div>" +
        '<div class="center mt-4"><button class="audio-btn" id="say" type="button" aria-label="再生">▶</button></div>' +
      "</div>" +
      '<div class="field mt-4"><input class="input" id="type-in" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="英単語を入力" /></div>' +
      '<button class="btn btn--primary btn--block" id="check" type="button">こたえ合わせ</button>' +
      '<div id="type-result" class="mt-4"></div>';

    document.getElementById("say").addEventListener("click", function () { EM.speak(w.en); });
    var input = document.getElementById("type-in");
    input.focus();
    function check() {
      var ans = (input.value || "").trim().toLowerCase();
      var correct = ans === w.en.toLowerCase();
      var res = document.getElementById("type-result");
      res.innerHTML = '<div class="diff center">' +
        (correct ? '<span class="w w-ok">' + EM.escapeHtml(w.en) + "</span>"
                 : '<span class="w w-ng">' + EM.escapeHtml(ans || "（未入力）") + '</span> → <span class="w w-ok">' + EM.escapeHtml(w.en) + "</span>") +
        "</div>";
      EM.speak(w.en);
      input.disabled = true;
      document.getElementById("check").outerHTML = "";
      showNext(w, correct ? "good" : "again");
    }
    document.getElementById("check").addEventListener("click", check);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") check(); });
  }

  // 「次へ」ボタンを出す（4択・タイピング用）
  function showNext(w, autoGrade) {
    var btn = document.createElement("button");
    btn.className = "btn btn--primary btn--block mt-4";
    btn.textContent = st.idx + 1 >= st.session.length ? "結果を見る" : "次の単語へ";
    btn.addEventListener("click", function () { grade(w, autoGrade); });
    root().appendChild(btn);
  }

  /* ---------- 採点して次へ ---------- */
  function grade(w, g) {
    var isNew = !SRS.getCard(w.id);
    SRS.review(w.id, g);
    if (isNew && g !== "again") st.learnedNew += 1;

    if (g === "again") {
      // 同セッション末尾に戻して再出題
      st.session.push(w);
    }
    st.idx += 1;
    st.flipped = false;
    drawCard();
  }

  /* ---------- 結果 ---------- */
  function drawSummary() {
    var total = st.session.length;
    var minutes = Math.max(1, Math.round(total * MIN_PER_WORD));
    Storage.recordStudy(minutes);
    Storage.incTotals({ sessions: 1, wordsLearned: st.learnedNew });
    EM.refreshStreakBadge();

    root().innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state__icon">✓</div>' +
        '<p class="empty-state__title">おつかれさまでした</p>' +
        '<p class="empty-state__body">' + total + "問を学習しました（新規 " + st.learnedNew + " 語）。<br>" +
          "学習時間に約 " + minutes + " 分を記録しました。</p>" +
      "</div>" +
      '<button class="btn btn--primary btn--block" id="again-btn" type="button">同じ設定でもう一度</button>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/home">ホームへ戻る</a>';
    document.getElementById("again-btn").addEventListener("click", drawSetup);
  }

  /* ---------- ユーティリティ ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  EM.registerView("#/vocab", { title: "単語", tab: "vocab", render: render });
})();

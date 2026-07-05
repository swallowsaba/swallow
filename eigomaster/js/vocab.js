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
    { id: "quiz", label: "4択クイズ" },
    { id: "type", label: "タイピング" }
  ];
  var SESSION_SIZE = 10;            // 1セッションの語数
  var MIN_PER_WORD = 0.4;          // 学習時間の概算（分/語）

  var SUBS = [
    { id: "all", label: "すべて" },
    { id: ".1", label: ".1 易" },
    { id: ".2", label: ".2 中" },
    { id: ".3", label: ".3 難" }
  ];

  var st = { level: "A1", sub: "all", mode: "quiz", session: [], idx: 0, flipped: false,
             learnedNew: 0, answered: false };

  var _annotated = false;
  function ensureAnnotated() {
    if (_annotated) return;
    var all = (window.EigoData && window.EigoData.words) || [];
    if (EM.levels) EM.levels.annotate(all, function (w) { return w.en; });
    _annotated = true;
  }

  // 指定CEFRレベルの語（サブレベル注釈済み）
  function wordsOfLevel(level) {
    ensureAnnotated();
    var all = (window.EigoData && window.EigoData.words) || [];
    return all.filter(function (w) { return w.level === level; });
  }

  // サブレベル絞り込みを適用したプール
  function poolFiltered() {
    var pool = wordsOfLevel(st.level);
    if (st.sub === "all") return pool;
    return pool.filter(function (w) { return w._sub === st.level + st.sub; });
  }

  function render() {
    return { html: '<section id="vocab-root" class="view-enter"></section>', onMount: drawSetup };
  }
  function root() { return document.getElementById("vocab-root"); }

  /* ---------- セットアップ画面 ---------- */
  function drawSetup() {
    var pool = poolFiltered();
    var dueCount = pool.filter(function (w) { return SRS.getCard(w.id) && SRS.isDue(w.id); }).length;
    var newCount = pool.filter(function (w) { return !SRS.getCard(w.id); }).length;

    var levelChips = LEVELS.map(function (lv) {
      return '<button class="chip" type="button" data-level="' + lv + '" aria-pressed="' + (st.level === lv) + '">' + lv + "</button>";
    }).join("");
    // サブレベル別の語数（バッジ用）
    var cefrPool = wordsOfLevel(st.level);
    function subCount(id) {
      if (id === "all") return cefrPool.length;
      return cefrPool.filter(function (w) { return w._sub === st.level + id; }).length;
    }
    var subChips = SUBS.map(function (s) {
      return '<button class="chip" type="button" data-sub="' + s.id + '" aria-pressed="' + (st.sub === s.id) + '">' +
        s.label + ' <span class="text-soft" style="font-size:var(--fs-tiny)">' + subCount(s.id) + "</span></button>";
    }).join("");
    var modeChips = MODES.map(function (m) {
      return '<button class="chip" type="button" data-mode="' + m.id + '" aria-pressed="' + (st.mode === m.id) + '">' + m.label + "</button>";
    }).join("");

    root().innerHTML =
      '<p class="section-title">単語学習</p>' +
      '<div class="field"><span class="field__label">レベル（CEFR）</span><div class="chip-group">' + levelChips + "</div></div>" +
      '<div class="field"><span class="field__label">細分レベル（' + st.level + ' を難易度で3分割）</span><div class="chip-group">' + subChips + "</div></div>" +
      '<div class="field"><span class="field__label">モード</span><div class="chip-group">' + modeChips + "</div></div>" +
      '<div class="card">' +
        '<div class="kv"><span class="kv__k">復習が必要</span><span class="kv__v">' + dueCount + " 語</span></div>" +
        '<div class="kv"><span class="kv__k">未学習</span><span class="kv__v">' + newCount + " 語</span></div>" +
        '<div class="kv"><span class="kv__k">この範囲の総数</span><span class="kv__v">' + pool.length + " 語</span></div>" +
      "</div>" +
      '<button class="btn btn--primary btn--block mt-4" id="start-btn" type="button">学習をはじめる（最大' + SESSION_SIZE + "語）</button>" +
      '<a class="btn btn--ghost btn--block mt-4" href="#/idioms">熟語・句動詞へ</a>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/wordbook">単語帳を見る</a>';

    root().querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { st.level = b.getAttribute("data-level"); st.sub = "all"; drawSetup(); });
    });
    root().querySelectorAll("[data-sub]").forEach(function (b) {
      b.addEventListener("click", function () { st.sub = b.getAttribute("data-sub"); drawSetup(); });
    });
    root().querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { st.mode = b.getAttribute("data-mode"); drawSetup(); });
    });
    document.getElementById("start-btn").addEventListener("click", startSession);
  }

  /* ---------- セッション開始 ---------- */
  function startSession() {
    var pool = poolFiltered();
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
    if (st.mode === "quiz") return drawQuiz();
    return drawType();
  }

  // フラッシュカード
  function kataOf(w) {
    return w.kata || (window.Katakana ? window.Katakana.toKatakana(w.en) : "");
  }

  // 4択（英単語→意味）
  function drawQuiz() {
    var w = st.session[st.idx];
    var pool = wordsOfLevel(st.level).filter(function (x) { return x.id !== w.id; });
    var choices = shuffle(pool).slice(0, 3).map(function (x) { return x.ja; });
    choices.push(w.ja);
    choices = shuffle(choices);

    var kanaApprox = "";
    try { kanaApprox = (window.Katakana && window.Katakana.reduceTokenKana) ? window.Katakana.reduceTokenKana(w.en, false) : ""; } catch (e) { kanaApprox = ""; }

    root().innerHTML =
      '<div class="study-fit">' +
      '<div class="study-fit__top">' + progressHtml() + '</div>' +
      '<div class="study-fit__main">' +
      '<div class="flashcard vcard">' +
        (EM.levels ? '<span class="chip chip--on vcard__badge" style="pointer-events:none">' + EM.escapeHtml(EM.levels.badge(w)) + "</span>" : "") +
        '<div class="vcard__word">' + EM.escapeHtml(w.en) + "</div>" +
        (w.ipa ? '<div class="vcard__ipa">' + EM.escapeHtml(w.ipa) + "</div>" : "") +
        (kanaApprox ? '<div class="vcard__kana">≈ ' + EM.escapeHtml(kanaApprox) + "</div>" : "") +
        '<div class="vcard__actions">' +
          '<button class="vcard__btn vcard__btn--play" id="say" type="button" aria-label="発音を再生">▶</button>' +
          '<button class="vcard__btn" id="mic" type="button" aria-label="発音チェック">🎤</button>' +
        "</div>" +
      "</div>" +
      '<p class="field__label mt-4">意味として正しいものは？</p>' +
      '<div id="choices">' + choices.map(function (c) {
        return '<button class="choice-btn" type="button" data-ja="' + EM.escapeHtml(c) + '">' + EM.escapeHtml(c) + "</button>";
      }).join("") + "</div>" +
      "</div>" +
      '<div class="study-fit__foot" id="vc-foot"></div>' +
      "</div>";

    document.getElementById("say").addEventListener("click", function () { EM.speak(w.en); });
    var vqMic = document.getElementById("mic");
    if (vqMic) vqMic.addEventListener("click", function () { EM.micCheck(w.en); });
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
    root().innerHTML =
      '<div class="study-fit">' +
      '<div class="study-fit__top">' + progressHtml() + '</div>' +
      '<div class="study-fit__main">' +
      '<div class="flashcard vcard">' +
        (EM.levels ? '<span class="chip chip--on vcard__badge" style="pointer-events:none">' + EM.escapeHtml(EM.levels.badge(w)) + "</span>" : "") +
        (w.pos ? '<div class="vcard__ipa">' + EM.escapeHtml(w.pos) + "</div>" : "") +
        '<div class="vcard__word">' + EM.escapeHtml(w.ja) + "</div>" +
        (w.ipa ? '<div class="vcard__ipa">' + EM.escapeHtml(w.ipa) + "</div>" : "") +
        '<div class="vcard__actions">' +
          '<button class="vcard__btn vcard__btn--play" id="say" type="button" aria-label="発音を再生">▶</button>' +
          '<button class="vcard__btn" id="mic" type="button" aria-label="発音チェック">🎤</button>' +
        "</div>" +
      "</div>" +
      '<div class="field mt-4"><input class="input" id="type-in" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="英単語を入力" /></div>' +
      '<div id="type-result" class="mt-4"></div>' +
      "</div>" +
      '<div class="study-fit__foot" id="vc-foot"><button class="btn btn--primary btn--block" id="check" type="button">こたえ合わせ</button></div>' +
      "</div>";

    document.getElementById("say").addEventListener("click", function () { EM.speak(w.en); });
    var vtMic = document.getElementById("mic");
    if (vtMic) vtMic.addEventListener("click", function () { EM.micCheck(w.en); });
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
      var chk = document.getElementById("check");
      if (chk) chk.outerHTML = "";
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
    var foot = document.getElementById("vc-foot");
    (foot || root()).appendChild(btn);
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

  EM.registerView("#/vocab", { title: "単語", tab: "learn", render: render });
})();

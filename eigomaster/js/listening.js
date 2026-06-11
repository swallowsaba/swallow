/* ============================================================
   listening.js — リスニング（#/listening）
   ディクテーション（聞いて書き取り→単語単位で照合）と
   内容理解（聞いて4択）の2モード。音声は EM.speak（オンライン英語音声）。
   ============================================================ */
(function () {
  "use strict";

  var LEVELS = ["A2", "B1", "B2"];
  var st = { level: "B1", mode: "dictation", session: [], idx: 0, correct: 0 };

  function pool(level, mode) {
    var all = (window.EigoData && window.EigoData.listening) || [];
    return all.filter(function (x) { return x.level === level && x.type === mode; });
  }
  function render() { return { html: '<section id="lis-root" class="view-enter"></section>', onMount: drawSetup }; }
  function root() { return document.getElementById("lis-root"); }

  function drawSetup() {
    var levelChips = LEVELS.map(function (lv) {
      return '<button class="chip" type="button" data-level="' + lv + '" aria-pressed="' + (st.level === lv) + '">' + lv + "</button>";
    }).join("");
    var modeChips = [
      { id: "dictation", label: "書き取り" },
      { id: "comprehension", label: "内容理解" }
    ].map(function (m) {
      return '<button class="chip" type="button" data-mode="' + m.id + '" aria-pressed="' + (st.mode === m.id) + '">' + m.label + "</button>";
    }).join("");
    var count = pool(st.level, st.mode).length;

    root().innerHTML =
      EM.backLink("#/home", "ホーム") +
      '<p class="section-title">リスニング</p>' +
      '<p class="text-soft" style="font-size:var(--fs-small);margin-bottom:var(--space-4)">英語音声を聞いて、書き取り（ディクテーション）や内容理解に挑戦します。音声は流ちょうな英語で再生されます。</p>' +
      '<div class="field"><span class="field__label">レベル</span><div class="chip-group">' + levelChips + "</div></div>" +
      '<div class="field"><span class="field__label">モード</span><div class="chip-group">' + modeChips + "</div></div>" +
      '<div class="card"><div class="kv"><span class="kv__k">この設定の問題数</span><span class="kv__v">' + count + " 問</span></div></div>" +
      '<button class="btn btn--primary btn--block mt-4" id="start" type="button">はじめる</button>';

    root().querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { st.level = b.getAttribute("data-level"); drawSetup(); });
    });
    root().querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { st.mode = b.getAttribute("data-mode"); drawSetup(); });
    });
    document.getElementById("start").addEventListener("click", start);
  }

  function start() {
    st.session = shuffle(pool(st.level, st.mode));
    if (!st.session.length) { EM.showToast("この設定の問題がありません", true); return; }
    st.idx = 0; st.correct = 0;
    draw();
  }

  function progressHtml() {
    var pct = Math.round((st.idx / st.session.length) * 100);
    return '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
      '<p class="center text-soft" style="font-size:var(--fs-tiny);margin-bottom:var(--space-3)">' + (st.idx + 1) + " / " + st.session.length + "</p>";
  }

  function draw() {
    if (st.idx >= st.session.length) return drawSummary();
    return st.mode === "dictation" ? drawDictation() : drawComprehension();
  }

  /* ---------- ディクテーション ---------- */
  function drawDictation() {
    var q = st.session[st.idx];
    root().innerHTML = progressHtml() +
      '<div class="card center">' +
        '<p class="text-soft" style="font-size:var(--fs-small)">音声を聞いて、聞こえた英文を入力してください。</p>' +
        '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--primary" id="play" type="button">▶ 再生</button>' +
          '<button class="btn btn--ghost" id="play-slow" type="button">🐢 ゆっくり</button>' +
        "</div>" +
      "</div>" +
      '<div class="field mt-4"><textarea class="textarea" id="dict-in" placeholder="ここに入力"></textarea></div>' +
      '<button class="btn btn--primary btn--block" id="check" type="button">答え合わせ</button>' +
      '<div id="dict-result" class="mt-4"></div>';

    document.getElementById("play").addEventListener("click", function () { EM.speak(q.text, { rate: 1.0 }); });
    document.getElementById("play-slow").addEventListener("click", function () { EM.speak(q.text, { rate: 0.6 }); });
    EM.speak(q.text, { rate: 1.0 });

    document.getElementById("check").addEventListener("click", function () {
      var typed = (document.getElementById("dict-in").value || "").trim();
      var res = diffWords(typed, q.text);
      var area = document.getElementById("dict-result");
      area.innerHTML =
        '<div class="explain-card">' +
          '<p class="explain-head ' + (res.rate >= 0.8 ? "explain-head--ok" : "explain-head--ng") + '">正答率 ' + Math.round(res.rate * 100) + "%</p>" +
          '<p class="explain-line"><strong>正解：</strong>' + EM.escapeHtml(q.text) + "</p>" +
          '<p class="explain-line">' + res.html + "</p>" +
          '<p class="explain-why">' + EM.escapeHtml(q.ja) + "</p>" +
          '<button class="btn btn--primary btn--block mt-4" id="next" type="button">' + (st.idx + 1 >= st.session.length ? "結果を見る" : "次へ") + "</button>" +
        "</div>";
      if (res.rate >= 0.8) st.correct += 1;
      document.getElementById("next").addEventListener("click", function () { st.idx += 1; draw(); });
    });
  }

  /* ---------- 内容理解 ---------- */
  function drawComprehension() {
    var q = st.session[st.idx];
    var choices = shuffle(q.choices.slice());
    root().innerHTML = progressHtml() +
      '<div class="card center">' +
        '<p class="text-soft" style="font-size:var(--fs-small)">英文を聞いて、質問に答えてください。</p>' +
        '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--primary" id="play" type="button">▶ 再生</button>' +
          '<button class="btn btn--ghost" id="play-slow" type="button">🐢 ゆっくり</button>' +
        "</div>" +
      "</div>" +
      '<p class="field__label mt-4">' + EM.escapeHtml(q.question) + "</p>" +
      '<div id="choices">' + choices.map(function (c) {
        return '<button class="choice-btn" type="button" data-c="' + EM.escapeHtml(c) + '">' + EM.escapeHtml(c) + "</button>";
      }).join("") + "</div>" +
      '<div id="comp-result" class="mt-4"></div>';

    document.getElementById("play").addEventListener("click", function () { EM.speak(q.text, { rate: 1.0 }); });
    document.getElementById("play-slow").addEventListener("click", function () { EM.speak(q.text, { rate: 0.6 }); });
    EM.speak(q.text, { rate: 1.0 });

    root().querySelectorAll(".choice-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var ok = b.getAttribute("data-c") === q.answer;
        root().querySelectorAll(".choice-btn").forEach(function (x) {
          x.disabled = true;
          if (x.getAttribute("data-c") === q.answer) x.classList.add("choice-btn--ok");
          else if (x === b) x.classList.add("choice-btn--ng");
        });
        if (ok) st.correct += 1;
        document.getElementById("comp-result").innerHTML =
          '<div class="explain-card">' +
            '<p class="explain-head ' + (ok ? "explain-head--ok" : "explain-head--ng") + '">' + (ok ? "正解！" : "正解は「" + EM.escapeHtml(q.answer) + "」") + "</p>" +
            '<p class="explain-line"><strong>英文：</strong>' + EM.escapeHtml(q.text) + "</p>" +
            '<p class="explain-why">' + EM.escapeHtml(q.ja) + "</p>" +
            '<button class="btn btn--primary btn--block mt-4" id="next" type="button">' + (st.idx + 1 >= st.session.length ? "結果を見る" : "次へ") + "</button>" +
          "</div>";
        document.getElementById("next").addEventListener("click", function () { st.idx += 1; draw(); });
      });
    });
  }

  function drawSummary() {
    var total = st.session.length;
    var minutes = Math.max(1, Math.round(total * 0.5));
    Storage.recordStudy(minutes);
    Storage.incTotals({ sessions: 1 });
    EM.refreshStreakBadge();
    root().innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state__icon">🎧</div>' +
        '<p class="empty-state__title">おつかれさまでした</p>' +
        '<p class="empty-state__body">' + total + "問中 " + st.correct + " 問正解（学習 約" + minutes + " 分）。</p>" +
      "</div>" +
      '<button class="btn btn--primary btn--block" id="again" type="button">もう一度</button>' +
      '<a class="btn btn--ghost btn--block mt-4" href="#/home">ホームへ戻る</a>';
    document.getElementById("again").addEventListener("click", drawSetup);
  }

  /* ---------- 単語単位の簡易diff ---------- */
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9'\s]/g, "").replace(/\s+/g, " ").trim(); }
  function diffWords(typed, answer) {
    var a = norm(typed).split(" ").filter(Boolean);
    var b = norm(answer).split(" ").filter(Boolean);
    // LCSで一致語を求める
    var n = a.length, m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (i = 1; i <= n; i++) for (var j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
    // bの各語が一致したかを復元
    var matched = new Array(m).fill(false);
    i = n; j = m;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { matched[j - 1] = true; i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    var origWords = String(answer).split(/\s+/);
    var html = origWords.map(function (w, k) {
      return matched[k] ? '<span class="w-ok">' + EM.escapeHtml(w) + "</span>"
                        : '<span class="w-ng">' + EM.escapeHtml(w) + "</span>";
    }).join(" ");
    var rate = m ? dp[n][m] / m : 0;
    return { rate: rate, html: html };
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  EM.registerView("#/listening", { title: "リスニング", tab: "learn", render: render });
})();

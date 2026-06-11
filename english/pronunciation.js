/* ============================================================
   pronunciation.js — 発音チェック（#/pron-check）
   - Web Speech API（SpeechRecognition）が使えれば、認識結果を
     目標文と単語単位で diff し、一致率(%)を表示。
   - 非対応ブラウザでは MediaRecorder 録音 → お手本と聞き比べにフォールバック。
   - 認識精度には限界がある旨を正直に明記する。
   ============================================================ */
(function () {
  "use strict";

  var TARGETS = [
    "Could you send me the report?",
    "I was wondering if you could help.",
    "Let's check it out together.",
    "Thank you for joining the meeting.",
    "We need to align on the goals."
  ];

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var rec = { recorder: null, chunks: [], url: null, stream: null };
  var current = TARGETS[0];

  function normalize(s) {
    return String(s).toLowerCase().replace(/[^a-z'\s]/g, "").split(/\s+/).filter(Boolean);
  }

  // LCS で目標語が認識結果に含まれるかを判定し、各目標語に ok/ng を付与
  function diffWords(target, said) {
    var t = normalize(target), s = normalize(said);
    var n = t.length, m = s.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (var i2 = 1; i2 <= n; i2++) {
      for (var j = 1; j <= m; j++) {
        dp[i2][j] = t[i2 - 1] === s[j - 1] ? dp[i2 - 1][j - 1] + 1 : Math.max(dp[i2 - 1][j], dp[i2][j - 1]);
      }
    }
    // バックトラックして一致語を特定
    var matched = new Array(n).fill(false);
    var i3 = n, j3 = m;
    while (i3 > 0 && j3 > 0) {
      if (t[i3 - 1] === s[j3 - 1]) { matched[i3 - 1] = true; i3--; j3--; }
      else if (dp[i3 - 1][j3] >= dp[i3][j3 - 1]) i3--;
      else j3--;
    }
    var hit = matched.filter(Boolean).length;
    var pct = n ? Math.round((hit / n) * 100) : 0;
    return { words: t, matched: matched, pct: pct };
  }

  function render() {
    return { html: '<section id="pron-root" class="view-enter"></section>', onMount: draw };
  }
  function root() { return document.getElementById("pron-root"); }

  function draw() {
    var targetChips = TARGETS.map(function (s, i) {
      return '<button class="choice-btn" type="button" data-target="' + i + '">' + EM.escapeHtml(s) + "</button>";
    }).join("");

    root().innerHTML =
      EM.backLink("#/pron", "発音メニュー") +
      '<p class="section-title">発音チェック</p>' +
      (SR
        ? '<div class="notice"><span class="notice__icon">!</span><span>音声認識は便利ですが万能ではありません。雑音や訛りで結果が変わるため、<strong>目安</strong>として使ってください。</span></div>'
        : '<div class="notice"><span class="notice__icon">!</span><span>このブラウザは音声認識に非対応です。<strong>録音して聞き比べる</strong>方式で練習します（Chrome系だと自動採点が使えます）。</span></div>') +

      '<p class="field__label mt-4">お手本の文を選ぶ</p>' +
      '<div id="targets">' + targetChips + "</div>" +
      '<div class="field mt-4"><label class="field__label" for="custom">自分で入力（任意）</label>' +
        '<input class="input" id="custom" type="text" placeholder="練習したい英文" /></div>' +

      '<div class="card mt-4">' +
        '<div class="row-between"><span class="field__label" style="margin:0">選択中の文</span>' +
          '<button class="audio-btn audio-btn--wide" id="say-model" type="button">▶ お手本</button></div>' +
        '<p class="flashcard__ipa" id="current-text" style="font-family:var(--font-body);font-size:var(--fs-body);color:var(--c-ink)">' + EM.escapeHtml(current) + "</p>" +
      "</div>" +

      (SR
        ? '<button class="btn btn--primary btn--block mt-4" id="rec-sr" type="button">🎤 録音して判定する</button>'
        : recorderHtml()) +
      '<div id="result" class="mt-4"></div>';

    root().querySelectorAll("[data-target]").forEach(function (b) {
      b.addEventListener("click", function () {
        current = TARGETS[parseInt(b.getAttribute("data-target"), 10)];
        document.getElementById("custom").value = "";
        updateCurrent();
      });
    });
    document.getElementById("custom").addEventListener("input", function (e) {
      if (e.target.value.trim()) current = e.target.value.trim();
      updateCurrent();
    });
    click("say-model", function () { EM.speak(current); });

    if (SR) click("rec-sr", runRecognition);
    else bindRecorder();
  }

  function updateCurrent() {
    var el = document.getElementById("current-text");
    if (el) el.textContent = current;
  }

  /* ---------- 音声認識モード ---------- */
  function runRecognition() {
    var btn = document.getElementById("rec-sr");
    recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    btn.textContent = "🎙 話してください…";
    btn.disabled = true;

    recognition.onresult = function (e) {
      var said = e.results[0][0].transcript;
      showResult(said);
    };
    recognition.onerror = function (ev) {
      EM.showToast(ev.error === "not-allowed" ? "マイクが許可されませんでした" : "認識できませんでした。もう一度お試しください", true);
    };
    recognition.onend = function () { btn.textContent = "🎤 録音して判定する"; btn.disabled = false; };
    try { recognition.start(); } catch (e) { EM.showToast("録音を開始できませんでした", true); btn.disabled = false; }
  }

  function showResult(said) {
    var d = diffWords(current, said);
    var diffHtml = d.words.map(function (w, i) {
      return '<span class="w ' + (d.matched[i] ? "w-ok" : "w-ng") + '">' + EM.escapeHtml(w) + "</span>";
    }).join(" ");
    document.getElementById("result").innerHTML =
      '<div class="card">' +
        '<div class="meter"><div class="meter__value">' + d.pct + '%</div><div class="meter__label">単語一致率（目安）</div></div>' +
        '<p class="diff center">' + diffHtml + "</p>" +
        '<p class="text-soft center mt-4" style="font-size:var(--fs-small)">認識結果：「' + EM.escapeHtml(said) + "」</p>" +
        '<button class="btn btn--ghost btn--block mt-4" id="retry-model" type="button">▶ お手本をもう一度</button>' +
      "</div>";
    click("retry-model", function () { EM.speak(current); });

    // 学習量を記録（軽め）
    Storage.recordStudy(1);
    Storage.incTotals({ sessions: 1 });
    EM.refreshStreakBadge();
  }

  /* ---------- 録音フォールバック ---------- */
  function recorderHtml() {
    if (!(navigator.mediaDevices && window.MediaRecorder)) {
      return '<div class="notice mt-4"><span class="notice__icon">!</span><span>録音にも非対応の環境です。お手本を聞いて、声に出して真似る練習をしましょう。</span></div>';
    }
    return '<div class="card mt-4"><p class="section-eyebrow">録音して聞き比べ</p>' +
      '<div class="grade-row" style="grid-template-columns:1fr 1fr 1fr">' +
        '<button class="btn btn--ghost" id="rec-start" type="button">● 録音</button>' +
        '<button class="btn btn--ghost" id="rec-stop" type="button" disabled>■ 停止</button>' +
        '<button class="btn btn--ghost" id="rec-play" type="button" disabled>▶ 自分の声</button>' +
      "</div></div>";
  }
  function bindRecorder() {
    if (!(navigator.mediaDevices && window.MediaRecorder)) return;
    click("rec-start", function () {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        rec.stream = stream; rec.chunks = [];
        rec.recorder = new MediaRecorder(stream);
        rec.recorder.ondataavailable = function (e) { if (e.data.size) rec.chunks.push(e.data); };
        rec.recorder.onstop = function () {
          if (rec.url) URL.revokeObjectURL(rec.url);
          rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: "audio/webm" }));
          var p = document.getElementById("rec-play"); if (p) p.disabled = false;
          Storage.recordStudy(1); Storage.incTotals({ sessions: 1 }); EM.refreshStreakBadge();
        };
        rec.recorder.start();
        setRec(true);
      }).catch(function () { EM.showToast("マイクが許可されませんでした", true); });
    });
    click("rec-stop", function () {
      if (rec.recorder && rec.recorder.state !== "inactive") rec.recorder.stop();
      if (rec.stream) rec.stream.getTracks().forEach(function (t) { t.stop(); });
      setRec(false);
    });
    click("rec-play", function () { if (rec.url) new Audio(rec.url).play(); });
  }
  function setRec(on) {
    var s = document.getElementById("rec-start"), e = document.getElementById("rec-stop");
    if (s) s.disabled = on; if (e) e.disabled = !on;
  }

  function click(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }

  EM.registerView("#/pron-check", { title: "発音チェック", tab: "pron", render: render });
})();

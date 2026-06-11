/* ============================================================
   shadowing.js — シャドーイング（#/video）
   - YouTube IFrame Player API（動的読込）で動画再生。
   - 速度0.5〜1.0 / A-Bループ / 秒シーク / 字幕同期ハイライト / クリックでシーク。
   - 3段表示：英語 / カタカナ（Katakana） / 訳（あれば）。
   - 録音聞き比べ（MediaRecorder）。
   - 動画なしでも字幕だけで練習できる「音声なしモード」。
   - 練習履歴を Storage.addHistory / incTotals(shadowingRuns) に保存。
   ============================================================ */
(function () {
  "use strict";

  var SPEEDS = [0.5, 0.75, 1.0];
  var SEEK_STEP = 2;            // 秒シークの刻み
  var SAMPLE_SRT =
    "1\n00:00:00,200 --> 00:00:02,400\nThank you for joining today.\n\n" +
    "2\n00:00:02,500 --> 00:00:05,000\nI was wondering if you could share the report.\n\n" +
    "3\n00:00:05,100 --> 00:00:07,800\nLet's check it out together.";

  var player = null;        // YT.Player
  var cues = [];            // 字幕
  var pollTimer = null;     // 再生位置の監視
  var activeIdx = -1;
  var loopA = null, loopB = null, loopOn = false;
  var rec = { recorder: null, chunks: [], url: null, stream: null };
  var apiLoading = false;

  /* ---------- YouTube API 読み込み ---------- */
  function ensureYouTubeAPI(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (typeof prev === "function") prev(); cb(); };
    if (apiLoading) return;
    apiLoading = true;
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = function () { EM.showToast("YouTube APIの読み込みに失敗しました（オフライン？）", true); };
    document.head.appendChild(tag);
  }

  function extractVideoId(url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
    return null;
  }

  /* ---------- 画面 ---------- */
  function render() {
    teardown(); // 再入時のクリーンアップ
    return {
      html: '<section id="shadow-root" class="view-enter"></section>',
      onMount: drawSetup
    };
  }
  function root() { return document.getElementById("shadow-root"); }

  function drawSetup() {
    root().innerHTML =
      '<p class="section-title">シャドーイング</p>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span>' +
        '<span>YouTubeのURLと字幕（SRT/VTT/テキスト）を貼り付けて練習します。著作権の都合で字幕は同梱していません。動画が無くても「音声なしモード」で練習できます。</span></div>' +
      '<div class="field mt-4">' +
        '<label class="field__label" for="yt-url">YouTube URL（任意）</label>' +
        '<input class="input" id="yt-url" type="text" placeholder="https://www.youtube.com/watch?v=..." />' +
      "</div>" +
      '<div class="field">' +
        '<label class="field__label" for="sub-in">字幕 / スクリプト</label>' +
        '<textarea class="textarea" id="sub-in" placeholder="SRT・VTT・プレーンテキストに対応">' + SAMPLE_SRT + "</textarea>" +
      "</div>" +
      '<button class="btn btn--primary btn--block" id="start-video" type="button">動画で練習する</button>' +
      '<button class="btn btn--ghost btn--block mt-4" id="start-silent" type="button">音声なしで練習する</button>';

    document.getElementById("start-video").addEventListener("click", function () { start(true); });
    document.getElementById("start-silent").addEventListener("click", function () { start(false); });
  }

  function start(withVideo) {
    var subRaw = document.getElementById("sub-in").value || "";
    cues = window.Subtitle.parse(subRaw);
    if (!cues.length) { EM.showToast("字幕を入力してください", true); return; }

    if (withVideo) {
      var id = extractVideoId(document.getElementById("yt-url").value || "");
      if (!id) { EM.showToast("有効なYouTube URLを入力してください", true); return; }
      drawPlayer(id);
    } else {
      drawSilent();
    }
  }

  /* ---------- 動画モード ---------- */
  function drawPlayer(videoId) {
    root().innerHTML =
      '<div class="video-frame"><div id="yt-player"></div></div>' +
      controlsHtml() +
      recorderHtml() +
      '<div class="lyric mt-4" id="lyric"></div>' +
      finishHtml();

    renderLyrics();
    bindControls();
    bindRecorder();
    bindFinish();

    ensureYouTubeAPI(function () {
      player = new YT.Player("yt-player", {
        videoId: videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: function () { startPolling(); },
          onError: function () { EM.showToast("動画を読み込めませんでした", true); }
        }
      });
    });
  }

  function controlsHtml() {
    var speedBtns = SPEEDS.map(function (s) {
      return '<button class="chip" type="button" data-speed="' + s + '" aria-pressed="' + (s === 1.0) + '">' + s + "x</button>";
    }).join("");
    return '<div class="card mt-4">' +
      '<div class="row-between"><span class="field__label" style="margin:0">速度</span><div class="chip-group">' + speedBtns + "</div></div>" +
      '<div class="grade-row mt-4" style="grid-template-columns:repeat(4,1fr)">' +
        '<button class="btn btn--ghost" id="seek-back" type="button">⟲ ' + SEEK_STEP + "s</button>" +
        '<button class="btn btn--ghost" id="play-pause" type="button">▶/⏸</button>' +
        '<button class="btn btn--ghost" id="seek-fwd" type="button">' + SEEK_STEP + "s ⟳</button>" +
        '<button class="btn btn--ghost" id="loop-toggle" type="button">A-B</button>' +
      "</div>" +
      '<p class="text-soft center" id="loop-status" style="font-size:var(--fs-tiny);margin-top:8px">A-Bループ：未設定</p>' +
      '<div class="grade-row" style="grid-template-columns:1fr 1fr">' +
        '<button class="btn btn--ghost" id="set-a" type="button">A点をセット</button>' +
        '<button class="btn btn--ghost" id="set-b" type="button">B点をセット</button>' +
      "</div>" +
    "</div>";
  }

  function bindControls() {
    root().querySelectorAll("[data-speed]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = parseFloat(b.getAttribute("data-speed"));
        if (player && player.setPlaybackRate) player.setPlaybackRate(s);
        root().querySelectorAll("[data-speed]").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
      });
    });
    click("play-pause", function () {
      if (!player) return;
      var s = player.getPlayerState();
      if (s === YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
    });
    click("seek-back", function () { if (player) player.seekTo(Math.max(0, player.getCurrentTime() - SEEK_STEP), true); });
    click("seek-fwd", function () { if (player) player.seekTo(player.getCurrentTime() + SEEK_STEP, true); });
    click("set-a", function () { if (player) { loopA = player.getCurrentTime(); updateLoopStatus(); } });
    click("set-b", function () { if (player) { loopB = player.getCurrentTime(); updateLoopStatus(); } });
    click("loop-toggle", function () {
      if (loopA == null || loopB == null) { EM.showToast("A点とB点をセットしてください", true); return; }
      loopOn = !loopOn; updateLoopStatus();
    });
  }
  function updateLoopStatus() {
    var el = document.getElementById("loop-status");
    if (!el) return;
    if (loopA == null && loopB == null) { el.textContent = "A-Bループ：未設定"; return; }
    el.textContent = "A-Bループ：" + (loopOn ? "ON" : "OFF") +
      "（A " + fmt(loopA) + " / B " + fmt(loopB) + "）";
  }
  function fmt(t) { return t == null ? "—" : t.toFixed(1) + "s"; }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (!player || !player.getCurrentTime) return;
      var t = player.getCurrentTime();
      // A-Bループ
      if (loopOn && loopA != null && loopB != null && t >= loopB) { player.seekTo(loopA, true); return; }
      // 字幕ハイライト
      var idx = cues.findIndex(function (c) { return c.start != null && t >= c.start && t <= (c.end || c.start + 3); });
      if (idx !== activeIdx) { activeIdx = idx; highlightActive(); }
    }, 200);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  /* ---------- 字幕（3段：英語 / カタカナ / 訳）---------- */
  function splitEnJa(text) {
    // "English | 日本語" や "English\t日本語" 形式なら訳を分離
    var m = text.split(/\s*[|\t]\s*/);
    if (m.length >= 2) return { en: m[0], ja: m.slice(1).join(" ") };
    return { en: text, ja: "" };
  }
  function renderLyrics() {
    var box = document.getElementById("lyric");
    box.innerHTML = cues.map(function (c, i) {
      var p = splitEnJa(c.text);
      var kata = window.Katakana ? window.Katakana.toKatakana(p.en) : "";
      return '<div class="lyric__line" data-i="' + i + '">' +
        '<div class="lyric__en">' + EM.escapeHtml(p.en) + "</div>" +
        '<div class="lyric__kata">' + EM.escapeHtml(kata) + "</div>" +
        (p.ja ? '<div class="lyric__ja">' + EM.escapeHtml(p.ja) + "</div>" : "") +
      "</div>";
    }).join("");
    box.querySelectorAll(".lyric__line").forEach(function (line) {
      line.addEventListener("click", function () {
        var i = parseInt(line.getAttribute("data-i"), 10);
        var c = cues[i];
        if (player && c.start != null) player.seekTo(c.start, true);
        else EM.speak(splitEnJa(c.text).en); // 音声なしモードでは読み上げ
      });
    });
  }
  function highlightActive() {
    var box = document.getElementById("lyric");
    if (!box) return;
    box.querySelectorAll(".lyric__line").forEach(function (line) {
      line.classList.toggle("lyric__line--active", parseInt(line.getAttribute("data-i"), 10) === activeIdx);
    });
    var active = box.querySelector(".lyric__line--active");
    if (active) active.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ---------- 音声なしモード ---------- */
  function drawSilent() {
    activeIdx = 0;
    root().innerHTML =
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>各行を読み上げ（お手本）→自分で発音、を手動で進めます。</span></div>' +
      '<div class="lyric mt-4" id="lyric"></div>' +
      '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr 1fr">' +
        '<button class="btn btn--ghost" id="say-line" type="button">▶ お手本</button>' +
        '<button class="btn btn--ghost" id="prev-line" type="button">‹ 前へ</button>' +
        '<button class="btn btn--primary" id="next-line" type="button">次へ ›</button>' +
      "</div>" +
      recorderHtml() +
      finishHtml();
    renderLyrics();
    highlightActive();
    bindRecorder();
    bindFinish();

    click("say-line", function () { EM.speak(splitEnJa(cues[activeIdx].text).en); });
    click("prev-line", function () { if (activeIdx > 0) { activeIdx--; highlightActive(); } });
    click("next-line", function () {
      if (activeIdx < cues.length - 1) { activeIdx++; highlightActive(); EM.speak(splitEnJa(cues[activeIdx].text).en); }
      else EM.showToast("最後の行です。お疲れさまでした。");
    });
  }

  /* ---------- 録音聞き比べ ---------- */
  function recorderHtml() {
    var supported = !!(navigator.mediaDevices && window.MediaRecorder);
    if (!supported) {
      return '<div class="notice mt-4"><span class="notice__icon">!</span><span>このブラウザは録音に対応していません。お手本の聞き取りと音読で練習しましょう。</span></div>';
    }
    return '<div class="card mt-4">' +
      '<p class="section-eyebrow">録音して聞き比べ</p>' +
      '<div class="grade-row" style="grid-template-columns:1fr 1fr 1fr">' +
        '<button class="btn btn--ghost" id="rec-start" type="button">● 録音</button>' +
        '<button class="btn btn--ghost" id="rec-stop" type="button" disabled>■ 停止</button>' +
        '<button class="btn btn--ghost" id="rec-play" type="button" disabled>▶ 再生</button>' +
      "</div></div>";
  }
  function bindRecorder() {
    if (!(navigator.mediaDevices && window.MediaRecorder)) return;
    click("rec-start", function () {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        rec.stream = stream;
        rec.chunks = [];
        rec.recorder = new MediaRecorder(stream);
        rec.recorder.ondataavailable = function (e) { if (e.data.size) rec.chunks.push(e.data); };
        rec.recorder.onstop = function () {
          if (rec.url) URL.revokeObjectURL(rec.url);
          rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: "audio/webm" }));
          var p = document.getElementById("rec-play"); if (p) p.disabled = false;
        };
        rec.recorder.start();
        toggleRec(true);
      }).catch(function () {
        EM.showToast("マイクの使用が許可されませんでした", true);
      });
    });
    click("rec-stop", function () {
      if (rec.recorder && rec.recorder.state !== "inactive") rec.recorder.stop();
      if (rec.stream) rec.stream.getTracks().forEach(function (t) { t.stop(); });
      toggleRec(false);
    });
    click("rec-play", function () { if (rec.url) new Audio(rec.url).play(); });
  }
  function toggleRec(on) {
    var s = document.getElementById("rec-start"), e = document.getElementById("rec-stop");
    if (s) s.disabled = on; if (e) e.disabled = !on;
  }

  /* ---------- 終了（履歴保存）---------- */
  function finishHtml() {
    return '<button class="btn btn--primary btn--block mt-5" id="finish-btn" type="button">練習を終える</button>';
  }
  function bindFinish() {
    click("finish-btn", function () {
      Storage.recordStudy(3);
      Storage.incTotals({ shadowingRuns: 1, sessions: 1 });
      Storage.addHistory({ type: "shadowing", at: new Date().toISOString(), lines: cues.length });
      EM.refreshStreakBadge();
      EM.showToast("シャドーイングを記録しました");
      teardown();
      location.hash = "#/home";
    });
  }

  /* ---------- クリーンアップ ---------- */
  function teardown() {
    stopPolling();
    activeIdx = -1; loopA = loopB = null; loopOn = false;
    if (rec.recorder && rec.recorder.state !== "inactive") { try { rec.recorder.stop(); } catch (e) {} }
    if (rec.stream) { rec.stream.getTracks().forEach(function (t) { t.stop(); }); rec.stream = null; }
    if (player && player.destroy) { try { player.destroy(); } catch (e) {} player = null; }
  }

  function click(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }

  EM.registerView("#/video", { title: "動画学習", tab: "video", render: render });
})();

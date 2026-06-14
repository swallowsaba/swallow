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
  var currentTitle = "";    // 選択中の動画タイトル
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

  // URLの種類を判定して { type, id|fileUrl, label } を返す
  // type: "youtube" | "file"(mp4等の直接動画) | "external"(Netflix等の埋め込み不可)
  function detectSource(url) {
    url = (url || "").trim();
    if (!url) return { type: "none" };
    var yid = extractVideoId(url);
    if (yid) return { type: "youtube", id: yid, label: "YouTube" };
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return { type: "file", fileUrl: url, label: "動画ファイル" };
    // Netflix・その他の動画サイトは埋め込み再生・字幕取得ともに不可（DRM/規約）
    var host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
    return { type: "external", url: url, label: host || "外部サイト" };
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

  // 再生画面の上部：戻りリンク＋タイトル
  function titleBarHtml() {
    return '<a class="back-link" id="shadow-back" href="#/video">‹ 動画を選び直す</a>' +
      (currentTitle ? '<p class="section-title" style="font-size:var(--fs-body);margin-bottom:var(--space-3)">' + EM.escapeHtml(currentTitle) + "</p>" : "");
  }
  function bindTitleBar() {
    var b = document.getElementById("shadow-back");
    if (b) b.addEventListener("click", function (e) { e.preventDefault(); teardown(); drawSetup(); });
  }

  function drawSetup() {
    var videos = Storage.getVideos();

    var libraryHtml;
    if (!videos.length) {
      libraryHtml =
        '<div class="empty-state" style="padding:var(--space-5) var(--space-3)">' +
          '<div class="empty-state__icon">▷</div>' +
          '<p class="empty-state__title">保存した動画はまだありません</p>' +
          '<p class="empty-state__body">下の「＋ 動画を追加」から、学習したいYouTube動画と字幕を登録すると、次回から一覧で選べます。</p>' +
        "</div>";
    } else {
      libraryHtml = '<div class="card" style="padding:0">' + videos.map(function (v) {
        var thumb = v.videoId
          ? '<img class="vid-thumb" src="https://img.youtube.com/vi/' + EM.escapeHtml(v.videoId) + '/mqdefault.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.outerHTML=\'<div class=&quot;vid-thumb vid-thumb--none&quot;>YouTube</div>\';" />'
          : '<div class="vid-thumb vid-thumb--none">字幕<br>のみ</div>';
        return '<div class="list-row">' +
          thumb +
          '<div class="list-row__main">' +
            '<div class="list-row__title">' + EM.escapeHtml(v.title || "（無題）") + "</div>" +
            '<div class="list-row__sub">' + (v.videoId ? "YouTube" : "字幕のみ") + " ・ " + cueCountLabel(v.subtitles) + "</div>" +
          "</div>" +
          '<button class="audio-btn" type="button" data-play="' + v.id + '" aria-label="練習">▶</button>' +
          '<button class="audio-btn" type="button" data-edit="' + v.id + '" aria-label="編集" style="background:var(--c-surface-2);color:var(--c-ink-soft)">✎</button>' +
          '<button class="audio-btn" type="button" data-del="' + v.id + '" aria-label="削除" style="background:var(--c-bad-soft);color:var(--c-bad)">✕</button>' +
        "</div>";
      }).join("") + "</div>";
    }

    root().innerHTML =
      '<div class="row-between"><p class="section-title" style="margin:0">シャドーイング</p>' +
        '<span class="text-soft" style="font-size:var(--fs-small)">保存 ' + videos.length + " 件</span></div>" +
      '<div class="notice notice--info"><span class="notice__icon">i</span>' +
        '<span>学習する動画は<strong>自分で選べます</strong>。YouTubeのURLを入れて「字幕を自動取得」すれば、字幕の手入力は不要です（取得できない動画は手動貼り付けにも対応）。登録した動画は一覧に保存され、いつでも選んで練習できます。</span></div>' +
      '<p class="section-title mt-5" style="font-size:var(--fs-body)">保存した動画から選ぶ</p>' +
      libraryHtml +
      '<button class="btn btn--primary btn--block mt-4" id="add-video" type="button">＋ 動画を追加</button>' +
      '<button class="btn btn--ghost btn--block mt-4" id="quick-practice" type="button">登録せずにすぐ練習する</button>';

    document.getElementById("add-video").addEventListener("click", function () { drawForm(null); });
    document.getElementById("quick-practice").addEventListener("click", function () { drawForm(null, true); });

    root().querySelectorAll("[data-play]").forEach(function (b) {
      b.addEventListener("click", function () { playSaved(b.getAttribute("data-play")); });
    });
    root().querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { drawForm(b.getAttribute("data-edit")); });
    });
    root().querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("この動画を一覧から削除しますか？")) return;
        Storage.deleteVideo(b.getAttribute("data-del"));
        EM.showToast("削除しました");
        drawSetup();
      });
    });
  }

  // 字幕テキストから行数ラベルを作る
  function cueCountLabel(sub) {
    if (!sub) return "字幕なし";
    var n = window.Subtitle.parse(sub).length;
    return n + " 行";
  }

  // 保存済み動画を選んで練習開始（動画ありなら選択肢を出す）
  function playSaved(id) {
    var v = Storage.getVideos().find(function (x) { return x.id === id; });
    if (!v) return;
    cues = window.Subtitle.parse(v.subtitles || "");
    if (!cues.length && v.sourceType !== "external" && v.sourceType !== "file" && v.videoId) {
      EM.showToast("この動画には字幕が登録されていません", true); return;
    }
    currentTitle = v.title || "";
    playEntry(v);
  }

  // ソース種別に応じて再生画面を振り分ける
  function playEntry(v) {
    if (v.videoId) { drawPlayer(v.videoId); return; }
    if (v.fileUrl || v.sourceType === "file") { drawFilePlayer(v.fileUrl || v.url); return; }
    if (v.sourceType === "external" && v.url) { drawExternal(v.url); return; }
    // 字幕のみ
    drawSilent("");
  }

  // Netflix等の外部サイト：別タブで開く＋ライブ文字起こしを並行する練習画面
  function drawExternal(url) {
    activeIdx = 0;
    var host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
    root().innerHTML =
      titleBarHtml() +
      '<div class="ext-hero">' +
        '<div class="ext-hero__badge">' + EM.escapeHtml(host || "外部サイト") + '</div>' +
        '<p class="ext-hero__title">この動画は埋め込み再生できません</p>' +
        '<p class="ext-hero__desc">' + EM.escapeHtml(host || "このサイト") + ' は著作権保護（DRM）のため、他アプリ内での再生が技術的に禁止されています。下のボタンで動画を開き、本アプリと並べて練習しましょう。</p>' +
        '<button class="btn btn--primary btn--block" id="ext-open" type="button">▶ ' + EM.escapeHtml(host || "動画") + ' を別画面で開く</button>' +
        '<button class="btn btn--ghost btn--block mt-4" id="ext-live" type="button">🎙 マイクで字幕を作りながら練習（ライブ文字起こし）</button>' +
      '</div>' +
      '<div class="notice notice--info mt-4"><span class="notice__icon">i</span><span>すでに字幕がある場合は、そのまま下の行で練習できます。動画は別画面で再生してください。</span></div>' +
      '<div class="lyric mt-4" id="lyric"></div>' +
      '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr 1fr">' +
        '<button class="btn btn--ghost" id="say-line" type="button">▶ お手本</button>' +
        '<button class="btn btn--ghost" id="prev-line" type="button">‹ 前へ</button>' +
        '<button class="btn btn--primary" id="next-line" type="button">次へ ›</button>' +
      "</div>" +
      recorderHtml() +
      finishHtml();
    bindTitleBar();
    renderLyrics();
    highlightActive();
    bindRecorder();
    bindFinish();

    click("ext-open", function () { window.open(url, "_blank", "noopener"); });
    click("ext-live", function () { startLiveCaptionLive(); });
    click("say-line", function () { if (cues[activeIdx]) EM.speak(splitEnJa(cues[activeIdx].text).en); });
    click("prev-line", function () { if (activeIdx > 0) { activeIdx--; highlightActive(); } });
    click("next-line", function () { if (activeIdx < cues.length - 1) { activeIdx++; highlightActive(); } });
  }

  // 練習画面から直接ライブ文字起こしを起動し、結果を現在のcuesに反映して再描画
  function startLiveCaptionLive() {
    if (!window.LiveCaption || !window.LiveCaption.isSupported()) {
      EM.showToast("この端末はライブ文字起こしに非対応です（Chrome系を推奨）", true);
      return;
    }
    var overlay = document.createElement("div");
    overlay.className = "live-cc-overlay";
    overlay.innerHTML =
      '<div class="live-cc-card">' +
        '<p class="live-cc__title">🎙 ライブ文字起こし</p>' +
        '<p class="live-cc__hint">動画を音を出して再生し「開始」を押してください。聞き取った字幕が練習行に追加されます。スピーカー再生・静かな環境だと精度が上がります。</p>' +
        '<div class="live-cc__transcript" id="live-transcript"><span class="live-cc__placeholder">ここに字幕が表示されます…</span></div>' +
        '<p class="live-cc__interim" id="live-interim"></p>' +
        '<div class="live-cc__btns">' +
          '<button class="btn btn--primary" id="live-start" type="button">● 開始</button>' +
          '<button class="btn btn--danger" id="live-stop" type="button" disabled>■ 停止して使う</button>' +
          '<button class="btn btn--ghost" id="live-cancel" type="button">閉じる</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var collected = [];
    var transcriptEl = overlay.querySelector("#live-transcript");
    var interimEl = overlay.querySelector("#live-interim");
    var startBtn = overlay.querySelector("#live-start");
    var stopBtn = overlay.querySelector("#live-stop");
    function renderT() {
      transcriptEl.innerHTML = collected.length
        ? collected.map(function (c) { return '<span class="live-cc__line">' + EM.escapeHtml(c.text) + "</span>"; }).join("")
        : '<span class="live-cc__placeholder">ここに字幕が表示されます…</span>';
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
    startBtn.addEventListener("click", function () {
      startBtn.disabled = true;
      liveSession = window.LiveCaption.start({
        onStart: function () { stopBtn.disabled = false; startBtn.textContent = "● 認識中…"; },
        onInterim: function (t) { interimEl.textContent = t; },
        onCue: function (cue) { collected.push(cue); interimEl.textContent = ""; renderT(); },
        onError: function (msg) { EM.showToast(msg, true); startBtn.disabled = false; startBtn.textContent = "● 開始"; }
      });
    });
    stopBtn.addEventListener("click", function () {
      if (liveSession) { liveSession.stop(); liveSession = null; }
      if (collected.length) {
        cues = collected.slice();
        document.body.removeChild(overlay);
        renderLyrics(); highlightActive();
        EM.showToast(collected.length + " 行の字幕を作成しました");
      } else {
        EM.showToast("字幕が作られませんでした。音量を上げて再度お試しください", true);
      }
    });
    overlay.querySelector("#live-cancel").addEventListener("click", function () {
      if (liveSession) { liveSession.stop(); liveSession = null; }
      document.body.removeChild(overlay);
    });
  }

  /* ---------- 追加 / 編集フォーム ---------- */
  function drawForm(editId, quickOnly) {
    var editing = editId ? Storage.getVideos().find(function (x) { return x.id === editId; }) : null;
    var title = editing ? editing.title : "";
    var url = editing ? editing.url : "";
    var sub = editing ? editing.subtitles : "";

    root().innerHTML =
      '<a class="back-link" id="form-back" href="#/video">‹ 一覧へ戻る</a>' +
      '<p class="section-title">' + (editing ? "動画を編集" : (quickOnly ? "すぐ練習" : "動画を追加")) + "</p>" +
      (quickOnly ? "" :
        '<div class="field"><label class="field__label" for="vid-title">タイトル（任意）</label>' +
          '<input class="input" id="vid-title" type="text" placeholder="例：TED 〇〇 のスピーチ" value="' + EM.escapeHtml(title) + '" /></div>') +
      '<div class="field"><label class="field__label" for="yt-url">動画URL（YouTube / 動画ファイル / Netflix等）</label>' +
        '<input class="input" id="yt-url" type="text" placeholder="https://... または .mp4 のURL" value="' + EM.escapeHtml(url) + '" /></div>' +
      '<button class="btn btn--primary btn--block" id="fetch-cc" type="button">🔎 URLから字幕を自動取得（YouTube）</button>' +
      '<p class="text-soft mt-4" id="cc-status" style="font-size:var(--fs-small)"></p>' +

      '<div class="notice notice--info mt-4"><span class="notice__icon">i</span><span>' +
        '<strong>字幕が無い動画・Netflix等</strong>でも練習できます。下の<strong>「マイクで字幕を作る（ライブ文字起こし）」</strong>を使うと、端末で動画を再生しながら音声を聞き取って字幕を自動生成します。' +
      '</span></div>' +
      '<button class="btn btn--ghost btn--block mt-4" id="live-cc" type="button">🎙 マイクで字幕を作る（ライブ文字起こし）</button>' +

      '<details class="cc-manual mt-4"' + (sub ? " open" : "") + '>' +
        '<summary>自動取得できないとき：字幕を貼り付け（SRT/VTT/テキスト）</summary>' +
        '<div class="field mt-4">' +
          '<textarea class="textarea" id="sub-in" placeholder="字幕を貼り付け">' + EM.escapeHtml(sub) + "</textarea></div>" +
      "</details>" +

      (quickOnly
        ? '<button class="btn btn--primary btn--block mt-4" id="quick-go" type="button">この内容で練習する</button>'
        : '<button class="btn btn--primary btn--block mt-4" id="save-video" type="button">' + (editing ? "保存する" : "保存して一覧に追加") + "</button>" +
          '<button class="btn btn--ghost btn--block mt-4" id="save-and-play" type="button">保存してすぐ練習</button>') +
      '<button class="btn btn--ghost btn--block mt-4" id="silent-go" type="button">動画なし（字幕だけ）で練習</button>';

    document.getElementById("form-back").addEventListener("click", function (e) { e.preventDefault(); drawSetup(); });
    document.getElementById("fetch-cc").addEventListener("click", autoFetch);
    document.getElementById("live-cc").addEventListener("click", function () { startLiveCaption(title); });
    document.getElementById("silent-go").addEventListener("click", function () {
      var subRaw = document.getElementById("sub-in").value || "";
      var parsed = window.Subtitle.parse(subRaw);
      if (!parsed.length) { EM.showToast("先に字幕を取得または貼り付けてください", true); openManual(); return; }
      cues = parsed; currentTitle = title || ""; drawSilent();
    });

    if (quickOnly) {
      document.getElementById("quick-go").addEventListener("click", function () {
        var s = readForm();
        if (!s) return;
        cues = s.cues; currentTitle = "";
        playEntry({ videoId: s.videoId, fileUrl: s.fileUrl, sourceType: s.sourceType, url: document.getElementById('yt-url').value });
      });
      return;
    }

    document.getElementById("save-video").addEventListener("click", function () {
      if (saveForm(editing)) { EM.showToast(editing ? "更新しました" : "一覧に追加しました"); drawSetup(); }
    });
    document.getElementById("save-and-play").addEventListener("click", function () {
      var saved = saveForm(editing);
      if (!saved) return;
      cues = window.Subtitle.parse(saved.subtitles || "");
      if (!cues.length && saved.sourceType !== "external" && saved.sourceType !== "file") {
        EM.showToast("字幕を取得または入力してください", true); return;
      }
      currentTitle = saved.title || "";
      playEntry(saved);
    });
  }

  function openManual() {
    var d = document.querySelector(".cc-manual");
    if (d) d.open = true;
  }

  // ライブ文字起こし：マイクで音声を聞き取り、字幕を生成して textarea に書き込む
  var liveSession = null;
  function startLiveCaption(title) {
    if (!window.LiveCaption || !window.LiveCaption.isSupported()) {
      EM.showToast("この端末はライブ文字起こしに非対応です（Chrome系ブラウザを推奨）", true);
      return;
    }
    var url = (document.getElementById("yt-url").value || "").trim();
    var src = detectSource(url);

    // 文字起こし用のオーバーレイUI
    var overlay = document.createElement("div");
    overlay.className = "live-cc-overlay";
    overlay.innerHTML =
      '<div class="live-cc-card">' +
        '<p class="live-cc__title">🎙 ライブ文字起こし</p>' +
        '<ol class="live-cc__steps">' +
          '<li>別の画面・端末で動画（' + EM.escapeHtml(src.label || "動画") + '）を<strong>音を出して再生</strong>します' +
            (src.type === "external" && url ? ' <a href="' + EM.escapeHtml(url) + '" target="_blank" rel="noopener">▶ 開く</a>' : "") + '</li>' +
          '<li>下の「開始」を押し、マイクの使用を<strong>許可</strong>します</li>' +
          '<li>聞き取った英語が字幕になります。終わったら「停止して使う」</li>' +
        '</ol>' +
        '<p class="live-cc__hint">※ 端末のスピーカー音をマイクが拾います。静かな部屋で、音量を上げると精度が上がります。イヤホンだと拾えないのでスピーカー再生にしてください。</p>' +
        '<div class="live-cc__transcript" id="live-transcript"><span class="live-cc__placeholder">ここに字幕が表示されます…</span></div>' +
        '<p class="live-cc__interim" id="live-interim"></p>' +
        '<div class="live-cc__btns">' +
          '<button class="btn btn--primary" id="live-start" type="button">● 開始</button>' +
          '<button class="btn btn--danger" id="live-stop" type="button" disabled>■ 停止して使う</button>' +
          '<button class="btn btn--ghost" id="live-cancel" type="button">閉じる</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var collected = [];
    var transcriptEl = overlay.querySelector("#live-transcript");
    var interimEl = overlay.querySelector("#live-interim");
    var startBtn = overlay.querySelector("#live-start");
    var stopBtn = overlay.querySelector("#live-stop");

    function renderTranscript() {
      transcriptEl.innerHTML = collected.length
        ? collected.map(function (c) { return '<span class="live-cc__line">' + EM.escapeHtml(c.text) + "</span>"; }).join("")
        : '<span class="live-cc__placeholder">ここに字幕が表示されます…</span>';
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }

    startBtn.addEventListener("click", function () {
      startBtn.disabled = true;
      liveSession = window.LiveCaption.start({
        onStart: function () { stopBtn.disabled = false; startBtn.textContent = "● 認識中…"; },
        onInterim: function (t) { interimEl.textContent = t; },
        onCue: function (cue) { collected.push(cue); interimEl.textContent = ""; renderTranscript(); },
        onError: function (msg) { EM.showToast(msg, true); startBtn.disabled = false; startBtn.textContent = "● 開始"; },
        onEnd: function () {}
      });
    });

    stopBtn.addEventListener("click", function () {
      if (liveSession) { liveSession.stop(); liveSession = null; }
      if (!collected.length) { EM.showToast("字幕が作られませんでした。音量を上げて再度お試しください", true); return; }
      // textareaにSRTとして書き込み、手動欄を開く
      document.getElementById("sub-in").value = cuesToSRT(collected);
      openManual();
      var status = document.getElementById("cc-status");
      if (status) { status.style.color = "var(--c-good)"; status.textContent = "✓ ライブ文字起こしで " + collected.length + " 行を作成しました。下の保存・練習へ。"; }
      document.body.removeChild(overlay);
    });

    overlay.querySelector("#live-cancel").addEventListener("click", function () {
      if (liveSession) { liveSession.stop(); liveSession = null; }
      document.body.removeChild(overlay);
    });
  }

  // URLから字幕を自動取得して textarea に反映
  function autoFetch() {
    var btn = document.getElementById("fetch-cc");
    var status = document.getElementById("cc-status");
    var url = (document.getElementById("yt-url").value || "").trim();
    var src = detectSource(url);

    // YouTube以外は字幕APIが無い → ライブ文字起こしへ誘導
    if (src.type !== "youtube") {
      status.style.color = "var(--c-warm)";
      if (src.type === "external") {
        status.innerHTML = "<strong>" + EM.escapeHtml(src.label) + "</strong> はアプリ内に埋め込んで再生できません（著作権保護=DRMのため、技術的に他アプリでの再生・字幕取得が禁止されています）。<br>" +
          "▶ <strong>保存して練習</strong>すると、" + EM.escapeHtml(src.label) + "を別画面で開くボタン＋ライブ文字起こしを並べた練習画面になります。<br>" +
          "▶ または字幕テキストを下に貼り付けてください。";
      } else if (src.type === "file") {
        status.innerHTML = "動画ファイルのURLですね。字幕は自動取得できないため、<strong>「🎙 マイクで字幕を作る」</strong>か、字幕の貼り付けをご利用ください。";
      } else {
        status.innerHTML = "URLが空です。YouTube・動画ファイル・Netflix等のURLを入力してください。";
      }
      openManual();
      return;
    }

    var videoId = src.id;
    btn.disabled = true;
    status.style.color = "";
    status.textContent = "字幕を取得中…（数秒かかることがあります）";

    window.Captions.fetchCaptions(videoId).then(function (cuesFetched) {
      var srt = cuesToSRT(cuesFetched);
      document.getElementById("sub-in").value = srt;
      openManual();
      status.style.color = "var(--c-good)";
      status.textContent = "✓ 字幕を取得しました（" + cuesFetched.length + " 行）。下の「保存してすぐ練習」へ。";
    }).catch(function (err) {
      status.style.color = "var(--c-warm)";
      status.innerHTML = "字幕を自動取得できませんでした。<br>" +
        "▶ この動画に字幕が無い場合は、上の<strong>「🎙 マイクで字幕を作る」</strong>で生成できます。<br>" +
        "▶ または下の欄に字幕を貼り付けてください。<br>" +
        "▶ 設定の「字幕取得プロキシ」を設定すると成功率が上がります。";
      openManual();
    }).finally(function () { btn.disabled = false; });
  }

  // cue配列をSRTテキスト化（タイムコードを保持して再パース可能に）
  function cuesToSRT(cues) {
    function ts(sec) {
      sec = Math.max(0, sec || 0);
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = Math.floor(sec % 60);
      var ms = Math.round((sec - Math.floor(sec)) * 1000);
      function p(n, w) { return String(n).padStart(w || 2, "0"); }
      return p(h) + ":" + p(m) + ":" + p(s) + "," + p(ms, 3);
    }
    return cues.map(function (c, i) {
      return (i + 1) + "\n" + ts(c.start) + " --> " + ts(c.end) + "\n" + c.text;
    }).join("\n\n");
  }

  // フォーム値を読む（保存せず {cues, videoId} を返す）
  function readForm() {
    var subRaw = document.getElementById("sub-in").value || "";
    var parsed = window.Subtitle.parse(subRaw);
    var src = detectSource(document.getElementById("yt-url").value || "");
    // external(Netflix等)/file は画面内でライブ文字起こしできるので、字幕未入力でも可
    if (!parsed.length && src.type !== "external" && src.type !== "file") {
      EM.showToast("字幕を取得または入力してください", true); openManual(); return null;
    }
    return { cues: parsed, videoId: src.id || null, fileUrl: src.fileUrl || null, sourceType: src.type };
  }

  // フォーム値を保存し、保存済み動画オブジェクトを返す
  function saveForm(editing) {
    var titleEl = document.getElementById("vid-title");
    var subRaw = document.getElementById("sub-in").value || "";
    var url = document.getElementById("yt-url").value || "";
    var src = detectSource(url);
    // external(Netflix等)/file は画面内でライブ文字起こしできるので、字幕未入力でも保存可
    if (!window.Subtitle.parse(subRaw).length && src.type !== "external" && src.type !== "file") {
      EM.showToast("字幕を取得または入力してください", true); openManual(); return null;
    }
    var label = src.type === "youtube" ? "YouTube動画" : src.type === "file" ? "動画ファイル" : src.type === "external" ? (src.label + "（外部）") : "字幕のみ";
    var entry = {
      title: (titleEl ? titleEl.value : "").trim() || label,
      url: url.trim(),
      videoId: src.id || null,
      fileUrl: src.fileUrl || null,
      sourceType: src.type,
      subtitles: subRaw
    };
    if (editing) entry.id = editing.id;
    return Storage.saveVideo(entry);
  }

  /* ---------- 動画モード ---------- */
  function drawPlayer(videoId) {
    root().innerHTML =
      titleBarHtml() +
      '<div class="video-frame"><div id="yt-player"></div></div>' +
      controlsHtml() +
      recorderHtml() +
      '<div class="lyric mt-4" id="lyric"></div>' +
      finishHtml();

    bindTitleBar();
    renderLyrics();
    bindControls();
    bindRecorder();
    bindFinish();

    ensureYouTubeAPI(function () {
      player = new YT.Player("yt-player", {
        videoId: videoId,
        playerVars: { rel: 0, playsinline: 1, origin: location.origin },
        events: {
          onReady: function () { startPolling(); },
          onError: function (e) {
            // 2:無効なID 5:HTML5不可 100:動画なし/非公開 101,150:埋め込み禁止
            var code = e && e.data;
            var msg = (code === 101 || code === 150)
              ? "この動画は埋め込み再生が許可されていません。別の動画でお試しください（YouTubeで開けば視聴は可能です）。"
              : (code === 100) ? "動画が見つかりません（削除・非公開の可能性）。"
              : (code === 2) ? "動画URLが正しくありません。"
              : "動画を読み込めませんでした（コード " + code + "）。";
            var frame = document.querySelector(".video-frame");
            if (frame) frame.insertAdjacentHTML("afterend",
              '<div class="notice notice--warn" id="yt-err"><span class="notice__icon">!</span><span>' + EM.escapeHtml(msg) +
              ' <a href="https://www.youtube.com/watch?v=' + EM.escapeHtml(videoId) + '" target="_blank" rel="noopener">YouTubeで開く</a></span></div>');
            EM.showToast(msg, true);
          }
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

  /* ---------- 動画ファイル(mp4等)モード ---------- */
  function drawFilePlayer(fileUrl) {
    root().innerHTML =
      titleBarHtml() +
      '<div class="video-frame"><video id="file-video" playsinline controls style="width:100%;height:100%;background:#000"></video></div>' +
      controlsHtml() +
      recorderHtml() +
      '<div class="lyric mt-4" id="lyric"></div>' +
      finishHtml();

    bindTitleBar();
    renderLyrics();
    bindControls();
    bindRecorder();
    bindFinish();

    var video = document.getElementById("file-video");
    video.src = fileUrl;
    video.onerror = function () {
      var frame = document.querySelector(".video-frame");
      if (frame) frame.insertAdjacentHTML("afterend",
        '<div class="notice notice--warn"><span class="notice__icon">!</span><span>この動画ファイルを再生できませんでした（URL・形式・CORSをご確認ください）。字幕だけでも練習できます。</span></div>');
    };
    // YT.Player互換のラッパーを player に持たせ、既存のコントロール/ポーリングを流用
    player = {
      getCurrentTime: function () { return video.currentTime || 0; },
      seekTo: function (t) { video.currentTime = t; },
      playVideo: function () { video.play(); },
      pauseVideo: function () { video.pause(); },
      getPlayerState: function () { return video.paused ? 2 : 1; },
      setPlaybackRate: function (r) { video.playbackRate = r; }
    };
    if (!window.YT) window.YT = { PlayerState: { PLAYING: 1, PAUSED: 2 } };
    startPolling();
  }

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
  function drawSilent(externalUrl) {
    activeIdx = 0;
    root().innerHTML =
      titleBarHtml() +
      (externalUrl
        ? '<div class="notice notice--warn"><span class="notice__icon">!</span><span>この動画は埋め込み再生できないため、字幕で練習します。動画は別画面で再生してください。 <a href="' + EM.escapeHtml(externalUrl) + '" target="_blank" rel="noopener">▶ 動画を開く</a></span></div>'
        : '<div class="notice notice--info"><span class="notice__icon">i</span><span>各行を読み上げ（お手本）→自分で発音、を手動で進めます。</span></div>') +
      '<div class="lyric mt-4" id="lyric"></div>' +
      '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr 1fr">' +
        '<button class="btn btn--ghost" id="say-line" type="button">▶ お手本</button>' +
        '<button class="btn btn--ghost" id="prev-line" type="button">‹ 前へ</button>' +
        '<button class="btn btn--primary" id="next-line" type="button">次へ ›</button>' +
      "</div>" +
      recorderHtml() +
      finishHtml();
    bindTitleBar();
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

  EM.registerView("#/video", { title: "動画学習", tab: "learn", render: render });
})();

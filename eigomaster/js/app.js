/* ============================================================
   app.js — アプリ中核：初期化・ルーティング・共有API(EM)・ホーム・設定
   - window.EM に共有ヘルパー（TTS・トースト・画面登録・ナビ等）を公開。
   - 各機能モジュールは読み込み時に EM.registerView() で画面を登録する。
   - ルーターは登録済みビューを参照して描画する（5タブ＋サブ画面）。
   storage.js が先に読み込まれている前提。
   ============================================================ */
(function () {
  "use strict";

  var DEFAULT_ROUTE = "#/home";
  var GOAL_MIN = 5, GOAL_MAX = 120, GOAL_STEP = 5;
  var TOAST_DURATION_MS = 2600;
  var GRAPH_DAYS = 7;            // 進捗グラフの表示日数

  /* ---------- DOM 参照 ---------- */
  var viewEl = document.getElementById("view");
  var titleEl = document.getElementById("screen-title");
  var streakCountEl = document.getElementById("streak-count");
  var tabEls = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  /* ============================================================
     共有 API（EM）— 各モジュールが利用する
     ============================================================ */
  var EM = {
    views: {} // routeKey -> { title, tab, render }
  };
  window.EM = EM;

  // 画面を登録する。def = { title, tab, render }
  EM.registerView = function (routeKey, def) {
    EM.views[routeKey] = def;
  };

  // HTMLエスケープ（ユーザー入力をDOMに差し込む際の安全対策）
  EM.escapeHtml = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // トースト通知
  EM.showToast = function (message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("toast--error", !!isError);
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.setAttribute("data-show", "true"); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.setAttribute("data-show", "false"); }, TOAST_DURATION_MS);
  };

  /* ---------- 音声合成（TTS）----------
     重要：日本語端末では既定ボイスが日本語のため、英文がカタカナのように
     発音されてしまう。これを防ぐため、英語ボイスを確実に読み込んでから、
     高品質な en-US ボイスを明示的に割り当てて話す。
  */
  var cachedVoices = [];
  var voicesReady = false;
  var speakQueue = [];   // ボイス未ロード時に再生待ちにする

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    var v = window.speechSynthesis.getVoices() || [];
    if (v.length) { cachedVoices = v; voicesReady = true; }
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = function () {
      loadVoices();
      // 待機していた読み上げを実行
      if (voicesReady && speakQueue.length) {
        var q = speakQueue.slice(); speakQueue.length = 0;
        q.forEach(function (item) { doSpeak(item.text, item.opts); });
      }
    };
    // 一部ブラウザは voiceschanged が来ないので保険でポーリング
    var tries = 0;
    var poll = setInterval(function () {
      loadVoices(); tries++;
      if (voicesReady || tries > 20) clearInterval(poll);
    }, 250);
  }

  // 利用可能な英語ボイスを品質順に返す
  function getEnglishVoices() {
    if (!cachedVoices.length) loadVoices();
    var en = cachedVoices.filter(function (v) {
      return /^en([-_]|$)/i.test(v.lang); // en, en-US, en_GB など。日本語(ja)は除外
    });
    // 高品質と分かっている名前を優先
    var prefer = ["Google US English", "Google UK English", "Samantha", "Alex",
      "Aria", "Jenny", "Microsoft Aria", "Microsoft Jenny", "Zira", "David",
      "Karen", "Daniel", "Moira", "Tessa"];
    function score(v) {
      var s = 0;
      if (/en[-_]?US/i.test(v.lang)) s += 20; else s += 8; // 米国英語を最優先
      for (var i = 0; i < prefer.length; i++) {
        if (v.name && v.name.indexOf(prefer[i]) >= 0) { s += (prefer.length - i) + 10; break; }
      }
      if (/google/i.test(v.name)) s += 6;        // Googleボイスは概して自然
      if (v.localService === false) s += 2;       // ネットワークボイスは高品質なことが多い
      return s;
    }
    return en.sort(function (a, b) { return score(b) - score(a); });
  }
  EM.getEnglishVoices = getEnglishVoices;

  // 使用するボイスを決定（設定で指定があればそれを優先）
  function resolveVoice() {
    var list = getEnglishVoices();
    if (!list.length) return null;
    var savedURI = Storage.getState().profile.voiceURI;
    if (savedURI) {
      var picked = list.find(function (v) { return v.voiceURI === savedURI; });
      if (picked) return picked;
    }
    return list[0];
  }

  var warnedNoVoice = false;
  function doSpeakDevice(text, opts) {
    var voice = resolveVoice();
    // 英語ボイスが無い端末では、日本語ボイスで英単語を読むと
    // 表記(IPA/カタカナ)と全く違う音になるため、誤読を避けて案内のみ表示する。
    var looksEnglish = /[A-Za-z]/.test(String(text));
    if (!voice && looksEnglish) {
      if (!warnedNoVoice) {
        warnedNoVoice = true;
        EM.showToast("この端末に英語の音声がありません。設定→音声で『オンライン英語音声（自動/オンライン）』をお選びください", true);
      }
      return; // 日本語ボイスでの誤った読み上げはしない
    }
    var u = new SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;       // ボイスと言語を一致させる（重要）
    } else {
      u.lang = opts.lang || "en-US";
    }
    u.rate = typeof opts.rate === "number" ? opts.rate : 0.95; // やや自然に
    u.pitch = 1.0;
    if (typeof opts.onend === "function") u.onend = opts.onend;
    window.speechSynthesis.cancel(); // 重複再生を止める
    window.speechSynthesis.speak(u);
  }

  /* ---------- オンライン英語音声（端末に英語ボイスが無くても英語で読む）----------
     CORS対応の無料エンドポイント（Amazon Polly音声）から直接MP3を再生する。
     プロキシ不要・設定不要で、自然なアメリカ英語が鳴る。ネット不通時は端末音声へ。
  */
  var currentAudio = null;
  // オンライン英語TTSの提供元（上から順に試す）。いずれも <audio> で直接再生（CORS不要）。
  //  1) StreamElements（Amazon Polly：声を選べる・自然）
  //  2) Google 翻訳の読み上げ（reliableなフォールバック）
  var TTS_PROVIDERS = [
    function (text, voice) {
      return "https://api.streamelements.com/kappa/v2/speech?voice=" + encodeURIComponent(voice) + "&text=" + encodeURIComponent(text);
    },
    function (text /*, voice*/) {
      return "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text);
    }
  ];
  // 選択可能なオンライン英語ボイス（Amazon Polly）
  var ONLINE_VOICES = [
    { id: "Matthew", label: "Matthew（米・男性）" },
    { id: "Joanna", label: "Joanna（米・女性）" },
    { id: "Joey", label: "Joey（米・男性）" },
    { id: "Justin", label: "Justin（米・男性・若め）" },
    { id: "Kendra", label: "Kendra（米・女性）" },
    { id: "Kimberly", label: "Kimberly（米・女性）" },
    { id: "Salli", label: "Salli（米・女性）" },
    { id: "Ivy", label: "Ivy（米・女性・子ども声）" }
  ];
  EM.ONLINE_VOICES = ONLINE_VOICES;
  function onlineVoiceId() {
    var v = Storage.getState().profile.onlineVoice;
    return v || "Matthew";
  }
  // 長文をチャンク分割（Google翻訳の約200字制限に合わせる）
  function chunkText(text, max) {
    max = max || 190;
    var words = String(text).split(/\s+/);
    var chunks = [], cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > max) { if (cur) chunks.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
    });
    if (cur) chunks.push(cur.trim());
    return chunks.length ? chunks : [text];
  }
  var warnedOnline = false;
  function onlineFailover(text, opts) {
    if (!warnedOnline) {
      warnedOnline = true;
      EM.showToast("オンライン音声に接続できません。端末の声で読み上げます", true);
    }
    doSpeakDevice(text, opts);
  }

  // オンライン音声で読み上げ（CORS不要：Audio要素に直接URLを渡す。提供元を多段フォールバック）
  function speakOnline(text, opts) {
    var voice = onlineVoiceId();
    var chunks = chunkText(text);
    var i = 0;          // チャンク番号
    var aborted = false;

    function playChunk(provIdx) {
      if (aborted) return;
      if (i >= chunks.length) { if (typeof opts.onend === "function") opts.onend(); return; }
      if (provIdx >= TTS_PROVIDERS.length) {
        // すべての提供元で失敗 → 端末音声へ
        aborted = true; onlineFailover(text, opts); return;
      }
      var url = TTS_PROVIDERS[provIdx](chunks[i], voice);
      var a = new Audio(url);             // ※ crossOrigin は付けない（再生にCORSは不要）
      currentAudio = a;
      if (typeof opts.rate === "number") a.playbackRate = Math.max(0.5, Math.min(1, opts.rate));
      a.onended = function () { i++; playChunk(0); };       // 次チャンクは先頭提供元から
      a.onerror = function () { playChunk(provIdx + 1); };  // この提供元が失敗 → 次の提供元
      var p = a.play();
      if (p && p.catch) p.catch(function (err) {
        // 自動再生ブロック（ユーザー操作前）は日本語に落とさず無音で待つ
        if (err && err.name === "NotAllowedError") { aborted = true; return; }
        playChunk(provIdx + 1);
      });
    }

    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    playChunk(0);
  }

  // 実際の読み上げ振り分け
  function doSpeak(text, opts) {
    var mode = Storage.getState().profile.ttsMode || "auto";
    if (mode === "device") { doSpeakDevice(text, opts); return; }
    if (mode === "online") { speakOnline(text, opts); return; }
    // auto：原則オンラインの英語音声（自然な米国英語）。失敗時は端末音声へ自動フォールバック。
    if (navigator.onLine === false) { doSpeakDevice(text, opts); return; }
    speakOnline(text, opts);
  }

  // テキストを読み上げる。opts = { rate, lang, onend }
  EM.speak = function (text, opts) {
    opts = opts || {};
    if (!text) return;
    EM.stopSpeak();
    var mode = Storage.getState().profile.ttsMode || "auto";
    // 端末音声を使う場合はボイス読み込みを待つ
    if (mode === "device" && "speechSynthesis" in window && !voicesReady) {
      loadVoices();
      if (!voicesReady) {
        speakQueue.length = 0;
        speakQueue.push({ text: text, opts: opts });
        setTimeout(function () {
          loadVoices();
          if (speakQueue.length) { var item = speakQueue.shift(); if (item) doSpeak(item.text, item.opts); }
        }, 350);
        return;
      }
    }
    doSpeak(text, opts);
  };
  EM.stopSpeak = function () {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
  };
  EM.hasTTS = true; // オンライン音声があるため常に利用可能

  // サブ画面の戻りリンク（HTML文字列）
  EM.backLink = function (toRoute, label) {
    return '<a class="back-link" href="' + toRoute + '">‹ ' + EM.escapeHtml(label || "戻る") + '</a>';
  };

  // ナビゲーション（再描画）
  EM.navigate = function () { navigate(); };

  // ストリークバッジ更新
  function refreshStreakBadge() {
    var state = Storage.getState();
    if (streakCountEl) streakCountEl.textContent = String(state.progress.streak.current);
  }
  EM.refreshStreakBadge = refreshStreakBadge;

  /* ============================================================
     ホーム画面（ダッシュボード）
     ============================================================ */
  function greetingByHour() {
    var h = new Date().getHours();
    if (h < 5) return "おつかれさまです";
    if (h < 11) return "おはようございます";
    if (h < 18) return "こんにちは";
    return "こんばんは";
  }

  // バッジ定義（達成条件は state を受け取る関数）
  var BADGES = [
    { id: "first",   icon: "✦", label: "はじめの一歩", test: function (s) { return s.progress.totals.sessions >= 1; } },
    { id: "streak3", icon: "▲", label: "3日連続",     test: function (s) { return s.progress.streak.longest >= 3; } },
    { id: "streak7", icon: "★", label: "7日連続",     test: function (s) { return s.progress.streak.longest >= 7; } },
    { id: "words25", icon: "あ", label: "単語25",      test: function (s) { return s.progress.totals.wordsLearned >= 25; } },
    { id: "words100",icon: "語", label: "単語100",     test: function (s) { return s.progress.totals.wordsLearned >= 100; } },
    { id: "shadow1", icon: "▷", label: "シャドー初挑戦", test: function (s) { return s.progress.totals.shadowingRuns >= 1; } }
  ];

  function renderHome() {
    var state = Storage.getState();
    var goal = state.profile.dailyGoalMinutes;
    var mins = Storage.getTodayMinutes();
    var ratio = goal > 0 ? Math.min(mins / goal, 1) : 0;
    var pct = Math.round(ratio * 100);
    var streak = state.progress.streak.current;
    var totals = state.progress.totals;
    var levelLabel = state.profile.level ? state.profile.level : "未診断";

    var subMessage = streak > 0
      ? streak + "日連続で学習中。今日も続けましょう。"
      : "最初の1日をはじめましょう。少しでも前進です。";

    var badgeHtml = BADGES.map(function (b) {
      var earned = b.test(state);
      return '<div class="badge ' + (earned ? "badge--on" : "badge--off") + '" title="' + EM.escapeHtml(b.label) + '">' +
               '<span class="badge__icon">' + b.icon + '</span>' +
               '<span class="badge__label">' + EM.escapeHtml(b.label) + '</span>' +
             '</div>';
    }).join("");

    var html =
      '<section class="stack-md view-enter">' +

        '<div class="home-hero">' +
          '<p class="home-hero__eyebrow">TODAY\'S STUDIO · ' + EM.escapeHtml(levelLabel) + '</p>' +
          '<h1 class="home-hero__greeting">' + greetingByHour() + '</h1>' +
          '<p class="home-hero__sub">' + subMessage + '</p>' +
        '</div>' +

        '<div class="card">' +
          '<p class="section-eyebrow">DAILY GOAL</p>' +
          '<div class="goal">' +
            '<div class="goal__ring" style="--progress:' + ratio + '">' +
              '<span class="goal__ring-value">' + pct + '%</span>' +
            '</div>' +
            '<div class="goal__text">' +
              '<p class="goal__label">本日の学習時間</p>' +
              '<p class="goal__value">' + mins + '<small> / ' + goal + ' 分</small></p>' +
            '</div>' +
          '</div>' +
          '<div class="graph-wrap"><canvas id="study-graph" height="120" aria-label="直近7日間の学習時間グラフ"></canvas></div>' +
        '</div>' +

        '<div>' +
          '<p class="section-title">今日の学習</p>' +
          '<a class="cta-card" href="#/learn">' +
            '<div class="cta-card__main"><p class="cta-card__title">学習をはじめる</p>' +
              '<p class="cta-card__desc">単語・文法・リスニング・発音をまとめて</p></div>' +
            '<span class="cta-card__arrow">→</span>' +
          '</a>' +
          '<div class="quick-grid quick-grid--2 mt-4">' +
            quickCard("あ", "単語", "SRSで暗記", "#/vocab") +
            quickCard("🎧", "リスニング", "聞き取り", "#/listening") +
            quickCard("θ", "発音", "発音/音声変化", "#/pron") +
            quickCard("文", "文法", "解説つき", "#/grammar") +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<p class="section-eyebrow">BADGES</p>' +
          '<div class="badge-row">' + badgeHtml + '</div>' +
        '</div>' +

        '<div class="card">' +
          '<p class="section-eyebrow">YOUR RECORD</p>' +
          '<div class="stat-row">' +
            stat(totals.wordsLearned, "覚えた単語") +
            stat(totals.sessions, "学習回数") +
            stat(state.progress.streak.longest, "最長連続") +
          '</div>' +
        '</div>' +

      '</section>';

    return { html: html, onMount: function () { drawStudyGraph(); } };
  }

  function quickCard(icon, title, desc, route) {
    return '<a class="quick-card" href="' + route + '">' +
             '<span class="quick-card__icon">' + icon + '</span>' +
             '<span class="quick-card__title">' + EM.escapeHtml(title) + '</span>' +
             '<span class="quick-card__desc">' + EM.escapeHtml(desc) + '</span>' +
           '</a>';
  }
  function stat(num, label) {
    return '<div class="stat"><div class="stat__num">' + num + '</div>' +
           '<div class="stat__label">' + EM.escapeHtml(label) + '</div></div>';
  }

  // 直近7日間の学習時間を棒グラフで描画（Canvas）
  function drawStudyGraph() {
    var canvas = document.getElementById("study-graph");
    if (!canvas) return;
    var data = Storage.getRecentDailyMinutes(GRAPH_DAYS);
    var goal = Storage.getState().profile.dailyGoalMinutes;

    // テーマ色をCSS変数から取得
    var cs = getComputedStyle(document.documentElement);
    var colAccent = cs.getPropertyValue("--c-accent").trim();
    var colLine = cs.getPropertyValue("--c-line").trim();
    var colInk = cs.getPropertyValue("--c-ink-faint").trim();

    // 解像度対応（Retina）
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 320;
    var cssH = 120;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    var padBottom = 22, padTop = 8;
    var maxVal = Math.max(goal, data.reduce(function (m, d) { return Math.max(m, d.minutes); }, 0), 1);
    var n = data.length;
    var gap = 10;
    var barW = (cssW - gap * (n + 1)) / n;
    var chartH = cssH - padBottom - padTop;

    // 目標ライン
    var goalY = padTop + chartH * (1 - goal / maxVal);
    ctx.strokeStyle = colLine;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, goalY); ctx.lineTo(cssW, goalY); ctx.stroke();
    ctx.setLineDash([]);

    var weekday = ["日","月","火","水","木","金","土"];
    data.forEach(function (d, i) {
      var x = gap + i * (barW + gap);
      var h = chartH * Math.min(d.minutes / maxVal, 1);
      var y = padTop + chartH - h;
      ctx.fillStyle = d.minutes >= goal && goal > 0 ? colAccent : colLine;
      if (d.minutes > 0) ctx.fillStyle = colAccent;
      // 角丸の棒
      var r = Math.min(4, barW / 2);
      roundRect(ctx, x, y, barW, h, r);
      ctx.fill();
      // 曜日ラベル
      ctx.fillStyle = colInk;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      var wd = new Date(d.date + "T00:00:00").getDay();
      ctx.fillText(weekday[wd], x + barW / 2, cssH - 6);
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ============================================================
     学ぶハブ（学ぶタブのトップ。カテゴリ別に全モジュールを集約）
     ============================================================ */
  function renderLearn() {
    function group(title, cards) {
      return '<div class="mt-5"><p class="section-title">' + title + '</p>' +
        '<div class="quick-grid quick-grid--2">' + cards + '</div></div>';
    }
    var html =
      '<section class="stack-md view-enter">' +
        '<p class="home-hero__eyebrow" style="color:var(--c-ink-soft)">LEARN · まなぶ</p>' +
        group("語彙", 
          quickCard("あ", "単語", "SRSで暗記", "#/vocab") +
          quickCard("熟", "熟語・句動詞", "ビジネス頻出", "#/idioms") +
          quickCard("帳", "単語帳", "保存した語", "#/wordbook")
        ) +
        group("文法",
          quickCard("文", "文法レッスン", "解説＋誤答解説", "#/grammar")
        ) +
        group("聞く・話す・読む",
          quickCard("🎧", "リスニング", "書き取り・内容理解", "#/listening") +
          quickCard("▷", "シャドーイング", "動画で練習", "#/video") +
          quickCard("読", "リーディング", "速読・辞書", "#/reading")
        ) +
        group("力試し",
          quickCard("◔", "レベル診断", "10問で判定", "#/diagnosis")
        ) +
      '</section>';
    return { html: html };
  }

  /* ============================================================
     発音ハブ（発音タブのトップ。子画面へ誘導）
     ============================================================ */
  function renderPronHub() {
    var html =
      '<section class="stack-md view-enter">' +
        '<div>' +
          '<p class="section-title">発音トレーニング</p>' +
          '<div class="quick-grid quick-grid--2">' +
            quickCard("θ", "発音チェック", "認識で一致率判定", "#/pron-check") +
            quickCard("æ", "フォニックス", "44音素・聞き分け", "#/phonics") +
            quickCard("◠", "リンキング", "音声変化を可視化", "#/linking") +
            quickCard("カ", "カタカナ変換", "実際の聞こえ方", "#/katakana") +
          '</div>' +
        '</div>' +
      '</section>';
    return { html: html };
  }

  /* ============================================================
     設定画面
     ============================================================ */
  function renderSettings() {
    var state = Storage.getState();
    var theme = state.profile.theme;
    var goal = state.profile.dailyGoalMinutes;

    var html =
      '<section class="stack-md view-enter">' +
        '<div class="setting-group">' +
          '<p class="section-title">表示</p>' +
          '<div class="card" style="padding:0">' +
            '<div class="setting-row">' +
              '<div class="setting-row__text"><p class="setting-row__label">テーマ</p>' +
                '<p class="setting-row__hint">画面の配色を切り替えます</p></div>' +
              '<div class="segmented" id="theme-segmented" role="group" aria-label="テーマ選択">' +
                themeBtn("system", "自動", theme) + themeBtn("light", "ライト", theme) + themeBtn("dark", "ダーク", theme) +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">学習</p>' +
          '<div class="card" style="padding:0">' +
            '<div class="setting-row">' +
              '<div class="setting-row__text"><p class="setting-row__label">デイリーゴール</p>' +
                '<p class="setting-row__hint">1日の目標学習時間（分）</p></div>' +
              '<div class="stepper" aria-label="デイリーゴール">' +
                '<button class="stepper__btn" id="goal-minus" type="button" aria-label="目標を減らす">−</button>' +
                '<span class="stepper__value" id="goal-value">' + goal + '</span>' +
                '<button class="stepper__btn" id="goal-plus" type="button" aria-label="目標を増やす">＋</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">音声（発音）</p>' +
          '<div class="card">' +
            '<p class="setting-row__label">読み上げの方式</p>' +
            '<p class="setting-row__hint" style="margin-bottom:var(--space-3)">既定は<strong>オンライン（自然なアメリカ英語）</strong>です。ネット接続だけで、設定不要で英語の発音になります。オフラインにしたいときは「端末の声」を選べます。</p>' +
            '<div class="segmented" id="tts-mode" role="group" aria-label="読み上げ方式">' +
              ttsModeBtn("auto", "自動", state.profile.ttsMode) +
              ttsModeBtn("online", "オンライン", state.profile.ttsMode) +
              ttsModeBtn("device", "端末の声", state.profile.ttsMode) +
            '</div>' +
            '<p class="setting-row__label mt-5">オンライン音声の声（自動／オンライン時）</p>' +
            '<select class="select mt-4" id="online-voice"></select>' +
            '<p class="setting-row__label mt-5">端末の声（端末モード時）</p>' +
            '<select class="select mt-4" id="voice-select"><option value="">自動（最適な英語の声）</option></select>' +
            '<button class="btn btn--primary btn--block mt-4" id="voice-test" type="button">▶ テスト再生（Could you check it out?）</button>' +
            '<p class="setting-row__hint mt-4" id="voice-hint"></p>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">動画字幕の自動取得</p>' +
          '<div class="card">' +
            '<p class="setting-row__hint" style="margin-bottom:var(--space-3)">字幕の自動取得に使うCORSプロキシです（音声には不要）。空欄なら公開プロキシを使います。確実に使うには無料のCloudflare Workerを立ててURLを入れてください（READMEに手順）。</p>' +
            '<input class="input" id="proxy-input" type="text" placeholder="' + EM.escapeHtml(window.Captions ? window.Captions.DEFAULT_PROXY : "") + '" value="' + EM.escapeHtml(state.profile.captionProxy || "") + '" />' +
            '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
              '<button class="btn btn--ghost" id="proxy-save" type="button">保存</button>' +
              '<button class="btn btn--ghost" id="proxy-reset" type="button">既定に戻す</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">教材を増やす（インポート）</p>' +
          '<div class="card">' +
            '<p class="setting-row__hint" style="margin-bottom:var(--space-3)">単語・熟語を<strong>大量に追加</strong>できます。下の形式のJSON（配列）を貼り付けてください。取り込んだ教材は単語・熟語の学習に自動で加わります。</p>' +
            '<div class="segmented" id="import-kind" role="group" aria-label="種類">' +
              '<button class="segmented__btn" type="button" data-kind="words" aria-pressed="true">単語</button>' +
              '<button class="segmented__btn" type="button" data-kind="idioms" aria-pressed="false">熟語</button>' +
            '</div>' +
            '<p class="setting-row__hint mt-4" id="import-format">例：[{"en":"revenue","ja":"収益","level":"B1","ipa":"/ˈrevənuː/","ex":"Revenue grew.","exja":"収益が伸びた。"}]</p>' +
            '<div class="field mt-4"><textarea class="textarea" id="import-in" placeholder="JSON配列を貼り付け"></textarea></div>' +
            '<button class="btn btn--primary btn--block" id="import-run" type="button">取り込む</button>' +
            '<p class="setting-row__hint mt-4" id="import-status"></p>' +
            '<button class="btn btn--ghost btn--block mt-4" id="import-clear" type="button">取り込んだ教材をすべて削除</button>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">データ</p>' +
          '<div class="button-stack">' +
            '<button class="btn btn--ghost btn--block" id="export-btn" type="button">進捗をJSONで書き出す</button>' +
            '<button class="btn btn--ghost btn--block" id="import-btn" type="button">バックアップを読み込む</button>' +
            '<input type="file" id="import-input" class="visually-hidden" accept="application/json,.json" />' +
            '<button class="btn btn--danger btn--block" id="reset-btn" type="button">すべてのデータを初期化</button>' +
          '</div>' +
        '</div>' +
        '<p class="app-footnote">EigoMaster · データ v' + Storage.SCHEMA_VERSION +
          ' · 進捗はこの端末内（localStorage）に保存されます</p>' +
      '</section>';
    return { html: html, onMount: bindSettings };
  }
  function themeBtn(value, label, current) {
    return '<button class="segmented__btn" type="button" data-theme-value="' + value +
      '" aria-pressed="' + (current === value ? "true" : "false") + '">' + label + '</button>';
  }
  function ttsModeBtn(value, label, current) {
    return '<button class="segmented__btn" type="button" data-tts-value="' + value +
      '" aria-pressed="' + (current === value ? "true" : "false") + '">' + label + '</button>';
  }

  // 教材インポートUIのセットアップ
  var importKind = "words";
  function setupImport() {
    var seg = document.getElementById("import-kind");
    var fmt = document.getElementById("import-format");
    var status = document.getElementById("import-status");
    if (!seg) return;

    function showCounts() {
      var im = Storage.getImported();
      if (status) status.textContent = "取り込み済み：単語 " + im.words.length + " 件 / 熟語 " + im.idioms.length + " 件";
    }
    showCounts();

    seg.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-kind]");
      if (!btn) return;
      importKind = btn.getAttribute("data-kind");
      seg.querySelectorAll(".segmented__btn").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      if (fmt) {
        fmt.textContent = importKind === "words"
          ? '例：[{"en":"revenue","ja":"収益","level":"B1","ipa":"/ˈrevənuː/","ex":"Revenue grew.","exja":"収益が伸びた。"}]'
          : '例：[{"en":"follow up","ja":"あとで確認する","level":"B1","kind":"句動詞","ex":"I will follow up.","exja":"あとで確認します。"}]';
      }
    });

    bindClick("import-run", function () {
      var raw = document.getElementById("import-in").value.trim();
      if (!raw) { EM.showToast("JSONを貼り付けてください", true); return; }
      var arr;
      try { arr = JSON.parse(raw); } catch (e) { EM.showToast("JSONの形式が正しくありません", true); return; }
      if (!Array.isArray(arr)) { EM.showToast("配列（[...]）で入力してください", true); return; }

      var clean = [];
      arr.forEach(function (o, i) {
        if (!o || !o.en || !o.ja) return; // en, ja は必須
        if (importKind === "words") {
          clean.push({
            id: "imp_w_" + Date.now() + "_" + i,
            en: String(o.en), ja: String(o.ja),
            level: o.level || "B1",
            pos: o.pos || "",
            ipa: o.ipa || "",
            kata: o.kata || (window.Katakana ? window.Katakana.toKatakana(String(o.en)) : ""),
            ex: o.ex || "", exja: o.exja || ""
          });
        } else {
          clean.push({
            id: "imp_i_" + Date.now() + "_" + i,
            en: String(o.en), ja: String(o.ja),
            level: o.level || "B1",
            kind: o.kind || "イディオム",
            ex: o.ex || "", exja: o.exja || ""
          });
        }
      });
      if (!clean.length) { EM.showToast("有効な項目がありません（en と ja は必須）", true); return; }

      Storage.addImported(importKind, clean);
      // 直ちに反映
      if (window.EigoData) {
        if (importKind === "words") window.EigoData.words = (window.EigoData.words || []).concat(clean);
        else window.EigoData.idioms = (window.EigoData.idioms || []).concat(clean);
      }
      document.getElementById("import-in").value = "";
      EM.showToast(clean.length + " 件を取り込みました");
      showCounts();
    });

    bindClick("import-clear", function () {
      if (!window.confirm("取り込んだ教材をすべて削除しますか？（端末内のデータのみ）")) return;
      Storage.clearImported();
      EM.showToast("取り込み教材を削除しました（次回起動で完全反映）");
      showCounts();
    });
  }
  function bindSettings() {
    var seg = document.getElementById("theme-segmented");
    if (seg) seg.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-theme-value]");
      if (!btn) return;
      var value = btn.getAttribute("data-theme-value");
      Storage.update(function (s) { s.profile.theme = value; return s; });
      applyTheme(value);
      seg.querySelectorAll(".segmented__btn").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
    });

    // 英語ボイス選択
    setupVoiceSelect();

    // 読み上げ方式（自動／オンライン／端末）
    var ttsSeg = document.getElementById("tts-mode");
    if (ttsSeg) ttsSeg.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tts-value]");
      if (!btn) return;
      var value = btn.getAttribute("data-tts-value");
      Storage.update(function (s) { s.profile.ttsMode = value; return s; });
      ttsSeg.querySelectorAll(".segmented__btn").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      EM.speak("Could you check it out?");
    });

    // オンライン音声のボイス選択
    var onlineSel = document.getElementById("online-voice");
    if (onlineSel) {
      (EM.ONLINE_VOICES || []).forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id; opt.textContent = v.label;
        if (v.id === (Storage.getState().profile.onlineVoice || "Matthew")) opt.selected = true;
        onlineSel.appendChild(opt);
      });
      onlineSel.addEventListener("change", function () {
        Storage.update(function (s) { s.profile.onlineVoice = onlineSel.value; return s; });
        // オンライン/自動なら即試聴
        var mode = Storage.getState().profile.ttsMode;
        if (mode !== "device") EM.speak("Hello, let's get started.");
      });
    }

    // 字幕取得プロキシ
    bindClick("proxy-save", function () {
      var v = document.getElementById("proxy-input").value.trim();
      Storage.update(function (s) { s.profile.captionProxy = v || null; return s; });
      EM.showToast("プロキシを保存しました");
    });
    bindClick("proxy-reset", function () {
      Storage.update(function (s) { s.profile.captionProxy = null; return s; });
      var el = document.getElementById("proxy-input"); if (el) el.value = "";
      EM.showToast("既定に戻しました");
    });

    // 教材インポート
    setupImport();

    var goalValueEl = document.getElementById("goal-value");
    function changeGoal(delta) {
      Storage.update(function (s) {
        var next = Math.max(GOAL_MIN, Math.min(GOAL_MAX, s.profile.dailyGoalMinutes + delta));
        s.profile.dailyGoalMinutes = next;
        if (goalValueEl) goalValueEl.textContent = String(next);
        return s;
      });
    }
    bindClick("goal-minus", function () { changeGoal(-GOAL_STEP); });
    bindClick("goal-plus", function () { changeGoal(GOAL_STEP); });

    bindClick("export-btn", function () {
      try { Storage.exportToFile(); EM.showToast("バックアップを書き出しました"); }
      catch (e) { console.error(e); EM.showToast("書き出しに失敗しました", true); }
    });

    var importInput = document.getElementById("import-input");
    bindClick("import-btn", function () { if (importInput) importInput.click(); });
    if (importInput) importInput.addEventListener("change", function () {
      var file = importInput.files && importInput.files[0];
      Storage.importFromFile(file).then(function (state) {
        applyTheme(state.profile.theme); refreshStreakBadge();
        EM.showToast("バックアップを読み込みました"); navigate();
      }).catch(function (err) { EM.showToast(err.message || "読み込みに失敗しました", true); })
        .finally(function () { importInput.value = ""; });
    });

    bindClick("reset-btn", function () {
      var ok = window.confirm("すべての学習データを削除して初期状態に戻します。\nこの操作は取り消せません。よろしいですか？");
      if (!ok) return;
      var fresh = Storage.reset();
      applyTheme(fresh.profile.theme); refreshStreakBadge();
      EM.showToast("データを初期化しました"); location.hash = "#/home";
    });
  }
  function bindClick(id, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  }

  // 英語ボイス選択UIの構築
  function setupVoiceSelect() {
    var select = document.getElementById("voice-select");
    var hint = document.getElementById("voice-hint");
    if (!select) return;

    function fill() {
      var voices = EM.getEnglishVoices ? EM.getEnglishVoices() : [];
      var saved = Storage.getState().profile.voiceURI;
      // 既存optionをクリア（自動の1件は残す）
      select.length = 1;
      voices.forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.voiceURI;
        opt.textContent = v.name + "（" + v.lang + "）";
        if (v.voiceURI === saved) opt.selected = true;
        select.appendChild(opt);
      });
      if (hint) {
        if (!voices.length) {
          hint.innerHTML = "この端末で英語の声が見つかりませんでした。<br>" +
            "iPhone/iPad：設定→アクセシビリティ→読み上げコンテンツ→声→英語 を追加。<br>" +
            "Windows：設定→時刻と言語→音声認識→音声 を追加。<br>" +
            "Android/PC Chrome：Google US English が使えることが多いです。";
        } else {
          hint.textContent = "英語の声が " + voices.length + " 件見つかりました。おすすめは Google US English / Samantha / Aria などです。";
        }
      }
    }
    fill();
    // ボイスが後から読み込まれた場合に再構築
    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", fill);
    }

    select.addEventListener("change", function () {
      var uri = select.value || null;
      Storage.update(function (s) { s.profile.voiceURI = uri; return s; });
      EM.speak("Could you check it out?");
    });
    bindClick("voice-test", function () { EM.speak("Could you check it out? Let's get started."); });
  }

  /* ---------- テーマ適用 ---------- */
  function applyTheme(theme) {
    var valid = (theme === "light" || theme === "dark") ? theme : "system";
    document.documentElement.setAttribute("data-theme", valid);
  }

  /* ============================================================
     コア画面の登録（機能モジュールは各自で登録）
     ============================================================ */
  EM.registerView("#/home",     { title: "ホーム", tab: "home",     render: renderHome });
  EM.registerView("#/learn",    { title: "学ぶ",   tab: "learn",    render: renderLearn });
  EM.registerView("#/pron",     { title: "発音",   tab: "pron",     render: renderPronHub });
  EM.registerView("#/settings", { title: "設定",   tab: "settings", render: renderSettings });

  // 機能モジュール未登録時のフォールバック（読み込み失敗対策）
  function fallbackView(title) {
    return { title: title, tab: "home", render: function () {
      return { html: '<div class="empty-state"><p class="empty-state__title">' + EM.escapeHtml(title) +
        '</p><p class="empty-state__body">この機能の読み込みに失敗しました。ページを再読み込みしてください。</p></div>' };
    }};
  }

  /* ============================================================
     ルーター
     ============================================================ */
  function getCurrentRouteKey() {
    var hash = location.hash;
    return EM.views[hash] ? hash : DEFAULT_ROUTE;
  }
  function setActiveTab(tabName) {
    tabEls.forEach(function (tab) {
      var isCurrent = tab.getAttribute("data-tab") === tabName;
      if (isCurrent) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
  }
  function navigate() {
    EM.stopSpeak(); // 画面遷移時は読み上げを止める
    var routeKey = getCurrentRouteKey();
    var def = EM.views[routeKey] || fallbackView("画面");

    titleEl.textContent = def.title;
    setActiveTab(def.tab || "home");
    refreshStreakBadge();

    var result;
    try { result = def.render(); }
    catch (e) {
      console.error("[router] 画面描画でエラー:", e);
      result = { html: '<div class="empty-state"><p class="empty-state__title">表示できませんでした</p>' +
        '<p class="empty-state__body">お手数ですが画面を再読み込みしてください。</p></div>' };
    }
    // 先に最上部へ戻す（描画前に位置をリセット）
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    viewEl.scrollTop = 0;

    viewEl.innerHTML = result.html;
    if (typeof result.onMount === "function") {
      try { result.onMount(); } catch (e2) { console.error("[router] onMount エラー:", e2); }
    }
    // フォーカスでブラウザが画面途中までスクロールするのを防ぐ（preventScroll）
    try { viewEl.focus({ preventScroll: true }); } catch (e3) { /* 古い実装は無視 */ }
    // 念のためもう一度先頭へ（描画後のレイアウト確定後）
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }

  /* ---------- Service Worker ---------- */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    // 新しいSWが制御を奪ったら一度だけリロードして最新版を確実に反映（更新が届かない問題の対策）
    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        // 既存ページに対しても更新確認を促す
        if (reg && reg.update) { try { reg.update(); } catch (e) {} }
      }).catch(function (e) {
        console.warn("[sw] 登録に失敗（オフライン非対応で続行）:", e);
      });
    });
  }

  /* ---------- 初期化 ---------- */
  // 取り込み教材（インポート）を EigoData に統合し、全モジュールから使えるようにする
  function mergeImported() {
    if (!window.EigoData) return;
    var im = Storage.getImported();
    if (im.words && im.words.length) {
      window.EigoData.words = (window.EigoData.words || []).concat(im.words);
    }
    if (im.idioms && im.idioms.length) {
      window.EigoData.idioms = (window.EigoData.idioms || []).concat(im.idioms);
    }
    dedupeByEn();
  }
  // en（見出し語）の重複を排除（最初の1件を残す）。データ増量時の安全弁。
  function dedupeByEn() {
    ["words", "idioms"].forEach(function (key) {
      var list = window.EigoData[key];
      if (!Array.isArray(list)) return;
      var seen = {}, out = [];
      list.forEach(function (item) {
        var k = (item.en || "").toLowerCase();
        if (k && seen[k]) return;
        seen[k] = true; out.push(item);
      });
      window.EigoData[key] = out;
    });
  }

  function init() {
    mergeImported();
    applyTheme(Storage.getState().profile.theme);
    if (!EM.views[location.hash]) location.replace("#" + DEFAULT_ROUTE.slice(1));
    window.addEventListener("hashchange", navigate);
    navigate();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

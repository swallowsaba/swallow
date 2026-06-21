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

  /* ============================================================
     レベル細分化（EM.levels）
     - 各CEFR帯（A1〜C1）を難易度で 3 段階（.1 易 / .2 中 / .3 難）に分割。
     - 難易度スコア：単語は文字数、文は語数（長いほど難）。
     - 同一CEFR帯の中で三分位（tertile）により均等に振り分ける。
     - annotate() で各要素に _sub（例 "B1.2"）を付与する。再計算は安定（決定的）。
     ============================================================ */
  EM.levels = {
    ORDER: ["A1", "A2", "B1", "B2", "C1"],
    SUBS: [".1", ".2", ".3"],
    SUB_LABEL: { ".1": "易", ".2": "中", ".3": "難" },
    // 難易度スコア（テキストから算出）
    scoreText: function (t) {
      t = String(t == null ? "" : t).trim();
      if (!t) return 0;
      var w = t.split(/\s+/);
      if (w.length > 1) return w.length;           // 文：語数
      return t.replace(/[^A-Za-z']/g, "").length;  // 単語：文字数
    },
    // 配列に _sub を付与。getText で難易度算出用テキストを取り出す
    annotate: function (items, getText) {
      if (!items || !items.length) return items;
      var byLv = {};
      items.forEach(function (it) {
        var lv = it.level || "B1";
        (byLv[lv] = byLv[lv] || []).push(it);
      });
      var self = this;
      Object.keys(byLv).forEach(function (lv) {
        var arr = byLv[lv].map(function (it) {
          var t = getText ? getText(it) : (it.en || it.text || it.answer || it.title || "");
          return { it: it, s: self.scoreText(t) };
        });
        // スコア昇順（同点は元順）で安定ソート
        arr.forEach(function (o, i) { o.i = i; });
        arr.sort(function (a, b) { return a.s - b.s || a.i - b.i; });
        var n = arr.length;
        arr.forEach(function (o, idx) {
          var sub = idx < n / 3 ? ".1" : (idx < 2 * n / 3 ? ".2" : ".3");
          o.it._sub = lv + sub;
        });
      });
      return items;
    },
    // 単一要素のサブレベル表示（_sub があればそれ、なければ level）
    badge: function (it) {
      return (it && it._sub) ? it._sub : (it && it.level ? it.level : "");
    }
  };

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
      if (voicesReady || tries > 20) {
        clearInterval(poll);
        // ポーリングが尽きたら「この端末はボイス0」と確定させる
        //（確定しないと英語ボイス無し端末でカタカナ近似への切替が永遠に行われない）
        if (!voicesReady) voicesReady = true;
      }
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
  var currentUtterance = null; // 発話中のutteranceを保持（ChromeのGCで無音になるバグ対策）
  var speakToken = 0;          // 多重再生防止トークン（エコー対策）：最新の再生だけを生かす
  var lastSpeakKey = "";       // 連打デバウンス用
  var lastSpeakAt = 0;
  var resumeTimer = null;      // Android Chrome の長文停止バグ対策ハートビート

  // 初回のユーザー操作で音声をアンロック（スマホの自動再生制限・初回無音対策）
  var audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.resume();
        var u = new SpeechSynthesisUtterance(" ");
        u.volume = 0; u.rate = 2;
        window.speechSynthesis.speak(u);
        setTimeout(function () { try { window.speechSynthesis.cancel(); } catch (e) {} }, 60);
        loadVoices();
      }
    } catch (e) { /* 失敗しても実害なし */ }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
    document.addEventListener("keydown", unlockAudio, { once: true, capture: true });
    // タブ/アプリがバックグラウンドへ → 再生を確実に止める。
    // 復帰時 → pause スタックを resume で解消（放置すると以後ずっと無音になる端末がある）
    document.addEventListener("visibilitychange", function () {
      if (!("speechSynthesis" in window)) return;
      try {
        if (document.hidden) { EM.stopSpeak(); }
        else { window.speechSynthesis.resume(); }
      } catch (e) { /* no-op */ }
    });
  }

  function stopResumeTimer() { if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; } }
  function startResumeTimer() {
    // Chrome系（特にAndroid）は十数秒で speechSynthesis が黙るバグがあるため、定期的に resume する
    stopResumeTimer();
    if (!("speechSynthesis" in window)) return;
    resumeTimer = setInterval(function () {
      try {
        if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
        else stopResumeTimer();
      } catch (e) { stopResumeTimer(); }
    }, 9000);
  }

  function doSpeakDevice(text, opts) {
    var voice = resolveVoice();
    // 端末読み上げが無音だった場合にオンライン英語音声へ切り替えてよいか。
    // 「端末の声」固定モードではユーザー意図を尊重して切り替えない。auto のときのみ許可。
    var allowFallback = (Storage.getState().profile.ttsMode || "auto") !== "device";
    // 英語ボイスが無い端末では、日本語ボイスで英単語を読むと
    // 表記(IPA/カタカナ)と全く違う音になるため、誤読を避けて案内のみ表示する。
    var looksEnglish = /[A-Za-z]/.test(String(text));
    if (!voice && looksEnglish && voicesReady) {
      // 英語ボイスが無い端末：日本語ボイスがあれば「カタカナ近似」で必ず読み上げる
      //（このアプリのカタカナ変換はリンキング込みの聞こえ方なので、近い音になる）
      var jaVoice = null;
      try {
        (window.speechSynthesis.getVoices() || []).forEach(function (v) {
          if (!jaVoice && /^ja/i.test(v.lang)) jaVoice = v;
        });
      } catch (e0) {}
      var allowKata = Storage.getState().profile.kataFallback !== false; // 既定ON（設定でOFFにできる）
      var kata = (allowKata && window.Katakana && window.Katakana.toKatakana) ? window.Katakana.toKatakana(String(text)) : "";
      if (kata) {
        if (!warnedNoVoice) {
          warnedNoVoice = true;
          EM.showToast("この端末に英語の声が無いため、カタカナ近似音声で再生します。より自然な音は 設定→音声 の「英語の声を追加する方法」へ");
        }
        var mk = ++speakToken;
        var ku = new SpeechSynthesisUtterance(kata);
        currentUtterance = ku;
        if (jaVoice) { ku.voice = jaVoice; ku.lang = jaVoice.lang; } else { ku.lang = "ja-JP"; }
        ku.rate = Math.min(1.3, (typeof opts.rate === "number" ? opts.rate : 1) + 0.15); // カタカナは少し速めが英語らしい
        ku.pitch = 1.0; ku.volume = 1.0;
        ku.onend = function () { if (mk === speakToken && typeof opts.onend === "function") opts.onend(); };
        try { window.speechSynthesis.cancel(); } catch (e1) {}
        setTimeout(function () { if (mk === speakToken) { try { window.speechSynthesis.resume(); } catch (e2) {} window.speechSynthesis.speak(ku); } }, 60);
        return;
      }
      if (!warnedNoVoice) {
        warnedNoVoice = true;
        EM.showToast("この端末に英語の音声がありません。設定→音声の「🔍診断」をお試しください", true);
      }
      return;
    }
    // ボイス一覧が未確定の間は lang=en-US 指定で即時発話（待つとタップ起点を失い、スマホ初回が無音になるため）
    var myToken = ++speakToken;
    var u = new SpeechSynthesisUtterance(text);
    currentUtterance = u;   // 参照を保持（ChromeはutteranceがGCされると無音になる既知バグがある）
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;       // ボイスと言語を一致させる（重要）
    } else {
      u.lang = opts.lang || "en-US";
    }
    u.rate = typeof opts.rate === "number" ? opts.rate : 0.95; // やや自然に
    u.pitch = 1.0;
    u.volume = 1.0;
    // 単語境界イベント：読み上げ位置(charIndex)を通知し、画面側で該当語をハイライトする
    u.onboundary = function (ev) {
      if (myToken !== speakToken) return;
      if (typeof opts.onboundary === "function") opts.onboundary(ev.charIndex, ev.charLength || 0);
    };
    u.onstart = function () { if (myToken === speakToken && typeof opts.onstart === "function") opts.onstart(); };
    u.onend = function () {
      stopResumeTimer();
      if (myToken === speakToken && typeof opts.onboundary === "function") opts.onboundary(-1, 0); // 終了マーク
      if (myToken === speakToken && typeof opts.onend === "function") opts.onend();
    };
    u.onerror = function () { stopResumeTimer(); };

    function fire() {
      if (myToken !== speakToken) return;
      try { window.speechSynthesis.resume(); } catch (e) {} // pauseスタックからの復帰
      window.speechSynthesis.speak(u);
      startResumeTimer();
      // 無音ウォッチドッグ：発話が始まらなければ自動でリカバリーする
      //（Chromeの「cancel直後のspeakが無視される」バグ、英語ボイス0のPC などをすべて拾う）
      setTimeout(function () {
        if (myToken !== speakToken) return;
        var ss = window.speechSynthesis;
        if (ss.speaking || ss.pending) return;   // 正常に再生中
        if (!retried) {
          retried = true;
          try { ss.cancel(); } catch (e) {}
          setTimeout(fire, 80);                  // まず端末でもう1回だけ再試行
        } else if (allowFallback) {
          speakOnline(text, opts);               // それでも無音 → オンライン英語音声へ
        }
      }, 800);
    }
    var retried = false;
    var ss = window.speechSynthesis;
    if (ss.speaking || ss.pending) {
      // Chromeは cancel() の直後に speak() すると無視されることがある → 少し置いてから話す
      try { ss.cancel(); } catch (e) {}
      setTimeout(fire, 60);
    } else {
      try { ss.cancel(); } catch (e) {}
      fire();
    }
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
    // 1) Google翻訳API系（CORS/Referer制限がもっとも緩く、PCでも通りやすい）
    function (text /*, voice*/) {
      return "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en&q=" + encodeURIComponent(text);
    },
    // 2) Google辞書拡張向け（Referer制限がほぼ無い）
    function (text /*, voice*/) {
      return "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=dict-chrome-ex&tl=en&q=" + encodeURIComponent(text);
    },
    // 3) Google翻訳（旧エンドポイント）
    function (text /*, voice*/) {
      return "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text);
    },
    // 4) StreamElements（Amazon Polly：通れば声を選べる）
    function (text, voice) {
      return "https://api.streamelements.com/kappa/v2/speech?voice=" + encodeURIComponent(voice) + "&text=" + encodeURIComponent(text);
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
    if (!resolveVoice()) {
      // オンライン全滅＋端末にも英語ボイス無し → 無言にせず必ず案内する
      EM.showToast("オンライン音声に接続できないため、カタカナ近似音声で再生します（設定→音声に改善方法）");
    } else if (!warnedOnline) {
      warnedOnline = true;
      EM.showToast("オンライン音声に接続できません。端末の声で読み上げます", true);
    }
    doSpeakDevice(text, opts);
  }

  // 診断用：経路（auto/device/online）を指定して読み上げる（設定→音声診断から使用）
  EM.speakWith = function (mode, text) {
    unlockAudio();
    EM.stopSpeak();
    if (mode === "device") doSpeakDevice(text, {});
    else if (mode === "online") speakOnline(text, {});
    else doSpeak(text, {});
  };
  // 診断用：端末ボイスの状況を返す
  EM.voiceInfo = function () {
    var vs = ("speechSynthesis" in window) ? (window.speechSynthesis.getVoices() || []) : [];
    var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
    return { supported: "speechSynthesis" in window, total: vs.length, en: en.length,
             names: en.slice(0, 3).map(function (v) { return v.name; }) };
  };
  // 診断用：オンライン提供元の到達テスト（idx番目に "Hello" をロードして可否を返す）
  EM.ttsProbe = function (idx, cb) {
    try {
      var url = TTS_PROVIDERS[idx]("Hello", onlineVoiceId());
      var a = new Audio();
      a.referrerPolicy = "no-referrer";
      a.src = url;
      var done = false;
      var fin = function (ok) { if (done) return; done = true; try { a.src = ""; } catch (e) {} cb(ok); };
      a.oncanplaythrough = function () { fin(true); };
      a.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 5000);
      a.load();
    } catch (e) { cb(false); }
  };
  EM.ttsProviderCount = function () { return TTS_PROVIDERS.length; };

  // オンライン音声で読み上げ（CORS不要：Audio要素に直接URLを渡す。提供元を多段フォールバック）
  function speakOnline(text, opts) {
    var voice = onlineVoiceId();
    var chunks = chunkText(text);
    // 各チャンクの text 内での開始文字位置（再生位置→文字位置の擬似 boundary に使う）
    var chunkStart = [];
    (function () { var pos = 0; for (var c = 0; c < chunks.length; c++) { var at = text.indexOf(chunks[c], pos); if (at < 0) at = pos; chunkStart.push(at); pos = at + chunks[c].length; } })();
    var i = 0;          // チャンク番号
    var myToken = ++speakToken;   // 古い再生のコールバックを無効化（エコー対策）
    var startedFired = false;

    // 実際の再生位置(currentTime/duration)から、いま読んでいる文字位置を推定して通知。
    // これにより端末ボイスの onboundary が無いオンライン音声でも、ハイライトが
    // 推定タイマーではなく「実音声」に追従し、リーディング等のズレが解消する。
    function emitBoundary(ratio) {
      if (typeof opts.onboundary !== "function") return;
      ratio = Math.max(0, Math.min(1, ratio));
      var base = chunkStart[i] || 0;
      var clen = (chunks[i] || "").length || 1;
      var off = Math.min(clen - 1, Math.floor(ratio * clen));
      opts.onboundary(base + off, 0);
    }

    function playChunk(provIdx) {
      if (myToken !== speakToken) return;
      if (i >= chunks.length) {
        if (typeof opts.onboundary === "function") opts.onboundary(-1, 0); // ハイライト解除
        if (typeof opts.onend === "function") opts.onend();
        return;
      }
      if (provIdx >= TTS_PROVIDERS.length) {
        // すべての提供元で失敗 → 端末音声へ
        onlineFailover(text, opts); return;
      }
      var url = TTS_PROVIDERS[provIdx](chunks[i], voice);
      var a = new Audio();                // ※ crossOrigin は付けない（再生にCORSは不要）
      a.referrerPolicy = "no-referrer";   // Refererで403にならないように（重要）
      a.preload = "auto";
      a.src = url;
      currentAudio = a;
      if (typeof opts.rate === "number") a.playbackRate = Math.max(0.5, Math.min(1, opts.rate));
      a.ontimeupdate = function () {
        if (myToken !== speakToken) return;
        if (!startedFired) { startedFired = true; if (typeof opts.onstart === "function") opts.onstart(); }
        var d = a.duration;
        if (d && isFinite(d) && d > 0) emitBoundary(a.currentTime / d);
      };
      a.onended = function () { if (myToken !== speakToken) return; i++; playChunk(0); };
      a.onerror = function () { if (myToken !== speakToken) return; playChunk(provIdx + 1); };
      var p = a.play();
      if (p && p.catch) p.catch(function (err) {
        if (myToken !== speakToken) return;
        if (err && err.name === "NotAllowedError") {
          // 自動再生ブロック → 無音にせず端末の英語音声で必ず鳴らす
          doSpeakDevice(text, opts); return;
        }
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
    // auto：端末に英語ボイスがあれば端末を優先（PC・タップと同期するので確実に鳴る）。
    //       ボイス一覧が未確定の間も端末で即時発話（lang=en-US）。
    //       「英語ボイスが無い」と確定した端末（日本のスマホ等）のみオンライン英語音声を使う。
    if (!voicesReady) { doSpeakDevice(text, opts); return; }
    if (resolveVoice()) { doSpeakDevice(text, opts); return; }
    if (navigator.onLine === false) { doSpeakDevice(text, opts); return; }
    speakOnline(text, opts);
  }

  // テキストを読み上げる。opts = { rate, lang, onend }
  EM.speak = function (text, opts) {
    opts = opts || {};
    if (!text) return;
    // 連打デバウンス（同じテキストを300ms以内に2回 → 2回目は無視。二重音声＝エコーの防止）
    var now = Date.now();
    var key = String(text) + "|" + (opts.rate || "");
    if (key === lastSpeakKey && now - lastSpeakAt < 300) return;
    lastSpeakKey = key; lastSpeakAt = now;

    unlockAudio();   // タップと同期してアンロック（初回でも確実に鳴らす）
    EM.stopSpeak();
    // ※ ここでボイス読み込みを「待たない」：待つとユーザー操作の文脈が切れて
    //    スマホの初回再生がブロックされるため、未確定でも lang=en-US で即時に話す。
    doSpeak(text, opts);
  };
  EM.stopSpeak = function () {
    speakToken++;            // 進行中の再生コールバックをすべて無効化（エコー防止）
    stopResumeTimer();
    if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    if (currentAudio) { try { currentAudio.pause(); } catch (e2) {} currentAudio = null; }
  };

  // どこからでも使える発音チェック（単語・熟語カードの🎤ボタン用）
  // 対象テキストを言ってもらい、音声認識との単語一致率をトーストで返す。
  EM.micCheck = function (text) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { EM.showToast("このブラウザは音声認識に未対応です（Chrome/Edge/Safariをご利用ください）", true); return; }
    EM.stopSpeak();
    var rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false;
    EM.showToast("🎤 マイクに向かって言ってみよう…");
    rec.onresult = function (e) {
      var said = e.results[0][0].transcript;
      var n = function (s) { return String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); };
      var a = n(text).split(" "), b = n(said).split(" ");
      var hit = 0; a.forEach(function (w) { if (b.indexOf(w) >= 0) hit++; });
      var rate = Math.round(hit / Math.max(1, a.length) * 100);
      EM.showToast((rate >= 70 ? "⭕ よく言えています！" : "△ もう一度。") + " 一致率" + rate + "%（認識：" + said + "）", rate < 70);
    };
    rec.onerror = function (ev) {
      EM.showToast(ev.error === "not-allowed" ? "マイクの使用を許可してください" : "聞き取れませんでした。もう一度どうぞ", true);
    };
    rec.start();
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
          '<p class="home-hero__eyebrow">EIGO MASTER · ' + EM.escapeHtml(levelLabel) + '</p>' +
          '<h1 class="home-hero__greeting">' + greetingByHour() + '</h1>' +
          '<p class="home-hero__sub">' + subMessage + '</p>' +
        '</div>' +

        // 学習ダッシュボード風：統計チップ4つ（今日の分数 / 連続日数 / 覚えた語 / 学習回数）
        '<div class="dash-stats">' +
          dashChip("⚡", mins + "分", "今日の学習") +
          dashChip("🔥", streak + "日", "連続記録") +
          dashChip("📚", totals.wordsLearned, "覚えた単語") +
          dashChip("🎯", totals.sessions + "回", "学習セッション") +
        '</div>' +

        // 大きなチャレンジCTA
        '<a class="cta-card cta-card--big" href="#/lesson">' +
          '<span class="cta-card__emoji">🎯</span>' +
          '<div class="cta-card__main"><p class="cta-card__title">今日のレッスンをはじめる</p>' +
            '<p class="cta-card__desc">語彙・文法・英作文・聞き取り・発音を1本の流れで（約12問）</p></div>' +
          '<span class="cta-card__arrow">→</span>' +
        '</a>' +

        // 学習モード（3モード）
        '<div>' +
          '<div class="hub-section__head"><span class="hub-section__title">学習モード</span>' +
            '<span class="hub-section__count">3モード</span></div>' +
          '<div class="hub-list">' +
            modeRow("⚡", "単語クイック", "SRSが今日の復習を自動で選びます", "コンボ重視", "#/vocab") +
            modeRow("🎧", "リスニング", "書き取り・内容理解（カタカナ補助つき）", "478問", "#/listening") +
            modeRow("🗣", "動画シャドーイング", "YouTube動画と字幕で口慣らし", "YouTube", "#/video") +
          '</div>' +
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

        '<div class="card">' +
          '<p class="section-eyebrow">称号コレクション</p>' +
          '<div class="badge-row">' + badgeHtml + '</div>' +
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
  // ダッシュボードの統計チップ（絵文字・値・ラベル）
  function dashChip(emoji, value, label) {
    return '<div class="dash-chip">' +
             '<span class="dash-chip__emoji">' + emoji + '</span>' +
             '<span class="dash-chip__value">' + EM.escapeHtml(String(value)) + '</span>' +
             '<span class="dash-chip__label">' + EM.escapeHtml(label) + '</span>' +
           '</div>';
  }
  // 学習モード行（絵文字・タイトル/説明・タグ）
  function modeRow(emoji, title, desc, tag, route) {
    return '<a class="hub-row" href="' + route + '">' +
             '<span class="hub-row__icon" style="font-size:22px">' + emoji + '</span>' +
             '<span class="hub-row__main">' +
               '<span class="hub-row__title">' + EM.escapeHtml(title) + '</span>' +
               '<span class="hub-row__desc">' + EM.escapeHtml(desc) + '</span>' +
             '</span>' +
             '<span class="hub-row__badge">' + EM.escapeHtml(tag) + '</span>' +
             '<span class="hub-row__arrow">›</span>' +
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
     学ぶハブ（学ぶタブのトップ。日程表スタイル：見出し＋件数バッジ＋行リスト）
     ============================================================ */
  function dataCount(key) {
    var d = window.EigoData || {};
    function dd(a){var s={},o=0;(a||[]).forEach(function(x){var k=(x.en||"").toLowerCase();if(k&&s[k])return;s[k]=1;o++;});return o;}
    switch (key) {
      case "words": return dd(d.words);
      case "idioms": return dd(d.idioms);
      case "grammar": return (d.grammar || []).length;
      case "listening": return (d.listening || []).length;
      case "reading": return (d.readingSamples || []).length;
      case "pairs": return (d.phonics && d.phonics.minimalPairs || []).length;
      case "linking": var n = 0; ((d.linkingRules) || []).forEach(function (r) { n += (r.examples || []).length; }); return n;
      default: return 0;
    }
  }
  function fmtCount(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString("ja-JP") + "k" : String(n); }

  // 日程表風の行（アイコン丸・タイトル/説明・件数バッジ・矢印）
  function hubRow(icon, title, desc, route, badge) {
    return '<a class="hub-row" href="' + route + '">' +
             '<span class="hub-row__icon">' + icon + '</span>' +
             '<span class="hub-row__main">' +
               '<span class="hub-row__title">' + EM.escapeHtml(title) + '</span>' +
               '<span class="hub-row__desc">' + EM.escapeHtml(desc) + '</span>' +
             '</span>' +
             (badge ? '<span class="hub-row__badge">' + EM.escapeHtml(badge) + '</span>' : '') +
             '<span class="hub-row__arrow">›</span>' +
           '</a>';
  }
  // セクション見出し（左に太いタイトル・右に件数チップ）
  function hubSection(title, sub, rows) {
    return '<div class="hub-section">' +
             '<div class="hub-section__head"><span class="hub-section__title">' + EM.escapeHtml(title) + '</span>' +
               (sub ? '<span class="hub-section__count">' + EM.escapeHtml(sub) + '</span>' : '') + '</div>' +
             '<div class="hub-list">' + rows + '</div>' +
           '</div>';
  }

  function renderLearn() {
    var html =
      '<section class="stack-md view-enter">' +
        '<p class="home-hero__eyebrow" style="color:var(--c-ink-soft)">LEARN · まなぶ</p>' +
        hubSection("まずはここから", "",
          hubRow("🎯", "今日のレッスン", "語彙→文法→英作文→聞き取り→発音をミックスで反復", "#/lesson", "ミックス反復") +
          hubRow("🗺", "学習マップ", "50以上のスキルがどこで学べるか一覧", "#/skills", "一覧") +
          hubRow("◔", "レベル診断", "10問でCEFRレベル判定", "#/diagnosis", "")
        ) +
        hubSection("語彙・表現", fmtCount(dataCount("words")) + "語 / " + fmtCount(dataCount("idioms")) + "件",
          hubRow("あ", "単語", "SRSで効率よく暗記", "#/vocab", fmtCount(dataCount("words")) + "語") +
          hubRow("熟", "熟語・句動詞", "イディオム・コロケーション", "#/idioms", fmtCount(dataCount("idioms")) + "件") +
          hubRow("帳", "単語帳", "保存した語を復習", "#/wordbook", "")
        ) +
        hubSection("文法・英作文", dataCount("grammar") + "課",
          hubRow("文", "文法レッスン", "例文・並べ替え・誤答解説つき", "#/grammar", dataCount("grammar") + "課")
        ) +
        hubSection("聞く・話す・読む", "",
          hubRow("🎧", "リスニング", "書き取り・内容理解（音声変化の解説つき）", "#/listening", dataCount("listening") + "問") +
          hubRow("▷", "動画シャドーイング", "YouTubeのURLを貼ると字幕で練習", "#/video", "YouTube") +
          hubRow("読", "リーディング", "全訳・語句・文法解説つき", "#/reading", dataCount("reading") + "本")
        ) +
        hubSection("発音・音声変化", "ネイティブの音に近づく",
          hubRow("🎤", "発音チェック", "話した英語を音声認識で一致率判定", "#/pron-check", "") +
          hubRow("æ", "フォニックス", "44音素・ミニマルペア聞き分け", "#/phonics", fmtCount(dataCount("pairs")) + "組") +
          hubRow("◠", "リンキング・音声変化", "つながる音を弧とカタカナで可視化", "#/linking", dataCount("linking") + "例")
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
        '<p class="home-hero__eyebrow" style="color:var(--c-ink-soft)">PRONUNCIATION · はつおん</p>' +
        hubSection("発音トレーニング", "",
          hubRow("θ", "発音チェック", "音声認識で一致率を判定", "#/pron-check", "") +
          hubRow("æ", "フォニックス", "44音素・ミニマルペア聞き分け", "#/phonics", fmtCount(dataCount("pairs")) + "組") +
          hubRow("◠", "リンキング", "音声変化の解説＋聞き取りクイズ", "#/linking", dataCount("linking") + "例")
        ) +
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
            '<p class="setting-row__hint" style="margin-bottom:var(--space-3)">既定の<strong>自動</strong>は、端末に英語の声があればそれを使い（PC・確実に再生）、無い端末では<strong>オンラインの米国英語</strong>に切り替えます。エコーや無音が出る場合もまず「自動」をお試しください。</p>' +
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
            '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr 1fr">' +
              '<button class="btn btn--ghost" id="vt-device" type="button">端末で再生</button>' +
              '<button class="btn btn--ghost" id="vt-online" type="button">オンラインで再生</button>' +
              '<button class="btn btn--ghost" id="vt-diag" type="button">🔍 診断</button>' +
            '</div>' +
            '<div id="vt-report" class="mt-4"></div>' +
            '<div class="setting-row" style="padding-left:0;padding-right:0">' +
              '<div class="setting-row__text"><p class="setting-row__label">英語の声が無いときのカタカナ近似</p>' +
                '<p class="setting-row__hint">英語ボイスもオンラインも使えない端末で、カタカナの近似音で読むかどうか</p></div>' +
              '<div class="segmented" id="kata-segmented" role="group" aria-label="カタカナ近似">' +
                '<button class="segmented__btn" type="button" data-kata="on" aria-pressed="' + (state.profile.kataFallback !== false) + '">使う</button>' +
                '<button class="segmented__btn" type="button" data-kata="off" aria-pressed="' + (state.profile.kataFallback === false) + '">使わない</button>' +
              '</div>' +
            '</div>' +
            '<details class="mt-4"><summary class="setting-row__hint" style="cursor:pointer">英語の声を端末に追加する方法（鳴らないときはまずこちら）</summary>' +
              '<p class="setting-row__hint mt-4"><strong>Windows：</strong>設定 → 時刻と言語 → 音声 → 「音声の追加」で English (United States) を追加 → ブラウザを再起動。<br>' +
              '<strong>Mac：</strong>システム設定 → アクセシビリティ → 読み上げコンテンツ → システムの声 → 「管理」で英語の声を追加。<br>' +
              '<strong>共通：</strong>OS・タブの音量とミュート、他アプリの音が鳴るかもあわせてご確認ください。</p></details>' +
            '<p class="setting-row__hint mt-4" id="voice-hint"></p>' +
          '</div>' +
        '</div>' +
        '<div class="setting-group">' +
          '<p class="section-title">動画字幕の自動取得</p>' +
          '<div class="card">' +
            '<p class="setting-row__hint" style="margin-bottom:var(--space-3)">字幕の自動取得は、まず<strong>公開のYouTube字幕API（Piped/Invidious・設定不要）</strong>を試すので、字幕付きの多くの動画はこの欄が空でも取得できます。ただし混雑時や<strong>自動生成字幕のみ</strong>の動画は失敗することがあります。<strong>どんな動画でも確実に</strong>取りたい場合は、無料のCloudflare Workerを立ててそのURLをここに入れてください（下に手順とコードがあります）。設定すると最優先で使われます。</p>' +
            '<input class="input" id="proxy-input" type="text" placeholder="' + EM.escapeHtml(window.Captions ? window.Captions.DEFAULT_PROXY : "") + '" value="' + EM.escapeHtml(state.profile.captionProxy || "") + '" />' +
            '<p class="setting-row__hint mt-4" id="proxy-status"></p>' +
            '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr 1fr">' +
              '<button class="btn btn--ghost" id="proxy-save" type="button">保存</button>' +
              '<button class="btn btn--ghost" id="proxy-test" type="button">接続テスト</button>' +
              '<button class="btn btn--ghost" id="proxy-reset" type="button">既定に戻す</button>' +
            '</div>' +
            '<details class="mt-4"><summary class="setting-row__hint" style="cursor:pointer"><strong>▶ なぜ字幕が取れないことがある？（仕組み）</strong></summary>' +
              '<p class="setting-row__hint mt-4">このアプリは通信を持たない静的サイトのため、ブラウザから直接YouTubeへ字幕を取りに行くと<strong>CORS</strong>という仕組みでブロックされます。そのため中継役（プロキシ）が必要です。公開プロキシは混雑や制限で失敗しがちで、YouTube側も自動生成字幕の取得を年々厳しくしています。自分専用のCloudflare Worker（無料枠で十分）を中継にすると、この両方を回避でき、<strong>「英語(自動生成)」しかない動画でも取得</strong>できるようになります。</p></details>' +
            '<details class="mt-4"><summary class="setting-row__hint" style="cursor:pointer"><strong>▶ Cloudflare Workerの作り方（無料・5分・コード付き）</strong></summary>' +
              '<ol class="setting-row__hint mt-4" style="padding-left:1.2em;line-height:1.9">' +
                '<li><a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener">dash.cloudflare.com</a> で無料アカウントを作成（クレジットカード不要）。</li>' +
                '<li>左メニュー「Workers &amp; Pages」→「Create application」→「Create Worker」。</li>' +
                '<li>名前を付けて「Deploy」。次の画面で「Edit code」を開く。</li>' +
                '<li>エディタの中身を全部消し、下の<strong>「Workerコードをコピー」</strong>で貼り付けて「Deploy」。</li>' +
                '<li>表示される <code>https://〇〇.workers.dev</code> の末尾に <code>/?url=</code> を付けた文字列を、上の入力欄に貼って「保存」。<br>例：<code>https://my-cc.workers.dev/?url=</code></li>' +
                '<li>「接続テスト」で OK が出れば完了。動画追加画面で「URLから字幕を自動取得」が通るようになります。</li>' +
              '</ol>' +
              '<button class="btn btn--ghost btn--block mt-4" id="proxy-copy-code" type="button">📋 Workerコードをコピー</button>' +
              '<p class="setting-row__hint mt-4">このWorkerはGET（HTML・字幕本文）とPOST（YouTube内部API）の両方を中継し、CORSヘッダーを付けて返します。自動生成字幕の安定取得にはPOST中継が効きます。</p>' +
            '</details>' +
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
    // 接続テスト：入力中のプロキシで既知の動画から字幕が取れるか試す
    bindClick("proxy-test", function () {
      var st = document.getElementById("proxy-status");
      var input = document.getElementById("proxy-input");
      var v = (input ? input.value.trim() : "");
      // 入力値を一時保存して試す（保存前でもテスト可能に）
      Storage.update(function (s) { s.profile.captionProxy = v || null; return s; });
      if (st) st.innerHTML = "テスト中… 数秒お待ちください。";
      // 字幕が確実にある公開動画（YouTube公式の字幕付きサンプル）
      window.Captions.fetchCaptions("PNLHxR4EtYs").then(function (cues) {
        if (st) st.innerHTML = '<span style="color:var(--ok,#2e7d32)">✅ 成功：' + cues.length + ' 行の字幕を取得できました。「保存」を押せば設定完了です。</span>';
      }).catch(function () {
        // サンプルが取れなくても他の動画で取れる場合があるため文言は穏当に
        if (st) st.innerHTML = '<span style="color:var(--danger,#c62828)">⚠ このプロキシでは取得できませんでした。URLの末尾が <code>/?url=</code> で終わっているか、Workerが正しくDeployされているかご確認ください。公開プロキシ（空欄）でも動画によっては取得できます。</span>';
      });
    });
    // Workerコードをクリップボードへ
    bindClick("proxy-copy-code", function () {
      var code = (window.EigoData && window.EigoData.workerCode) ? window.EigoData.workerCode : "";
      if (!code) { EM.showToast("コードを読み込めませんでした", true); return; }
      function done() { EM.showToast("Workerコードをコピーしました"); }
      function fallback() {
        try {
          var ta = document.createElement("textarea");
          ta.value = code; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta); done();
        } catch (e) { EM.showToast("コピーに失敗しました。手動で選択してください", true); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(fallback);
      } else { fallback(); }
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
    bindClick("vt-device", function () { EM.speakWith("device", "This is the device voice test."); });
    document.querySelectorAll('#kata-segmented [data-kata]').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('data-kata') === 'on';
        Storage.update(function (s) { s.profile.kataFallback = on; return s; });
        document.querySelectorAll('#kata-segmented [data-kata]').forEach(function (x) {
          x.setAttribute('aria-pressed', String((x.getAttribute('data-kata') === 'on') === on));
        });
        EM.showToast(on ? 'カタカナ近似を使います' : 'カタカナ近似を使いません（英語の声が無い場合は案内のみ表示）');
      });
    });
    bindClick("vt-online", function () { EM.speakWith("online", "This is the online voice test."); });
    bindClick("vt-diag", function () {
      var box = document.getElementById("vt-report");
      var vi = EM.voiceInfo();
      var rows = [];
      rows.push("端末の音声合成：" + (vi.supported ? "対応" : "非対応") + "／ボイス " + vi.total + " 個（英語 " + vi.en + " 個" + (vi.names.length ? "：" + vi.names.join(", ") : "") + "）");
      box.innerHTML = '<div class="notice notice--info"><span class="notice__icon">i</span><span id="vt-lines">' + EM.escapeHtml(rows[0]) + '<br>オンライン音声の接続を確認中…</span></div>';
      var n = EM.ttsProviderCount(); var done = 0; var oks = [];
      var names = ["Google A", "Google B", "Google C", "Polly"];
      function fin() {
        var el = document.getElementById("vt-lines"); if (!el) return;
        var line2 = "オンライン音声：" + oks.map(function (o, i) { return names[i] + (o ? " ✅" : " ❌"); }).join(" ／ ");
        var anyOnline = oks.some(function (o) { return o; });
        var advice = vi.en > 0 ? "→ 端末の英語ボイスで再生できます（自動でこれを使います）。鳴らない場合はOS音量・ミュートをご確認ください。"
          : anyOnline ? "→ 端末に英語ボイスが無いため、オンライン音声（✅のもの）を自動で使います。"
          : "→ 端末に英語ボイスが無く、オンラインにも接続できません。上の『英語の声を端末に追加する方法』をお試しください。";
        el.innerHTML = EM.escapeHtml(rows[0]) + "<br>" + EM.escapeHtml(line2) + "<br>" + EM.escapeHtml(advice);
      }
      for (var i = 0; i < n; i++) (function (idx) { EM.ttsProbe(idx, function (ok) { oks[idx] = ok; done++; if (done === n) fin(); }); })(i);
    });
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
  EM.registerView("#/pron",     { title: "発音",   tab: "learn",    render: renderPronHub });
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
    highlightSideNav(routeKey);
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
    function toTop() {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      viewEl.scrollTop = 0;
    }
    toTop();
    // canvas描画や画像読み込みでレイアウトが後から動いても先頭を維持
    if (window.requestAnimationFrame) requestAnimationFrame(toTop);
    setTimeout(toTop, 60);
  }

  /* ---------- Service Worker ---------- */
  var APP_VERSION = "v60";
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
      // updateViaCache:"none" … ブラウザが sw.js 自体を古いままキャッシュして
      // 新バージョンが永久に入らない問題を防ぐ（更新が届かない最大の原因対策）。
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
        if (reg && reg.update) { try { reg.update(); } catch (e) {} }
        // 新SWが見つかってインストール完了したら、即座に有効化＆リロードを促す
        if (reg) {
          reg.addEventListener("updatefound", function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", function () {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                EM.showToast("新しいバージョンに更新します…");
                setTimeout(function () { window.location.reload(); }, 800);
              }
            });
          });
        }
        // 起動後も定期的に更新確認（タブを開きっぱなしでも最新を取りに行く）
        setInterval(function () { if (reg && reg.update) { try { reg.update(); } catch (e) {} } }, 60000);
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
    var verEl = document.getElementById("app-version");
    if (verEl) verEl.textContent = APP_VERSION;
    buildSideNav();
    if (!EM.views[location.hash]) location.replace("#" + DEFAULT_ROUTE.slice(1));
    window.addEventListener("hashchange", navigate);
    navigate();
    registerServiceWorker();
  }

  /* ============================================================
     デスクトップ用サイドバー（PCでのみ表示）
     - 3つの巨大タブではなく、学習モードへ直接飛べる実用的なナビ。
     - モバイルは従来の下部タブバーを使用（このside-navはCSSで非表示）。
     ============================================================ */
  var SIDE_NAV = [
    { type: "brand", label: "EigoMaster" },
    { type: "link", icon: "🏠", label: "ホーム", href: "#/home" },
    { type: "head", label: "学ぶ" },
    { type: "link", icon: "🎯", label: "今日のレッスン", href: "#/lesson" },
    { type: "link", icon: "あ", label: "単語", href: "#/vocab" },
    { type: "link", icon: "熟", label: "熟語・句動詞", href: "#/idioms" },
    { type: "link", icon: "文", label: "文法", href: "#/grammar" },
    { type: "link", icon: "🎧", label: "リスニング", href: "#/listening" },
    { type: "link", icon: "読", label: "リーディング", href: "#/reading" },
    { type: "link", icon: "▷", label: "シャドーイング", href: "#/video" },
    { type: "head", label: "発音・音声変化" },
    { type: "link", icon: "🎤", label: "発音チェック", href: "#/pron-check" },
    { type: "link", icon: "æ", label: "フォニックス", href: "#/phonics" },
    { type: "link", icon: "◠", label: "リンキング", href: "#/linking" },
    { type: "head", label: "そのほか" },
    { type: "link", icon: "◔", label: "レベル診断", href: "#/diagnosis" },
    { type: "link", icon: "🗺", label: "学習マップ", href: "#/skills" },
    { type: "link", icon: "帳", label: "単語帳", href: "#/wordbook" },
    { type: "link", icon: "⚙", label: "設定", href: "#/settings" }
  ];

  function buildSideNav() {
    var shell = document.querySelector(".app-shell");
    if (!shell || document.querySelector(".side-nav")) return;
    var nav = document.createElement("nav");
    nav.className = "side-nav";
    nav.setAttribute("aria-label", "メインナビゲーション（PC）");
    var html = "";
    SIDE_NAV.forEach(function (it) {
      if (it.type === "brand") {
        html += '<a class="side-nav__brand" href="#/home">' + EM.escapeHtml(it.label) + "</a>";
      } else if (it.type === "head") {
        html += '<p class="side-nav__head">' + EM.escapeHtml(it.label) + "</p>";
      } else {
        html += '<a class="side-nav__link" href="' + it.href + '" data-href="' + it.href + '">' +
          '<span class="side-nav__icon">' + EM.escapeHtml(it.icon) + "</span>" +
          '<span class="side-nav__label">' + EM.escapeHtml(it.label) + "</span></a>";
      }
    });
    nav.innerHTML = html;
    shell.appendChild(nav);
    sideNavEl = nav;
  }

  var sideNavEl = null;
  function highlightSideNav(routeKey) {
    if (!sideNavEl) return;
    sideNavEl.querySelectorAll(".side-nav__link").forEach(function (a) {
      if (a.getAttribute("data-href") === routeKey) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ============================================================
   aicaption.js — マイク不要の自動字幕生成（ブラウザ内 AI 音声認識）
   ・音声の入手：①タブ/画面の音声キャプチャ(getDisplayMedia、マイク不要) または
                 ②動画/音声ファイルURL（同一オリジン or CORS許可）
   ・文字起こし：Transformers.js の Whisper を CDN から読み込み、ブラウザ内で実行。
                 サーバー送信なし・タイムスタンプ付きで cues を生成。
   ・対応：Netflix / 字幕なしYouTube / mp4 等あらゆる「音が鳴る動画」。
   window.AICaption として公開。
   ※ 初回はモデル(約40MB)をHugging FaceのCDNから取得（ネット接続が必要）。
   ============================================================ */
(function () {
  "use strict";

  // Transformers.js（ESM）の読み込み先。依存解決済みのESMエンドポイントを順に試す。
  // ※ 素の cdn.jsdelivr.net/npm/<pkg> は依存(onnxruntime等)を解決できずimportに失敗するため使わない。
  var TRANSFORMERS_CDNS = [
    "https://esm.sh/@xenova/transformers@2.17.2",
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm",
    "https://unpkg.com/@xenova/transformers@2.17.2/+esm"
  ];
  var MODELS = {
    fast: "Xenova/whisper-tiny.en",   // 約40MB・速い（英語）
    accurate: "Xenova/whisper-base.en" // 約145MB・やや高精度（英語）
  };
  var TARGET_SR = 16000;               // Whisper入力は16kHzモノラル

  var _pipelinePromise = null;
  var _loadedModel = null;

  function hasDisplayCapture() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
  function hasRecorder() { return typeof window.MediaRecorder !== "undefined"; }
  // 動的importが使えてキャプチャ手段があれば対応（マイクは不要）
  function isSupported() {
    return hasRecorder() && (hasDisplayCapture() || true); // ファイルURL経路は常に可
  }

  // fetch にタイムアウトを付ける（無応答で固まらないように）
  function fetchT(url, opts, ms) {
    opts = opts || {};
    ms = ms || 25000;
    if (typeof AbortController === "undefined") return fetch(url, opts);
    var ac = new AbortController();
    var t = setTimeout(function () { ac.abort(); }, ms);
    opts.signal = ac.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }

  // 複数CDNから Transformers.js を動的import（pipeline/env を持つものを採用）
  function importTransformers() {
    var i = 0;
    return new Promise(function (resolve, reject) {
      (function next() {
        if (i >= TRANSFORMERS_CDNS.length) { reject(new Error("AIライブラリの読み込みに失敗しました（ネット接続/拡張機能のブロックをご確認ください）")); return; }
        var url = TRANSFORMERS_CDNS[i++];
        import(/* @vite-ignore */ url).then(function (mod) {
          if (mod && typeof mod.pipeline === "function") resolve(mod);
          else next();
        }).catch(function () { next(); });
      })();
    });
  }

  // ---- Transformers.js / Whisper の遅延ロード ----
  function loadPipeline(modelKey, onProgress) {
    var model = MODELS[modelKey] || MODELS.fast;
    if (_pipelinePromise && _loadedModel === model) return _pipelinePromise;
    _loadedModel = model;
    _pipelinePromise = importTransformers().then(function (mod) {
      var env = mod.env;
      try {
        env.allowLocalModels = false;          // ローカル探索しない（CDN/HFのみ）
        env.useBrowserCache = true;            // モデルをブラウザにキャッシュ
        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
          env.backends.onnx.wasm.numThreads = 1; // 安定性優先
        }
      } catch (e) {}
      return mod.pipeline("automatic-speech-recognition", model, {
        quantized: true,
        progress_callback: function (p) {
          if (!onProgress) return;
          if (p && p.status === "progress" && p.total) {
            onProgress({ phase: "model", ratio: (p.loaded || 0) / p.total, file: p.file || "" });
          } else if (p && p.status === "ready") {
            onProgress({ phase: "model", ratio: 1 });
          }
        }
      });
    }).catch(function (e) { _pipelinePromise = null; throw e; });
    return _pipelinePromise;
  }

  // ---- タブ/画面の音声をキャプチャ（マイク不要） ----
  // 返り値 { stream, stop() }。ユーザーは共有ダイアログで「タブの音声を共有」を選ぶ。
  function captureDisplayAudio() {
    if (!hasDisplayCapture()) return Promise.reject(new Error("この環境は画面/タブ音声のキャプチャに非対応です（Chrome系の最新版を推奨）"));
    // 多くのブラウザは video:true を要求するが、音声トラックのみ使う
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(function (stream) {
      var audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        throw new Error("音声トラックを取得できませんでした。共有ダイアログで『タブの音声も共有』にチェックを入れてください（画面全体共有時は『システムの音声』）。");
      }
      return {
        stream: stream,
        stop: function () { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
      };
    });
  }

  // ---- MediaRecorder で録音し、停止時に Blob を返す ----
  function recordStream(stream, onTick) {
    var mime = "";
    ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].some(function (m) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
      return false;
    });
    var rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    var chunks = [];
    var t0 = Date.now();
    var timer = null;
    rec.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
    rec.start(1000);
    if (onTick) timer = setInterval(function () { onTick((Date.now() - t0) / 1000); }, 500);

    return {
      stop: function () {
        return new Promise(function (resolve) {
          rec.onstop = function () {
            if (timer) clearInterval(timer);
            resolve(new Blob(chunks, { type: mime || "audio/webm" }));
          };
          try { rec.stop(); } catch (e) { if (timer) clearInterval(timer); resolve(new Blob(chunks)); }
        });
      }
    };
  }

  // ---- Blob/ArrayBuffer → 16kHzモノラル Float32 ----
  function decodeToMono16k(arrayBuffer) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    return ctx.decodeAudioData(arrayBuffer).then(function (audioBuf) {
      try { ctx.close(); } catch (e) {}
      var duration = audioBuf.duration;
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var frames = Math.ceil(duration * TARGET_SR);
      var offline = new OAC(1, frames, TARGET_SR);
      var src = offline.createBufferSource();
      src.buffer = audioBuf;
      src.connect(offline.destination);
      src.start(0);
      return offline.startRendering().then(function (rendered) {
        return rendered.getChannelData(0); // Float32Array @16k mono
      });
    });
  }

  // ---- URL（ファイル/音声ストリーム）から音声を取得 ----
  function fetchAudioBuffer(url) {
    return fetchT(url, {}, 60000).then(function (r) {
      if (!r.ok) throw new Error("音声の取得に失敗（CORSまたは無効なURL）: HTTP " + r.status);
      return r.arrayBuffer();
    });
  }

  // ---- Whisper 実行 → cues 化 ----
  function transcribeAudio(float32, modelKey, onProgress) {
    if (onProgress) onProgress({ phase: "model", ratio: 0 }); // 起動中表示（初回は読み込みに時間がかかる）
    return loadPipeline(modelKey, onProgress).then(function (asr) {
      if (onProgress) onProgress({ phase: "transcribe", ratio: 0 });
      return asr(float32, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: "english",
        task: "transcribe"
      });
    }).then(function (out) {
      var cues = [];
      var chunks = (out && out.chunks) || [];
      chunks.forEach(function (c) {
        var ts = c.timestamp || [];
        var text = String(c.text || "").replace(/\s+/g, " ").trim();
        if (!text) return;
        var start = (ts[0] != null) ? ts[0] : (cues.length ? cues[cues.length - 1].end : 0);
        var end = (ts[1] != null) ? ts[1] : start + 2;
        cues.push({ index: cues.length + 1, start: start, end: end, text: cap(text) });
      });
      // チャンクが無い場合は全文を1つに
      if (!cues.length && out && out.text) {
        cues.push({ index: 1, start: 0, end: 5, text: cap(String(out.text).trim()) });
      }
      if (onProgress) onProgress({ phase: "transcribe", ratio: 1 });
      return cues;
    });
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ---- 高レベルAPI ---- */

  // タブ/画面音声を録音 → 文字起こし。
  // returns { stop: () => Promise<cues> }  … 録音中。停止で文字起こしして cues を返す。
  function startCaptureSession(opts) {
    opts = opts || {};
    var modelKey = opts.model || "fast";
    return captureDisplayAudio().then(function (cap) {
      // ユーザーが共有を止めたら自動停止できるようにフラグ
      var ended = false;
      cap.stream.getAudioTracks().forEach(function (t) { t.onended = function () { ended = true; if (opts.onAutoEnd) opts.onAutoEnd(); }; });
      var recorder = recordStream(cap.stream, opts.onTick);
      return {
        isEnded: function () { return ended; },
        stop: function () {
          return recorder.stop().then(function (blob) {
            cap.stop();
            if (!blob || !blob.size) throw new Error("音声が録音されませんでした。動画を再生し、共有時に音声を有効にしてください。");
            if (opts.onProgress) opts.onProgress({ phase: "decode", ratio: 0 });
            return blob.arrayBuffer()
              .then(decodeToMono16k)
              .then(function (f32) {
                if (!f32 || !f32.length) throw new Error("音声を解析できませんでした。");
                return transcribeAudio(f32, modelKey, opts.onProgress);
              });
          });
        },
        cancel: function () { cap.stop(); }
      };
    });
  }

  // ファイル/音声ストリームURLから文字起こし（録音不要）。returns Promise<cues>
  function transcribeFromUrl(url, opts) {
    opts = opts || {};
    var modelKey = opts.model || "fast";
    if (opts.onProgress) opts.onProgress({ phase: "fetch", ratio: 0 });
    return fetchAudioBuffer(url)
      .then(decodeToMono16k)
      .then(function (f32) { return transcribeAudio(f32, modelKey, opts.onProgress); });
  }

  window.AICaption = {
    isSupported: isSupported,
    hasDisplayCapture: hasDisplayCapture,
    startCaptureSession: startCaptureSession,
    transcribeFromUrl: transcribeFromUrl,
    MODELS: MODELS
  };
})();

/* ============================================================
   livecaption.js — ライブ文字起こし（字幕の無い動画に対応）
   ブラウザの音声認識(Web Speech API)で、デバイスで再生している音声を
   マイク経由で聞き取り、字幕(cues)を生成する。
   - Netflix / 字幕なしYouTube / あらゆる動画・音声に使える（音が鳴っていれば良い）。
   - 認識した確定フレーズを、開始からの経過時間つきで cue 化する。
   window.LiveCaption として公開。
   ============================================================ */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function isSupported() { return !!SR; }

  // opts: { onInterim(text), onCue(cue), onStart(), onEnd(), onError(msg) }
  function start(opts) {
    opts = opts || {};
    if (!SR) { if (opts.onError) opts.onError("この端末はライブ文字起こしに対応していません（Chrome系を推奨）"); return null; }

    var rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    var t0 = null;
    var cueCount = 0;
    var stopped = false;

    rec.onstart = function () { t0 = Date.now(); if (opts.onStart) opts.onStart(); };
    rec.onresult = function (ev) {
      var interim = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i];
        var txt = (res[0] && res[0].transcript ? res[0].transcript : "").replace(/\s+/g, " ").trim();
        if (!txt) continue;
        if (res.isFinal) {
          var now = (Date.now() - t0) / 1000;
          cueCount++;
          var cue = { index: cueCount, start: Math.max(0, now - estDur(txt)), end: now, text: cap(txt) };
          if (opts.onCue) opts.onCue(cue);
        } else {
          interim += txt + " ";
        }
      }
      if (opts.onInterim) opts.onInterim(interim.trim());
    };
    rec.onerror = function (e) {
      if (opts.onError) opts.onError(errMsg(e && e.error));
    };
    rec.onend = function () {
      // continuousでも自動で切れることがあるため、stopされていなければ再開
      if (!stopped) { try { rec.start(); } catch (x) {} return; }
      if (opts.onEnd) opts.onEnd();
    };

    try { rec.start(); } catch (e) { if (opts.onError) opts.onError("マイクを開始できませんでした"); return null; }

    return {
      stop: function () { stopped = true; try { rec.stop(); } catch (e) {} }
    };
  }

  function estDur(text) {
    var words = text.split(/\s+/).length;
    return Math.min(8, Math.max(1.2, words * 0.4));
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function errMsg(code) {
    if (code === "not-allowed" || code === "service-not-allowed") return "マイクの使用が許可されていません。ブラウザの設定で許可してください。";
    if (code === "no-speech") return "音声を検出できませんでした。動画の音量を上げてお試しください。";
    if (code === "audio-capture") return "マイクが見つかりません。";
    if (code === "network") return "音声認識サーバーに接続できません。";
    return "音声認識でエラーが発生しました（" + (code || "不明") + "）";
  }

  window.LiveCaption = { isSupported: isSupported, start: start };
})();

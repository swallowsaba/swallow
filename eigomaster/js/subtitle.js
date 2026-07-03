/* ============================================================
   subtitle.js — 字幕パーサ（SRT / VTT / プレーンテキスト）
   返り値：[{ index, start(秒|null), end(秒|null), text }]
   ユーザーが持ち込んだ字幕を自前で解析する（外部依存なし）。
   window.Subtitle として公開。
   ============================================================ */
(function () {
  "use strict";

  // "00:01:02,500" or "01:02.500" → 秒
  function timeToSeconds(str) {
    str = str.trim().replace(",", ".");
    var parts = str.split(":").map(parseFloat);
    if (parts.some(isNaN)) return null;
    var sec = 0;
    for (var i = 0; i < parts.length; i++) sec = sec * 60 + parts[i];
    return sec;
  }

  var TIME_LINE = /(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{1,3}/;

  // SRT/VTT 共通のブロック解析
  function parseTimed(raw) {
    var text = String(raw).replace(/^\uFEFF/, "").replace(/\r/g, "");
    // WEBVTT ヘッダ除去
    text = text.replace(/^WEBVTT.*?(\n\n|$)/s, "");
    var blocks = text.split(/\n{2,}/);
    var cues = [];
    blocks.forEach(function (block) {
      var lines = block.split("\n").filter(function (l) { return l.trim() !== ""; });
      if (!lines.length) return;
      // 先頭が連番なら飛ばす
      if (/^\d+$/.test(lines[0].trim()) && lines.length > 1 && TIME_LINE.test(lines[1])) lines.shift();
      var timeLine = lines[0];
      if (!TIME_LINE.test(timeLine)) return; // 時刻行が無いブロックは無視
      var m = timeLine.split("-->");
      var start = timeToSeconds(m[0].trim());
      var end = timeToSeconds(m[1].trim().replace(/\s.*$/, "")); // 時刻のみ（align/position等を除去）
      var body = lines.slice(1).join(" ").replace(/<[^>]+>/g, "").trim(); // タグ除去
      if (body) cues.push({ index: cues.length + 1, start: start, end: end, text: body });
    });
    return cues;
  }

  function parseSRT(raw) { return parseTimed(raw); }
  function parseVTT(raw) { return parseTimed(raw); }

  // YouTubeの「文字起こしを表示」からコピペした形式を解析する。
  //  例) "0:00 Hello everyone" / 連続行で「0:00」の次行に本文、のどちらにも対応。
  //  → 外部通信なしで、字幕付きYouTube動画を確実に取り込める。
  var YT_TS = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\.\d+)?\s*(.*)$/;
  function looksLikeYouTubeTranscript(raw) {
    var lines = String(raw).replace(/\r/g, "").split("\n");
    var hit = 0, total = 0;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim(); if (!t) continue; total++;
      if (YT_TS.test(t)) hit++;
      if (total >= 6) break;
    }
    return total >= 2 && hit >= 2;
  }
  function parseYouTubeTranscript(raw) {
    var lines = String(raw).replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
    var cues = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = line.match(YT_TS);
      if (!m) {
        // タイムスタンプの無い行（タイトル等）。直前のcueがあれば本文として連結。
        if (cues.length && !cues[cues.length - 1]._needText) cues[cues.length - 1].text += " " + line;
        continue;
      }
      var start = timeToSeconds(m[1]);
      var body = (m[2] || "").trim();
      if (body) {
        cues.push({ index: cues.length + 1, start: start, end: null, text: body });
      } else {
        // タイムスタンプ単独行 → 次の非空行が本文
        var j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length) {
          cues.push({ index: cues.length + 1, start: start, end: null, text: lines[j].trim() });
          i = j;
        }
      }
    }
    // end を次cueのstartで補完
    for (var k = 0; k < cues.length; k++) {
      cues[k].end = (k + 1 < cues.length) ? cues[k + 1].start : (cues[k].start != null ? cues[k].start + 3 : null);
      delete cues[k]._needText;
    }
    return cues;
  }

  // タイムスタンプ無し：文・行ごとに分割（start/end は null）
  function parsePlainText(raw) {
    var text = String(raw).replace(/\r/g, "").trim();
    if (!text) return [];
    // 改行優先、無ければ文末記号で分割
    var pieces = text.indexOf("\n") >= 0
      ? text.split(/\n+/)
      : text.split(/(?<=[.!?])\s+/);
    return pieces.map(function (t, i) {
      return { index: i + 1, start: null, end: null, text: t.trim() };
    }).filter(function (c) { return c.text; });
  }

  // 自動判定
  function parse(raw) {
    if (TIME_LINE.test(String(raw))) return parseTimed(raw);          // SRT / VTT
    if (looksLikeYouTubeTranscript(raw)) return parseYouTubeTranscript(raw); // YouTube文字起こしコピペ
    return parsePlainText(raw);
  }

  window.Subtitle = {
    parse: parse,
    parseSRT: parseSRT,
    parseVTT: parseVTT,
    parsePlainText: parsePlainText,
    parseYouTubeTranscript: parseYouTubeTranscript,
    looksLikeYouTubeTranscript: looksLikeYouTubeTranscript,
    timeToSeconds: timeToSeconds
  };
})();

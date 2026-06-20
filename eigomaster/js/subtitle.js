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
    if (TIME_LINE.test(String(raw))) return parseTimed(raw);
    return parsePlainText(raw);
  }

  window.Subtitle = {
    parse: parse,
    parseSRT: parseSRT,
    parseVTT: parseVTT,
    parsePlainText: parsePlainText,
    timeToSeconds: timeToSeconds
  };
})();

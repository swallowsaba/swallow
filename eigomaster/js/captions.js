/* ============================================================
   captions.js — YouTube字幕の自動取得
   - YouTube の timedtext エンドポイントから字幕XMLを取得して cue 化する。
   - 静的サイトからは CORS によりブラウザ直接取得が原則できないため、
     CORSを解決するプロキシ（既定は公開プロキシ。設定で自分のWorkerに変更可）を経由する。
   - 取得できないケース（字幕なし・プロキシ不通・YouTube側の制限）では失敗を返し、
     呼び出し側は手動貼り付けにフォールバックする。
   window.Captions として公開。
   ============================================================ */
(function () {
  "use strict";

  // 既定の公開CORSプロキシ（信頼性は保証されない。設定で自分のものに変更推奨）
  var DEFAULT_PROXY = "https://api.allorigins.win/raw?url=";

  function getProxy() {
    var p = Storage.getState().profile.captionProxy;
    return (p && p.trim()) ? p.trim() : DEFAULT_PROXY;
  }

  // HTMLエンティティを解く（&amp; &#39; 等）
  function decodeEntities(s) {
    var ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  // timedtext のXMLを [{index,start,end,text}] に変換
  function parseTimedTextXML(xmlStr) {
    var cues = [];
    try {
      var doc = new DOMParser().parseFromString(xmlStr, "text/xml");
      var texts = doc.getElementsByTagName("text");
      for (var i = 0; i < texts.length; i++) {
        var t = texts[i];
        var start = parseFloat(t.getAttribute("start")) || 0;
        var dur = parseFloat(t.getAttribute("dur")) || 2;
        var raw = t.textContent || "";
        var text = decodeEntities(raw).replace(/\s+/g, " ").trim();
        if (text) cues.push({ index: cues.length + 1, start: start, end: start + dur, text: text });
      }
    } catch (e) { /* パース失敗時は空 */ }
    return cues;
  }

  // 試行するtimedtext URL（手動字幕→自動字幕(asr)→英語亜種）
  function candidateUrls(videoId) {
    return [
      "https://www.youtube.com/api/timedtext?lang=en&v=" + videoId,
      "https://www.youtube.com/api/timedtext?lang=en-US&v=" + videoId,
      "https://www.youtube.com/api/timedtext?lang=en&kind=asr&v=" + videoId,
      "https://video.google.com/timedtext?lang=en&v=" + videoId
    ];
  }

  function fetchVia(url, proxy) {
    var full = proxy + encodeURIComponent(url);
    return fetch(full, { method: "GET" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  // 字幕を取得。成功で cues 配列、失敗で reject。
  function fetchCaptions(videoId) {
    if (!videoId) return Promise.reject(new Error("動画IDが不正です"));
    var proxy = getProxy();
    var urls = candidateUrls(videoId);

    return new Promise(function (resolve, reject) {
      (function tryNext(i) {
        if (i >= urls.length) { reject(new Error("字幕を自動取得できませんでした")); return; }
        fetchVia(urls[i], proxy).then(function (xml) {
          if (xml && xml.indexOf("<text") >= 0) {
            var cues = parseTimedTextXML(xml);
            if (cues.length) { resolve(cues); return; }
          }
          tryNext(i + 1);
        }).catch(function () { tryNext(i + 1); });
      })(0);
    });
  }

  window.Captions = {
    DEFAULT_PROXY: DEFAULT_PROXY,
    fetchCaptions: fetchCaptions,
    parseTimedTextXML: parseTimedTextXML
  };
})();

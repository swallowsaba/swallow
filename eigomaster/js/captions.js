/* ============================================================
   captions.js — YouTube字幕の自動取得（刷新版 v2）
   旧 timedtext API は多くの動画で空を返すため、次の順で試す：
     1) 動画ページHTMLから captionTracks(baseUrl) を抽出 → そのURLで字幕取得
        （手動字幕を優先し、無ければ自動字幕(asr)も使う。英語系を優先）
     2) baseUrl に &fmt=json3 を付けてJSON取得（XMLが空でもJSONで取れる場合がある）
     3) 旧 timedtext 形式（保険）
   静的サイトは CORS のため、すべてプロキシ経由で取得する。
   複数の公開プロキシを順に試し、全滅なら失敗を返す（呼び出し側が手動貼り付けへ）。
   window.Captions として公開。
   ============================================================ */
(function () {
  "use strict";

  // 複数の公開CORSプロキシ（先頭から順に試す）。設定で先頭に自分のWorkerを追加可能。
  var PROXIES = [
    "https://corsproxy.io/?url=",
    "https://api.allorigins.win/raw?url=",
    "https://thingproxy.freeboard.io/fetch/"
  ];

  function proxyList() {
    var p = (Storage.getState().profile.captionProxy || "").trim();
    return p ? [p].concat(PROXIES) : PROXIES.slice();
  }

  function decodeEntities(s) {
    var ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  // 任意のURLをプロキシ経由で取得（順に試す）
  function fetchTextViaProxies(url) {
    var proxies = proxyList();
    return new Promise(function (resolve, reject) {
      (function attempt(i) {
        if (i >= proxies.length) { reject(new Error("プロキシ経由の取得に失敗")); return; }
        var full = proxies[i] + encodeURIComponent(url);
        fetch(full, { method: "GET" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(function (txt) { if (txt && txt.length > 0) resolve(txt); else attempt(i + 1); })
          .catch(function () { attempt(i + 1); });
      })(0);
    });
  }

  // timedtext XML → cues
  function parseTimedTextXML(xmlStr) {
    var cues = [];
    try {
      var doc = new DOMParser().parseFromString(xmlStr, "text/xml");
      var texts = doc.getElementsByTagName("text");
      for (var i = 0; i < texts.length; i++) {
        var t = texts[i];
        var start = parseFloat(t.getAttribute("start")) || 0;
        var dur = parseFloat(t.getAttribute("dur")) || 2;
        var text = decodeEntities(t.textContent || "").replace(/\s+/g, " ").trim();
        if (text) cues.push({ index: cues.length + 1, start: start, end: start + dur, text: text });
      }
    } catch (e) {}
    return cues;
  }

  // json3形式 → cues
  function parseJson3(jsonStr) {
    var cues = [];
    try {
      var data = JSON.parse(jsonStr);
      (data.events || []).forEach(function (ev) {
        if (!ev.segs) return;
        var text = ev.segs.map(function (s) { return s.utf8 || ""; }).join("").replace(/\s+/g, " ").trim();
        if (!text) return;
        var start = (ev.tStartMs || 0) / 1000;
        var dur = (ev.dDurationMs || 2000) / 1000;
        cues.push({ index: cues.length + 1, start: start, end: start + dur, text: text });
      });
    } catch (e) {}
    return cues;
  }

  // 動画ページHTMLから captionTracks を抽出
  function extractCaptionTracks(html) {
    try {
      var m = html.match(/"captionTracks":(\[.*?\])/);
      if (!m) return [];
      // baseUrl中の \u0026 を & に戻す
      var json = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      var tracks = JSON.parse(json);
      return tracks || [];
    } catch (e) { return []; }
  }

  // 英語トラックを優先して選ぶ（手動→自動の順）
  function pickTrack(tracks) {
    if (!tracks.length) return null;
    function score(t) {
      var lang = (t.languageCode || "").toLowerCase();
      var isEn = lang.indexOf("en") === 0 ? 0 : 1;
      var isAsr = (t.kind === "asr") ? 1 : 0; // 手動字幕を優先
      return isEn * 2 + isAsr;
    }
    return tracks.slice().sort(function (a, b) { return score(a) - score(b); })[0];
  }

  // baseUrl から cues を取得（json3 → xml の順）
  function fetchFromBaseUrl(baseUrl) {
    var jsonUrl = baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + "fmt=json3";
    return fetchTextViaProxies(jsonUrl).then(function (txt) {
      var cues = parseJson3(txt);
      if (cues.length) return cues;
      // json3が空ならXMLで再挑戦
      return fetchTextViaProxies(baseUrl).then(function (xml) {
        var c = parseTimedTextXML(xml);
        if (c.length) return c;
        throw new Error("字幕本文が空でした");
      });
    });
  }

  // メイン：videoId から字幕を取得
  function fetchCaptions(videoId) {
    if (!videoId) return Promise.reject(new Error("動画IDが不正です"));
    var watchUrl = "https://www.youtube.com/watch?v=" + videoId + "&hl=en";

    // 1) 動画ページHTML → captionTracks → baseUrl
    return fetchTextViaProxies(watchUrl).then(function (html) {
      var tracks = extractCaptionTracks(html);
      var track = pickTrack(tracks);
      if (track && track.baseUrl) {
        return fetchFromBaseUrl(track.baseUrl).catch(function () {
          return fallbackTimedText(videoId);
        });
      }
      return fallbackTimedText(videoId);
    }).catch(function () {
      // ページHTMLが取れない場合も timedtext を試す
      return fallbackTimedText(videoId);
    });
  }

  // 3) 旧 timedtext（保険）
  function fallbackTimedText(videoId) {
    var urls = [
      "https://www.youtube.com/api/timedtext?lang=en&v=" + videoId + "&fmt=json3",
      "https://www.youtube.com/api/timedtext?lang=en&v=" + videoId,
      "https://www.youtube.com/api/timedtext?lang=en&kind=asr&v=" + videoId + "&fmt=json3",
      "https://www.youtube.com/api/timedtext?lang=en&kind=asr&v=" + videoId
    ];
    return new Promise(function (resolve, reject) {
      (function tryNext(i) {
        if (i >= urls.length) { reject(new Error("字幕を自動取得できませんでした")); return; }
        fetchTextViaProxies(urls[i]).then(function (body) {
          var cues = urls[i].indexOf("json3") >= 0 ? parseJson3(body) : parseTimedTextXML(body);
          if (cues.length) resolve(cues); else tryNext(i + 1);
        }).catch(function () { tryNext(i + 1); });
      })(0);
    });
  }

  window.Captions = {
    PROXIES: PROXIES,
    DEFAULT_PROXY: PROXIES[0],
    fetchCaptions: fetchCaptions,
    parseTimedTextXML: parseTimedTextXML,
    parseJson3: parseJson3,
    extractCaptionTracks: extractCaptionTracks
  };
})();

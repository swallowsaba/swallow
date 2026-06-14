/* ============================================================
   captions.js — YouTube字幕の自動取得（刷新版 v3 / Innertube対応）
   静的サイトはCORSのため全取得をプロキシ経由で行う。
   取得戦略（成功率の高い順に試す）：
     A) Innertube player API（youtubei/v1/player）から captionTracks を取得
        - WEB / ANDROID / iOS クライアントを順に試す
        - 自動生成字幕(kind:"asr")も対象。英語系を優先
     B) 動画ページHTMLから ytInitialPlayerResponse を抽出 → captionTracks
     C) 旧 timedtext（最後の保険）
   字幕本文は baseUrl に &fmt=json3 を付けてJSON取得（空ならXML）。
   window.Captions として公開。
   ============================================================ */
(function () {
  "use strict";

  // 公開CORSプロキシ（先頭から順に試す）。設定で自分のWorkerを先頭に追加可能。
  // POST対応が必要なInnertubeはWorker推奨。GET専用プロキシはHTML/字幕本文取得に使う。
  var PROXIES = [
    "https://corsproxy.io/?url=",
    "https://api.allorigins.win/raw?url=",
    "https://thingproxy.freeboard.io/fetch/"
  ];

  // InnertubeのAPIキー（YouTube公開の固定WEBキー。HTML取得不要で叩ける）
  var INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  // 試行するクライアント（captionが返りやすい順）
  var CLIENTS = [
    { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 },
    { clientName: "IOS", clientVersion: "20.10.4" },
    { clientName: "WEB", clientVersion: "2.20250101.00.00" }
  ];

  function proxyList() {
    var p = (Storage.getState().profile.captionProxy || "").trim();
    return p ? [p].concat(PROXIES) : PROXIES.slice();
  }

  // 自前Worker（POST対応・パススルー型）が設定されているか
  function customProxy() {
    return (Storage.getState().profile.captionProxy || "").trim();
  }

  function decodeEntities(s) {
    var ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  // 任意URLをGETでプロキシ経由取得（順に試す）
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

  // Innertube player API をPOSTで叩く（自前WorkerがPOSTパススルー対応なら最優先）
  // 多くの公開GETプロキシはPOST不可のため、まずWorker、ダメならHTML方式へ。
  function fetchPlayerViaInnertube(videoId, client) {
    var body = JSON.stringify({
      context: { client: client },
      videoId: videoId,
      params: "CgIQBg=="
    });
    var apiUrl = "https://www.youtube.com/youtubei/v1/player?key=" + INNERTUBE_KEY + "&prettyPrint=false";

    var worker = customProxy();
    // 自前Workerが "?url=" 型パススルーでPOSTを通す前提。POST可否は環境次第なので失敗時は握りつぶす。
    var target = worker ? (worker + encodeURIComponent(apiUrl)) : null;
    if (!target) return Promise.reject(new Error("Innertube POSTには自前Workerが必要"));

    return fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
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
      var data = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
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

  // ytInitialPlayerResponse をHTMLから抽出（var/window 両対応の堅牢版）
  function extractPlayerResponse(html) {
    try {
      var re = /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|window\[|<\/script|\n)/;
      var m = html.match(re);
      if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
      // フォールバック：captionTracks 配列だけを括弧対応で切り出す
      var idx = html.indexOf('"captionTracks"');
      if (idx >= 0) {
        var sub = html.slice(idx + 15);
        var br = sub.indexOf("[");
        if (br >= 0) {
          var depth = 0, end = -1;
          for (var i = br; i < sub.length; i++) {
            if (sub[i] === "[") depth++;
            else if (sub[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end >= 0) {
            var arr = sub.slice(br, end + 1).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
            var tracks = JSON.parse(arr);
            return { captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // playerResponse から captionTracks を取り出す
  function tracksFromPlayer(player) {
    try {
      var tr = player.captions &&
        player.captions.playerCaptionsTracklistRenderer &&
        player.captions.playerCaptionsTracklistRenderer.captionTracks;
      return tr || [];
    } catch (e) { return []; }
  }

  // 英語トラックを優先（手動→自動の順、languageCode と vssId 両方を見る）
  function pickTrack(tracks) {
    if (!tracks.length) return null;
    function score(t) {
      var lang = (t.languageCode || "").toLowerCase();
      var vss = (t.vssId || "").toLowerCase();
      var isEn = (lang.indexOf("en") === 0 || vss.indexOf(".en") >= 0 || vss.indexOf("a.en") >= 0) ? 0 : 1;
      var isAsr = (t.kind === "asr") ? 1 : 0; // 手動字幕を優先（無ければ自動生成）
      return isEn * 2 + isAsr;
    }
    return tracks.slice().sort(function (a, b) { return score(a) - score(b); })[0];
  }

  // baseUrl から cues を取得（json3 → xml の順）
  function fetchFromBaseUrl(baseUrl) {
    var clean = baseUrl.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    var jsonUrl = clean + (clean.indexOf("?") >= 0 ? "&" : "?") + "fmt=json3";
    return fetchTextViaProxies(jsonUrl).then(function (txt) {
      var cues = parseJson3(txt);
      if (cues.length) return cues;
      return fetchTextViaProxies(clean).then(function (xml) {
        var c = parseTimedTextXML(xml);
        if (c.length) return c;
        throw new Error("字幕本文が空でした");
      });
    });
  }

  // A) Innertube（自前Workerがある場合のみ有効）
  function tryInnertube(videoId) {
    var worker = customProxy();
    if (!worker) return Promise.reject(new Error("no worker"));
    return new Promise(function (resolve, reject) {
      (function tryClient(i) {
        if (i >= CLIENTS.length) { reject(new Error("Innertube全クライアント失敗")); return; }
        fetchPlayerViaInnertube(videoId, CLIENTS[i]).then(function (player) {
          var track = pickTrack(tracksFromPlayer(player));
          if (track && track.baseUrl) {
            fetchFromBaseUrl(track.baseUrl).then(resolve).catch(function () { tryClient(i + 1); });
          } else { tryClient(i + 1); }
        }).catch(function () { tryClient(i + 1); });
      })(0);
    });
  }

  // B) 動画ページHTML経由
  function tryHtml(videoId) {
    var watchUrl = "https://www.youtube.com/watch?v=" + videoId + "&hl=en&bpctr=9999999999";
    return fetchTextViaProxies(watchUrl).then(function (html) {
      var player = extractPlayerResponse(html);
      var track = player ? pickTrack(tracksFromPlayer(player)) : null;
      if (track && track.baseUrl) return fetchFromBaseUrl(track.baseUrl);
      throw new Error("captionTracksが見つかりません");
    });
  }

  // C) 旧 timedtext（最後の保険）
  function tryTimedText(videoId) {
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

  // メイン：videoId から字幕を取得（A→B→C）
  function fetchCaptions(videoId) {
    if (!videoId) return Promise.reject(new Error("動画IDが不正です"));
    return tryInnertube(videoId)
      .catch(function () { return tryHtml(videoId); })
      .catch(function () { return tryTimedText(videoId); });
  }

  window.Captions = {
    PROXIES: PROXIES,
    DEFAULT_PROXY: PROXIES[0],
    fetchCaptions: fetchCaptions,
    parseTimedTextXML: parseTimedTextXML,
    parseJson3: parseJson3,
    extractPlayerResponse: extractPlayerResponse,
    tracksFromPlayer: tracksFromPlayer
  };
})();

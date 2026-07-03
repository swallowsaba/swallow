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
  // wrap:"contents" は JSON で包んで返すプロキシ（allorigins /get 等）の取り出しキー。
  // enc:false は URL を素のまま末尾に付けるタイプ（thingproxy）。
  var PROXIES = [
    { u: "https://api.codetabs.com/v1/proxy/?quest=", wrap: null, enc: true },
    { u: "https://corsproxy.io/?url=", wrap: null, enc: true },
    { u: "https://api.allorigins.win/raw?url=", wrap: null, enc: true },
    { u: "https://api.allorigins.win/get?url=", wrap: "contents", enc: true },
    { u: "https://thingproxy.freeboard.io/fetch/", wrap: null, enc: false }
  ];
  var DEFAULT_PROXY_STR = "https://api.codetabs.com/v1/proxy/?quest=";

  // CORS許可済みの公開YouTube API（Worker不要でブラウザから直接字幕取得できる）。
  // インスタンスは入れ替わるため複数を順に試す。
  var PIPED = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.private.coffee",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi-libre.kavin.rocks"
  ];
  var INVIDIOUS = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://invidious.jing.rocks",
    "https://inv.tux.pizza",
    "https://invidious.privacyredirect.com"
  ];

  // InnertubeのAPIキー（YouTube公開の固定WEBキー。HTML取得不要で叩ける）
  var INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  // 試行するクライアント（captionが返りやすい順）
  var CLIENTS = [
    { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 },
    { clientName: "IOS", clientVersion: "20.10.4" },
    { clientName: "WEB", clientVersion: "2.20250101.00.00" }
  ];

  // 中継URLの決定：①各ユーザーの個別設定（上書き）→ ②config.jsの全ユーザー共通中継。
  function sharedRelay() {
    try { return ((window.EIGO_CONFIG && window.EIGO_CONFIG.RELAY_URL) || "").trim(); } catch (e) { return ""; }
  }
  function relayUrl() {
    var personal = (Storage.getState().profile.captionProxy || "").trim();
    return personal || sharedRelay();
  }
  // 中継のベース（末尾の ?url= 等を除いた https://xxx.workers.dev/ 部分）
  function workerBase() {
    var p = relayUrl();
    if (!p) return null;
    return p.split("?")[0];
  }
  function proxyList() {
    var base = workerBase();
    var list = PROXIES.slice();
    if (base) list = [{ u: base + "?url=", wrap: null, enc: true }].concat(list); // 中継(パススルー)を最優先
    return list;
  }

  // 中継が設定されているか（個別 or 共通）
  function customProxy() {
    return relayUrl();
  }

  // 中継の「スマート字幕エンドポイント」URL（?videoId=...）。
  function smartWorkerUrl(videoId) {
    var base = workerBase();
    if (!base) return null;
    return base + "?videoId=" + encodeURIComponent(videoId) + "&lang=en";
  }

  function decodeEntities(s) {
    var ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  // タイムアウト付き fetch（無応答で固まらないように）
  function fetchT(url, opts, ms) {
    opts = opts || {}; ms = ms || 12000;
    if (typeof AbortController === "undefined") return fetch(url, opts);
    var ac = new AbortController();
    var t = setTimeout(function () { ac.abort(); }, ms);
    opts.signal = ac.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }

  // 任意URLをGETでプロキシ経由取得（順に試す）。JSON包み(allorigins /get)も解す。
  function fetchTextViaProxies(url) {
    var proxies = proxyList();
    return new Promise(function (resolve, reject) {
      (function attempt(i) {
        if (i >= proxies.length) { reject(new Error("プロキシ経由の取得に失敗")); return; }
        var px = proxies[i];
        var full = px.u + (px.enc === false ? url : encodeURIComponent(url));
        fetch(full, { method: "GET" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(function (txt) {
            if (px.wrap) {
              try { var j = JSON.parse(txt); txt = j[px.wrap] || ""; } catch (e) { txt = ""; }
            }
            if (txt && txt.length > 0) resolve(txt); else attempt(i + 1);
          })
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

  // 英語・手動字幕を優先するスコア（小さいほど優先）
  function subScore(code, auto) {
    var c = String(code || "").toLowerCase();
    var isEn = (c.indexOf("en") === 0) ? 0 : 1;
    return isEn * 2 + (auto ? 1 : 0);
  }
  // 候補リストを順に試し、最初に成功した結果を返す
  function tryList(list, fn) {
    return new Promise(function (resolve, reject) {
      (function next(i) {
        if (i >= list.length) { reject(new Error("全インスタンス失敗")); return; }
        Promise.resolve().then(function () { return fn(list[i]); })
          .then(resolve)
          .catch(function () { next(i + 1); });
      })(0);
    });
  }
  function vttToCues(vtt) {
    var cues = (window.Subtitle && window.Subtitle.parse) ? window.Subtitle.parse(vtt) : [];
    // 自動生成VTTは同じ行が転がって重複しがちなので、連続重複を除去
    var out = [];
    cues.forEach(function (c) {
      var last = out[out.length - 1];
      if (last && last.text === c.text) { last.end = c.end; return; }
      out.push({ index: out.length + 1, start: c.start || 0, end: (c.end != null ? c.end : (c.start || 0) + 2), text: c.text });
    });
    return out;
  }

  // Piped（CORS可）：/streams/{id} の subtitles[] から英語字幕を取得
  function tryPiped(videoId) {
    return getPipedInstances().then(function (LIST) { return tryList(LIST, function (base) {
      return fetchT(base + "/streams/" + videoId, { headers: { "Accept": "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          var subs = (d && d.subtitles) || [];
          if (!subs.length) throw new Error("no subs");
          var pick = subs.slice().sort(function (a, b) { return subScore(a.code, a.autoGenerated) - subScore(b.code, b.autoGenerated); })[0];
          if (!pick || !pick.url) throw new Error("no url");
          return fetch(pick.url).then(function (r) { return r.text(); }).then(function (vtt) {
            var cues = vttToCues(vtt);
            if (!cues.length) throw new Error("empty");
            return cues;
          });
        });
    }); });
  }

  // Invidious（CORS可）：/api/v1/captions/{id} から英語字幕を取得
  function tryInvidious(videoId) {
    return getInvidiousInstances().then(function (LIST) { return tryList(LIST, function (base) {
      return fetchT(base + "/api/v1/captions/" + videoId, { headers: { "Accept": "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          var caps = (d && d.captions) || [];
          if (!caps.length) throw new Error("no caps");
          var pick = caps.slice().sort(function (a, b) { return subScore(a.languageCode || a.label, /auto/i.test(a.label || "")) - subScore(b.languageCode || b.label, /auto/i.test(b.label || "")); })[0];
          var url = pick.url || ("/api/v1/captions/" + videoId + "?label=" + encodeURIComponent(pick.label || "English"));
          if (url.charAt(0) === "/") url = base + url;
          return fetch(url).then(function (r) { return r.text(); }).then(function (vtt) {
            var cues = vttToCues(vtt);
            if (!cues.length) throw new Error("empty");
            return cues;
          });
        });
    }); });
  }

  // ---- 音声ストリームURL（AI字幕生成用。CORS可のプロキシ済みURLを返す）----
  // Piped: audioStreams[] の最小ビットレート（小さく速い）を優先。
  function tryPipedAudio(videoId) {
    return getPipedInstances().then(function (LIST) { return tryList(LIST, function (base) {
      return fetchT(base + "/streams/" + videoId, { headers: { "Accept": "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          var a = (d && d.audioStreams) || [];
          if (!a.length) throw new Error("no audio");
          a = a.slice().sort(function (x, y) { return (x.bitrate || 1e9) - (y.bitrate || 1e9); });
          var pick = a[0];
          if (!pick || !pick.url) throw new Error("no url");
          return { url: pick.url, mime: pick.mimeType || "", bitrate: pick.bitrate || 0, source: "piped" };
        });
    }); });
  }
  // Invidious: /latest_version?...&local=true でInvidious経由プロキシ（CORS可）。itag140=m4a(128k)。
  function tryInvidiousAudio(videoId) {
    return getInvidiousInstances().then(function (LIST) { return tryList(LIST, function (base) {
      var url = base + "/latest_version?id=" + encodeURIComponent(videoId) + "&itag=140&local=true";
      // 実体取得可能か軽く確認（HEAD不可な実装もあるのでGETのRangeで先頭だけ）
      return fetchT(url, { method: "GET", headers: { "Range": "bytes=0-1" } }, 12000).then(function (r) {
        if (!(r.ok || r.status === 206)) throw new Error("HTTP " + r.status);
        return { url: url, mime: "audio/mp4", bitrate: 128000, source: "invidious" };
      });
    }); });
  }
  // 自前Worker：?audio=ID で音声URLを取得し、googlevideoはCORS無しのため ?url= パススルー経由で取得する形に。
  function tryWorkerAudio(videoId) {
    var base = workerBase();
    if (!base) return Promise.reject(new Error("no worker"));
    return fetchT(base + "?audio=" + encodeURIComponent(videoId), {}, 15000)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.url) {
          return { url: base + "?url=" + encodeURIComponent(d.url), mime: d.mime || "", bitrate: d.bitrate || 0, source: "worker" };
        }
        throw new Error((d && d.error) || "worker no audio");
      });
  }
  // YouTube動画IDから、ブラウザでfetch可能な音声URLを返す
  function getAudioStreamUrl(videoId) {
    if (!videoId) return Promise.reject(new Error("動画IDが不正です"));
    return tryWorkerAudio(videoId)
      .catch(function () { return tryPipedAudio(videoId); })
      .catch(function () { return tryInvidiousAudio(videoId); });
  }

  // 稼働中インスタンスを実行時に取得（一覧APIはCORS対応）。失敗時はハードコードへフォールバック。
  var _inst = { piped: null, inv: null };
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x.replace(/\/$/, "")); } }); return out; }
  function getPipedInstances() {
    if (_inst.piped) return Promise.resolve(_inst.piped);
    return fetchT("https://piped-instances.kavin.rocks/", { headers: { "Accept": "application/json" } }, 8000)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) {
        var apis = (list || []).map(function (x) { return x.api_url; }).filter(Boolean);
        _inst.piped = uniq(apis.concat(PIPED));
        return _inst.piped;
      }).catch(function () { _inst.piped = uniq(PIPED.slice()); return _inst.piped; });
  }
  function getInvidiousInstances() {
    if (_inst.inv) return Promise.resolve(_inst.inv);
    return fetchT("https://api.invidious.io/instances.json?sort_by=health", { headers: { "Accept": "application/json" } }, 8000)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) {
        // list = [[host, {uri, cors, api, type}], ...] CORS・API有効・httpsのみ採用
        var apis = (list || []).filter(function (e) { return e[1] && e[1].cors && e[1].api && e[1].type === "https"; })
          .map(function (e) { return e[1].uri; });
        _inst.inv = uniq(apis.concat(INVIDIOUS));
        return _inst.inv;
      }).catch(function () { _inst.inv = uniq(INVIDIOUS.slice()); return _inst.inv; });
  }

  // Jina AI Reader（CORS対応の別系統）：YouTubeのトランスクリプトを返すことがある。
  // Piped/Invidiousが全滅していても通る可能性がある自動経路。タイムスタンプ付きのみ採用。
  function tryJina(videoId) {
    var url = "https://r.jina.ai/https://www.youtube.com/watch?v=" + encodeURIComponent(videoId);
    return fetchT(url, { headers: { "Accept": "text/plain", "X-Return-Format": "text" } }, 20000)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (txt) {
        var S = window.Subtitle;
        if (!S || !txt) throw new Error("no text");
        // タイムスタンプ付きトランスクリプトとして解釈できる時だけ採用
        if (S.looksLikeYouTubeTranscript && S.looksLikeYouTubeTranscript(txt)) {
          var cues = S.parse(txt);
          if (cues && cues.length >= 5) {
            return cues.map(function (c, i) { return { index: i + 1, start: c.start || 0, end: (c.end != null ? c.end : (c.start || 0) + 3), text: c.text }; });
          }
        }
        throw new Error("Jina: トランスクリプト無し");
      });
  }

  // 0) スマートWorker：?videoId= で cues JSON を直接返す（最も確実）
  function trySmartWorker(videoId) {
    var url = smartWorkerUrl(videoId);
    if (!url) return Promise.reject(new Error("no worker"));
    return fetch(url, { method: "GET" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      if (d && d.ok && d.cues && d.cues.length) {
        return d.cues.map(function (c, i) {
          return { index: i + 1, start: c.start || 0, end: (c.end != null ? c.end : (c.start || 0) + 2), text: c.text || "" };
        }).filter(function (c) { return c.text; });
      }
      throw new Error((d && d.error) || "Workerが字幕を返しませんでした");
    });
  }

  // メイン：videoId から字幕を取得。
  // ゼロ設定で動く公開API(Piped/Invidious)を最優先 → 自前Worker → プロキシ各種。
  function fetchCaptions(videoId) {
    if (!videoId) return Promise.reject(new Error("動画IDが不正です"));
    return trySmartWorker(videoId)
      .catch(function () { return tryJina(videoId); })
      .catch(function () { return tryPiped(videoId); })
      .catch(function () { return tryInvidious(videoId); })
      .catch(function () { return tryInnertube(videoId); })
      .catch(function () { return tryHtml(videoId); })
      .catch(function () { return tryTimedText(videoId); });
  }

  window.Captions = {
    PROXIES: PROXIES,
    DEFAULT_PROXY: DEFAULT_PROXY_STR,
    fetchCaptions: fetchCaptions,
    getAudioStreamUrl: getAudioStreamUrl,
    parseTimedTextXML: parseTimedTextXML,
    parseJson3: parseJson3,
    extractPlayerResponse: extractPlayerResponse,
    tracksFromPlayer: tracksFromPlayer
  };
})();

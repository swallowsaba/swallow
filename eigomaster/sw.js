/* ============================================================
   sw.js — Service Worker（PWA）
   方針を「キャッシュ優先」→「ネットワーク優先（オフライン時のみキャッシュ）」へ変更。
   理由：キャッシュ優先＋固定バージョンだと、更新後も古いファイルが返り続け、
   UI刷新やデータ追加・発音修正が利用者に永久に反映されない不具合があったため。
   - 同一オリジンの GET：まずネットワークから取得し、成功すれば最新を表示＆キャッシュ更新。
   - 取得失敗（オフライン）時のみキャッシュを返す。画面遷移は index.html を返す（SPA）。
   - バージョンを上げると古いキャッシュは activate 時に削除。
   ============================================================ */

// 更新のたびに上げる。これで古いキャッシュは確実に破棄される。
var CACHE_VERSION = "eigomaster-v70";

// 事前キャッシュ（オフライン初期動作用。失敗しても全体は止めない）
var APP_SHELL = [
  "./", "./index.html", "./css/style.css", "./manifest.json",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./js/config.js", "./js/storage.js", "./js/app.js", "./js/srs.js", "./js/katakana.js",
  "./js/linking.js", "./js/subtitle.js", "./js/captions.js", "./js/vocab.js",
  "./js/wordbook.js", "./js/idioms.js", "./js/shadowing.js", "./js/pronunciation.js",
  "./js/phonics.js", "./js/grammar.js", "./js/reading.js", "./js/listening.js",
  "./js/diagnosis.js", "./js/aicaption.js",
  "./data/words.js", "./data/grammar.js", "./data/phonics.js", "./data/linking_rules.js",
  "./data/pron_dict.js", "./data/diagnosis.js", "./data/reading.js", "./data/idioms.js",
  "./data/listening.js", "./data/worker_code.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function (e) { console.warn("[sw] precache失敗:", url, e); });
      }));
    })
  );
  self.skipWaiting(); // 新SWを即時待機解除
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // 外部CDN/YouTube等は素通し

  // ネットワーク優先：常に最新を取りに行き、成功したらキャッシュも更新。失敗時のみキャッシュ。
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("オフラインのため取得できませんでした。", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      });
    })
  );
});

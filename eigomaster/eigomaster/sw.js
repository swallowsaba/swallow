/* ============================================================
   sw.js — Service Worker（PWA：オフライン基本動作）
   - インストール時にアプリシェル（HTML/CSS/JS/アイコン）を事前キャッシュ。
   - 取得戦略：キャッシュ優先 → 無ければネットワーク → 取得物をキャッシュ更新。
   - キャッシュ名にバージョンを含め、更新時に古いキャッシュを掃除する。
   GitHub Pages のサブパス公開に対応するため、相対パスで登録する。
   ============================================================ */

// キャッシュのバージョン。アプリ更新時にこの数字を上げると古いキャッシュを破棄する。
var CACHE_VERSION = "eigomaster-v1";

// 事前キャッシュするアプリシェル（相対パス）
var APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

/* ---------- インストール：アプリシェルを取り込む ---------- */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // 一部の取得に失敗しても全体を止めない（addAll は1つでも失敗すると拒否されるため個別に）
      return Promise.all(
        APP_SHELL.map(function (url) {
          return cache.add(url).catch(function (e) {
            console.warn("[sw] キャッシュ失敗:", url, e);
          });
        })
      );
    })
  );
  // 新しい SW を即時有効化
  self.skipWaiting();
});

/* ---------- 有効化：古いバージョンのキャッシュを削除 ---------- */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- 取得：キャッシュ優先＋ネットワークフォールバック ---------- */
self.addEventListener("fetch", function (event) {
  var req = event.request;

  // GET 以外と別オリジンは素通し（外部CDN・YouTube等に干渉しない）
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;

      return fetch(req).then(function (res) {
        // 正常応答のみキャッシュへ複製保存
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        // オフラインかつ画面遷移（HTML要求）なら index.html を返す（SPAのため）
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
        // それ以外はそのまま失敗
        return new Response("オフラインのため取得できませんでした。", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      });
    })
  );
});

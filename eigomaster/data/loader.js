/* ============================================================
   data/loader.js — 教材データローダー（v104〜 マニフェスト自己完結型）
   data/packs/manifest.json に列挙された JSON パックを並列読込し、
   window.EigoData へマージする。

   ◆ 教材の追加方法（今後は data/packs/ 内だけで完結）
     1. data/packs/ に JSON ファイルを置く
        形式: {"collection":"words","type":"array","data":[{...},...]}
        - collection: words / idioms / grammar / readingSamples / listening /
          pronSentences / trainingItems / stressItems / intonationItems /
          rhythmItems / qrtItems / chunkItems / thinkingItems / cultureItems /
          discussionItems / collocationItems / pronDict / etymology など
        - type: "array"（配列に連結） or "object"（pronDict 等へマージ）
     2. data/packs/manifest.json を更新
        - "packs" 配列にファイル名を追加
        - "version" を上げる（例: "104" → "105"）
     → index.html / js/app.js / sw.js の変更は不要。
       manifest.version がキャッシュバスターとバージョンバッジの
       唯一の情報源（single source of truth）になる。
   ◆ 命名規約（推奨）: <collection>_<レベル|カテゴリ|追加日>.json
     例: words_B2_2026-08-01_medical.json
   ============================================================ */
(function () {
  var D = (window.EigoData = window.EigoData || {});

  // manifest は常にネットワークから最新を取得（HTTPキャッシュ・SWキャッシュを回避）
  var MANIFEST_URL = "data/packs/manifest.json?t=" + Date.now();

  function packUrl(p, ver) {
    // パックは manifest.version でキャッシュバスト。version が変わった時だけ再取得される。
    return "data/packs/" + p + (ver ? "?v=" + encodeURIComponent(ver) : "");
  }

  function mergePack(pack) {
    if (!pack || !pack.collection) return;
    var key = pack.collection;
    if (pack.type === "object") {
      D[key] = D[key] || {};
      var src = pack.data || {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) D[key][k] = src[k];
    } else {
      D[key] = (D[key] || []).concat(pack.data || []);
    }
  }

  function dedupeByEn(list) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i++) {
      var key = ((list[i] && list[i].en) || "").toLowerCase();
      if (key && seen[key]) continue;
      if (key) seen[key] = true;
      out.push(list[i]);
    }
    return out;
  }

  window.EigoDataReady = fetch(MANIFEST_URL, { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("manifest.json の取得に失敗: " + r.status);
      return r.json();
    })
    .then(function (man) {
      var ver = (man && man.version) || "";
      // バージョンをグローバル公開（app.js のバッジ表示が参照）
      window.EigoDataVersion = ver;
      var packs = (man && man.packs) || [];
      return Promise.all(
        packs.map(function (p) {
          return fetch(packUrl(p, ver)).then(function (r) {
            if (!r.ok) { console.warn("[loader] pack取得失敗:", p, r.status); return null; }
            return r.json();
          }).catch(function (e) { console.warn("[loader] pack読込エラー:", p, e); return null; });
        })
      );
    })
    .then(function (packs) {
      packs.forEach(mergePack);
      if (D.words) D.words = dedupeByEn(D.words);
      if (D.idioms) D.idioms = dedupeByEn(D.idioms);
      console.log("[loader] 教材ロード完了 (v" + (window.EigoDataVersion || "?") + "):",
        Object.keys(D).map(function (k) {
          var v = D[k];
          return k + "=" + (Array.isArray(v) ? v.length : (v && typeof v === "object" ? Object.keys(v).length : "?"));
        }).join(", "));
      return D;
    })
    .catch(function (e) {
      console.error("[loader] 教材ロード失敗:", e);
      if (location.protocol === "file:") {
        console.error("[loader] file:// では JSON を読み込めません。HTTPサーバー経由で開いてください（例: npx serve / python3 -m http.server）。");
      }
      return D;
    });
})();

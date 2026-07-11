/* ============================================================
   data/loader.js — 教材データローダー（v90〜）
   data/packs/manifest.json に列挙された JSON パックを並列読込し、
   window.EigoData へマージする。

   ◆ 教材の追加方法（今後はこれだけ）
     1. data/packs/ に JSON ファイルを置く
        形式: {"collection":"words","type":"array","data":[{...},...]}
        - collection: words / idioms / grammar / readingSamples / listening /
          pronSentences / trainingItems / stressItems / intonationItems /
          rhythmItems / qrtItems / chunkItems / thinkingItems / cultureItems /
          discussionItems / collocationItems など
        - type: "array"（配列に連結） or "object"（pronDict 等へマージ）
     2. data/packs/manifest.json の "packs" 配列にファイル名を1行追加
     → 自動で読み込まれ、問題数が拡張される。
   ◆ 命名規約（推奨）: <collection>_<レベル|カテゴリ|追加日>.json
     例: words_B2_2026-08-01_medical.json
   ============================================================ */
(function () {
  var D = (window.EigoData = window.EigoData || {});
  var VER = (function () {
    // index.html の <script src="data/loader.js?v=XX"> と同じ v を packs にも付ける
    var s = document.currentScript && document.currentScript.src;
    var m = s && s.match(/[?&]v=([^&]+)/);
    return m ? m[1] : "";
  })();
  function url(p) { return "data/packs/" + p + (VER ? "?v=" + VER : ""); }

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

  window.EigoDataReady = fetch(url("manifest.json"))
    .then(function (r) {
      if (!r.ok) throw new Error("manifest.json の取得に失敗: " + r.status);
      return r.json();
    })
    .then(function (man) {
      var packs = (man && man.packs) || [];
      return Promise.all(
        packs.map(function (p) {
          return fetch(url(p)).then(function (r) {
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
      console.log("[loader] 教材ロード完了:", Object.keys(D).map(function (k) {
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

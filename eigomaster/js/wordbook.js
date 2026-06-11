/* ============================================================
   wordbook.js — 単語帳（#/wordbook）
   リーディング等で保存した単語を一覧表示。読み上げ・削除に対応。
   保存元：Storage.addToWordbook（state.wordbook）。
   ============================================================ */
(function () {
  "use strict";

  function render() {
    return { html: '<section id="wb-root" class="view-enter"></section>', onMount: draw };
  }
  function root() { return document.getElementById("wb-root"); }

  function draw() {
    var book = Storage.getState().wordbook || [];

    if (!book.length) {
      root().innerHTML =
        EM.backLink("#/vocab", "単語学習") +
        '<div class="empty-state">' +
          '<div class="empty-state__icon">語</div>' +
          '<p class="empty-state__title">単語帳はまだ空です</p>' +
          '<p class="empty-state__body">リーディングで単語をタップ →「単語帳に追加」で、ここに集まります。</p>' +
        "</div>" +
        '<a class="btn btn--primary btn--block" href="#/reading">リーディングへ</a>';
      return;
    }

    var rows = book.map(function (w, i) {
      return '<div class="list-row">' +
        '<div class="list-row__main">' +
          '<div class="list-row__title">' + EM.escapeHtml(w.en) +
            (w.ipa ? ' <span class="flashcard__ipa" style="font-size:var(--fs-small)">' + EM.escapeHtml(w.ipa) + "</span>" : "") + "</div>" +
          (w.ja ? '<div class="list-row__sub">' + EM.escapeHtml(w.ja) + "</div>" : "") +
        "</div>" +
        '<button class="audio-btn" type="button" data-say-i="' + i + '" aria-label="再生">▶</button>' +
        '<button class="audio-btn" type="button" data-del-i="' + i + '" aria-label="削除" style="background:var(--c-bad-soft);color:var(--c-bad)">✕</button>' +
      "</div>";
    }).join("");

    root().innerHTML =
      EM.backLink("#/vocab", "単語学習") +
      '<div class="row-between"><p class="section-title" style="margin:0">単語帳</p>' +
        '<span class="text-soft" style="font-size:var(--fs-small)">' + book.length + " 語</span></div>" +
      '<div class="card mt-4">' + rows + "</div>" +
      '<button class="btn btn--ghost btn--block mt-4" id="wb-say-all" type="button">▶ 上から順に読み上げ</button>';

    root().querySelectorAll("[data-say-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var w = book[parseInt(b.getAttribute("data-say-i"), 10)];
        if (w) EM.speak(w.en);
      });
    });
    root().querySelectorAll("[data-del-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-del-i"), 10);
        Storage.update(function (s) { s.wordbook.splice(i, 1); return s; });
        EM.showToast("削除しました");
        draw();
      });
    });

    // 順に読み上げ（onend で次へ）
    var sayAll = document.getElementById("wb-say-all");
    if (sayAll) sayAll.addEventListener("click", function () {
      var i = 0;
      (function next() {
        if (i >= book.length) return;
        EM.speak(book[i].en, { onend: function () { i += 1; next(); } });
      })();
      Storage.recordStudy(1);
      EM.refreshStreakBadge();
    });
  }

  EM.registerView("#/wordbook", { title: "単語帳", tab: "vocab", render: render });
})();

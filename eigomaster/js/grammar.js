/* ============================================================
   grammar.js — 文法（#/grammar）
   レッスン一覧 → 各レッスン：解説 → 例文(TTS) → 並べ替え → 穴埋め → 英作文。
   ============================================================ */
(function () {
  "use strict";

  var currentId = null;
  var reorder = { source: [], answer: [], target: "" };

  function lessons() { return (window.EigoData && window.EigoData.grammar) || []; }
  function findLesson(id) { return lessons().find(function (l) { return l.id === id; }); }

  function render() {
    return { html: '<section id="grammar-root" class="view-enter"></section>', onMount: function () {
      if (currentId && findLesson(currentId)) drawLesson(currentId); else drawList();
    }};
  }
  function root() { return document.getElementById("grammar-root"); }

  /* ---------- 一覧 ---------- */
  function drawList() {
    currentId = null;
    var cards = lessons().map(function (l) {
      return '<button class="quick-card" type="button" data-lesson="' + l.id + '" style="text-align:left">' +
        '<span class="quick-card__title">' + EM.escapeHtml(l.title) + "</span>" +
        '<span class="quick-card__desc">' + EM.escapeHtml(l.ja.slice(0, 38)) + "…</span></button>";
    }).join("");
    root().innerHTML =
      '<p class="section-title">文法</p>' +
      '<p class="text-soft" style="font-size:var(--fs-small);margin-bottom:var(--space-4)">日本人がつまずきやすい順に並べています。</p>' +
      '<div class="quick-grid">' + cards + "</div>";
    root().querySelectorAll("[data-lesson]").forEach(function (b) {
      b.addEventListener("click", function () { drawLesson(b.getAttribute("data-lesson")); });
    });
  }

  /* ---------- レッスン ---------- */
  function drawLesson(id) {
    currentId = id;
    var l = findLesson(id);
    if (!l) return drawList();

    // 並べ替えの初期化
    reorder.target = l.reorder.answer;
    reorder.source = shuffle(tokenize(l.reorder.answer));
    reorder.answer = [];

    var examples = l.examples.map(function (ex, i) {
      return '<div class="gx-ex">' +
        '<div class="gx-ex__chip" data-en="' + EM.escapeHtml(ex.en) + '"></div>' +
        '<div class="gx-ex__ja">' + EM.escapeHtml(ex.ja) + "</div></div>";
    }).join("");

    var blankOptions = l.blank.options.map(function (o) {
      return '<button class="choice-btn" type="button" data-opt="' + EM.escapeHtml(o) + '">' + EM.escapeHtml(o) + "</button>";
    }).join("");

    root().innerHTML =
      '<a class="back-link" id="to-list" href="#/grammar">‹ 文法レッスン一覧</a>' +
      '<p class="section-title">' + EM.escapeHtml(l.title) + "</p>" +

      (function () {
        // 教科書スタイルの解説：①考え方 ②形 ③ミニ会話 ④つまずきポイント
        var det = (window.EigoData.grammarDetail || {})[l.id];
        var h = '<div class="card gx">';
        h += '<p class="gx__head">① 基本の考え方</p><p class="gx__body">' + EM.escapeHtml(det ? det.core : l.ja) + '</p>';
        if (det && det.form) h += '<p class="gx__head mt-4">② 形（公式）</p><p class="gx__form">' + EM.escapeHtml(det.form) + '</p>';
        if (det && det.dialog) {
          h += '<p class="gx__head mt-4">③ ミニ会話で確認</p>';
          det.dialog.forEach(function (d) {
            h += '<div class="gx__line"><button class="audio-btn" type="button" data-say="' + EM.escapeHtml(d.en.replace(/^[AB]:\s*/, "")) + '">▶</button>' +
                 '<span><strong>' + EM.escapeHtml(d.en) + '</strong><br><small>' + EM.escapeHtml(d.ja) + '</small></span></div>';
          });
        }
        if (det) h += '<p class="gx__head mt-4">④ 日本人がつまずくポイント</p><p class="gx__body">' + EM.escapeHtml(det.pitfall) + '</p>' +
                      '<p class="gx__head mt-4">⑤ 補足</p><p class="gx__body">' + EM.escapeHtml(l.ja) + '</p>';
        h += "</div>";
        return h;
      })() +

      '<p class="section-title mt-5">例文（タップで再生）</p>' +
      '<div class="card">' + examples + "</div>" +

      '<p class="section-title mt-5">並べ替え</p>' +
      '<div class="card">' +
        '<p class="list-row__sub">' + EM.escapeHtml(l.reorder.ja) + "</p>" +
        '<div class="tiles tiles--answer mt-4" id="ro-answer"></div>' +
        '<div class="tiles" id="ro-source"></div>' +
        '<div class="grade-row" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--ghost" id="ro-reset" type="button">リセット</button>' +
          '<button class="btn btn--primary" id="ro-check" type="button">こたえ合わせ</button>' +
        "</div>" +
        '<div id="ro-result" class="mt-4"></div>' +
      "</div>" +

      '<p class="section-title mt-5">穴埋め</p>' +
      '<div class="card">' +
        '<p class="diff" style="font-size:var(--fs-h2)">' + EM.escapeHtml(l.blank.before) +
          '<span class="w" style="background:var(--c-warm-soft)">____</span>' + EM.escapeHtml(l.blank.after) + "</p>" +
        '<p class="list-row__sub mt-4">' + EM.escapeHtml(l.blank.ja) + "</p>" +
        '<div class="mt-4" id="blank-opts">' + blankOptions + "</div>" +
        '<div id="blank-explain" class="mt-4"></div>' +
      "</div>" +

      '<p class="section-title mt-5">英作文（セルフチェック）</p>' +
      '<div class="card">' +
        '<p class="list-row__sub">' + EM.escapeHtml(l.writing.prompt) + "</p>" +
        '<div class="field mt-4"><textarea class="textarea" id="writing-in" placeholder="英語で書いてみましょう"></textarea></div>' +
        '<button class="btn btn--ghost btn--block" id="show-model" type="button">模範解答を見る</button>' +
        '<div id="model-area" class="mt-4"></div>' +
      "</div>";

    bindLesson(l);
  }

  function bindLesson(l) {
    document.getElementById("to-list").addEventListener("click", function (e) { e.preventDefault(); drawList(); });

    // 例文：語ハイライト＋カタカナ同期のプレイヤーチップを生成
    if (EM.audioChip) {
      root().querySelectorAll(".gx-ex__chip").forEach(function (el) {
        EM.audioChip(el, el.getAttribute("data-en"));
      });
    }
    // ミニ会話など他の data-say ボタン
    root().querySelectorAll("[data-say]").forEach(function (b) {
      b.addEventListener("click", function () { EM.speak(b.getAttribute("data-say")); });
    });

    drawReorder();
    document.getElementById("ro-reset").addEventListener("click", function () {
      reorder.source = shuffle(tokenize(reorder.target)); reorder.answer = [];
      document.getElementById("ro-result").innerHTML = ""; drawReorder();
    });
    document.getElementById("ro-check").addEventListener("click", checkReorder);

    // 穴埋め
    root().querySelectorAll("#blank-opts .choice-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var picked = b.getAttribute("data-opt");
        var ok = picked === l.blank.answer;
        root().querySelectorAll("#blank-opts .choice-btn").forEach(function (x) {
          x.disabled = true;
          if (x.getAttribute("data-opt") === l.blank.answer) x.classList.add("choice-btn--ok");
          else if (x === b) x.classList.add("choice-btn--ng");
        });
        if (ok) { EM.speak(l.blank.before + l.blank.answer + l.blank.after); Storage.recordStudy(1); EM.refreshStreakBadge(); }

        // 解説表示（正解理由＋誤答理由）
        var ex = l.blank.explain;
        var box = document.getElementById("blank-explain");
        if (box) {
          var head = ok
            ? '<p class="explain-head explain-head--ok">正解！</p>'
            : '<p class="explain-head explain-head--ng">惜しい。正解は「' + EM.escapeHtml(l.blank.answer) + '」</p>';
          var lines = "";
          if (ex && ex.opts) {
            if (!ok && ex.opts[picked]) {
              lines += '<p class="explain-line"><strong>あなたの解答「' + EM.escapeHtml(picked) + '」：</strong>' + EM.escapeHtml(ex.opts[picked]) + "</p>";
            }
            if (ex.opts[l.blank.answer]) {
              lines += '<p class="explain-line"><strong>正解「' + EM.escapeHtml(l.blank.answer) + '」：</strong>' + EM.escapeHtml(ex.opts[l.blank.answer]) + "</p>";
            }
          }
          if (ex && ex.why) lines += '<p class="explain-why">ポイント：' + EM.escapeHtml(ex.why) + "</p>";
          box.innerHTML = '<div class="explain-card">' + head + lines + "</div>";
        }
      });
    });

    // 英作文
    document.getElementById("show-model").addEventListener("click", function () {
      document.getElementById("model-area").innerHTML =
        '<div class="list-row"><div class="list-row__main"><div class="list-row__sub">模範解答</div>' +
          '<div class="list-row__title">' + EM.escapeHtml(l.writing.model) + "</div></div>" +
          '<button class="audio-btn" type="button" id="say-model" aria-label="再生">▶</button></div>';
      document.getElementById("say-model").addEventListener("click", function () { EM.speak(l.writing.model); });
      Storage.recordStudy(1); EM.refreshStreakBadge();
    });
  }

  /* ---------- 並べ替えウィジェット ---------- */
  function drawReorder() {
    var ans = document.getElementById("ro-answer");
    var src = document.getElementById("ro-source");
    if (!ans || !src) return;
    ans.innerHTML = reorder.answer.map(function (t, i) {
      return '<button class="tile" type="button" data-from="answer" data-i="' + i + '">' + EM.escapeHtml(t) + "</button>";
    }).join("") || '<span class="text-soft" style="font-size:var(--fs-small)">下の語をタップして並べます</span>';
    src.innerHTML = reorder.source.map(function (t, i) {
      return '<button class="tile" type="button" data-from="source" data-i="' + i + '">' + EM.escapeHtml(t) + "</button>";
    }).join("");

    ans.querySelectorAll("[data-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-i"), 10);
        reorder.source.push(reorder.answer.splice(i, 1)[0]); drawReorder();
      });
    });
    src.querySelectorAll("[data-i]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-i"), 10);
        reorder.answer.push(reorder.source.splice(i, 1)[0]); drawReorder();
      });
    });
  }
  function checkReorder() {
    var built = reorder.answer.join(" ");
    var ok = built === reorder.target;
    document.getElementById("ro-result").innerHTML =
      '<div class="diff center">' + (ok
        ? '<span class="w w-ok">' + EM.escapeHtml(reorder.target) + "</span>"
        : '<span class="w w-ng">' + EM.escapeHtml(built || "（未配置）") + '</span><br>正解：<span class="w w-ok">' + EM.escapeHtml(reorder.target) + "</span>") +
      "</div>";
    if (ok) { EM.speak(reorder.target); Storage.recordStudy(1); EM.refreshStreakBadge(); }
  }

  /* ---------- ユーティリティ ---------- */
  function tokenize(sentence) {
    // 末尾の句読点は直前の語にくっつける
    return sentence.trim().split(/\s+/);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    // 偶然そろってしまったら軽くずらす
    if (a.join(" ") === arr.join(" ") && a.length > 1) { var x = a.shift(); a.push(x); }
    return a;
  }

  EM.registerView("#/grammar", { title: "文法", tab: "learn", render: render });
})();

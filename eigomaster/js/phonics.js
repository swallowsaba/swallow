/* ============================================================
   phonics.js — フォニックス（#/phonics）
   タブ1：44音素一覧（IPA / つづり / 口の形 / 例語＋TTS）
   タブ2：ミニマルペア聞き分けゲーム（ランダム再生→2択→正答率）
   ============================================================ */
(function () {
  "use strict";

  var tab = "list";   // list | game
  var game = { pair: null, answer: null, correct: 0, total: 0 };

  function data() { return (window.EigoData && window.EigoData.phonics) || { phonemes: [], minimalPairs: [] }; }

  function render() {
    return { html: '<section id="phonics-root" class="view-enter"></section>', onMount: draw };
  }
  function root() { return document.getElementById("phonics-root"); }

  function draw() {
    root().innerHTML =
      EM.backLink("#/learn", "学ぶ") +
      '<p class="section-title">フォニックス</p>' +
      '<div class="pill-tabs">' +
        '<button class="pill-tabs__btn" data-tab="list" aria-pressed="' + (tab === "list") + '">44音素</button>' +
        '<button class="pill-tabs__btn" data-tab="game" aria-pressed="' + (tab === "game") + '">聞き分けゲーム</button>' +
      "</div>" +
      '<div id="phonics-body"></div>';

    root().querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); draw(); });
    });
    if (tab === "list") drawList(); else drawGame();
  }

  /* ---------- 音素一覧（グリッド＋詳細パネル：1画面で完結） ---------- */
  var selIpa = null;   // 選択中の音素
  function drawList() {
    var ph = data().phonemes;
    if (selIpa === null && ph.length) selIpa = ph[0].ipa;
    var sel = null;
    ph.forEach(function (p) { if (p.ipa === selIpa) sel = p; });
    sel = sel || ph[0];

    var detail =
      '<div class="card phx-detail" id="phx-detail">' +
        '<div class="row-between">' +
          '<span class="flashcard__ipa" style="font-size:var(--fs-h1)">' + EM.escapeHtml(sel.ipa) + '</span>' +
          '<span class="hub-row__badge">' + EM.escapeHtml(sel.type) + '・つづり ' + EM.escapeHtml(sel.spell) + '</span>' +
        '</div>' +
        '<p class="setting-row__hint" style="margin-top:8px">👄 ' + EM.escapeHtml(sel.mouth) + '</p>' +
        '<div class="chip-group mt-4">' + sel.ex.map(function (w) {
          return '<button class="chip" type="button" data-say="' + EM.escapeHtml(w) + '">' + EM.escapeHtml(w) + ' ▶</button>';
        }).join(" ") + '</div>' +
      '</div>';

    function grid(title, items) {
      if (!items.length) return "";
      return '<p class="section-title mt-5">' + title + '（' + items.length + '）</p>' +
        '<div class="phx-grid">' + items.map(function (p) {
          return '<button class="phx-cell' + (p.ipa === sel.ipa ? " phx-cell--on" : "") + '" data-ipa="' + EM.escapeHtml(p.ipa) + '" type="button">' +
            '<span class="phx-cell__ipa">' + EM.escapeHtml(p.ipa) + '</span>' +
            '<span class="phx-cell__ex">' + EM.escapeHtml(p.ex[0]) + '</span></button>';
        }).join("") + '</div>';
    }
    var vows = ph.filter(function (p) { return p.type.indexOf("母音") >= 0; });
    var cons = ph.filter(function (p) { return p.type.indexOf("母音") < 0; });

    document.getElementById("phonics-body").innerHTML =
      detail + grid("母音", vows) + grid("子音", cons);

    var body = document.getElementById("phonics-body");
    body.querySelectorAll("[data-say]").forEach(function (b) {
      b.addEventListener("click", function () { EM.speak(b.getAttribute("data-say")); });
    });
    body.querySelectorAll("[data-ipa]").forEach(function (b) {
      b.addEventListener("click", function () {
        selIpa = b.getAttribute("data-ipa");
        drawList();
        // 詳細を見せたまま選び直せるよう、パネルへスクロールせず例語を即再生
        var p2 = null; data().phonemes.forEach(function (p) { if (p.ipa === selIpa) p2 = p; });
        if (p2) EM.speak(p2.ex[0]);
        var d = document.getElementById("phx-detail");
        if (d && d.getBoundingClientRect().top < 0) d.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ---------- 聞き分けゲーム ---------- */
  function newRound() {
    var pairs = data().minimalPairs;
    game.pair = pairs[Math.floor(Math.random() * pairs.length)];
    game.answer = Math.random() < 0.5 ? "a" : "b";
  }
  function drawGame() {
    if (!game.pair) newRound();
    var p = game.pair;
    var rate = game.total ? Math.round((game.correct / game.total) * 100) : 0;

    document.getElementById("phonics-body").innerHTML =
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>「' + EM.escapeHtml(p.focus) +
        '」の聞き分け。再生ボタンを押し、どちらが聞こえたかを選んでください。</span></div>' +
      '<div class="center mt-5"><button class="audio-btn audio-btn--wide" id="play-sound" type="button" style="font-size:var(--fs-body);padding:12px 24px">🔊 再生する</button></div>' +
      '<div class="grade-row mt-5" style="grid-template-columns:1fr 1fr">' +
        '<button class="choice-btn center" data-pick="a" type="button">' + EM.escapeHtml(p.a) + "<br><small>" + EM.escapeHtml(p.ipaA) + "</small></button>" +
        '<button class="choice-btn center" data-pick="b" type="button">' + EM.escapeHtml(p.b) + "<br><small>" + EM.escapeHtml(p.ipaB) + "</small></button>" +
      "</div>" +
      '<div id="game-result"></div>' +
      '<div class="card mt-5"><div class="kv"><span class="kv__k">正答率</span><span class="kv__v">' + rate + "% （" + game.correct + "/" + game.total + "）</span></div></div>";

    document.getElementById("play-sound").addEventListener("click", playCurrent);
    document.getElementById("phonics-body").querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () { judge(b.getAttribute("data-pick")); });
    });
    playCurrent();
  }
  function playCurrent() {
    var p = game.pair;
    EM.speak(game.answer === "a" ? p.a : p.b);
  }
  function judge(pick) {
    var p = game.pair;
    var correct = pick === game.answer;
    game.total += 1; if (correct) game.correct += 1;

    var said = game.answer === "a" ? p.a : p.b;
    document.getElementById("phonics-body").querySelectorAll("[data-pick]").forEach(function (b) {
      b.disabled = true;
      if (b.getAttribute("data-pick") === game.answer) b.classList.add("choice-btn--ok");
      else if (b.getAttribute("data-pick") === pick) b.classList.add("choice-btn--ng");
    });
    document.getElementById("game-result").innerHTML =
      '<div class="card mt-4 center">' +
        '<p class="list-row__title">' + (correct ? "正解！" : "おしい！") + "</p>" +
        '<p class="list-row__sub">正解は「' + EM.escapeHtml(said) + "」でした。</p>" +
        '<button class="btn btn--primary btn--block mt-4" id="next-round" type="button">次の問題へ</button>' +
      "</div>";

    Storage.recordStudy(1);
    document.getElementById("next-round").addEventListener("click", function () { newRound(); drawGame(); });
  }

  EM.registerView("#/phonics", { title: "フォニックス", tab: "learn", render: render });
})();

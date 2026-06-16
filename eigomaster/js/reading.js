/* ============================================================
   reading.js — リーディング（#/reading）刷新版 v2
   - サンプルはレベル別タブ＋一覧（107本でも探しやすい）。
   - サンプルをタップすると即リーダー画面へ（押しても動かない誤解を解消）。
   - 自分のテキスト貼り付けは独立カードに。
   - 文タップで読み上げ、単語タップで辞書＋単語帳追加。WPM速読対応。
   - スマホ/PC両対応のレスポンシブUI。
   ============================================================ */
(function () {
  "use strict";

  var WPM_OPTIONS = [150, 250, 350];
  var LEVELS = ["A2", "B1", "B2", "C1"];
  var SUBS = [
    { id: "all", label: "すべて" },
    { id: ".1", label: ".1 易" },
    { id: ".2", label: ".2 中" },
    { id: ".3", label: ".3 難" }
  ];
  var st = { cues: [], wpm: 250, timer: null, wordIdx: 0, words: [], level: "A2", sub: "all", note: null, noteTitle: "" };

  function samples() { return (window.EigoData && window.EigoData.readingSamples) || []; }

  var _annotated = false;
  function ensureAnnotated() {
    if (_annotated) return;
    if (EM.levels) EM.levels.annotate(samples(), function (s) { return s.text; });
    _annotated = true;
  }
  function samplesOfLevel(lv) {
    ensureAnnotated();
    return samples().filter(function (s) { return (s.level || "B1") === lv; });
  }
  // サブレベル絞り込み適用後の一覧
  function samplesFiltered() {
    var list = samplesOfLevel(st.level);
    if (st.sub === "all") return list;
    return list.filter(function (s) { return s._sub === st.level + st.sub; });
  }

  function render() {
    return { html: '<section id="reading-root" class="view-enter"></section>', onMount: drawSetup };
  }
  function root() { return document.getElementById("reading-root"); }

  /* ---------- セットアップ ---------- */
  function drawSetup() {
    stopWpm();
    // レベルにサンプルが無ければ最初の有効レベルへ
    if (!samplesOfLevel(st.level).length) {
      var first = LEVELS.find(function (lv) { return samplesOfLevel(lv).length; });
      if (first) st.level = first;
    }

    var levelTabs = LEVELS.map(function (lv) {
      var n = samplesOfLevel(lv).length;
      if (!n) return "";
      return '<button class="seg-tab" type="button" data-level="' + lv + '" aria-pressed="' + (lv === st.level) + '">' +
        lv + ' <small>(' + n + ')</small></button>';
    }).join("");

    root().innerHTML =
      '<p class="section-title">リーディング</p>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span>' +
        '<span>読みたい教材を<strong>タップするだけ</strong>で本文が開きます。レベルと細分レベルで絞り込めます。</span></div>' +
      '<div class="card mt-4">' +
        '<p class="section-eyebrow">レベルで選ぶ</p>' +
        '<div class="seg-tabs" id="read-levels">' + levelTabs + '</div>' +
        '<div class="chip-group mt-4" id="read-subs"></div>' +
        '<div class="read-sample-list" id="read-samples"></div>' +
      '</div>' +
      '<div class="card mt-4">' +
        '<p class="section-eyebrow">自分のテキストで読む</p>' +
        '<div class="field"><textarea class="textarea" id="read-in" placeholder="英文を貼り付け（自由なテキストでもOK）"></textarea></div>' +
        '<button class="btn btn--primary btn--block mt-4" id="read-go" type="button">このテキストを読む</button>' +
      '</div>';

    drawSubChips();
    drawSampleList();

    root().querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.level = b.getAttribute("data-level");
        st.sub = "all";
        root().querySelectorAll("[data-level]").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        drawSubChips();
        drawSampleList();
      });
    });

    document.getElementById("read-go").addEventListener("click", function () {
      var text = (document.getElementById("read-in").value || "").trim();
      if (!text) { EM.showToast("テキストを入力してください", true); return; }
      var matched = samples().some(function (s) { return s.text === text; });
      if (!matched) { st.note = null; st.noteTitle = ""; }
      openReader(text);
    });
  }

  // サブレベル絞り込みチップ
  function drawSubChips() {
    var box = document.getElementById("read-subs");
    if (!box) return;
    var lvList = samplesOfLevel(st.level);
    function cnt(id) {
      if (id === "all") return lvList.length;
      return lvList.filter(function (s) { return s._sub === st.level + id; }).length;
    }
    box.innerHTML = SUBS.map(function (s) {
      return '<button class="chip" type="button" data-sub="' + s.id + '" aria-pressed="' + (st.sub === s.id) + '">' +
        s.label + ' <span class="text-soft" style="font-size:var(--fs-tiny)">' + cnt(s.id) + "</span></button>";
    }).join("");
    box.querySelectorAll("[data-sub]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.sub = b.getAttribute("data-sub");
        box.querySelectorAll("[data-sub]").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        drawSampleList();
      });
    });
  }

  // サンプル一覧（選択レベル＋サブレベル）を描画
  function drawSampleList() {
    var box = document.getElementById("read-samples");
    if (!box) return;
    var list = samplesFiltered();
    if (!list.length) { box.innerHTML = '<p class="text-soft mt-4" style="font-size:var(--fs-small)">この細分レベルの教材はありません。</p>'; return; }
    box.innerHTML = list.map(function (s) {
      var idx = samples().indexOf(s);
      return '<button class="read-sample" type="button" data-sample="' + idx + '">' +
        '<span class="read-sample__title">' + EM.escapeHtml(s.title) +
        (EM.levels ? ' <span class="text-soft" style="font-size:var(--fs-tiny)">' + EM.escapeHtml(EM.levels.badge(s)) + "</span>" : "") +
        '</span>' +
        '<span class="read-sample__go" aria-hidden="true">›</span></button>';
    }).join("");
    box.querySelectorAll("[data-sample]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = samples()[parseInt(b.getAttribute("data-sample"), 10)];
        st.note = (window.EigoData && window.EigoData.readingNotes && window.EigoData.readingNotes[s.id]) || null;
        st.noteTitle = s.title;
        openReader(s.text);
      });
    });
  }

  // テキストからリーダーを開く（共通）
  function openReader(text) {
    st.cues = window.Subtitle.parsePlainText(text);
    st.words = text.split(/\s+/);
    drawReader();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ---------- リーダー ---------- */
  function drawReader() {
    var lines = st.cues.map(function (c, i) {
      var words = c.text.split(/\s+/).map(function (w) {
        return '<span class="word" data-word="' + EM.escapeHtml(w) + '">' + EM.escapeHtml(w) + "</span>";
      }).join(" ");
      return '<div class="lyric__line" data-line="' + i + '"><div class="lyric__en">' + words + "</div></div>";
    }).join("");

    var wpmChips = WPM_OPTIONS.map(function (w) {
      return '<button class="chip" type="button" data-wpm="' + w + '" aria-pressed="' + (w === st.wpm) + '">' + w + " wpm</button>";
    }).join("");

    var noteHtml = "";
    if (st.note) {
      var n = st.note;
      var vocabRows = (n.vocab || []).map(function (v) {
        return '<div class="list-row" style="padding:8px 0">' +
          '<div class="list-row__main"><div class="list-row__title" style="font-size:15px">' + EM.escapeHtml(v.en) + '</div>' +
          '<div class="list-row__sub">' + EM.escapeHtml(v.ja) + '</div></div>' +
          '<button class="audio-btn" type="button" data-say-note="' + EM.escapeHtml(v.en) + '" aria-label="再生">▶</button></div>';
      }).join("");
      var grammarRows = (n.grammar || []).map(function (g) {
        return '<div class="lk-example"><p class="list-row__title" style="font-size:15px">📌 ' + EM.escapeHtml(g.point) + '</p>' +
          '<p class="lk-breakdown">' + EM.escapeHtml(g.ja) + '</p></div>';
      }).join("");
      noteHtml =
        '<details class="card mt-4" open><summary class="section-eyebrow" style="cursor:pointer">全訳' + (st.noteTitle ? "（" + EM.escapeHtml(st.noteTitle) + "）" : "") + '</summary>' +
          '<p class="setting-row__hint mt-4" style="line-height:1.9">' + EM.escapeHtml(n.ja || "") + '</p></details>' +
        (vocabRows ? '<details class="card mt-4"><summary class="section-eyebrow" style="cursor:pointer">重要語句</summary><div class="mt-4">' + vocabRows + '</div></details>' : "") +
        (grammarRows ? '<details class="card mt-4"><summary class="section-eyebrow" style="cursor:pointer">文法ポイント</summary><div class="mt-4">' + grammarRows + '</div></details>' : "");
    } else {
      noteHtml = '<p class="setting-row__hint mt-4">※ サンプル教材を選ぶと、全訳・重要語句・文法ポイントの解説が表示されます。</p>';
    }

    root().innerHTML =
      '<a class="back-link" id="to-setup" href="#/reading">‹ 教材を選び直す</a>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>下のバーで再生位置を移動でき、読み上げ中の語が色でわかります。<strong>文をタップ</strong>で再生、<strong>単語タップ</strong>で意味表示。</span></div>' +
      '<div class="card mt-4"><p class="section-eyebrow">読み上げ（シークバー対応）</p><div id="ap-read"></div></div>' +
      '<div class="card mt-4"><div class="lyric" id="reader">' + lines + "</div></div>" +
      noteHtml +
      '<div class="card mt-4"><p class="section-eyebrow">速読モード（WPM）</p>' +
        '<p class="setting-row__hint">語を一定速度で順送り表示。速読の訓練に。</p>' +
        '<div class="chip-group mt-4">' + wpmChips + "</div>" +
        '<div class="center mt-4"><div class="meter__value" id="wpm-word" style="min-height:54px">—</div></div>' +
        '<div class="grade-row" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--primary" id="wpm-start" type="button">スタート</button>' +
          '<button class="btn btn--ghost" id="wpm-stop" type="button">ストップ</button>' +
        "</div></div>" +
      '<div id="dict-panel"></div>';

    if (EM.audioPlayer) {
      var fullText = st.cues.map(function (c) { return c.text; }).join(" ");
      EM.audioPlayer(document.getElementById("ap-read"), fullText);
    }

    root().querySelectorAll("[data-say-note]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); EM.speak(b.getAttribute("data-say-note")); });
    });
    document.getElementById("to-setup").addEventListener("click", function (e) { e.preventDefault(); drawSetup(); });

    root().querySelectorAll(".lyric__line").forEach(function (line) {
      line.addEventListener("click", function (e) {
        if (e.target.classList.contains("word")) return;
        var i = parseInt(line.getAttribute("data-line"), 10);
        EM.speak(st.cues[i].text);
        Storage.recordStudy(1); EM.refreshStreakBadge();
      });
    });
    root().querySelectorAll(".word").forEach(function (sp) {
      sp.addEventListener("click", function (e) { e.stopPropagation(); showDict(sp.getAttribute("data-word")); });
    });
    root().querySelectorAll("[data-wpm]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.wpm = parseInt(b.getAttribute("data-wpm"), 10);
        root().querySelectorAll("[data-wpm]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      });
    });
    document.getElementById("wpm-start").addEventListener("click", startWpm);
    document.getElementById("wpm-stop").addEventListener("click", stopWpm);
  }

  /* ---------- 単語辞書 ---------- */
  function lookup(raw) {
    var key = raw.toLowerCase().replace(/[^a-z']/g, "");
    var words = (window.EigoData && window.EigoData.words) || [];
    var hit = words.find(function (w) { return w.en.toLowerCase() === key; });
    if (hit) return { en: hit.en, ipa: hit.ipa, kata: hit.kata, ja: hit.ja };
    var dict = (window.EigoData && window.EigoData.pronDict) || {};
    if (dict[key]) return { en: key, ipa: dict[key].ipa, kata: dict[key].kata, ja: "" };
    return { en: key, ipa: "", kata: window.Katakana ? window.Katakana.wordToKatakana(key) : "", ja: "" };
  }
  function showDict(raw) {
    var d = lookup(raw);
    var panel = document.getElementById("dict-panel");
    panel.innerHTML =
      '<div class="card mt-4">' +
        '<div class="row-between">' +
          '<div><span class="flashcard__word" style="font-size:var(--fs-h1)">' + EM.escapeHtml(d.en) + "</span> " +
            '<span class="flashcard__ipa" style="font-size:var(--fs-body)">' + EM.escapeHtml(d.ipa) + "</span></div>" +
          '<button class="audio-btn" id="dict-say" type="button" aria-label="再生">▶</button>' +
        "</div>" +
        '<p class="list-row__sub mt-4">' + EM.escapeHtml(d.kata) + (d.ja ? " ・ " + EM.escapeHtml(d.ja) : "") + "</p>" +
        '<button class="btn btn--ghost btn--block mt-4" id="dict-add" type="button">＋ 単語帳に追加</button>' +
      "</div>";
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    document.getElementById("dict-say").addEventListener("click", function () { EM.speak(d.en); });
    document.getElementById("dict-add").addEventListener("click", function () {
      Storage.addToWordbook({ en: d.en, ja: d.ja, ipa: d.ipa });
      EM.showToast("単語帳に追加しました");
    });
    EM.speak(d.en);
  }

  /* ---------- WPM速読 ---------- */
  function startWpm() {
    stopWpm();
    st.wordIdx = 0;
    var interval = Math.round(60000 / st.wpm);
    var disp = document.getElementById("wpm-word");
    st.timer = setInterval(function () {
      if (st.wordIdx >= st.words.length) { stopWpm(); disp.textContent = "完了"; Storage.recordStudy(1); EM.refreshStreakBadge(); return; }
      disp.textContent = st.words[st.wordIdx];
      st.wordIdx += 1;
    }, interval);
  }
  function stopWpm() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

  EM.registerView("#/reading", { title: "リーディング", tab: "learn", render: render });
})();

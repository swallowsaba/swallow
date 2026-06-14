/* ============================================================
   reading.js — リーディング（#/reading）
   - サンプル文 or 自分のテキストを文単位で表示。
   - 文クリックで読み上げ、単語タップで簡易辞書＋単語帳追加。
   - WPM速読モード（語を一定速度で順送り）。
   ============================================================ */
(function () {
  "use strict";

  var WPM_OPTIONS = [150, 250, 350];
  var st = { cues: [], wpm: 250, timer: null, wordIdx: 0, words: [] };

  function samples() { return (window.EigoData && window.EigoData.readingSamples) || []; }

  function render() {
    return { html: '<section id="reading-root" class="view-enter"></section>', onMount: drawSetup };
  }
  function root() { return document.getElementById("reading-root"); }

  /* ---------- セットアップ ---------- */
  function drawSetup() {
    stopWpm();
    var chips = samples().map(function (s, i) {
      return '<button class="choice-btn" type="button" data-sample="' + i + '">' +
        '<strong>' + EM.escapeHtml(s.title) + "</strong> <small>（" + s.level + "）</small></button>";
    }).join("");

    root().innerHTML =
      '<p class="section-title">リーディング</p>' +
      '<p class="field__label">サンプルを選ぶ</p>' + chips +
      '<div class="field mt-4"><label class="field__label" for="read-in">または自分のテキストを貼り付け</label>' +
        '<textarea class="textarea" id="read-in" placeholder="英文を貼り付け"></textarea></div>' +
      '<button class="btn btn--primary btn--block" id="read-go" type="button">読む</button>';

    root().querySelectorAll("[data-sample]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = samples()[parseInt(b.getAttribute("data-sample"), 10)];
        document.getElementById("read-in").value = s.text;
        st.note = (window.EigoData && window.EigoData.readingNotes && window.EigoData.readingNotes[s.id]) || null;
        st.noteTitle = s.title;
      });
    });
    document.getElementById("read-go").addEventListener("click", function () {
      var text = (document.getElementById("read-in").value || "").trim();
      if (!text) { EM.showToast("テキストを入力してください", true); return; }
      // サンプル本文から編集されていたら解説は外す（内容と解説のずれを防ぐ）
      var matched = samples().some(function (s) { return s.text === text; });
      if (!matched) st.note = null;
      st.cues = window.Subtitle.parsePlainText(text);
      st.words = text.split(/\s+/);
      drawReader();
    });
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

    // 解説（サンプル選択時のみ）：全訳・語句・文法ポイント
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
        '<div class="card mt-4"><p class="section-eyebrow">全訳' + (st.noteTitle ? "（" + EM.escapeHtml(st.noteTitle) + "）" : "") + '</p>' +
          '<p class="setting-row__hint" style="line-height:1.9">' + EM.escapeHtml(n.ja || "") + '</p></div>' +
        (vocabRows ? '<div class="card mt-4"><p class="section-eyebrow">重要語句</p>' + vocabRows + '</div>' : "") +
        (grammarRows ? '<div class="card mt-4"><p class="section-eyebrow">文法ポイント</p>' + grammarRows + '</div>' : "");
    } else {
      noteHtml = '<p class="setting-row__hint mt-4">※ サンプルを選ぶと、全訳・重要語句・文法ポイントの解説が表示されます。</p>';
    }

    root().innerHTML =
      '<a class="back-link" id="to-setup" href="#/reading">‹ テキストを選び直す</a>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>下のバーで再生位置を移動でき、読み上げ中の語が色でわかります。文をタップでその文を再生、単語タップで意味表示。</span></div>' +
      '<div class="card mt-4"><p class="section-eyebrow">読み上げ（シークバー対応）</p><div id="ap-read"></div></div>' +
      '<div class="card mt-4"><div class="lyric" id="reader">' + lines + "</div></div>" +
      noteHtml +

      '<div class="card mt-4"><p class="section-eyebrow">速読モード（WPM）</p>' +
        '<div class="chip-group">' + wpmChips + "</div>" +
        '<div class="center mt-4"><div class="meter__value" id="wpm-word" style="min-height:54px">—</div></div>' +
        '<div class="grade-row" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--primary" id="wpm-start" type="button">スタート</button>' +
          '<button class="btn btn--ghost" id="wpm-stop" type="button">ストップ</button>' +
        "</div></div>" +

      '<div id="dict-panel"></div>';

    // 本文全体のシークバー付きプレイヤー
    if (EM.audioPlayer) {
      var fullText = st.cues.map(function (c) { return c.text; }).join(" ");
      EM.audioPlayer(document.getElementById("ap-read"), fullText);
    }

    // 解説内の語句再生
    root().querySelectorAll("[data-say-note]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        EM.speak(b.getAttribute("data-say-note"));
      });
    });

    document.getElementById("to-setup").addEventListener("click", function (e) { e.preventDefault(); drawSetup(); });

    // 文クリックで読み上げ
    root().querySelectorAll(".lyric__line").forEach(function (line) {
      line.addEventListener("click", function (e) {
        if (e.target.classList.contains("word")) return; // 単語タップは別処理
        var i = parseInt(line.getAttribute("data-line"), 10);
        EM.speak(st.cues[i].text);
        Storage.recordStudy(1); EM.refreshStreakBadge();
      });
    });
    // 単語タップ辞書
    root().querySelectorAll(".word").forEach(function (sp) {
      sp.addEventListener("click", function (e) {
        e.stopPropagation();
        showDict(sp.getAttribute("data-word"));
      });
    });
    // WPM
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

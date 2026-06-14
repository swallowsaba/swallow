/* ============================================================
   発音チェック（1画面完結・大量の練習文）
   - data/pron_sentences.js のカテゴリ別練習文（130文超）を使用。
   - 文の切替は「‹ 前 / 次 ›」だけ。タップ→スクロールの往復を廃止し、
     お手本・録音・判定がすべて同じ画面内で完結する。
   - Web Speech API（SpeechRecognition）で単語ごとの一致を判定。
   ============================================================ */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var CATS = [
    { id: "basic", name: "基本" }, { id: "meeting", name: "会議" },
    { id: "presentation", name: "プレゼン" }, { id: "email", name: "メール" },
    { id: "negotiation", name: "交渉" }, { id: "smalltalk", name: "雑談" },
    { id: "th", name: "TH" }, { id: "rl", name: "R/L" },
    { id: "darkl", name: "ダークL" }, { id: "linking", name: "つながる音" },
    { id: "stress", name: "強勢・リズム" }
  ];
  var st = { cat: "basic", idx: 0, custom: "" };

  function pool() {
    var all = (window.EigoData && window.EigoData.pronSentences) || [];
    var p = all.filter(function (s) { return s.cat === st.cat; });
    return p.length ? p : all;
  }
  function cur() {
    if (st.custom) return { en: st.custom, ja: "（自由入力）", tip: "短い文に区切ると判定しやすくなります" };
    var p = pool();
    return p[((st.idx % p.length) + p.length) % p.length];
  }
  function normalize(s) { return String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); }
  function diffWords(target, said) {
    var t = normalize(target).split(" "), s = normalize(said).split(" ");
    var hit = 0;
    var words = t.map(function (w) { var ok = s.indexOf(w) >= 0; if (ok) hit++; return { w: w, ok: ok }; });
    return { words: words, rate: Math.round(hit / Math.max(1, t.length) * 100) };
  }

  function render() { return { html: '<section id="pron-root" class="view-enter"></section>', onMount: draw }; }
  function root() { return document.getElementById("pron-root"); }

  function draw() {
    var s = cur();
    var p = pool();
    var chips = CATS.map(function (c) {
      return '<button class="chip' + (c.id === st.cat ? " chip--on" : "") + '" data-cat="' + c.id + '" type="button">' + c.name + "</button>";
    }).join("");
    root().innerHTML =
      '<div class="chip-group chip-group--scroll" id="pron-cats">' + chips + '</div>' +
      '<div class="pron-stage card mt-4">' +
        '<div class="row-between"><span class="hub-row__badge">' + (st.custom ? "自由入力" : (st.idx % p.length + 1) + " / " + p.length + "文") + '</span>' +
          '<button class="audio-btn" id="say-model" type="button" aria-label="お手本">▶</button></div>' +
        '<div id="pron-chip"></div>' +
        '<p class="pron-stage__ja">' + EM.escapeHtml(s.ja) + '</p>' +
        '<p class="pron-stage__tip">💡 ' + EM.escapeHtml(s.tip || "") + '</p>' +
        '<div id="pron-result" class="mt-4"></div>' +
      '</div>' +
      '<div class="pron-actions">' +
        '<button class="btn btn--ghost" id="pron-prev" type="button">‹ 前</button>' +
        (SR ? '<button class="btn btn--primary" id="pron-mic" type="button">🎤 録音して判定</button>'
            : '<button class="btn btn--primary" id="say-model2" type="button">▶ お手本を聞く</button>') +
        '<button class="btn btn--ghost" id="pron-next" type="button">次 ›</button>' +
      '</div>' +
      (SR ? "" : '<p class="setting-row__hint center mt-4">このブラウザは音声認識に未対応です（Chrome/Edge/Safariで判定できます）。お手本を聞いてリピートしましょう。</p>') +
      '<details class="card mt-5"><summary class="list-row__title">自分の文章で練習する</summary>' +
        '<textarea class="textarea mt-4" id="pron-custom" rows="2" placeholder="例：Could you send me the report by Friday?">' + EM.escapeHtml(st.custom) + '</textarea>' +
        '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--ghost" id="pron-clear" type="button">一覧に戻す</button>' +
          '<button class="btn btn--primary" id="pron-use" type="button">この文で練習</button></div></details>';

    root().querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () { st.cat = b.getAttribute("data-cat"); st.idx = 0; st.custom = ""; draw(); });
    });
    if (EM.audioChip) EM.audioChip(document.getElementById("pron-chip"), cur().en);
    function go(d) { st.custom = ""; st.idx += d; EM.stopSpeak(); draw(); EM.speak(cur().en); }
    document.getElementById("pron-prev").addEventListener("click", function () { go(-1); });
    document.getElementById("pron-next").addEventListener("click", function () { go(1); });
    document.getElementById("say-model").addEventListener("click", function () { EM.speak(cur().en); });
    var m2 = document.getElementById("say-model2");
    if (m2) m2.addEventListener("click", function () { EM.speak(cur().en); });
    document.getElementById("pron-use").addEventListener("click", function () {
      var v = (document.getElementById("pron-custom").value || "").trim();
      if (!v) { EM.showToast("文章を入力してください", true); return; }
      st.custom = v; draw();
    });
    document.getElementById("pron-clear").addEventListener("click", function () { st.custom = ""; draw(); });
    var mic = document.getElementById("pron-mic");
    if (mic) mic.addEventListener("click", runRecognition);
  }

  function runRecognition() {
    var btn = document.getElementById("pron-mic");
    EM.stopSpeak();
    var rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    btn.disabled = true; btn.textContent = "聞き取り中…";
    rec.onresult = function (e) { showResult(e.results[0][0].transcript); };
    rec.onerror = function (ev) {
      EM.showToast(ev.error === "not-allowed" ? "マイクの使用を許可してください" : "聞き取れませんでした。もう一度どうぞ", true);
    };
    rec.onend = function () { btn.disabled = false; btn.textContent = "🎤 録音して判定"; };
    rec.start();
  }

  function showResult(said) {
    var s = cur();
    var d = diffWords(s.en, said);
    var wordsHtml = d.words.map(function (w) {
      return '<span class="' + (w.ok ? "diff-ok" : "diff-ng") + '">' + EM.escapeHtml(w.w) + "</span>";
    }).join(" ");
    var box = document.getElementById("pron-result");
    box.innerHTML =
      '<div class="' + (d.rate >= 80 ? "notice notice--good" : "notice notice--info") + '">' +
        '<span class="notice__icon">' + (d.rate >= 80 ? "✓" : "i") + '</span>' +
        '<span>一致率 <strong>' + d.rate + '%</strong>　認識：' + EM.escapeHtml(said) + '</span></div>' +
      '<p class="mt-4" style="line-height:2">' + wordsHtml + '</p>' +
      (d.rate < 80 ? '<p class="setting-row__hint mt-4">赤い単語を中心に、▶お手本→自分の順でもう一度。</p>' : '<p class="setting-row__hint mt-4">すばらしい！「次 ›」で進みましょう。</p>');
  }

  EM.registerView("#/pron-check", { title: "発音チェック", tab: "learn", render: render });
})();

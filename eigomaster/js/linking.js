/* ============================================================
   linking.js — リンキング（音声変化）解析と画面
   analyzeLinking(sentence)：つづりベースのヒューリスティックで
   連結 / フラップT / 脱落 / 同化 / 弱形 を検出し、色分けHTMLと参考カタカナを返す。
   ※ 完全な音声解析ではなく近似。UIにもその旨を明記する。
   ============================================================ */
(function () {
  "use strict";

  var WEAK = { a: 1, an: 1, the: 1, to: 1, of: 1, "for": 1, and: 1, can: 1, at: 1, your: 1, "but": 1, from: 1, as: 1 };

  // タグの優先順位（1語に複数当たった場合の表示色）
  var PRIORITY = ["assim", "flap", "drop", "link", "weak"];

  function clean(w) { return w.toLowerCase().replace(/[^a-z']/g, ""); }

  // 文を解析して { html, soundKata, rules:[] } を返す
  function analyzeLinking(sentence) {
    var words = String(sentence).trim().split(/\s+/).filter(Boolean);
    var tags = words.map(function () { return {}; });

    for (var i = 0; i < words.length; i++) {
      var w = clean(words[i]);
      if (!w) continue;
      if (WEAK[w]) tags[i].weak = true;
      // 語中フラップT：母音 + t/tt + 母音
      if (/[aeiou]tt?[aeiou]/.test(w)) tags[i].flap = true;

      if (i < words.length - 1) {
        var nw = clean(words[i + 1]);
        var endsCons = /[^aeiou]$/.test(w) && !/e$/.test(w);
        var startsVowel = /^[aeiou]/.test(nw);
        var startsCons = /^[^aeiou]/.test(nw);

        // 同化：d/t + you/your
        if (/[dt]$/.test(w) && /^(you|your)$/.test(nw)) tags[i].assim = true;
        // 境界フラップ：…(母音)t + 母音始まり（get it 等）
        else if (/[aeiou]t$/.test(w) && startsVowel) tags[i].flap = true;
        // 連結：子音終わり + 母音始まり
        else if (endsCons && startsVowel) tags[i].link = true;
        // 脱落：t/d 終わり + 子音始まり
        if (/[td]$/.test(w) && startsCons) tags[i].drop = true;
      }
    }

    // 色分けHTML
    var rulesUsed = {};
    var html = words.map(function (word, idx) {
      var t = tags[idx];
      var primary = PRIORITY.find(function (p) { return t[p]; });
      if (!primary) return '<span class="lk">' + EM.escapeHtml(word) + "</span>";
      rulesUsed[primary] = true;
      return '<span class="lk lk--' + primary + '">' + EM.escapeHtml(word) + "</span>";
    }).join(" ");

    // 参考カタカナ（縮約を反映してから変換）
    var reduced = " " + sentence.toLowerCase() + " ";
    reduced = reduced
      .replace(/ want to /g, " wanna ")
      .replace(/ going to /g, " gonna ")
      .replace(/ got to /g, " gotta ")
      .replace(/ have to /g, " hafta ")
      .replace(/ kind of /g, " kinda ");
    var soundKata = window.Katakana ? window.Katakana.toKatakana(reduced.trim()) : "";

    return { html: html, soundKata: soundKata, rules: Object.keys(rulesUsed) };
  }

  window.Linking = { analyzeLinking: analyzeLinking };

  /* ---------- 画面 ---------- */
  var LEGEND = [
    { id: "link", label: "連結", cls: "lk--link" },
    { id: "flap", label: "フラップT", cls: "lk--flap" },
    { id: "drop", label: "脱落", cls: "lk--drop" },
    { id: "assim", label: "同化", cls: "lk--assim" },
    { id: "weak", label: "弱形", cls: "lk--weak" }
  ];

  function render() {
    var rules = (window.EigoData && window.EigoData.linkingRules) || [];

    var legendHtml = LEGEND.map(function (l) {
      return '<span><span class="lk ' + l.cls + '">' + l.label + "</span></span>";
    }).join("");

    var catalog = rules.map(function (r, idx) {
      var exHtml = r.examples.map(function (ex, j) {
        return '<div class="lk-example">' +
          '<div class="list-row" style="padding:0">' +
            '<div class="list-row__main"><div class="list-row__title">' + EM.escapeHtml(ex.text) + "</div>" +
            '<div class="list-row__sub">≈ ' + EM.escapeHtml(ex.sound) + "</div></div>" +
            '<button class="audio-btn" type="button" data-say="' + EM.escapeHtml(ex.text) + '" aria-label="再生">▶</button>' +
            '<button class="audio-btn" type="button" data-say-slow="' + EM.escapeHtml(ex.text) + '" aria-label="ゆっくり再生">🐢</button>' +
          "</div>" +
          (ex.breakdown ? '<p class="lk-breakdown">' + EM.escapeHtml(ex.breakdown) + "</p>" : "") +
        "</div>";
      }).join("");
      return '<div class="card">' +
        '<div class="row-between"><p class="list-row__title">' + EM.escapeHtml(r.name) + "</p>" +
          (r.short ? '<span class="chip chip--static">' + EM.escapeHtml(r.short) + "</span>" : "") + "</div>" +
        '<p class="setting-row__hint" style="margin-top:8px">' + EM.escapeHtml(r.ja) + "</p>" +
        (r.how ? '<p class="lk-how"><strong>対象：</strong>' + EM.escapeHtml(r.how) + "</p>" : "") +
        '<div class="mt-4">' + exHtml + "</div></div>";
    }).join("");

    var html =
      '<section class="view-enter">' +
        EM.backLink("#/pron", "発音メニュー") +
        '<p class="section-title">リンキング（音声変化）</p>' +
        '<div class="notice"><span class="notice__icon">!</span>' +
          '<span>英文を入力すると、音のつながりを推定して色分けします。つづりベースの<strong>近似</strong>のため、実際の発音と異なる場合があります。</span></div>' +

        '<div class="field mt-4">' +
          '<label class="field__label" for="lk-in">英文を解析</label>' +
          '<textarea class="textarea" id="lk-in" placeholder="例：Could you check it out?">Could you check it out?</textarea>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" id="lk-go" type="button">音の変化を見る</button>' +
        '<div id="lk-out" class="mt-5"></div>' +

        '<div class="legend mt-4">' + legendHtml + "</div>" +

        '<p class="section-title mt-5">聞き取りクイズ（全' + String(rules.reduce(function (n, r) { return n + (r.examples || []).length; }, 0)) + '例から10問）</p>' +
        '<div class="card" id="lkq-box">' +
          '<p class="setting-row__hint">音声変化した英語を聞いて、正しい英文を選びます。</p>' +
          '<button class="btn btn--primary btn--block mt-4" id="lkq-start" type="button">クイズをはじめる</button>' +
        '</div>' +

        '<p class="section-title mt-5">ルール別の練習</p>' +
        catalog +
      "</section>";
    return { html: html, onMount: bind };
  }

  function bind() {
    var input = document.getElementById("lk-in");
    var out = document.getElementById("lk-out");

    function run() {
      var text = (input.value || "").trim();
      if (!text) { out.innerHTML = ""; return; }
      var res = analyzeLinking(text);

      // 検出された音声変化の解説
      var rules = (window.EigoData && window.EigoData.linkingRules) || [];
      var detected = (res.rules || []).map(function (key) {
        var r = rules.find(function (x) { return x.id === key; });
        if (!r) return "";
        return '<div class="lk-detected"><span class="lk lk--' + key + '">' + EM.escapeHtml(r.name) + "</span>" +
          '<span class="lk-detected__txt">' + EM.escapeHtml(r.short || r.ja) + "</span></div>";
      }).join("");
      var detectedHtml = detected
        ? '<div class="mt-4"><p class="setting-row__hint" style="margin-bottom:6px">この文で起きている変化：</p>' + detected + "</div>"
        : '<p class="setting-row__hint mt-4">この文では大きな音声変化は検出されませんでした。</p>';

      out.innerHTML =
        '<div class="card">' +
          '<p class="linking-out">' + res.html + "</p>" +
          '<p class="linking-kata">≈ ' + EM.escapeHtml(res.soundKata) + "</p>" +
          '<div class="grade-row" style="grid-template-columns:1fr 1fr">' +
            '<button class="btn btn--ghost" id="lk-play" type="button">▶ 通常</button>' +
            '<button class="btn btn--ghost" id="lk-slow" type="button">🐢 ゆっくり</button>' +
          "</div>" +
          detectedHtml +
        "</div>";
      document.getElementById("lk-play").addEventListener("click", function () { EM.speak(text, { rate: 1.0 }); });
      document.getElementById("lk-slow").addEventListener("click", function () { EM.speak(text, { rate: 0.6 }); });
    }

    document.getElementById("lk-go").addEventListener("click", run);
    run();

    /* ---------- 聞き取りクイズ（10問） ---------- */
    (function () {
      var box = document.getElementById("lkq-box");
      if (!box) return;
      var rules = (window.EigoData && window.EigoData.linkingRules) || [];
      var pool = [];
      rules.forEach(function (r) {
        (r.examples || []).forEach(function (ex) {
          pool.push({ text: ex.text, sound: ex.sound || "", breakdown: ex.breakdown || "", rule: r.name });
        });
      });
      function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

      var qs = [], idx = 0, score = 0;

      function startQuiz() {
        if (pool.length < 4) { box.innerHTML = '<p class="setting-row__hint">出題できる例が足りません。</p>'; return; }
        qs = shuffle(pool).slice(0, Math.min(10, pool.length));
        idx = 0; score = 0;
        showQ();
      }
      function showQ() {
        var q = qs[idx];
        // 選択肢：正解＋他の例3つ
        var others = shuffle(pool.filter(function (p) { return p.text !== q.text; })).slice(0, 3);
        var choices = shuffle([q].concat(others));
        box.innerHTML =
          '<div class="row-between"><p class="list-row__title">第' + (idx + 1) + '問 / ' + qs.length + '</p>' +
            '<span class="chip chip--static">正解 ' + score + '</span></div>' +
          '<p class="setting-row__hint mt-4">音声を聞いて、読まれた英文を選んでください。</p>' +
          '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
            '<button class="btn btn--primary" id="lkq-play" type="button">▶ 再生</button>' +
            '<button class="btn btn--ghost" id="lkq-slow" type="button">🐢 ゆっくり</button>' +
          '</div>' +
          '<div class="stack-sm mt-4" id="lkq-choices">' +
            choices.map(function (c, i) {
              return '<button class="choice-btn" type="button" data-pick="' + EM.escapeHtml(c.text) + '">' + EM.escapeHtml(c.text) + '</button>';
            }).join("") +
          '</div>';
        document.getElementById("lkq-play").addEventListener("click", function () { EM.speak(q.text, { rate: 1.0 }); });
        document.getElementById("lkq-slow").addEventListener("click", function () { EM.speak(q.text, { rate: 0.6 }); });
        box.querySelectorAll("[data-pick]").forEach(function (b) {
          b.addEventListener("click", function () { answer(b.getAttribute("data-pick"), q); });
        });
        // 出題と同時に1回再生（タップ起点なのでスマホでも鳴る）
        EM.speak(q.text, { rate: 1.0 });
      }
      function answer(picked, q) {
        var ok = picked === q.text;
        if (ok) score++;
        var fb =
          '<div class="card mt-4" style="background:var(--c-accent-soft)">' +
            '<p class="list-row__title">' + (ok ? "⭕ 正解！" : "❌ 不正解") + '</p>' +
            '<p class="list-row__sub mt-4"><strong>' + EM.escapeHtml(q.text) + '</strong>' +
              (q.sound ? ' ≈ ' + EM.escapeHtml(q.sound) : '') + '</p>' +
            (q.breakdown ? '<p class="lk-breakdown mt-4">' + EM.escapeHtml(q.breakdown) + '</p>' : '') +
            '<p class="setting-row__hint mt-4">変化の種類：' + EM.escapeHtml(q.rule) + '</p>' +
            '<button class="btn btn--primary btn--block mt-4" id="lkq-next" type="button">' +
              (idx + 1 < qs.length ? "次の問題 →" : "結果を見る") + '</button>' +
          '</div>';
        box.insertAdjacentHTML("beforeend", fb);
        box.querySelectorAll("[data-pick]").forEach(function (b) { b.disabled = true; });
        document.getElementById("lkq-next").addEventListener("click", function () {
          idx++;
          if (idx < qs.length) showQ(); else showResult();
        });
      }
      function showResult() {
        box.innerHTML =
          '<p class="list-row__title">結果：' + score + ' / ' + qs.length + ' 問正解</p>' +
          '<p class="setting-row__hint mt-4">' + (score >= qs.length * 0.8 ? "すばらしい！音声変化に耳が慣れてきています。" : "繰り返すほど聞き取れるようになります。下のルール別練習で確認しましょう。") + '</p>' +
          '<button class="btn btn--primary btn--block mt-4" id="lkq-again" type="button">もう一度（別の10問）</button>';
        document.getElementById("lkq-again").addEventListener("click", startQuiz);
      }
      document.getElementById("lkq-start").addEventListener("click", startQuiz);
    })();

    // カタログの再生ボタン（イベント委譲）
    document.getElementById("view").addEventListener("click", function (e) {
      var say = e.target.closest("[data-say]");
      if (say) { EM.speak(say.getAttribute("data-say"), { rate: 1.0 }); return; }
      var slow = e.target.closest("[data-say-slow]");
      if (slow) { EM.speak(slow.getAttribute("data-say-slow"), { rate: 0.55 }); }
    });
  }

  EM.registerView("#/linking", { title: "リンキング", tab: "pron", render: render });
})();

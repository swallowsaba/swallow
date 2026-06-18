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
  // 各音声変化が「なぜ」起きるのかの理由（解析・クイズ・リスニング解説で共有）
  var REASONS = {
    link: "英語は語末の子音と次の語頭の母音をひとかたまりに発音するため、単語の切れ目で音がつながります（check it → チェッキッ）。",
    flap: "アメリカ英語では母音に挟まれた t/d を舌先で弾くため、日本語のラ行に近い音になります（water → ワラー）。",
    darkl: "語末や子音の前の L は舌先を歯ぐきに付けず舌の奥を持ち上げるため、「ウ」に近いこもった音になります（feel → フィーゥ）。",
    drop: "破裂音（p/t/k/b/d/g）が連続すると前の音は口の形だけ作って破裂させないため、音が消えたように聞こえます（good bye → グッ(ド)バイ）。",
    assim: "隣り合う音が言いやすい位置に引っ張られて別の音に変わります（did you → ディジュ：d+y→ヂ）。",
    weak: "前置詞・冠詞・代名詞などの機能語は内容語より重要度が低いため、あいまい母音で弱く短く発音されます（for → ファ）。",
    contract: "話し言葉では高頻度の組み合わせが縮まって1語のように発音されます（going to → gonna）。",
    aspiration: "語頭の p/t/k は強い息を伴って破裂します。息が弱いと b/d/g に聞こえてしまいます（pin と bin の違い）。"
  };

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

        // 同化：d/t/s/z + you/your（could you→クッジュー, miss you→ミシュー）
        if (/[dtsz]$|ss$/.test(w) && /^(you|your)$/.test(nw)) tags[i].assim = true;
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

    // 語境界でのリンク（弧でつなぐ箇所）を抽出
    var links = [];
    for (var b = 0; b < words.length - 1; b++) {
      var tb = tags[b];
      var rule = tb.assim ? "assim" : tb.flap && /[aeiou]t$/.test(clean(words[b])) ? "flap" : tb.link ? "link" : tb.drop ? "drop" : null;
      if (rule && rule !== "drop") links.push({ from: b, to: b + 1, rule: rule });
      else if (tb.drop) links.push({ from: b, to: b + 1, rule: "drop" });
    }

    // 参考カタカナ（連結発音）：弱化・脱促音/脱長音に加え、語境界の
    // 連結(∪)は語間スペースを詰め、脱落(t/d+子音)は前語の末尾ト/ド/ッを落とす。
    // ※ tags/links は元の words のインデックスに対応するため、語数を変える縮約は行わない。
    var soundKata = buildConnectedKata(words, tags, links);

    return { html: html, soundKata: soundKata, rules: Object.keys(rulesUsed), words: words, tags: tags, links: links };
  }

  // 語配列＋tags から「実際のアメリカ英語の連結発音」カタカナを組み立てる。
  // 各語は reduced 形にし、語境界で同化/連結/フラップ/脱落を実際に結合する。
  function buildConnectedKata(words, tags, links) {
    var K = window.Katakana;
    if (!K || !K.reduceTokenKana) return "";
    function cw(w) { return String(w).toLowerCase().replace(/[^a-z']/g, ""); }
    var ks = [], engs = [], prevIdx = -1;
    for (var i = 0; i < words.length; i++) {
      var eng = cw(words[i]);
      var kana = K.reduceTokenKana(words[i], true); // 冠詞 a 等は "" で脱落
      if (kana === "") continue;
      if (prevIdx < 0) { ks.push(kana); engs.push(eng); prevIdx = i; continue; }
      var t = tags[prevIdx] || {};
      var pEng = cw(words[prevIdx]);
      // 境界の規則を1つ選ぶ（同化＞脱落＞境界フラップ＞連結）
      var rule = t.assim ? "assim"
               : t.drop ? "drop"
               : (t.flap && /[aeiou]t$/.test(pEng)) ? "flap"
               : t.link ? "link" : null;
      var merged = rule && K.mergeBoundary ? K.mergeBoundary(ks[ks.length - 1], pEng, kana, eng, rule) : null;
      if (merged) { ks[ks.length - 1] = merged.prev; ks.push("\u0001" + merged.cur); } // \u0001=前語と詰める
      else ks.push(kana);
      engs.push(eng);
      prevIdx = i;
    }
    var out = "";
    for (var j = 0; j < ks.length; j++) {
      var piece = ks[j];
      if (j === 0) { out = piece; continue; }
      if (piece.charAt(0) === "\u0001") out += piece.slice(1);   // 連結：スペース無し
      else out += " " + piece;                                    // 非連結：スペース
    }
    return out;
  }

  window.Linking = { analyzeLinking: analyzeLinking, explainHtml: explainHtml, bindVisual: bindVisual, REASONS: REASONS };

  // .lkv 視覚カードに再生ボタンを配線し、発話中の語をハイライトする。
  // EM.speak の onboundary(charIndex) を使い、文字位置から語を特定して光らせる。
  function bindVisual(scope) {
    if (!scope) return;
    var card = scope.querySelector ? (scope.matches && scope.matches(".lkv") ? scope : scope.querySelector(".lkv")) : null;
    if (!card) return;
    var sentence = card.getAttribute("data-sentence") || "";
    var cells = Array.prototype.slice.call(card.querySelectorAll(".lkv__cell"));

    // 各語の文字範囲 [start, end) を算出（onboundary の charIndex を語に対応づける）
    var ranges = [];
    var re = /\S+/g, m;
    while ((m = re.exec(sentence)) !== null) ranges.push([m.index, m.index + m[0].length]);

    function clearHi() { cells.forEach(function (c) { c.classList.remove("lkv__cell--on"); }); }
    function highlightAt(charIndex) {
      if (charIndex < 0) { clearHi(); return; }
      var wi = -1;
      for (var i = 0; i < ranges.length; i++) {
        if (charIndex >= ranges[i][0] && charIndex < ranges[i][1]) { wi = i; break; }
        if (charIndex < ranges[i][0]) { wi = i; break; }
      }
      clearHi();
      if (wi >= 0 && cells[wi]) cells[wi].classList.add("lkv__cell--on");
    }
    function play(rate) {
      EM.stopSpeak && EM.stopSpeak();
      EM.speak(sentence, {
        rate: rate,
        onboundary: function (ci) { highlightAt(ci); },
        onend: function () { setTimeout(clearHi, 250); }
      });
    }
    var pb = card.querySelector("[data-lkv-play]");
    var sb = card.querySelector("[data-lkv-slow]");
    if (pb) pb.addEventListener("click", function () { play(1.0); });
    if (sb) sb.addEventListener("click", function () { play(0.55); });
  }

  // 文中の音声変化を「色分け文＋どこが・どの規則で・なぜ」まで説明するHTMLを返す。
  // リスニングの答え合わせやレッスンの解説から呼び出して、変化箇所を可視化する。
  // ルールごとの色（弧・下線・カタカナの色分けに使う）
  var RULE_COLORS = { link: "#e0457b", flap: "#e0457b", assim: "#e0457b", drop: "#8a8f98", weak: "#f0932b" };
  var RULE_LABEL = { link: "連結", flap: "フラップ", assim: "同化", drop: "脱落", weak: "弱形" };

  function explainHtml(sentence) {
    var res = analyzeLinking(sentence);
    var words = res.words || String(sentence).trim().split(/\s+/);
    var links = res.links || [];

    // 各語のカタカナ（文中での聞こえ方＝reduced。1語1表示でハイライト整合）
    var kana = words.map(function (w) {
      try { return (window.Katakana && window.Katakana.reduceTokenKana) ? window.Katakana.reduceTokenKana(w, false) : ""; }
      catch (e) { return ""; }
    });

    // 連結が起きる語ペアを強調色にする
    var linkedIdx = {};
    links.forEach(function (l) { if (l.rule !== "drop") { linkedIdx[l.from] = l.rule; linkedIdx[l.to] = l.rule; } });

    // 視覚カード：単語の列。連結ペアは弧（∪）で結ぶ
    var wordsHtml = words.map(function (w, i) {
      var hasArc = links.some(function (l) { return l.from === i && l.rule !== "drop"; });
      var rule = linkedIdx[i];
      var col = rule ? RULE_COLORS[rule] : "";
      return '<span class="lkv__cell" data-wi="' + i + '">' +
        (hasArc ? '<span class="lkv__arc" style="border-color:' + RULE_COLORS[links.find(function (l) { return l.from === i; }).rule] + '"></span>' : '') +
        '<span class="lkv__en"' + (col ? ' style="color:' + col + '"' : '') + '>' + EM.escapeHtml(w) + '</span>' +
        '<span class="lkv__ka"' + (col ? ' style="color:' + col + '"' : '') + '>' + EM.escapeHtml(kana[i] || "") + '</span>' +
        '</span>';
    }).join("");

    var visual =
      '<div class="lkv" data-sentence="' + EM.escapeHtml(sentence) + '">' +
        '<p class="lkv__title">単語のつながり（弧）と、いま読んでいる箇所が光ります</p>' +
        '<div class="lkv__row">' + wordsHtml + '</div>' +
        '<p class="lkv__full">≈ ' + EM.escapeHtml(res.soundKata) + '</p>' +
        '<div class="lkv__controls">' +
          '<button class="btn btn--primary" type="button" data-lkv-play>▶ つながりを聞く</button>' +
          '<button class="btn btn--ghost" type="button" data-lkv-slow>🐢 ゆっくり</button>' +
        '</div>' +
      '</div>';

    // 検出された規則の説明（なぜ）
    var ruleData = (window.EigoData && window.EigoData.linkingRules) || [];
    var detected = (res.rules || []).map(function (key) {
      var r = ruleData.find(function (x) { return x.id === key; });
      var name = r ? r.name : (RULE_LABEL[key] || key);
      return '<div class="lk-detected"><span class="lk-chip" style="background:' + (RULE_COLORS[key] || "#888") + '">' + EM.escapeHtml(name) + '</span>' +
        '<span class="lk-detected__txt">' + EM.escapeHtml(r ? (r.short || r.ja) : "") +
        (REASONS[key] ? '<br><small class="lk-why">なぜ？ ' + EM.escapeHtml(REASONS[key]) + '</small>' : "") +
        '</span></div>';
    }).join("");

    return '<div class="lk-explain">' +
      visual +
      (detected ? '<p class="setting-row__hint" style="margin:10px 0 6px">色つきの箇所で、次の変化が起きています：</p>' + detected
                : '<p class="setting-row__hint" style="margin-top:6px">この文では大きな音声変化はありません。</p>') +
      '</div>';
  }

  /* ---------- 画面 ---------- */
  var LEGEND = [
    { id: "link", label: "連結", cls: "lk--link" },
    { id: "flap", label: "フラップT", cls: "lk--flap" },
    { id: "drop", label: "脱落", cls: "lk--drop" },
    { id: "assim", label: "同化", cls: "lk--assim" },
    { id: "weak", label: "弱形", cls: "lk--weak" }
  ];


  /* ============================================================
     画面：タブ切替（クイズ／解析／ルール）で1画面完結
     - 既定はクイズ。開いたら即出題（だらだら縦長を廃止）
     ============================================================ */
  var st = { tab: "analyze" };
  var qz = { qs: [], idx: 0, score: 0 };

  function rules() { return (window.EigoData && window.EigoData.linkingRules) || []; }
  function pool() {
    var p = [];
    rules().forEach(function (r) {
      (r.examples || []).forEach(function (ex) {
        p.push({ text: ex.text, sound: ex.sound || "", breakdown: ex.breakdown || "", rule: r.name, ruleId: r.id });
      });
    });
    return p;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function render() {
    return { html: '<section id="linking-root" class="view-enter"></section>', onMount: function () { draw(); } };
  }
  function root() { return document.getElementById("linking-root"); }

  function draw() {
    root().innerHTML =
      '<div class="pill-tabs" role="tablist">' +
        tabBtn("analyze", "🔗 つながり図") + tabBtn("quiz", "🎧 聞き取り") + tabBtn("rules", "📖 ルール") +
      '</div>' +
      '<div id="lk-body" class="mt-4"></div>';
    root().querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { st.tab = b.getAttribute("data-tab"); EM.stopSpeak(); draw(); });
    });
    if (st.tab === "quiz") drawQuiz();
    else if (st.tab === "analyze") drawAnalyze();
    else drawRules();
  }
  function tabBtn(id, label) {
    return '<button class="pill-tabs__btn" data-tab="' + id + '" aria-pressed="' + (st.tab === id) + '" type="button">' + label + '</button>';
  }
  function body() { return document.getElementById("lk-body"); }

  /* ---------- クイズ（既定タブ・即出題・1問1画面） ---------- */
  function startQuiz() {
    var p = pool();
    qz.qs = shuffle(p).slice(0, Math.min(10, p.length));
    qz.idx = 0; qz.score = 0;
    showQ();
  }
  function showQ() {
    var q = qz.qs[qz.idx];
    var others = shuffle(pool().filter(function (x) { return x.text !== q.text; })).slice(0, 3);
    var choices = shuffle([q].concat(others));
    body().innerHTML =
      '<div class="card">' +
        '<div class="row-between"><span class="hub-row__badge">第' + (qz.idx + 1) + '問 / ' + qz.qs.length + '</span>' +
          '<span class="hub-row__badge">正解 ' + qz.score + '</span></div>' +
        '<p class="lesson__q mt-4">音声変化した英語を聞いて、読まれた文を選ぼう</p>' +
        '<div class="grade-row mt-4" style="grid-template-columns:1fr 1fr">' +
          '<button class="btn btn--primary" id="lkq-play" type="button">▶ 再生</button>' +
          '<button class="btn btn--ghost" id="lkq-slow" type="button">🐢 ゆっくり</button>' +
        '</div>' +
        '<div class="lesson__choices mt-4">' +
          choices.map(function (c) {
            return '<button class="lesson__choice" type="button" data-pick="' + EM.escapeHtml(c.text) + '">' + EM.escapeHtml(c.text) + '</button>';
          }).join("") +
        '</div>' +
        '<div id="lkq-fb"></div>' +
      '</div>';
    document.getElementById("lkq-play").addEventListener("click", function () { EM.speak(q.text, { rate: 1.0 }); });
    document.getElementById("lkq-slow").addEventListener("click", function () { EM.speak(q.text, { rate: 0.6 }); });
    body().querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () { answer(b, q); }, { once: true });
    });
    EM.speak(q.text, { rate: 1.0 });
  }
  function answer(btn, q) {
    var ok = btn.getAttribute("data-pick") === q.text;
    if (ok) qz.score++;
    body().querySelectorAll("[data-pick]").forEach(function (b) {
      b.disabled = true;
      if (b.getAttribute("data-pick") === q.text) b.classList.add("is-right");
      else if (b === btn) b.classList.add("is-wrong");
    });
    document.getElementById("lkq-fb").innerHTML =
      '<div class="lesson__foot ' + (ok ? "lesson__foot--ok" : "lesson__foot--ng") + '" style="margin:12px 0 0;border-radius:12px;padding:12px">' +
        '<p class="lesson__fb-head">' + (ok ? "⭕ 正解！" : "❌ 不正解") + '</p>' +
        explainHtml(q.text) +
        '<p class="lesson__fb-body" style="margin-top:8px"><strong>' + EM.escapeHtml(q.text) + '</strong>' +
          (q.sound ? '　≈ ' + EM.escapeHtml(q.sound) : '') +
          (q.breakdown ? '<br>' + EM.escapeHtml(q.breakdown) : '') +
          '<br><span class="lk lk--' + q.ruleId + '">' + EM.escapeHtml(q.rule) + '</span> ' +
          EM.escapeHtml(REASONS[q.ruleId] || "") + '</p>' +
        '<button class="btn btn--primary btn--block mt-4" id="lkq-next" type="button">' +
          (qz.idx + 1 < qz.qs.length ? "次の問題 →" : "結果を見る") + '</button>' +
      '</div>';
    if (window.Linking && window.Linking.bindVisual) window.Linking.bindVisual(document.getElementById("lkq-fb"));
    document.getElementById("lkq-next").addEventListener("click", function () {
      qz.idx++; EM.stopSpeak();
      if (qz.idx < qz.qs.length) showQ(); else showResult();
    });
  }
  function showResult() {
    var pct = Math.round(qz.score / Math.max(1, qz.qs.length) * 100);
    body().innerHTML =
      '<div class="card center">' +
        '<p style="font-size:48px">' + (pct >= 80 ? "🏆" : pct >= 60 ? "💪" : "🌱") + '</p>' +
        '<p class="lesson__big">' + qz.score + ' / ' + qz.qs.length + ' 問正解</p>' +
        '<p class="setting-row__hint mt-4">' + (pct >= 80 ? "すばらしい！音声変化に耳が慣れています。" : "繰り返すほど聞き取れるようになります。📖ルールで仕組みも確認してみよう。") + '</p>' +
        '<button class="btn btn--primary btn--block mt-5" id="lkq-again" type="button">もう一度（別の10問）</button>' +
      '</div>';
    document.getElementById("lkq-again").addEventListener("click", startQuiz);
  }
  function drawQuiz() { startQuiz(); }

  /* ---------- 解析タブ（可視化中心） ---------- */
  function drawAnalyze() {
    body().innerHTML =
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>英文を入れると、<strong>どの語とどの語がつながるか（弧）</strong>を図で示し、<strong>再生すると今読んでいる語が光ります</strong>。色つきの箇所で音が変化します。</span></div>' +
      '<div class="field mt-4"><span class="field__label">英文を可視化</span>' +
        '<textarea class="textarea" id="lk-in" rows="2" placeholder="例：Could you check it out?">Could you check it out?</textarea></div>' +
      '<button class="btn btn--primary btn--block" id="lk-go" type="button">つながりを図で見る</button>' +
      '<div id="lk-out" class="mt-4"></div>';
    var input = document.getElementById("lk-in");
    var out = document.getElementById("lk-out");
    function run() {
      var text = (input.value || "").trim();
      if (!text) { out.innerHTML = ""; return; }
      var res = analyzeLinking(text);
      var detected = (res.rules || []).map(function (key) {
        var r = rules().find(function (x) { return x.id === key; });
        if (!r) return "";
        return '<div class="lk-detected"><span class="lk lk--' + key + '">' + EM.escapeHtml(r.name) + '</span>' +
          '<span class="lk-detected__txt">' + EM.escapeHtml(r.short || r.ja) +
          (REASONS[key] ? '<br><small class="lk-why">なぜ？ ' + EM.escapeHtml(REASONS[key]) + '</small>' : '') +
          '</span></div>';
      }).join("");
      out.innerHTML =
        '<div class="card">' +
          explainHtml(text) +
          (detected ? '<div class="mt-4"><p class="setting-row__hint" style="margin-bottom:6px">この文の<strong>色つき箇所</strong>で起きている変化と理由：</p>' + detected + '</div>'
                    : '<p class="setting-row__hint mt-4">この文では大きな音声変化は検出されませんでした。</p>') +
        '</div>';
      if (window.Linking && window.Linking.bindVisual) window.Linking.bindVisual(out);
    }
    document.getElementById("lk-go").addEventListener("click", run);
    run();
  }

  /* ---------- ルールタブ（アコーディオンで縦長解消） ---------- */
  function drawRules() {
    body().innerHTML =
      '<p class="setting-row__hint">8つの音声変化ルール。タップで開き、例文は▶で聞けます。</p>' +
      rules().map(function (r) {
        var exHtml = (r.examples || []).map(function (ex) {
          return '<div class="list-row" style="padding:8px 0">' +
            '<div class="list-row__main"><div class="list-row__title" style="font-size:15px">' + EM.escapeHtml(ex.text) + '</div>' +
            (ex.sound ? '<div class="list-row__sub">≈ ' + EM.escapeHtml(ex.sound) + '</div>' : '') +
            (ex.breakdown ? '<div class="list-row__sub">' + EM.escapeHtml(ex.breakdown) + '</div>' : '') +
            '</div>' +
            '<button class="audio-btn" type="button" data-say="' + EM.escapeHtml(ex.text) + '" aria-label="再生">▶</button></div>';
        }).join("");
        return '<details class="card mt-4 lk-rule">' +
          '<summary class="row-between" style="cursor:pointer;list-style:none">' +
            '<span class="list-row__title"><span class="lk lk--' + r.id + '">' + EM.escapeHtml(r.name) + '</span></span>' +
            '<span class="hub-row__badge">' + (r.examples || []).length + '例</span></summary>' +
          '<p class="setting-row__hint mt-4">' + EM.escapeHtml(r.ja) + '</p>' +
          (REASONS[r.id] ? '<p class="lk-breakdown mt-4">なぜ？ ' + EM.escapeHtml(REASONS[r.id]) + '</p>' : '') +
          '<div class="mt-4">' + exHtml + '</div>' +
        '</details>';
      }).join("");
    body().querySelectorAll("[data-say]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); EM.speak(b.getAttribute("data-say")); });
    });
  }

  EM.registerView("#/linking", { title: "リンキング", tab: "learn", render: render });
})();

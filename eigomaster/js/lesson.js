/* ============================================================
   統合レッスン（今日のレッスン）
   - 複数スキルを1本の流れで反復する学習エンジン。
   - 1レッスン＝12問。語彙・熟語・コロケーション・文法・並べ替え英作文
     （瞬間英作文/語順感覚/チャンク）・リスニング・リンキング聞き取り・
     発音（音声認識）を1本の流れにミックスして出題する。
   - 間違えた問題は列の最後にもう一度出る（アクティブリコール×間隔反復）。
   - 正誤は単語SRSにも反映（語彙はSRS.reviewへ）。
   - 画面は1問1画面・スクロール不要。選択肢タップで即判定し、
     下部固定パネルに正誤と解説を表示する（操作はタップ1回）。
   ============================================================ */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* ---------- コース定義 ---------- */
  var LEVELS = [
    { id: "A2", name: "A2 基礎", levels: ["A1", "A2"] },
    { id: "B1", name: "B1 実務入門", levels: ["A2", "B1"] },
    { id: "B2", name: "B2 ビジネス", levels: ["B1", "B2"] },
    { id: "C1", name: "C1 上級", levels: ["B2", "C1"] }
  ];
  var THEMES = [
    { id: "mix", icon: "🎯", name: "総合ミックス", desc: "語彙・文法・英作文・聞き取り・発音をバランスよく", cat: "basic" },
    { id: "meeting", icon: "🗣", name: "会議英語", desc: "会議の定型表現を聞く・言う・組み立てる", cat: "meeting" },
    { id: "presentation", icon: "📊", name: "プレゼン英語", desc: "発表の流れを口に出して身につける", cat: "presentation" },
    { id: "email", icon: "✉️", name: "メール英語", desc: "書き言葉の定型を音読して定着", cat: "email" },
    { id: "negotiation", icon: "🤝", name: "交渉英語", desc: "条件交渉の言い回しを反復", cat: "negotiation" },
    { id: "smalltalk", icon: "☕", name: "スモールトーク", desc: "雑談の切り出しと相づち", cat: "smalltalk" },
    { id: "pron", icon: "🔊", name: "発音集中", desc: "TH・R/L・ダークL・リンキング・リズム", cat: "th" }
  ];

  var st = { phase: "pick", level: "B2", diff: "all", theme: null, queue: [], idx: 0, ok: 0, total: 0, combo: 0, best: 0, retried: {} };

  var DIFFS = [
    { id: "all", label: "おまかせ" },
    { id: ".1", label: "やさしめ" },
    { id: ".2", label: "標準" },
    { id: ".3", label: "むずかしめ" }
  ];

  // 各教材にサブレベル(_sub)を一度だけ付与（CEFR帯ごとに難易度で3分割）
  var _annotated = false;
  function ensureAnnotated() {
    if (_annotated || !EM.levels) return;
    var d = D();
    EM.levels.annotate(d.words || [], function (w) { return w.en; });
    EM.levels.annotate(d.idioms || [], function (w) { return w.en; });
    EM.levels.annotate(d.listening || [], function (x) { return x.text; });
    EM.levels.annotate(d.trainingItems || [], function (x) { return x.text || (x.choices ? x.choices.join(" ") : ""); });
    EM.levels.annotate(d.qrtItems || [], function (x) { return x.answer; });
    _annotated = true;
  }

  /* ---------- ユーティリティ ---------- */
  function D() { return window.EigoData || {}; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a, n) { return shuffle(a).slice(0, n); }
  function lv() { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === st.level) return LEVELS[i]; return LEVELS[2]; }
  // CEFR帯に合致。難易度(st.diff)指定時は、サブレベルの末尾(.1/.2/.3)も一致を要求
  function inLevel(x) {
    if (lv().levels.indexOf(x.level) < 0) return false;
    if (st.diff === "all") return true;
    if (!x._sub) return true; // レベル未注釈の項目は通す
    return x._sub.slice(-2) === st.diff;
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); }

  /* ---------- 問題生成（複数スキルを1本に混ぜる） ---------- */
  function makeLesson(theme) {
    ensureAnnotated();
    var d = D();
    var words = (d.words || []).filter(inLevel);
    var idioms = (d.idioms || []).filter(inLevel);
    // 難易度絞り込みでプールが小さすぎる場合は、帯全体（難易度無視）にフォールバック
    if (words.length < 6) words = (d.words || []).filter(function (x) { return lv().levels.indexOf(x.level) >= 0; });
    if (idioms.length < 6) idioms = (d.idioms || []).filter(function (x) { return lv().levels.indexOf(x.level) >= 0; });
    var biz = idioms.filter(function (x) { return x.kind === "ビジネス"; });
    var coll = idioms.filter(function (x) { return x.kind === "コロケーション"; });
    var grams = (d.grammar || []).filter(function (g) { return g.blank && g.blank.explain; });
    var sents = (d.pronSentences || []);
    var themeSents = sents.filter(function (s) { return s.cat === theme.cat; });
    if (theme.id === "pron") themeSents = sents.filter(function (s) { return ["th", "rl", "darkl", "linking", "stress"].indexOf(s.cat) >= 0; });
    if (themeSents.length < 4) themeSents = sents.filter(function (s) { return s.cat === "basic"; });
    var linkPool = [];
    (d.linkingRules || []).forEach(function (r) { (r.examples || []).forEach(function (ex) { linkPool.push({ text: ex.text, sound: ex.sound || "", breakdown: ex.breakdown || "", rule: r.name }); }); });

    var q = [];
    // 語彙（英→日 / 日→英）＋ 聞き取り語彙
    pick(words, 3).forEach(function (w, i) {
      var wrong = pick(words.filter(function (x) { return x.ja !== w.ja; }), 3);
      if (i === 2) q.push({ type: "listen_word", w: w, choices: shuffle([w].concat(wrong)) });
      else if (i === 1) q.push({ type: "word_je", w: w, choices: shuffle([w].concat(wrong)) });
      else q.push({ type: "word_ej", w: w, choices: shuffle([w].concat(wrong)) });
    });
    // 熟語/ビジネス定型 ＋ コロケーション
    var ipool = theme.id === "mix" ? idioms : (biz.length >= 8 ? biz : idioms);
    pick(ipool, 2).forEach(function (x) {
      q.push({ type: "idiom_ej", w: x, choices: shuffle([x].concat(pick(ipool.filter(function (y) { return y.ja !== x.ja; }), 3))) });
    });
    if (coll.length >= 4) {
      var c = pick(coll, 1)[0];
      q.push({ type: "idiom_ej", w: c, choices: shuffle([c].concat(pick(coll.filter(function (y) { return y.ja !== c.ja; }), 3))) });
    }
    // 文法（穴埋め＋誤答解説）
    pick(grams, 2).forEach(function (g) { q.push({ type: "gram", g: g, choices: shuffle(g.blank.options.slice()) }); });
    // 並べ替え英作文（瞬間英作文・語順感覚・チャンク）
    pick(grams.filter(function (g) { return g.reorder && g.reorder.answer; }), 2).forEach(function (g) {
      q.push({ type: "reorder", ja: g.reorder.ja, answer: g.reorder.answer });
    });
    // リンキング聞き取り（音声変化・リダクション）
    if (linkPool.length >= 4) {
      var L = pick(linkPool, 1)[0];
      q.push({ type: "linking", q: L, choices: shuffle([L].concat(pick(linkPool.filter(function (y) { return y.text !== L.text; }), 3))) });
    }
    // 発音・スピーキング（テーマの文を声に出す）
    pick(themeSents, 1).forEach(function (s) { q.push({ type: "speak", s: s }); });

    // ディクテーション（聞いて入力：アクティブリコール）
    var dict = (d.listening || []).filter(function (x) { return x.type === "dictation" && inLevel(x); });
    if (dict.length) { var dq = pick(dict, 1)[0]; q.push({ type: "dictation", text: dq.text, ja: dq.ja }); }

    // 高次トレーニング（要約・パラフレーズ・精読・質問力・即答力・多読）
    // theme=pron 以外で2問混ぜる。CEFRに合うものを優先。
    if (theme.id !== "pron") {
      var tr = (d.trainingItems || []).filter(inLevel);
      if (tr.length < 2) tr = (d.trainingItems || []);
      pick(tr, 2).forEach(function (it) {
        q.push({ type: "training", t: it, choices: shuffle(it.choices.slice()) });
      });
    }

    // 発音系スキル：アクセント／イントネーション／リズム（pronテーマは厚め、他は1問）
    var nPron = theme.id === "pron" ? 3 : 1;
    var stressP = (d.stressItems || []).filter(inLevel); if (stressP.length < nPron) stressP = (d.stressItems || []);
    pick(stressP, nPron).forEach(function (it) {
      q.push({ type: "stress", t: it, choices: it.syl.map(function (s, i) { return i; }) });
    });
    if (theme.id === "pron") {
      var intoP = (d.intonationItems || []); pick(intoP, 1).forEach(function (it) { q.push({ type: "tchoice", kind: "intonation", t: it, choices: shuffle(it.choices.slice()) }); });
      var rhyP = (d.rhythmItems || []); pick(rhyP, 1).forEach(function (it) { q.push({ type: "tchoice", kind: "rhythm", t: it, choices: shuffle(it.choices.slice()) }); });
    }

    // 瞬間英作文（和文→英文ゼロ産出）
    var qrtP = (d.qrtItems || []).filter(inLevel); if (!qrtP.length) qrtP = (d.qrtItems || []);
    pick(qrtP, 1).forEach(function (it) { q.push({ type: "qrt", t: it }); });

    // チャンク・英語思考・異文化・ディスカッション・コロケーション（mix寄りで1〜2問）
    var extra = [];
    (d.chunkItems || []).filter(inLevel).forEach(function (it) { extra.push({ type: "tchoice", kind: "chunk", t: it }); });
    (d.thinkingItems || []).forEach(function (it) { extra.push({ type: "tchoice", kind: "thinking", t: it }); });
    (d.cultureItems || []).forEach(function (it) { extra.push({ type: "tchoice", kind: "culture", t: it }); });
    (d.discussionItems || []).forEach(function (it) { extra.push({ type: "tchoice", kind: "discussion", t: it }); });
    (d.collocationItems || []).filter(inLevel).forEach(function (it) { extra.push({ type: "tchoice", kind: "collocation", t: it }); });
    pick(extra, theme.id === "pron" ? 1 : 2).forEach(function (it) {
      it.choices = shuffle(it.t.choices.slice());
      q.push(it);
    });

    return shuffle(q).slice(0, 14);
  }

  /* ---------- 画面 ---------- */
  function render() { st.phase = "pick"; return { html: '<section id="lesson-root" class="view-enter"></section>', onMount: drawPick }; }
  function root() { return document.getElementById("lesson-root"); }

  function drawPick() {
    st.phase = "pick";
    var lvChips = LEVELS.map(function (l) {
      return '<button class="chip' + (l.id === st.level ? " chip--on" : "") + '" data-lv="' + l.id + '" type="button">' + l.name + "</button>";
    }).join("");
    var rows = THEMES.map(function (t, i) {
      return '<button class="hub-row" data-th="' + i + '" type="button" style="text-align:left;width:100%">' +
        '<span class="hub-row__icon" style="font-size:22px">' + t.icon + '</span>' +
        '<span class="hub-row__main"><span class="hub-row__title">' + t.name + '</span>' +
        '<span class="hub-row__desc">' + t.desc + '</span></span>' +
        '<span class="hub-row__arrow">›</span></button>';
    }).join("");
    var diffChips = DIFFS.map(function (dd) {
      return '<button class="chip' + (dd.id === st.diff ? " chip--on" : "") + '" data-diff="' + dd.id + '" type="button">' + dd.label + "</button>";
    }).join("");
    root().innerHTML =
      '<p class="home-hero__eyebrow" style="color:var(--c-ink-soft)">LESSON · 今日のレッスン</p>' +
      '<div class="notice notice--info"><span class="notice__icon">i</span><span>1レッスン約12問。語彙・文法・英作文・リスニング・発音・リンキングに加え、<strong>ディクテーション・要約・言い換え・精読・質問力・即答力・多読</strong>まで<strong>ひとつの流れ</strong>で反復。間違いは最後にもう一度出ます。</span></div>' +
      '<p class="section-title mt-5">レベル（CEFR）</p>' +
      '<div class="chip-group">' + lvChips + '</div>' +
      '<p class="section-title mt-5">難易度（レベル帯の中で細分化）</p>' +
      '<div class="chip-group">' + diffChips + '</div>' +
      '<p class="section-title mt-5">コースを選ぶ</p>' +
      '<div class="hub-list">' + rows + '</div>';
    root().querySelectorAll("[data-lv]").forEach(function (b) {
      b.addEventListener("click", function () { st.level = b.getAttribute("data-lv"); drawPick(); });
    });
    root().querySelectorAll("[data-diff]").forEach(function (b) {
      b.addEventListener("click", function () { st.diff = b.getAttribute("data-diff"); drawPick(); });
    });
    root().querySelectorAll("[data-th]").forEach(function (b) {
      b.addEventListener("click", function () { startLesson(THEMES[parseInt(b.getAttribute("data-th"), 10)]); });
    });
  }

  function startLesson(theme) {
    st.theme = theme;
    st.queue = makeLesson(theme);
    if (!st.queue.length) { EM.showToast("教材の読み込みに失敗しました", true); return; }
    st.idx = 0; st.ok = 0; st.total = st.queue.length; st.combo = 0; st.best = 0; st.retried = {};
    st.phase = "quiz";
    drawQ();
  }

  function barHtml() {
    var done = Math.min(st.idx, st.total);
    var pct = Math.round(done / st.total * 100);
    return '<div class="lesson__top">' +
      '<button class="lesson__quit" id="ls-quit" type="button" aria-label="やめる">✕</button>' +
      '<div class="lesson__bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="lesson__combo">' + (st.combo > 1 ? "🔥" + st.combo : "") + '</span></div>';
  }

  function drawQ() {
    if (st.idx >= st.queue.length) { drawResult(); return; }
    var item = st.queue[st.idx];
    var body = "";
    if (item.type === "word_ej" || item.type === "idiom_ej") {
      body = qHead("この意味は？") +
        '<div class="lesson__prompt"><button class="audio-btn" id="ls-say" type="button">▶</button>' +
        '<span class="lesson__big">' + EM.escapeHtml(item.w.en) + '</span></div>' +
        choices(item.choices.map(function (c) { return c.ja; }));
    } else if (item.type === "word_je") {
      body = qHead("英語で言うと？") +
        '<div class="lesson__prompt"><span class="lesson__big">' + EM.escapeHtml(item.w.ja) + '</span></div>' +
        choices(item.choices.map(function (c) { return c.en; }));
    } else if (item.type === "listen_word") {
      body = qHead("聞こえた単語の意味は？") +
        '<div class="lesson__prompt center"><button class="btn btn--primary" id="ls-say" type="button">▶ もう一度聞く</button></div>' +
        choices(item.choices.map(function (c) { return c.ja; }));
    } else if (item.type === "gram") {
      var g = item.g;
      body = qHead("空所に入るのは？（" + EM.escapeHtml(g.title) + "）") +
        '<div class="lesson__prompt"><span class="lesson__sentence">' + EM.escapeHtml(g.blank.before) + '<u class="lesson__blank">　　　</u>' + EM.escapeHtml(g.blank.after) + '</span>' +
        '<p class="lesson__ja">' + EM.escapeHtml(g.blank.ja) + '</p></div>' +
        choices(item.choices);
    } else if (item.type === "reorder") {
      body = qHead("日本語に合うよう英文を組み立てよう") +
        '<div class="lesson__prompt"><p class="lesson__ja" style="font-size:16px">' + EM.escapeHtml(item.ja) + '</p></div>' +
        '<div class="lesson__build" id="ls-build" aria-label="あなたの答え"></div>' +
        '<div class="lesson__bank" id="ls-bank"></div>';
    } else if (item.type === "linking") {
      body = qHead("音声変化を聞き取ろう：読まれた文は？") +
        '<div class="lesson__prompt center"><button class="btn btn--primary" id="ls-say" type="button">▶ もう一度聞く</button> ' +
        '<button class="btn btn--ghost" id="ls-slow" type="button">🐢</button></div>' +
        choices(item.choices.map(function (c) { return c.text; }));
    } else if (item.type === "speak") {
      body = qHead("声に出して言ってみよう（発音）") +
        '<div class="lesson__prompt"><span class="lesson__sentence">' + EM.escapeHtml(item.s.en) + '</span>' +
        '<p class="lesson__ja">' + EM.escapeHtml(item.s.ja) + '</p>' +
        '<p class="setting-row__hint mt-4">コツ：' + EM.escapeHtml(item.s.tip || "") + '</p></div>' +
        '<div class="center mt-4"><button class="btn btn--ghost" id="ls-say" type="button">▶ お手本</button></div>';
    } else if (item.type === "dictation") {
      body = qHead("聞こえた英文を入力しよう（ディクテーション）") +
        '<div class="lesson__prompt center"><button class="btn btn--primary" id="ls-say" type="button">▶ もう一度聞く</button> ' +
        '<button class="btn btn--ghost" id="ls-slowd" type="button">🐢</button>' +
        '<p class="lesson__ja mt-4">' + EM.escapeHtml(item.ja || "") + '</p></div>' +
        '<input class="input mt-4" id="ls-dict" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="聞こえた英語を入力" />';
    } else if (item.type === "training") {
      var t = item.t;
      var TL = { summary: "要約：最も適切なまとめは？", paraphrase: "言い換え：ほぼ同じ意味は？",
        intensive: "精読：正しい解釈は？", question: "質問力：最も適切な質問は？",
        response: "即答：自然な応答は？", extensive: "多読：内容に合うものは？" };
      body = qHead(TL[t.type] || "問題") +
        '<div class="lesson__prompt"><p class="lesson__sentence" style="font-size:16px">' + EM.escapeHtml(t.text) + '</p>' +
        (t.q ? '<p class="lesson__ja mt-4">' + EM.escapeHtml(t.q) + '</p>' : '') + '</div>' +
        choices(item.choices);
    } else if (item.type === "stress") {
      var sw = item.t;
      body = qHead("アクセント：強く読む音節はどれ？") +
        '<div class="lesson__prompt"><div class="row-between"><span class="lesson__big">' + EM.escapeHtml((sw.say || sw.word)) + '</span>' +
        '<button class="audio-btn" id="ls-say" type="button">▶</button></div>' +
        '<p class="lesson__ja">' + EM.escapeHtml(sw.ja || "") + '</p></div>' +
        '<div class="lesson__choices">' + sw.syl.map(function (s, i) {
          return '<button class="lesson__choice center" data-c="' + i + '" type="button" style="font-size:18px">' + EM.escapeHtml(s) + '</button>';
        }).join("") + '</div>';
    } else if (item.type === "tchoice") {
      var KL = { intonation: "イントネーション", rhythm: "リズム", chunk: "チャンク（意味の区切り）",
        thinking: "英語思考", culture: "異文化コミュニケーション", discussion: "ディスカッション", collocation: "コロケーション" };
      var tt = item.t;
      body = qHead(KL[item.kind] || "問題") +
        '<div class="lesson__prompt"><p class="lesson__sentence" style="font-size:16px">' + EM.escapeHtml(tt.text) + '</p>' +
        (tt.q ? '<p class="lesson__ja mt-4">' + EM.escapeHtml(tt.q) + '</p>' : '') +
        ((item.kind === "intonation" || item.kind === "rhythm") ? '<div class="center mt-4"><button class="audio-btn" id="ls-say" type="button">▶ お手本</button></div>' : '') +
        '</div>' +
        choices(item.choices);
    } else if (item.type === "qrt") {
      body = qHead("瞬間英作文：日本語を英語にしよう") +
        '<div class="lesson__prompt"><p class="lesson__big" style="font-size:20px">' + EM.escapeHtml(item.t.ja) + '</p>' +
        '<p class="setting-row__hint mt-4">頭の中で英文を作ってから入力。多少の表現違いはOK。</p></div>' +
        '<input class="input mt-4" id="ls-qrt" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="英語で入力" />';
    }
    root().innerHTML = '<div class="lesson">' + barHtml() +
      '<div class="lesson__body">' + body + '</div>' +
      '<div class="lesson__foot" id="ls-foot">' + footFor(item) + '</div></div>';
    bindQ(item);
  }

  function qHead(t) { return '<p class="lesson__q">' + t + '</p>'; }
  function choices(arr) {
    return '<div class="lesson__choices">' + arr.map(function (c, i) {
      return '<button class="lesson__choice" data-c="' + i + '" type="button">' + EM.escapeHtml(c) + '</button>';
    }).join("") + '</div>';
  }
  function footFor(item) {
    if (item.type === "reorder") return '<button class="btn btn--primary btn--block" id="ls-check" type="button" disabled>確認する</button>';
    if (item.type === "dictation") return '<button class="btn btn--primary btn--block" id="ls-dcheck" type="button">確認する</button>';
    if (item.type === "qrt") return '<button class="btn btn--primary btn--block" id="ls-qcheck" type="button">確認する</button>';
    if (item.type === "speak") {
      return SR
        ? '<button class="btn btn--primary btn--block" id="ls-mic" type="button">🎤 録音して判定する</button>'
        : '<div class="grade-row" style="grid-template-columns:1fr 1fr"><button class="btn btn--ghost" id="ls-skip" type="button">むずかしい</button><button class="btn btn--primary" id="ls-said" type="button">言えた！</button></div>';
    }
    return '<p class="lesson__hint">選択肢をタップすると判定します</p>';
  }

  function bindQ(item) {
    document.getElementById("ls-quit").addEventListener("click", function () { EM.stopSpeak(); drawPick(); });
    var say = document.getElementById("ls-say");
    if (say) {
      var text = item.w ? item.w.en : (item.q ? item.q.text : (item.s ? item.s.en : (item.text ? item.text :
        (item.type === "stress" ? (item.t.say || item.t.word) : (item.type === "tchoice" ? item.t.text : "")))));
      say.addEventListener("click", function () { EM.speak(text); });
      if (item.type === "listen_word" || item.type === "linking" || item.type === "dictation") EM.speak(text);
    }
    var slow = document.getElementById("ls-slow");
    if (slow) slow.addEventListener("click", function () { EM.speak(item.q.text, { rate: 0.6 }); });
    var slowd = document.getElementById("ls-slowd");
    if (slowd) slowd.addEventListener("click", function () { EM.speak(item.text, { rate: 0.6 }); });

    if (item.type === "reorder") return bindReorder(item);
    if (item.type === "speak") return bindSpeak(item);
    if (item.type === "dictation") return bindDictation(item);
    if (item.type === "training") return bindTraining(item);
    if (item.type === "stress") return bindStress(item);
    if (item.type === "tchoice") return bindTchoice(item);
    if (item.type === "qrt") return bindQrt(item);

    root().querySelectorAll(".lesson__choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-c"), 10);
        var ok, fb = "";
        if (item.type === "gram") {
          ok = item.choices[i] === item.g.blank.answer;
          var ex = item.g.blank.explain;
          fb = "<strong>" + EM.escapeHtml(item.g.blank.answer) + "</strong>：" + EM.escapeHtml(ex.why);
          if (!ok && ex.opts && ex.opts[item.choices[i]]) fb += "<br>あなたの選択：" + EM.escapeHtml(ex.opts[item.choices[i]]);
        } else if (item.type === "linking") {
          ok = item.choices[i].text === item.q.text;
          fb = "<strong>" + EM.escapeHtml(item.q.text) + "</strong>" + (item.q.sound ? " ≈ " + EM.escapeHtml(item.q.sound) : "") +
            (item.q.breakdown ? "<br>" + EM.escapeHtml(item.q.breakdown) : "") + "<br>変化：" + EM.escapeHtml(item.q.rule);
        } else {
          ok = item.choices[i].id === item.w.id;
          fb = "<strong>" + EM.escapeHtml(item.w.en) + "</strong> ＝ " + EM.escapeHtml(item.w.ja);
          if (window.SRS && (item.type === "word_ej" || item.type === "word_je" || item.type === "listen_word")) {
            try { SRS.review(item.w.id, ok ? "good" : "again"); } catch (e) {}
          }
        }
        b.classList.add(ok ? "is-right" : "is-wrong");
        if (!ok) markRight(item);
        judge(ok, fb, item);
      }, { once: true });
    });
  }
  function markRight(item) {
    root().querySelectorAll(".lesson__choice").forEach(function (b) {
      var i = parseInt(b.getAttribute("data-c"), 10);
      var good = item.type === "gram" ? item.choices[i] === item.g.blank.answer :
        item.type === "linking" ? item.choices[i].text === item.q.text : item.choices[i].id === item.w.id;
      if (good) b.classList.add("is-right");
      b.disabled = true;
    });
  }

  /* 高次トレーニング（4択：先頭が正解。choicesはシャッフル済みなので正解判定はテキスト一致） */
  function bindTraining(item) {
    var correct = item.t.choices[0];
    root().querySelectorAll(".lesson__choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-c"), 10);
        var ok = item.choices[i] === correct;
        root().querySelectorAll(".lesson__choice").forEach(function (x) {
          var j = parseInt(x.getAttribute("data-c"), 10);
          if (item.choices[j] === correct) x.classList.add("is-right");
          else if (x === b) x.classList.add("is-wrong");
          x.disabled = true;
        });
        var fb = "<strong>" + EM.escapeHtml(correct) + "</strong>" + (item.t.explain ? "<br>" + EM.escapeHtml(item.t.explain) : "");
        judge(ok, fb, item);
      }, { once: true });
    });
  }

  /* ディクテーション（聞いて入力） */
  function bindDictation(item) {
    var input = document.getElementById("ls-dict");
    if (input) input.focus();
    function norm2(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim(); }
    document.getElementById("ls-dcheck").addEventListener("click", function () {
      var ans = (input.value || "").trim();
      var ok = norm2(ans) === norm2(item.text);
      var fb = "<strong>" + EM.escapeHtml(item.text) + "</strong>" + (item.ja ? "<br>" + EM.escapeHtml(item.ja) : "");
      if (!ok && ans) fb = "あなた：" + EM.escapeHtml(ans) + "<br>" + fb;
      input.disabled = true;
      judge(ok, fb, item);
    });
  }

  /* アクセント（強い音節をindexで判定） */
  function bindStress(item) {
    var ans = item.t.ans;
    root().querySelectorAll(".lesson__choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-c"), 10);
        var ok = i === ans;
        root().querySelectorAll(".lesson__choice").forEach(function (x) {
          var j = parseInt(x.getAttribute("data-c"), 10);
          if (j === ans) x.classList.add("is-right");
          else if (x === b) x.classList.add("is-wrong");
          x.disabled = true;
        });
        var stressed = item.t.syl.map(function (s, k) { return k === ans ? s.toUpperCase() : s.toLowerCase(); }).join("-");
        judge(ok, "<strong>" + EM.escapeHtml(stressed) + "</strong><br>強く長く読む音節は「" + EM.escapeHtml(item.t.syl[ans]) + "」です。", item);
      }, { once: true });
    });
  }

  /* 選択式トレーニング全般（先頭が正解） */
  function bindTchoice(item) {
    var correct = item.t.choices[0];
    root().querySelectorAll(".lesson__choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-c"), 10);
        var ok = item.choices[i] === correct;
        root().querySelectorAll(".lesson__choice").forEach(function (x) {
          var j = parseInt(x.getAttribute("data-c"), 10);
          if (item.choices[j] === correct) x.classList.add("is-right");
          else if (x === b) x.classList.add("is-wrong");
          x.disabled = true;
        });
        judge(ok, "<strong>" + EM.escapeHtml(correct) + "</strong>" + (item.t.explain ? "<br>" + EM.escapeHtml(item.t.explain) : ""), item);
      }, { once: true });
    });
  }

  /* 瞬間英作文（和文→英文ゼロ産出。模範＋別解と照合） */
  function bindQrt(item) {
    var input = document.getElementById("ls-qrt");
    if (input) input.focus();
    function norm3(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim(); }
    document.getElementById("ls-qcheck").addEventListener("click", function () {
      var ans = (input.value || "").trim();
      var cands = [item.t.answer].concat(item.t.alts || []);
      var ok = cands.some(function (c) { return norm3(c) === norm3(ans); });
      var fb = "模範解答：<strong>" + EM.escapeHtml(item.t.answer) + "</strong>" +
        ((item.t.alts && item.t.alts.length) ? "<br>別解：" + EM.escapeHtml(item.t.alts.join(" / ")) : "");
      if (!ok && ans) fb = "あなた：" + EM.escapeHtml(ans) + "<br>" + fb + "<br><span class=\"setting-row__hint\">語順や語彙が違っても意味が同じなら自分でOKと判断してOKです。</span>";
      input.disabled = true;
      EM.speak(item.t.answer);
      judge(ok, fb, item);
    });
  }

  /* 並べ替え英作文 */
  function bindReorder(item) {
    var bank = document.getElementById("ls-bank");
    var build = document.getElementById("ls-build");
    var check = document.getElementById("ls-check");
    var tokens = shuffle(item.answer.replace(/[.?!]$/, "").split(/\s+/));
    var picked = [];
    function paint() {
      build.innerHTML = picked.map(function (t, i) { return '<button class="lesson__token" data-b="' + i + '" type="button">' + EM.escapeHtml(t) + '</button>'; }).join("") || '<span class="lesson__hint">下の単語をタップして並べる</span>';
      bank.innerHTML = tokens.map(function (t, i) { return '<button class="lesson__token lesson__token--bank" data-k="' + i + '" type="button">' + EM.escapeHtml(t) + '</button>'; }).join("");
      check.disabled = tokens.length !== 0;
      build.querySelectorAll("[data-b]").forEach(function (b) {
        b.addEventListener("click", function () { tokens.push(picked.splice(parseInt(b.getAttribute("data-b"), 10), 1)[0]); paint(); });
      });
      bank.querySelectorAll("[data-k]").forEach(function (b) {
        b.addEventListener("click", function () { picked.push(tokens.splice(parseInt(b.getAttribute("data-k"), 10), 1)[0]); paint(); });
      });
    }
    paint();
    check.addEventListener("click", function () {
      var ok = norm(picked.join(" ")) === norm(item.answer);
      judge(ok, "<strong>" + EM.escapeHtml(item.answer) + "</strong><br>" + EM.escapeHtml(item.ja), item);
    });
  }

  /* 発音（音声認識） */
  function bindSpeak(item) {
    var mic = document.getElementById("ls-mic");
    if (!mic) {
      document.getElementById("ls-said").addEventListener("click", function () { judge(true, "その調子！もう一度お手本と聞き比べてみよう。", item); });
      document.getElementById("ls-skip").addEventListener("click", function () { judge(false, "コツ：" + EM.escapeHtml(item.s.tip || "ゆっくり区切って練習しよう"), item); });
      return;
    }
    mic.addEventListener("click", function () {
      EM.stopSpeak();
      var rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
      mic.disabled = true; mic.textContent = "聞き取り中…";
      rec.onresult = function (e) {
        var said = e.results[0][0].transcript;
        var a = norm(item.s.en).split(" "), b = norm(said).split(" ");
        var hit = 0; a.forEach(function (w) { if (b.indexOf(w) >= 0) hit++; });
        var rate = Math.round(hit / a.length * 100);
        judge(rate >= 60, "認識：" + EM.escapeHtml(said) + '<br>一致率 <strong>' + rate + '%</strong>' + (rate >= 60 ? "（よく言えています）" : "。コツ：" + EM.escapeHtml(item.s.tip || "")), item);
      };
      rec.onerror = function () { mic.disabled = false; mic.textContent = "🎤 録音して判定する"; EM.showToast("マイクを利用できませんでした", true); };
      rec.start();
    });
  }

  /* ---------- 判定 → 下部固定パネル ---------- */
  // 問題から「読み上げ＆ハイライト対象の英文」を取り出す（無ければ空）
  function sayTextOf(item) {
    if (!item) return "";
    if (item.type === "dictation") return item.text || "";
    if (item.type === "qrt") return item.answer || "";
    if (item.type === "linking") return (item.s && item.s.en) || item.text || "";
    if (item.type === "reorder") return item.target || "";
    if (item.type === "listen_word" || item.type === "word_ej" || item.type === "word_je") return (item.w && item.w.en) || "";
    if (item.type === "speak") return (item.q && item.q.text) || "";
    if (item.type === "gram") return item.answerSentence || "";
    return "";
  }

  function judge(ok, fbHtml, item) {
    EM.stopSpeak();
    if (ok) { st.ok++; st.combo++; st.best = Math.max(st.best, st.combo); }
    else {
      st.combo = 0;
      var key = st.idx + ":" + item.type;
      if (!st.retried[key]) { st.retried[key] = 1; st.queue.push(item); } // 間違いは最後にもう一度
    }
    var sayText = sayTextOf(item);
    var foot = document.getElementById("ls-foot");
    foot.className = "lesson__foot " + (ok ? "lesson__foot--ok" : "lesson__foot--ng");
    foot.innerHTML =
      '<div class="lesson__fb"><p class="lesson__fb-head">' + (ok ? "⭕ 正解！" : "❌ もう一度最後に出ます") + '</p>' +
      '<p class="lesson__fb-body">' + fbHtml + '</p>' +
      (sayText ? '<div class="ls-fb-chip" id="ls-fb-chip"></div>' : "") +
      (sayText && window.Linking && window.Linking.explainHtml && /\s/.test(sayText.trim()) ? '<details class="ls-fb-sound"><summary>音声変化を見る</summary>' + window.Linking.explainHtml(sayText) + '</details>' : "") +
      '</div>' +
      '<button class="btn ' + (ok ? "btn--primary" : "btn--danger") + ' btn--block" id="ls-next" type="button">つづける</button>';
    if (sayText && EM.audioChip) EM.audioChip(document.getElementById("ls-fb-chip"), sayText);
    document.getElementById("ls-next").addEventListener("click", function () { st.idx++; drawQ(); });
  }

  function drawResult() {
    var pct = Math.round(st.ok / Math.max(1, st.queue.length) * 100);
    try { Storage.recordStudy(3); Storage.incTotals({ sessions: 1 }); } catch (e) {}
    root().innerHTML = '<div class="lesson"><div class="lesson__body center" style="justify-content:center">' +
      '<p style="font-size:56px">' + (pct >= 80 ? "🏆" : pct >= 60 ? "💪" : "🌱") + '</p>' +
      '<p class="lesson__big">レッスン完了！</p>' +
      '<div class="dash-stats mt-5" style="grid-template-columns:repeat(3,1fr);width:100%">' +
      '<div class="dash-chip"><span class="dash-chip__value">' + st.ok + "/" + st.queue.length + '</span><span class="dash-chip__label">正解</span></div>' +
      '<div class="dash-chip"><span class="dash-chip__value">' + pct + '%</span><span class="dash-chip__label">正答率</span></div>' +
      '<div class="dash-chip"><span class="dash-chip__value">🔥' + st.best + '</span><span class="dash-chip__label">最大コンボ</span></div></div></div>' +
      '<div class="lesson__foot"><div class="grade-row" style="grid-template-columns:1fr 1fr">' +
      '<button class="btn btn--ghost" id="ls-home" type="button">コース選択へ</button>' +
      '<button class="btn btn--primary" id="ls-again" type="button">もう1レッスン</button></div></div></div>';
    document.getElementById("ls-home").addEventListener("click", drawPick);
    document.getElementById("ls-again").addEventListener("click", function () { startLesson(st.theme); });
  }

  EM.registerView("#/lesson", { title: "今日のレッスン", tab: "learn", render: render });
})();

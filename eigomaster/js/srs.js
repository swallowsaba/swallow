/* ============================================================
   srs.js — 間隔反復（SM-2 簡易版）
   単語ごとに { ease, interval(日), reps, due("YYYY-MM-DD") } を Storage.srs に保持。
   採点は again / hard / good / easy の4段階。
   window.SRS として公開する。
   ============================================================ */
(function () {
  "use strict";

  var EASE_MIN = 1.3;       // 易しさ係数の下限
  var EASE_START = 2.5;     // 初期係数
  var EASE_DOWN_AGAIN = 0.2;
  var EASE_DOWN_HARD = 0.15;
  var EASE_UP_EASY = 0.15;

  function todayISO() { return Storage.todayISO(); }

  // "YYYY-MM-DD" に n 日足した日付
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function defaultCard() {
    return { ease: EASE_START, interval: 0, reps: 0, due: todayISO() };
  }

  // カード取得（無ければ null）
  function getCard(id) {
    var srs = Storage.getState().srs || {};
    return srs[id] || null;
  }

  // 期限到来（未学習＝新規も対象）か
  function isDue(id) {
    var c = getCard(id);
    if (!c) return true;
    return c.due <= todayISO();
  }

  // 採点して更新し、新しいカードを返す
  function review(id, grade) {
    var card = getCard(id) || defaultCard();
    var today = todayISO();

    switch (grade) {
      case "again":
        card.reps = 0;
        card.interval = 0;
        card.ease = Math.max(EASE_MIN, card.ease - EASE_DOWN_AGAIN);
        card.due = today; // 同セッション内で再出題
        break;
      case "hard":
        card.ease = Math.max(EASE_MIN, card.ease - EASE_DOWN_HARD);
        card.interval = Math.max(1, Math.round((card.interval || 1) * 1.2));
        card.reps = card.reps + 1;
        card.due = addDays(today, card.interval);
        break;
      case "good":
        card.reps = card.reps + 1;
        if (card.reps === 1) card.interval = 1;
        else if (card.reps === 2) card.interval = 3;
        else card.interval = Math.round(card.interval * card.ease);
        card.due = addDays(today, card.interval);
        break;
      case "easy":
        card.reps = card.reps + 1;
        card.ease = card.ease + EASE_UP_EASY;
        if (card.reps === 1) card.interval = 2;
        else card.interval = Math.round((card.interval || 2) * card.ease * 1.3);
        card.due = addDays(today, card.interval);
        break;
      default:
        // 未知の採点は good 相当
        card.reps = card.reps + 1;
        card.interval = Math.max(1, card.interval);
        card.due = addDays(today, card.interval);
    }

    Storage.update(function (s) {
      if (!s.srs) s.srs = {};
      s.srs[id] = card;
      return s;
    });
    return card;
  }

  // 配列をシャッフル（Fisher-Yates）。元配列は壊さない。
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 学習セッションを組む：期限到来の既習語を優先し、新規語で埋める（最大 size 語）
  // 復習(due)は期限順を保つ（学習効果のため）。新規(fresh)は毎回シャッフルし、
  // 同じ問題が同じ順序で続くのを防ぐ（飽き防止・満遍ない学習）。
  function buildSession(words, size) {
    var due = [];
    var fresh = [];
    words.forEach(function (w) {
      var c = getCard(w.id);
      if (!c) fresh.push(w);
      else if (c.due <= todayISO()) due.push({ w: w, due: c.due });
    });
    // 既習の復習：期限が早い順（同期限内はシャッフルして偏りを無くす）
    due.sort(function (a, b) {
      if (a.due < b.due) return -1;
      if (a.due > b.due) return 1;
      return Math.random() - 0.5;
    });
    // 新規語はシャッフルして毎回違う出会いに
    var ordered = due.map(function (x) { return x.w; }).concat(shuffle(fresh));
    return ordered.slice(0, size);
  }

  window.SRS = {
    GRADES: ["again", "hard", "good", "easy"],
    getCard: getCard,
    isDue: isDue,
    review: review,
    buildSession: buildSession
  };
})();

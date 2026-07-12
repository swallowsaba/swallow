/* ============================================================
   音声プレイヤー（シークバー＋読み上げ位置ハイライト）v2
   - 英語とカタカナ（聞こえ方）を2段で表示し、再生中の語を両方ハイライト。
   - シークバーは再生の進行に合わせてアニメで動く（端末/オンライン/カタカナ全対応）。
   - つまみを動かす・語をタップ → その語から再生。再生/一時停止/速度切替。
   - boundary が来ない環境（英語ボイス0のPC・カタカナ近似）でも、
     語ごとの推定時間を積み上げてシーク・ハイライトを必ず進める。
   ============================================================ */
(function () {
  "use strict";

  function tokenize(text) {
    var toks = [], re = /(\S+)(\s*)/g, m;
    while ((m = re.exec(text)) !== null) toks.push({ word: m[1], start: m.index, end: m.index + m[1].length });
    return toks;
  }
  function tokenAt(toks, ci) {
    for (var i = 0; i < toks.length; i++) {
      if (ci >= toks[i].start && ci < toks[i].end) return i;
      if (ci < toks[i].start) return i;
    }
    return toks.length - 1;
  }
  function weightOf(word) {
    var syl = (word.replace(/[^a-zA-Z]/g, "").match(/[aeiouy]+/gi) || []).length || 1;
    var w = 0.18 + syl * 0.13; // 秒（基準1.0×）
    // 【v92】実音声は句読点で息継ぎするため、推定にも同じポーズを織り込む
    if (/[.!?;:]$/.test(word)) w += 0.30;
    else if (/,$/.test(word)) w += 0.15;
    return w;
  }

  EM.audioPlayer = function (container, text, opts) {
    opts = opts || {};
    text = String(text || "").trim();
    if (!container || !text) return;
    var toks = tokenize(text);
    var kana = toks.map(function (t) {
      try { return (window.Katakana && window.Katakana.reduceTokenKana) ? window.Katakana.reduceTokenKana(t.word, false)
                 : (window.Katakana && window.Katakana.wordToKatakana) ? window.Katakana.wordToKatakana(t.word) : ""; }
      catch (e) { return ""; }
    });
    var weights = toks.map(function (t) { return weightOf(t.word); });

    container.innerHTML =
      '<div class="aplayer">' +
        '<p class="aplayer__text" id="ap-en">' +
          toks.map(function (t, i) {
            return '<span class="aplayer__w" data-i="' + i + '">' + EM.escapeHtml(t.word) + '</span>';
          }).join(" ") +
        '</p>' +
        '<p class="aplayer__kana" id="ap-kana">≈ ' +
          toks.map(function (t, i) {
            return '<span class="aplayer__k" data-i="' + i + '">' + EM.escapeHtml(kana[i] || "・") + '</span>';
          }).join(" ") +
        '</p>' +
        '<div class="aplayer__controls">' +
          '<button class="aplayer__play" id="ap-play" type="button" aria-label="再生">▶</button>' +
          '<div class="aplayer__track" id="ap-track">' +
            '<div class="aplayer__fill" id="ap-fill"></div>' +
            '<div class="aplayer__thumb" id="ap-thumb"></div>' +
          '</div>' +
          '<button class="aplayer__rate" id="ap-rate" type="button" aria-label="速度">1.0×</button>' +
        '</div>' +
      '</div>';

    var enEls = container.querySelectorAll(".aplayer__w");
    var kaEls = container.querySelectorAll(".aplayer__k");
    var playBtn = container.querySelector("#ap-play");
    var rateBtn = container.querySelector("#ap-rate");
    var track = container.querySelector("#ap-track");
    var fill = container.querySelector("#ap-fill");
    var thumb = container.querySelector("#ap-thumb");

    var RATES = [1.0, 0.75, 0.5, 1.25];
    var st = { playing: false, idx: 0, rate: 1.0, raf: null, t0: 0, startIdx: 0, cumStart: 0, lastB: 0, boundaryActive: false };

    var cum = [0];
    for (var i = 0; i < weights.length; i++) cum.push(cum[i] + weights[i]);
    var totalDur = cum[cum.length - 1];

    function setBar(ratio) {
      ratio = Math.max(0, Math.min(1, ratio));
      fill.style.width = (ratio * 100) + "%";
      thumb.style.left = (ratio * 100) + "%";
    }
    function highlight(i) {
      st.idx = i;
      enEls.forEach(function (el, k) {
        el.classList.toggle("aplayer__w--on", k === i);
        el.classList.toggle("aplayer__w--done", k >= 0 && k < i);
      });
      kaEls.forEach(function (el, k) {
        el.classList.toggle("aplayer__k--on", k === i);
        el.classList.toggle("aplayer__k--done", k >= 0 && k < i);
      });
      if (i >= 0) setBar(cum[i] / totalDur);
    }

    function tick() {
      if (!st.playing) return;
      var elapsed = (performance.now() - st.t0) / 1000 * st.rate;
      var pos = st.cumStart + elapsed;
      var idx = st.startIdx;
      while (idx < toks.length - 1 && pos >= cum[idx + 1]) idx++;
      var nowMs = performance.now();
      // 【v92修正】実音声の境界イベントが一度でも来ている間は「境界が唯一の語送り」。
      // 従来は境界が1.2秒途切れると定速推定が再開し、実際の発声（長い語・ポーズ）と
      // 無関係にカタカナが一定速度で流れるバグがあった。
      // 修正後: 境界イベント駆動中は、推定は最後の境界語から最大+1語まで
      // （長い無音でも先走らない）。境界が全く無い環境のみ従来の推定で進める。
      if (st.boundaryActive) {
        var boundaryRecent = (nowMs - st.lastB < 1500);
        var cap = st.startIdx + (boundaryRecent ? 0 : 1);
        if (idx > cap) idx = cap;
      } else if (nowMs - st.playStart < 700) {
        // 開始直後の猶予中は推定で進めない（最初の境界で語が巻き戻るのを防ぐ）
        idx = st.startIdx;
      }
      if (idx !== st.idx) highlight(idx);
      setBar(Math.min(1, pos / totalDur));
      st.raf = requestAnimationFrame(tick);
    }

    function playFrom(idx) {
      EM.stopSpeak();
      cancelAnimationFrame(st.raf);
      if (idx < 0) idx = 0;
      if (idx >= toks.length) { finish(); return; }
      var sub = text.slice(toks[idx].start);
      var base = toks[idx].start;
      st.playing = true; st.startIdx = idx; st.cumStart = cum[idx];
      st.t0 = performance.now(); st.playStart = performance.now();
      st.boundaryActive = false; st.lastB = 0;
      playBtn.textContent = "⏸";
      highlight(idx);
      st.raf = requestAnimationFrame(tick);
      EM.speak(sub, {
        rate: st.rate,
        onboundary: function (ci, len) {
          if (ci < 0) return;
          var gi = tokenAt(toks, base + ci);
          // 境界は前進のみ（推定や端末の不規則な発火で手前へ戻らない）
          if (gi < st.startIdx) gi = st.startIdx;
          st.startIdx = gi; st.cumStart = cum[gi]; st.t0 = performance.now();
          st.boundaryActive = true; st.lastB = performance.now();
          highlight(gi);
        },
        onend: function () { finish(); }
      });
    }
    function finish() {
      st.playing = false;
      cancelAnimationFrame(st.raf);
      playBtn.textContent = "▶";
      enEls.forEach(function (el) { el.classList.remove("aplayer__w--on", "aplayer__w--done"); });
      kaEls.forEach(function (el) { el.classList.remove("aplayer__k--on", "aplayer__k--done"); });
      setBar(0); st.idx = 0;
    }
    function pause() {
      st.playing = false;
      cancelAnimationFrame(st.raf);
      EM.stopSpeak();
      playBtn.textContent = "▶";
    }

    playBtn.addEventListener("click", function () {
      if (st.playing) pause();
      else playFrom(st.idx >= toks.length - 1 ? 0 : st.idx);
    });

    function seekToClientX(clientX) {
      var rect = track.getBoundingClientRect();
      var ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      var target = ratio * totalDur, idx = 0;
      while (idx < toks.length - 1 && target >= cum[idx + 1]) idx++;
      if (st.playing) playFrom(idx);
      else { highlight(idx); setBar(cum[idx] / totalDur); }
    }
    var dragging = false;
    track.addEventListener("pointerdown", function (e) { dragging = true; try { track.setPointerCapture(e.pointerId); } catch (x) {} if (!st.playing) { var rect = track.getBoundingClientRect(); setBar((e.clientX - rect.left) / rect.width); } });
    track.addEventListener("pointermove", function (e) { if (dragging && !st.playing) { var rect = track.getBoundingClientRect(); setBar((e.clientX - rect.left) / rect.width); } });
    track.addEventListener("pointerup", function (e) { if (dragging) { dragging = false; seekToClientX(e.clientX); } });

    function bindTap(els) {
      els.forEach(function (el) { el.addEventListener("click", function () { playFrom(parseInt(el.getAttribute("data-i"), 10)); }); });
    }
    bindTap(enEls); bindTap(kaEls);

    rateBtn.addEventListener("click", function () {
      var cur = RATES.indexOf(st.rate);
      st.rate = RATES[(cur + 1) % RATES.length];
      rateBtn.textContent = st.rate.toFixed(2).replace(/0$/, "") + "×";
      if (st.playing) playFrom(st.idx);
    });

    setBar(0);
    return { play: function () { playFrom(0); }, pause: pause, stop: finish };
  };
})();

/* ============================================================
   インライン版（カード向け）: EM.audioChip(container, text)
   - 1行に「▶ 英語（語ハイライト）」を表示。タップで再生、語タップでそこから。
   - カタカナ行を下に小さく出し、再生中は同じ語を同期ハイライト。
   - 例文・単語カードなど狭いUIに差し込む用途。
   ============================================================ */
(function () {
  "use strict";
  EM.audioChip = function (container, text, opts) {
    opts = opts || {};
    text = String(text || "").trim();
    if (!container || !text) return;
    var re = /(\S+)(\s*)/g, m, toks = [];
    while ((m = re.exec(text)) !== null) toks.push({ word: m[1], start: m.index });
    var kana = toks.map(function (t) { try { return (window.Katakana && window.Katakana.reduceTokenKana) ? window.Katakana.reduceTokenKana(t.word, false) : (window.Katakana && window.Katakana.wordToKatakana) ? window.Katakana.wordToKatakana(t.word) : ""; } catch (e) { return ""; } });
    function wt(w) { var s = (w.replace(/[^a-zA-Z]/g, "").match(/[aeiouy]+/gi) || []).length || 1; var v = 0.18 + s * 0.13; if (/[.!?;:]$/.test(w)) v += 0.30; else if (/,$/.test(w)) v += 0.15; return v; }
    var cum = [0]; toks.forEach(function (t) { cum.push(cum[cum.length - 1] + wt(t.word)); });
    var total = cum[cum.length - 1];

    container.innerHTML =
      '<div class="achip">' +
        '<button class="achip__play" type="button" aria-label="再生">▶</button>' +
        '<div class="achip__body">' +
          '<div class="achip__en">' + toks.map(function (t, i) { return '<span class="achip__w" data-i="' + i + '">' + EM.escapeHtml(t.word) + '</span>'; }).join(" ") + '</div>' +
          (opts.showKana !== false ? '<div class="achip__kana">≈ ' + toks.map(function (t, i) { return '<span class="achip__k" data-i="' + i + '">' + EM.escapeHtml(kana[i] || "・") + '</span>'; }).join(" ") + '</div>' : "") +
        '</div>' +
      '</div>';

    var play = container.querySelector(".achip__play");
    var enEls = container.querySelectorAll(".achip__w");
    var kaEls = container.querySelectorAll(".achip__k");
    var stt = { playing: false, idx: 0, raf: null, t0: 0, startIdx: 0, boundaryActive: false, lastB: 0 };

    function hl(i) {
      stt.idx = i;
      enEls.forEach(function (el, k) { el.classList.toggle("achip__w--on", k === i); });
      kaEls.forEach(function (el, k) { el.classList.toggle("achip__k--on", k === i); });
    }
    function tick() {
      if (!stt.playing) return;
      var pos = cum[stt.startIdx] + (performance.now() - stt.t0) / 1000;
      var idx = stt.startIdx; while (idx < toks.length - 1 && pos >= cum[idx + 1]) idx++;
      // 【v92】実境界イベント駆動中は推定を先走らせない（最大+1語）
      if (stt.boundaryActive) {
        var cap = stt.startIdx + ((performance.now() - stt.lastB < 1500) ? 0 : 1);
        if (idx > cap) idx = cap;
      }
      if (idx !== stt.idx) hl(idx);
      stt.raf = requestAnimationFrame(tick);
    }
    function fin() { stt.playing = false; cancelAnimationFrame(stt.raf); play.textContent = "▶"; enEls.forEach(function (e) { e.classList.remove("achip__w--on"); }); kaEls.forEach(function (e) { e.classList.remove("achip__k--on"); }); stt.idx = 0; }
    function from(idx) {
      EM.stopSpeak(); cancelAnimationFrame(stt.raf);
      if (idx >= toks.length) { fin(); return; }
      stt.playing = true; stt.startIdx = idx; stt.t0 = performance.now(); stt.boundaryActive = false; stt.lastB = 0; play.textContent = "⏸"; hl(idx);
      stt.raf = requestAnimationFrame(tick);
      EM.speak(text.slice(toks[idx].start), {
        onboundary: function (ci) { if (ci < 0) return; var gi = 0; var g = toks[idx].start + ci; while (gi < toks.length - 1 && toks[gi + 1].start <= g) gi++; if (gi < stt.startIdx) gi = stt.startIdx; stt.startIdx = gi; stt.t0 = performance.now(); stt.boundaryActive = true; stt.lastB = performance.now(); hl(gi); },
        onend: fin
      });
    }
    play.addEventListener("click", function () { if (stt.playing) { fin(); EM.stopSpeak(); } else from(0); });
    enEls.forEach(function (el) { el.addEventListener("click", function () { from(parseInt(el.getAttribute("data-i"), 10)); }); });
    kaEls.forEach(function (el) { el.addEventListener("click", function () { from(parseInt(el.getAttribute("data-i"), 10)); }); });
    return { play: function () { from(0); } };
  };
})();

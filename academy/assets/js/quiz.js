/* ============================================================
   Swallow AI Academy — Quiz Engine
   Loads questions from static JSON, scores, persists to Store
   ============================================================ */

class QuizEngine {
  constructor(opts) {
    this.topicId = opts.topicId;
    this.title = opts.title || 'クイズ';
    this.dataUrl = opts.dataUrl;
    this.mount = opts.mount;
    this.questions = [];
    this.idx = 0;
    this.answers = [];
    this.startTime = null;
  }

  async start() {
    try {
      const res = await fetch(this.dataUrl);
      const json = await res.json();
      this.questions = this.shuffle([...json.questions]).slice(0, json.questions.length);
    } catch (e) {
      this.mount.innerHTML = `
        <div class="callout accent" data-label="読み込みエラー">
          <p>問題データを読み込めませんでした。GitHub Pages 経由（または簡易サーバー）でアクセスしてください。<br>
          <code>python -m http.server</code> などで起動するとローカルでも動作します。</p>
        </div>`;
      return;
    }
    this.idx = 0;
    this.answers = [];
    this.startTime = Date.now();
    this.renderQuestion();
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  renderQuestion() {
    if (this.idx >= this.questions.length) {
      this.renderResult();
      return;
    }
    const q = this.questions[this.idx];
    const total = this.questions.length;
    const progressPct = (this.idx / total) * 100;

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    this.mount.innerHTML = `
      <div class="quiz-header">
        <div>
          <div class="quiz-q-meta">${this.title}</div>
          <div style="font-family: var(--font-display-jp); font-weight: 700; font-size: 18px; margin-top: 4px;">第 ${this.idx + 1} 問 / ${total}</div>
        </div>
        <div class="quiz-progress"><strong>${Math.round(progressPct)}%</strong> 進行</div>
      </div>
      <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${progressPct}%"></div></div>
      <div class="quiz-card">
        <div class="quiz-q-meta">
          ${q.category ? q.category : ''}
          ${q.difficulty ? ' · 難易度 ' + q.difficulty : ''}
        </div>
        <div class="quiz-q">${this.escape(q.q)}</div>
        <div class="quiz-choices" id="qc">
          ${q.choices.map((c, i) => `
            <button class="quiz-choice" data-idx="${i}">
              <span class="letter">${letters[i]}</span>
              <span>${this.escape(c)}</span>
            </button>
          `).join('')}
        </div>
        <div class="quiz-explain" id="qe">
          <h5>解説</h5>
          <p>${q.explain ? this.escape(q.explain).replace(/\n/g, '<br>') : ''}</p>
          ${q.ref ? `<p style="margin-top:10px;font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);">出典・関連: ${this.escape(q.ref)}</p>` : ''}
        </div>
        <div class="quiz-actions" style="margin-top:24px;">
          <button class="btn small" id="qSkip">スキップ</button>
          <button class="btn small accent" id="qNext" style="display:none;">次の問題 →</button>
        </div>
      </div>`;

    const buttons = this.mount.querySelectorAll('.quiz-choice');
    buttons.forEach(b => {
      b.addEventListener('click', () => this.selectAnswer(parseInt(b.dataset.idx, 10), buttons, q));
    });
    document.getElementById('qSkip').addEventListener('click', () => {
      this.answers.push({ q: q.q, selected: -1, correct: q.answer, isCorrect: false });
      this.idx++;
      this.renderQuestion();
    });
    document.getElementById('qNext').addEventListener('click', () => {
      this.idx++;
      this.renderQuestion();
    });
  }

  selectAnswer(idx, buttons, q) {
    const isCorrect = idx === q.answer;
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.style.cursor = 'default';
      if (i === q.answer) b.classList.add('correct');
      else if (i === idx && !isCorrect) b.classList.add('wrong');
    });
    document.getElementById('qe').classList.add('show');
    document.getElementById('qNext').style.display = 'inline-flex';
    document.getElementById('qSkip').style.display = 'none';
    this.answers.push({ q: q.q, selected: idx, correct: q.answer, isCorrect });
  }

  renderResult() {
    const total = this.answers.length;
    const correctCount = this.answers.filter(a => a.isCorrect).length;
    const acc = total ? Math.round((correctCount / total) * 100) : 0;
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;

    if (window.SwallowStore) {
      window.SwallowStore.recordQuiz(this.topicId, correctCount, total);
    }

    this.mount.innerHTML = `
      <div class="quiz-result fade-up">
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--ink-mute);text-transform:uppercase;">Result · ${this.title}</div>
        <div class="big">${acc}<sub>%</sub></div>
        <h3>${this.gradeLabel(acc)}</h3>
        <div class="quiz-result-stats">
          <div class="quiz-result-stat">
            <div class="num">${correctCount} / ${total}</div>
            <div class="label">正答</div>
          </div>
          <div class="quiz-result-stat">
            <div class="num">${min}:${String(sec).padStart(2, '0')}</div>
            <div class="label">所要時間</div>
          </div>
          <div class="quiz-result-stat">
            <div class="num">${Math.round(elapsed / total)}<span style="font-size:0.5em;color:var(--ink-mute);"> 秒/問</span></div>
            <div class="label">平均</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px;">
          <button class="btn solid" id="qRetry">もう一度挑戦</button>
          <a class="btn" href="../quiz.html">クイズ一覧へ</a>
          <a class="btn" href="../index.html">ホームへ</a>
        </div>
        <hr class="divider">
        <h4 style="text-align:left;font-family:var(--font-display-jp);font-weight:700;font-size:18px;margin-bottom:16px;">解答の振り返り</h4>
        <ol style="text-align:left;list-style:none;padding:0;">
          ${this.answers.map((a, i) => `
            <li style="border-bottom:1px solid var(--rule);padding:12px 0;display:flex;gap:14px;align-items:flex-start;">
              <span style="font-family:var(--font-mono);font-size:11px;color:${a.isCorrect ? 'var(--green)' : 'var(--accent)'};letter-spacing:0.1em;margin-top:3px;">
                ${a.isCorrect ? '○ 正解' : (a.selected < 0 ? '— スキップ' : '× 誤答')}
              </span>
              <span style="font-size:14px;line-height:1.7;color:var(--ink-soft);">${this.escape(a.q)}</span>
            </li>
          `).join('')}
        </ol>
      </div>`;

    document.getElementById('qRetry').addEventListener('click', () => this.start());
  }

  gradeLabel(acc) {
    if (acc >= 90) return '優秀 — Excellent';
    if (acc >= 75) return '合格圏 — Pass';
    if (acc >= 60) return 'もう一歩 — Almost';
    return '基礎固めから — Foundation';
  }

  escape(s) {
    if (typeof s !== 'string') return s;
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.QuizEngine = QuizEngine;

/* =============================================================================
   Swallow AI Academy — v6 Gamified Learning JS
   Progress tracking · Streaks · XP · Achievements · Confetti · Mobile drawer
   ============================================================================= */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  /* ---------- Storage ---------- */
  const Store = {
    KEY: 'swallow-v6',
    data: { progress: {}, stats: { xp: 0, streak: 0, lastVisit: null, achievements: [] } },
    init() {
      try { 
        const raw = localStorage.getItem(this.KEY);
        if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
        if (!this.data.progress) this.data.progress = {};
        if (!this.data.stats) this.data.stats = { xp: 0, streak: 0, lastVisit: null, achievements: [] };
      } catch (e) {}
      // Update streak based on visit
      this.checkStreak();
    },
    save() {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    checkStreak() {
      const today = new Date().toDateString();
      const last = this.data.stats.lastVisit ? new Date(this.data.stats.lastVisit).toDateString() : null;
      if (last === today) return; // Already counted today
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (last === yesterday.toDateString()) {
        this.data.stats.streak += 1;
      } else if (last) {
        this.data.stats.streak = 1; // Reset
      } else {
        this.data.stats.streak = 1; // First visit
      }
      this.data.stats.lastVisit = Date.now();
      this.save();
    },
    visit(key) {
      if (!this.data.progress[key]) {
        this.data.progress[key] = { visited: Date.now() };
        this.addXP(5, '章を開きました');
        this.save();
        this.checkAchievements();
      }
    },
    complete(key) {
      if (!this.data.progress[key]) this.data.progress[key] = { visited: Date.now() };
      if (!this.data.progress[key].completed) {
        this.data.progress[key].completed = Date.now();
        this.addXP(20, '章を完了！');
        this.save();
        this.checkAchievements();
        return true;
      }
      return false;
    },
    uncomplete(key) {
      if (this.data.progress[key] && this.data.progress[key].completed) {
        delete this.data.progress[key].completed;
        this.data.stats.xp = Math.max(0, this.data.stats.xp - 20);
        this.save();
      }
    },
    addXP(amount, reason) {
      this.data.stats.xp = (this.data.stats.xp || 0) + amount;
      Toast.show({ title: `+${amount} XP`, sub: reason, type: 'xp' });
    },
    isCompleted(key) { return !!(this.data.progress[key] && this.data.progress[key].completed); },
    isVisited(key) { return !!this.data.progress[key]; },
    getCompletedCount(prefix) {
      return Object.keys(this.data.progress).filter(k => k.startsWith(prefix) && this.data.progress[k].completed).length;
    },
    getVisitedCount(prefix) {
      return Object.keys(this.data.progress).filter(k => k.startsWith(prefix)).length;
    },
    checkAchievements() {
      const ACHIEVEMENTS = [
        { id: 'first', name: '初めての一歩', desc: '最初の章を開きました', cond: () => Object.keys(this.data.progress).length >= 1 },
        { id: 'first-complete', name: '初めての完了', desc: '1章を完了しました', cond: () => this.data.stats.xp >= 25 },
        { id: 'five-chapters', name: '5章達成', desc: '5章を完了しました', cond: () => Object.values(this.data.progress).filter(p => p.completed).length >= 5 },
        { id: 'ten-chapters', name: '10章達成', desc: '10章を完了しました', cond: () => Object.values(this.data.progress).filter(p => p.completed).length >= 10 },
        { id: 'basics-master', name: '基礎マスター', desc: 'G検定 基本編 全12章完了！', cond: () => this.getCompletedCount('g-kentei:basics:') >= 12 },
        { id: 'advanced-master', name: '応用マスター', desc: 'G検定 応用編 全12章完了！', cond: () => this.getCompletedCount('g-kentei:advanced:') >= 12 },
        { id: 'gkentei-complete', name: 'G検定 完全制覇', desc: '全24章完了 — おめでとう！', cond: () => this.getCompletedCount('g-kentei:') >= 24 },
        { id: 'streak-3', name: '三日連続学習', desc: '3日連続で学習しました', cond: () => this.data.stats.streak >= 3 },
        { id: 'streak-7', name: '一週間続けた', desc: '7日連続で学習しました', cond: () => this.data.stats.streak >= 7 },
      ];
      const already = new Set(this.data.stats.achievements || []);
      ACHIEVEMENTS.forEach(a => {
        if (!already.has(a.id) && a.cond()) {
          this.data.stats.achievements.push(a.id);
          Toast.show({ title: `🏆 ${a.name}`, sub: a.desc, type: 'achievement', duration: 4000 });
          Confetti.burst();
        }
      });
      this.save();
    }
  };

  /* ---------- Theme ---------- */
  const ThemeManager = {
    KEY: 'swallow-theme',
    init() {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
      }
      $$('.topbar-theme, .theme-toggle').forEach(btn => on(btn, 'click', () => this.toggle()));
    },
    toggle() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(this.KEY, next);
    }
  };

  /* ---------- Toast ---------- */
  const Toast = {
    container: null,
    ensure() {
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
      return this.container;
    },
    show({ title, sub, type = 'default', duration = 2400 }) {
      const c = this.ensure();
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.innerHTML = `<div class="toast__title">${title}</div>${sub ? `<div class="toast__sub">${sub}</div>` : ''}`;
      c.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(20px)'; }, duration - 300);
      setTimeout(() => el.remove(), duration);
    }
  };

  /* ---------- Confetti ---------- */
  const Confetti = {
    colors: ['#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'],
    burst() {
      const c = document.createElement('div');
      c.className = 'confetti';
      for (let i = 0; i < 40; i++) {
        const s = document.createElement('span');
        s.style.left = Math.random() * 100 + 'vw';
        s.style.background = this.colors[Math.floor(Math.random() * this.colors.length)];
        s.style.animationDelay = Math.random() * 0.3 + 's';
        s.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
        c.appendChild(s);
      }
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
  };

      /* ---------- Stats Display (v10 rail) ---------- */
  const StatsDisplay = {
    init() {
      const xp = Store.data.stats.xp || 0;
      const streak = Store.data.stats.streak || 0;
      const rs = document.getElementById('rail-streak');
      const rx = document.getElementById('rail-xp');
      if (rs) rs.textContent = streak;
      if (rx) rx.textContent = xp;
    }
  };

  /* ---------- Progress Renderer (rings, bars, badges) ---------- */
  const ProgressRenderer = {
    renderRings() {
      $$('[data-progress-ring]').forEach(el => {
        const prefix = el.getAttribute('data-progress-ring');
        const total = parseInt(el.getAttribute('data-total') || '12', 10);
        const completed = Store.getCompletedCount(prefix);
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const circ = 2 * Math.PI * 36; // radius 36
        el.innerHTML = `
          <svg viewBox="0 0 80 80">
            <circle class="ring__track" cx="40" cy="40" r="36"/>
            <circle class="ring__bar" cx="40" cy="40" r="36" style="stroke-dasharray: ${(pct / 100) * circ} ${circ};"/>
          </svg>
          <div class="ring__center">${pct}%<small>${completed}/${total}</small></div>
        `;
      });
      $$('[data-progress-bar]').forEach(el => {
        const prefix = el.getAttribute('data-progress-bar');
        const total = parseInt(el.getAttribute('data-total') || '12', 10);
        const completed = Store.getCompletedCount(prefix);
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const fill = el.querySelector('.pbar__fill');
        if (fill) fill.style.width = pct + '%';
        const info = el.querySelector('[data-bar-info]');
        if (info) info.textContent = `${completed} / ${total} 章完了 (${pct}%)`;
      });
    },
    renderChapterStates() {
      // For .chap-item with data-chapter-key, apply is-visited / is-completed
      $$('[data-chapter-key]').forEach(el => {
        const key = el.getAttribute('data-chapter-key');
        el.classList.toggle('is-visited', Store.isVisited(key));
        el.classList.toggle('is-completed', Store.isCompleted(key));
      });
      // Sidebar links
      $$('.sidebar-link[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        el.classList.toggle('is-visited', Store.isVisited(key));
        el.classList.toggle('is-completed', Store.isCompleted(key));
      });
    },
    init() {
      this.renderRings();
      this.renderChapterStates();
    }
  };

  /* ---------- Chapter Completion Button ---------- */
  const ChapterComplete = {
    init() {
      const btn = $('[data-complete-chapter]');
      if (!btn) return;
      const key = btn.getAttribute('data-complete-chapter');
      const cta = btn.closest('.complete-cta');
      
      // Initial state
      if (Store.isCompleted(key)) {
        this.applyDone(cta, btn);
      }
      
      on(btn, 'click', () => {
        if (Store.isCompleted(key)) {
          if (confirm('完了マークを外しますか？')) {
            Store.uncomplete(key);
            this.applyPending(cta, btn);
            ProgressRenderer.init();
          }
        } else {
          const added = Store.complete(key);
          if (added) {
            this.applyDone(cta, btn);
            ProgressRenderer.init();
            Confetti.burst();
            Toast.show({ title: '🎉 章を完了しました！', sub: 'お疲れさまでした。次の章へ進みましょう。', type: 'success', duration: 3000 });
            StatsDisplay.init();
          }
        }
      });
    },
    applyDone(cta, btn) {
      cta.classList.add('complete-cta--done');
      const icon = cta.querySelector('.complete-cta__icon');
      const title = cta.querySelector('.complete-cta__title');
      const sub = cta.querySelector('.complete-cta__sub');
      if (icon) icon.textContent = '✓';
      if (title) title.textContent = '完了済み';
      if (sub) sub.textContent = 'この章はマスターしました 🎓';
      if (btn) btn.innerHTML = '<span>完了マークを解除</span>';
    },
    applyPending(cta, btn) {
      cta.classList.remove('complete-cta--done');
      const icon = cta.querySelector('.complete-cta__icon');
      const title = cta.querySelector('.complete-cta__title');
      const sub = cta.querySelector('.complete-cta__sub');
      if (icon) icon.textContent = '🎯';
      if (title) title.textContent = 'この章はいかがでしたか？';
      if (sub) sub.textContent = '理解できたら完了マークをつけましょう (+20 XP)';
      if (btn) btn.innerHTML = '<span>✓ 章を完了としてマーク</span>';
    }
  };

        /* ---------- Rail (left nav) ---------- */
  const Sidebar = {
    init() {
      const rail = $('#rail');
      const toggle = $('#rail-toggle');
      const backdrop = $('#rail-backdrop');
      if (toggle && rail) {
        on(toggle, 'click', () => {
          rail.classList.toggle('is-open');
          if (backdrop) backdrop.classList.toggle('is-open');
        });
      }
      if (backdrop) on(backdrop, 'click', () => {
        rail.classList.remove('is-open');
        backdrop.classList.remove('is-open');
      });
      // Active link
      const filename = location.pathname.split('/').pop() || 'index.html';
      $$('.rail-link').forEach(a => {
        const href = (a.getAttribute('href') || '').split('#')[0];
        if (href && href.endsWith(filename) && filename.length > 4) {
          a.classList.add('is-active');
        }
      });
      // Search button (if a dedicated one exists)
      const sb = $('#search-btn');
      if (sb) on(sb, 'click', () => Search.open());
    }
  };

  /* ---------- Reading Progress ---------- */
  const ReadingProgress = {
    init() {
      const article = $('.article-body') || $('article');
      if (!article) return;
      const bar = document.createElement('div');
      bar.className = 'read-progress';
      bar.innerHTML = '<div class="read-progress__bar"></div>';
      document.body.insertBefore(bar, document.body.firstChild);
      const barFill = bar.querySelector('.read-progress__bar');
      const update = () => {
        const rect = article.getBoundingClientRect();
        const total = article.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;
        const pct = Math.max(0, Math.min(100, (scrolled / total) * 100));
        barFill.style.width = pct + '%';
      };
      on(window, 'scroll', update, { passive: true });
      on(window, 'resize', update);
      update();
    }
  };

  /* ---------- Chapter Tabs Scroll-Spy ---------- */
  const ChapterTabs = {
    init() {
      const tabs = $('.chapter-tabs');
      if (!tabs) return;
      const tabLinks = $$('a[href^="#"]', tabs);
      if (!tabLinks.length) return;
      const targets = tabLinks.map(a => {
        const id = a.getAttribute('href').slice(1);
        return { link: a, target: document.getElementById(id) };
      }).filter(t => t.target);

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            tabLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      targets.forEach(t => observer.observe(t.target));
    }
  };

  /* ---------- Search (Cmd+K) ---------- */
  const Search = {
    index: [], overlay: null, input: null, results: null, activeIdx: 0, matches: [],
    init() {
      this.index = this.buildIndex();
      this.createOverlay();
      this.bindShortcuts();
      $$('.topbar-search, .search-trigger').forEach(btn => on(btn, 'click', () => this.open()));
    },
    detectBase() {
      const path = location.pathname;
      if (path.includes('/learn/g-kentei/basics/') || path.includes('/learn/g-kentei/advanced/')) return '../../../';
      if (path.includes('/learn/g-kentei/')) return '../../';
      if (path.includes('/certifications/')) return '../';
      return './';
    },
    buildIndex() {
      const base = this.detectBase();
      const idx = [
        { cat: 'ホーム', title: 'ホーム', url: `${base}index.html` },
        { cat: '資格', title: 'G検定', url: `${base}certifications/g-kentei.html` },
        { cat: '資格', title: 'E資格', url: `${base}certifications/e-shikaku.html` },
        { cat: '資格', title: '統計検定', url: `${base}certifications/tokei-kentei.html` },
        { cat: '資格', title: 'Python認定', url: `${base}certifications/python-cert.html` },
        { cat: '資格', title: 'AWS MLA', url: `${base}certifications/aws-mla-c01.html` },
        { cat: '資格', title: '画像処理エンジニア', url: `${base}certifications/image-engineer.html` },
        { cat: '資格', title: 'Jetson AI', url: `${base}certifications/jetson-ai.html` },
        { cat: '演習', title: 'ハンズオン演習', url: `${base}learn/g-kentei/handson.html` },
        { cat: '演習', title: '問題演習', url: `${base}quiz.html` },
      ];
      const basics = [['01','what-is-ai','AIとは何か'],['02','history','AIの歴史'],['03','linear-algebra','線形代数'],['04','calculus','微分・最適化'],['05','probability','確率・統計'],['06','info-theory','情報理論'],['07','ml-paradigm','機械学習パラダイム'],['08','ml-classical','古典機械学習'],['09','ml-evaluation','評価指標'],['10','nn-basics','NN基礎'],['11','backprop','逆伝播'],['12','nn-tricks','NNの工夫']];
      basics.forEach(([n,s,t]) => idx.push({ cat: 'G検定 基本', title: `${n} ${t}`, url: `${base}learn/g-kentei/basics/${n}-${s}.html` }));
      const advanced = [['01','cnn','CNN','13'],['02','rnn','RNN・LSTM','14'],['03','transformer','Transformer','15'],['04','bert-gpt','BERT・GPT','16'],['05','llm','LLM','17'],['06','generative','生成AI','18'],['07','rl','強化学習','19'],['08','rag','RAG','20'],['09','agent','AI Agent','21'],['10','mlops','MLOps','22'],['11','ethics','AI倫理','23'],['12','law','AI法規制','24']];
      advanced.forEach(([n,s,t,d]) => idx.push({ cat: 'G検定 応用', title: `${d} ${t}`, url: `${base}learn/g-kentei/advanced/${n}-${s}.html` }));
      return idx;
    },
    createOverlay() {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="search-overlay" role="dialog" aria-modal="true">
        <div class="search-panel">
          <div class="search-input-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="search-input" placeholder="章、資格、キーワードを検索…" autocomplete="off" spellcheck="false">
          </div>
          <div class="search-results"></div>
          <div class="search-footer"><span><span class="kbd">↑↓</span> 移動</span><span><span class="kbd">Enter</span> 開く</span><span><span class="kbd">Esc</span> 閉じる</span></div>
        </div>
      </div>`;
      this.overlay = wrap.firstElementChild;
      document.body.appendChild(this.overlay);
      this.input = $('.search-input', this.overlay);
      this.results = $('.search-results', this.overlay);
      on(this.input, 'input', () => this.render());
      on(this.input, 'keydown', (e) => this.handleKey(e));
      on(this.overlay, 'click', (e) => { if (e.target === this.overlay) this.close(); });
    },
    bindShortcuts() {
      on(document, 'keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
        if (e.key === 'Escape' && this.overlay && this.overlay.classList.contains('open')) this.close();
      });
    },
    open() { this.overlay.classList.add('open'); setTimeout(() => this.input.focus(), 50); this.render(); document.body.style.overflow = 'hidden'; },
    close() { this.overlay.classList.remove('open'); document.body.style.overflow = ''; this.input.value = ''; },
    toggle() { this.overlay.classList.contains('open') ? this.close() : this.open(); },
    render() {
      const q = this.input.value.trim().toLowerCase();
      this.activeIdx = 0;
      this.matches = q ? this.index.filter(item => (item.title + ' ' + item.cat).toLowerCase().includes(q)).slice(0, 12) : this.index.slice(0, 8);
      if (!this.matches.length) {
        this.results.innerHTML = '<div class="search-empty">該当する結果が見つかりませんでした</div>';
        return;
      }
      this.results.innerHTML = this.matches.map((m, i) => `<a class="search-result ${i === this.activeIdx ? 'is-active' : ''}" href="${m.url}"><span class="search-result-cat">${m.cat}</span><span class="search-result-title">${m.title}</span></a>`).join('');
    },
    handleKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.activeIdx = Math.min(this.matches.length - 1, this.activeIdx + 1); this.updateActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.activeIdx = Math.max(0, this.activeIdx - 1); this.updateActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); const m = this.matches[this.activeIdx]; if (m) location.href = m.url; }
    },
    updateActive() {
      $$('.search-result', this.results).forEach((el, i) => el.classList.toggle('is-active', i === this.activeIdx));
      const active = $('.search-result.is-active', this.results);
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  };

  /* ---------- Auto-track current chapter visit ---------- */
  function trackVisit() {
    const m = location.pathname.match(/\/learn\/([^/]+)\/([^/]+)\/(\d+-[^/]+)\.html/);
    if (m) {
      const key = `${m[1]}:${m[2]}:${m[3]}`;
      Store.visit(key);
    }
  }

  /* ---------- Init ---------- */
  function init() {
    Store.init();
    ThemeManager.init();
    Toast.ensure();
    Sidebar.init();
    StatsDisplay.init();
    trackVisit();
    ProgressRenderer.init();
    ChapterComplete.init();
    Search.init();
    ReadingProgress.init();
    ChapterTabs.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Swallow = { Store, ThemeManager, Toast, Search, ProgressRenderer, Confetti };
})();

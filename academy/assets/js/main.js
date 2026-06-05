/* =============================================================================
   Swallow AI Academy — Application Script (2026 Edition)
   Theme, Search, Scroll-spy TOC, Reading Progress, Mobile Nav, Toasts
   ============================================================================= */

(function () {
  'use strict';

  /* ---------- Utilities ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  /* ---------- Theme Toggle ---------- */
  const ThemeManager = {
    KEY: 'swallow-theme',
    init() {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
      }
      // Bind toggle buttons
      $$('.theme-toggle').forEach(btn => on(btn, 'click', () => this.toggle()));
    },
    toggle() {
      const current = document.documentElement.getAttribute('data-theme');
      // Default is dark (no attribute = dark). Toggle to light, then back to dark.
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(this.KEY, next);
      Toast.show(`${next === 'dark' ? '🌙 ダーク' : '☀ ライト'}モードに切替`);
    }
  };

  /* ---------- Toast Notifications ---------- */
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
    show(msg, type = 'default', duration = 2200) {
      const c = this.ensure();
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.textContent = msg;
      c.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; }, duration - 200);
      setTimeout(() => el.remove(), duration);
    }
  };

  /* ---------- Reading Progress Bar ---------- */
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

  /* ---------- Scroll-Spy TOC ---------- */
  const ScrollSpy = {
    init() {
      const side = $('.article-side');
      if (!side) return;
      const tocLinks = $$('a[href^="#"]', side);
      if (!tocLinks.length) return;
      const targets = tocLinks.map(a => {
        const id = a.getAttribute('href').slice(1);
        return { link: a, target: document.getElementById(id) };
      }).filter(t => t.target);

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            tocLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
          }
        });
      }, { rootMargin: '-20% 0px -70% 0px' });

      targets.forEach(t => observer.observe(t.target));
    }
  };

  /* ---------- Global Search (Cmd+K) ---------- */
  const Search = {
    index: [],
    overlay: null,
    input: null,
    results: null,
    activeIdx: 0,
    matches: [],

    async init() {
      // Build search index from available pages (use a simple static one)
      this.index = await this.buildIndex();
      this.createOverlay();
      this.bindShortcuts();
      $$('.search-trigger').forEach(btn => on(btn, 'click', () => this.open()));
    },

    async buildIndex() {
      // Static, lightweight index covering main pages + chapters
      const base = this.detectBase();
      const idx = [
        { cat: '資格', title: 'G検定', url: `${base}certifications/g-kentei.html` },
        { cat: '資格', title: 'E資格', url: `${base}certifications/e-shikaku.html` },
        { cat: '資格', title: '統計検定', url: `${base}certifications/tokei-kentei.html` },
        { cat: '資格', title: 'Python認定', url: `${base}certifications/python-cert.html` },
        { cat: '資格', title: 'AWS MLA', url: `${base}certifications/aws-mla-c01.html` },
        { cat: '資格', title: '画像処理エンジニア', url: `${base}certifications/image-engineer.html` },
        { cat: '資格', title: 'Jetson AI Specialist', url: `${base}certifications/jetson-ai.html` },
        { cat: 'ページ', title: 'ホーム', url: `${base}index.html` },
        { cat: 'ページ', title: '問題演習', url: `${base}quiz.html` },
      ];
      // G検定 basics
      const basicsTitles = [
        '01 AIとは', '02 AIの歴史', '03 線形代数', '04 微分・最適化', '05 確率統計',
        '06 情報理論', '07 機械学習パラダイム', '08 古典機械学習', '09 評価指標',
        '10 NN基礎', '11 逆伝播', '12 NNの工夫'
      ];
      basicsTitles.forEach((title, i) => {
        const num = String(i + 1).padStart(2, '0');
        const slugs = ['what-is-ai', 'history', 'linear-algebra', 'calculus', 'probability', 'info-theory',
          'ml-paradigm', 'ml-classical', 'ml-evaluation', 'nn-basics', 'backprop', 'nn-tricks'];
        idx.push({ cat: 'G検定 基本', title, url: `${base}learn/g-kentei/basics/${num}-${slugs[i]}.html` });
      });
      // G検定 advanced
      const advTitles = [
        '13 CNN', '14 RNN', '15 Transformer', '16 BERT/GPT', '17 LLM', '18 生成AI',
        '19 強化学習', '20 RAG', '21 AI Agent', '22 MLOps', '23 AI倫理', '24 AI法規制'
      ];
      const advSlugs = ['cnn', 'rnn', 'transformer', 'bert-gpt', 'llm', 'generative',
        'rl', 'rag', 'agent', 'mlops', 'ethics', 'law'];
      advTitles.forEach((title, i) => {
        const num = String(i + 1).padStart(2, '0');
        idx.push({ cat: 'G検定 応用', title, url: `${base}learn/g-kentei/advanced/${num}-${advSlugs[i]}.html` });
      });
      return idx;
    },

    detectBase() {
      const path = location.pathname;
      const segs = path.split('/').filter(Boolean);
      // Detect how deep we are; common deployment under /academy/ or root
      // We rely on relative ../ navigation matching the file's depth
      const fileSegs = segs.length - (path.endsWith('/') ? 0 : 1);
      // If file is at root: 0 segments before file
      // We just generate paths relative to root with ./ prefix; chapter pages link with ../../ already
      const file = path.split('/').pop() || '';
      if (path.includes('/learn/g-kentei/')) return '../../../';
      if (path.includes('/certifications/')) return '../';
      return './';
    },

    createOverlay() {
      const html = `
        <div class="search-overlay" role="dialog" aria-modal="true" aria-label="グローバル検索">
          <div class="search-panel">
            <div class="search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="search" class="search-input" placeholder="章、資格、キーワードを検索…" autocomplete="off" spellcheck="false">
            </div>
            <div class="search-results"></div>
            <div class="search-footer">
              <span><span class="kbd">↑↓</span> 移動</span>
              <span><span class="kbd">Enter</span> 開く</span>
              <span><span class="kbd">Esc</span> 閉じる</span>
            </div>
          </div>
        </div>`;
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
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
        const isCmd = e.metaKey || e.ctrlKey;
        if (isCmd && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.toggle();
        }
        if (e.key === 'Escape' && this.overlay && this.overlay.classList.contains('open')) {
          this.close();
        }
      });
    },

    open() { this.overlay.classList.add('open'); setTimeout(() => this.input.focus(), 50); this.render(); document.body.style.overflow = 'hidden'; },
    close() { this.overlay.classList.remove('open'); document.body.style.overflow = ''; this.input.value = ''; },
    toggle() { this.overlay.classList.contains('open') ? this.close() : this.open(); },

    render() {
      const q = this.input.value.trim().toLowerCase();
      this.activeIdx = 0;
      if (!q) {
        this.matches = this.index.slice(0, 8);
      } else {
        this.matches = this.index.filter(item => {
          const hay = (item.title + ' ' + item.cat).toLowerCase();
          return hay.includes(q);
        }).slice(0, 12);
      }
      if (!this.matches.length) {
        this.results.innerHTML = '<div class="search-empty">該当する結果が見つかりませんでした</div>';
        return;
      }
      this.results.innerHTML = this.matches.map((m, i) => `
        <a class="search-result ${i === this.activeIdx ? 'is-active' : ''}" href="${m.url}" data-idx="${i}">
          <span class="search-result-cat">${m.cat}</span>
          <span class="search-result-title">${m.title}</span>
        </a>
      `).join('');
    },

    handleKey(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIdx = Math.min(this.matches.length - 1, this.activeIdx + 1);
        this.updateActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIdx = Math.max(0, this.activeIdx - 1);
        this.updateActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const m = this.matches[this.activeIdx];
        if (m) location.href = m.url;
      }
    },
    updateActive() {
      $$('.search-result', this.results).forEach((el, i) => el.classList.toggle('is-active', i === this.activeIdx));
      const active = $('.search-result.is-active', this.results);
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  };

  /* ---------- Mobile Nav ---------- */
  const MobileNav = {
    init() {
      const toggle = $('.nav-toggle');
      if (!toggle) return;
      let drawer = $('.nav-drawer');
      if (!drawer) {
        // Build drawer from nav-primary
        const nav = $('.nav-primary');
        if (!nav) return;
        drawer = document.createElement('nav');
        drawer.className = 'nav-drawer';
        drawer.innerHTML = nav.innerHTML;
        document.body.appendChild(drawer);
      }
      on(toggle, 'click', () => {
        const isOpen = drawer.classList.toggle('open');
        toggle.textContent = isOpen ? 'CLOSE' : 'MENU';
      });
      $$('a', drawer).forEach(a => on(a, 'click', () => { drawer.classList.remove('open'); toggle.textContent = 'MENU'; }));
    }
  };

  /* ---------- Progress Tracking (chapters read) ---------- */
  const Progress = {
    KEY: 'swallow-progress',
    data: {},
    init() {
      try { this.data = JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
      catch (e) { this.data = {}; }
      // Mark current chapter as visited
      const m = location.pathname.match(/\/learn\/([^/]+)\/([^/]+)\/(\d+-[^/]+)\.html/);
      if (m) {
        const cert = m[1], level = m[2], chapter = m[3];
        const key = `${cert}:${level}:${chapter}`;
        if (!this.data[key]) {
          this.data[key] = { visited: Date.now() };
          this.save();
        }
      }
      // Show progress on certification pages
      this.renderProgressBadges();
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
    markComplete(key) {
      this.data[key] = this.data[key] || {};
      this.data[key].completed = Date.now();
      this.save();
    },
    renderProgressBadges() {
      // Apply visited class to any link with data-chapter-key matching
      $$('[data-chapter-key]').forEach(el => {
        const key = el.getAttribute('data-chapter-key');
        if (this.data[key]) el.classList.add('is-visited');
        if (this.data[key]?.completed) el.classList.add('is-completed');
      });
    }
  };

  /* ---------- Initialize on DOMContentLoaded ---------- */
  function init() {
    ThemeManager.init();
    Toast.ensure();
    Search.init();
    MobileNav.init();
    Progress.init();
    ReadingProgress.init();
    ScrollSpy.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.Swallow = { ThemeManager, Toast, Search, Progress };
})();

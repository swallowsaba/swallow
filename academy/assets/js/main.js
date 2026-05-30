/* ============================================================
   Swallow AI Academy — Main JS
   Navigation, progress (localStorage), dashboard rendering
   ============================================================ */

const STORAGE_KEY = 'swallow_ai_academy_v1';

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Store.defaults();
      const parsed = JSON.parse(raw);
      return Object.assign(Store.defaults(), parsed);
    } catch (e) { return Store.defaults(); }
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  },
  defaults() {
    return {
      checks: {},          // {certId-chapterId: true}
      quizScores: {},      // {topicId: [{date, correct, total}]}
      totalStudyMin: 0,
      lastVisit: null,
      streak: 0,
      streakDate: null,
    };
  },
  update(patch) {
    const cur = Store.load();
    const next = Object.assign(cur, patch);
    Store.save(next);
    return next;
  },
  toggleCheck(id) {
    const data = Store.load();
    data.checks[id] = !data.checks[id];
    Store.save(data);
    return data.checks[id];
  },
  recordQuiz(topicId, correct, total) {
    const data = Store.load();
    if (!data.quizScores[topicId]) data.quizScores[topicId] = [];
    data.quizScores[topicId].push({
      date: new Date().toISOString(),
      correct, total,
    });
    if (data.quizScores[topicId].length > 50) data.quizScores[topicId].shift();
    Store.save(data);
  },
  bumpStreak() {
    const data = Store.load();
    const today = new Date().toDateString();
    if (data.streakDate === today) return data;
    if (data.streakDate) {
      const last = new Date(data.streakDate);
      const diff = (new Date(today) - last) / (1000 * 60 * 60 * 24);
      data.streak = (diff <= 1.5) ? data.streak + 1 : 1;
    } else {
      data.streak = 1;
    }
    data.streakDate = today;
    Store.save(data);
    return data;
  },
};

/* Mobile nav */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav-primary');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  // record visit and streak
  Store.bumpStreak();

  // checklist persistence
  document.querySelectorAll('.checklist li').forEach(li => {
    const id = li.dataset.id;
    if (!id) return;
    const data = Store.load();
    if (data.checks[id]) li.classList.add('done');
    li.addEventListener('click', () => {
      const now = Store.toggleCheck(id);
      li.classList.toggle('done', now);
      renderDashboard();
    });
  });

  // sticky article side nav highlight
  const sideLinks = document.querySelectorAll('.article-side a');
  if (sideLinks.length) {
    const sections = Array.from(sideLinks).map(a => {
      const id = a.getAttribute('href').replace('#', '');
      return { link: a, el: document.getElementById(id) };
    }).filter(s => s.el);

    const onScroll = () => {
      const offset = window.scrollY + 140;
      let active = sections[0];
      for (const s of sections) {
        if (s.el.offsetTop <= offset) active = s;
      }
      sideLinks.forEach(a => a.classList.remove('active'));
      if (active) active.link.classList.add('active');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  renderDashboard();
});

/* Dashboard render — used on home page */
function renderDashboard() {
  const data = Store.load();

  // Total checks
  const totalChecks = Object.values(data.checks).filter(Boolean).length;
  setText('#stat-checks', totalChecks);

  // Streak
  setText('#stat-streak', data.streak || 0);

  // Quiz attempts
  const totalAttempts = Object.values(data.quizScores).reduce((s, arr) => s + arr.length, 0);
  setText('#stat-attempts', totalAttempts);

  // Best accuracy
  let bestAcc = 0;
  Object.values(data.quizScores).forEach(arr => {
    arr.forEach(r => {
      const acc = r.total ? (r.correct / r.total) * 100 : 0;
      if (acc > bestAcc) bestAcc = acc;
    });
  });
  setText('#stat-acc', Math.round(bestAcc) + '%');

  // recent quiz list (optional)
  const recentList = document.getElementById('recent-quiz');
  if (recentList) {
    const all = [];
    Object.entries(data.quizScores).forEach(([topic, arr]) => {
      arr.forEach(r => all.push({ topic, ...r }));
    });
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    recentList.innerHTML = '';
    all.slice(0, 5).forEach(r => {
      const li = document.createElement('li');
      const acc = r.total ? Math.round((r.correct / r.total) * 100) : 0;
      const d = new Date(r.date);
      li.innerHTML = `
        <span class="tag">${formatDate(d)}</span>
        <span class="desc"><strong>${r.topic}</strong> — ${r.correct} / ${r.total} 正解（${acc}%）</span>`;
      recentList.appendChild(li);
    });
    if (!all.length) {
      recentList.innerHTML = '<li><span class="tag">記録なし</span><span class="desc">まだクイズに挑戦していません。最初の一問からはじめましょう。</span></li>';
    }
  }
}

function setText(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/* Make Store available to inline scripts */
window.SwallowStore = Store;

// 画面の文が重なっていないか・切れていないか・画面の外へはみ出していないか（VERIFY-FREE.txt【3】の 1280×720）。
// tools/scenarios/verify-all.mjs（VERIFY_SIZE を付けた時）と verify-small.mjs が使う。

/**
 * 今の画面の、文の重なり・切れ・はみ出しを返す（無ければ空）。
 * 見るのは、見えている文の入った要素（自分の直下に文字がある物）。都市の絵（canvas）と、見せない物（visibility・大きさ 0）は除く
 */
export function layoutProblems(page, root = 'body') {
  return page.evaluate((sel) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const host = document.querySelector(sel) ?? document.body;
    const say = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    // 巻ける箱の中の物は、巻けば見える（切れではない）
    const scroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) return p;
      }
      return null;
    };
    // 自分の真ん中が、上に重なった別の層（レッスンの画面の下の都市の帯など）に隠れていない物
    const onTop = (el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), W - 1), Math.min(Math.max(r.top + r.height / 2, 0), H - 1));
      return hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const texts = [...host.querySelectorAll('*')].filter((el) => !el.closest('canvas, svg, [aria-hidden="true"], .sr-only, .visually-hidden') && ownText(el) && visible(el) && onTop(el));
    const out = [];
    for (const el of texts) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // 文が箱の幅で切れている（… で省いた物を含む）
      if (el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX) && el.clientWidth > 0) out.push(`切れ: 「${say(el)}」（幅 ${String(el.clientWidth)} に ${String(el.scrollWidth)}）`);
      if (el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(cs.overflowY) && el.clientHeight > 0 && cs.display !== 'inline') out.push(`切れ: 「${say(el)}」（高さ ${String(el.clientHeight)} に ${String(el.scrollHeight)}）`);
      // 画面の外へはみ出す（巻ける箱の中は除く）
      if (!scroller(el) && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1)) out.push(`はみ出し: 「${say(el)}」（${String(Math.round(r.left))},${String(Math.round(r.top))}〜${String(Math.round(r.right))},${String(Math.round(r.bottom))}）`);
      // 親のどれかが文を隠して切っている（巻けない箱の外にある）
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/(auto|scroll)/.test(ps.overflowY + ps.overflowX)) break;
        if (!/(hidden|clip)/.test(ps.overflowX + ps.overflowY)) continue;
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.bottom > pr.bottom + 2 || r.left < pr.left - 2 || r.top < pr.top - 2) out.push(`切れ: 「${say(el)}」が「${(p.className || p.tagName).toString().split(' ')[0]}」の外にある`);
        break;
      }
    }
    // 重なり: 親子でない 2 つの文（どちらも真ん中が見えている物）の、字の並ぶ行の箱が、縦横とも 3px より多く重なる。
    // 行の箱は、自分の直下の文字の範囲（Range）の行ごとの箱（折り返した文の中の用語のように、同じ段落の中で続く物を重ねて数えない）
    // 巻ける箱の中で、巻いて見えなくなった行は除く（箱の縁で切り取る）
    const lineBoxes = (el) => {
      // 自分が文を隠して切る箱（… で省く見出しなど）なら、自分の縁で切り取る（切れは上で数えた）
      const sc = /(hidden|clip)/.test(getComputedStyle(el).overflowX) ? el.getBoundingClientRect() : scroller(el)?.getBoundingClientRect();
      return [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim() !== '').flatMap((n) => {
        const range = document.createRange();
        range.selectNodeContents(n);
        return [...range.getClientRects()].map((r) => (sc ? { left: Math.max(r.left, sc.left), right: Math.min(r.right, sc.right), top: Math.max(r.top, sc.top), bottom: Math.min(r.bottom, sc.bottom) } : r));
      }).filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0);
    };
    const boxes = texts.map((el) => ({ el, rs: lineBoxes(el) }));
    // 縦に崩れた文: 2 字以上の語が、1〜2 字ずつの行に割れている（狭い列で 1 字ずつ折り返す）
    for (const { el, rs } of boxes) {
      const chars = (el.textContent ?? '').replace(/\s+/g, '').length;
      const em = parseFloat(getComputedStyle(el).fontSize) || 16;
      const rows = [...new Set(rs.map((r) => Math.round(r.top)))].length;
      if (chars >= 2 && rows >= 2 && rs.every((r) => r.right - r.left < em * 2.2)) out.push(`崩れ: 「${say(el)}」が 1〜2 字ずつの行に割れる（${String(rows)} 行）`);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const hit = a.rs.some((ra) => b.rs.some((rb) => Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 3 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 3));
        if (hit) out.push(`重なり: 「${say(a.el)}」と「${say(b.el)}」`);
      }
    }
    return [...new Set(out)];
  }, root);
}

/** 「今打てるコマンドの候補」の行が収まっているか（はみ出さない・折り返しで崩れない）。無ければ null */
export function candidatesProblem(page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="practice-candidates"]');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    const box = row.parentElement?.getBoundingClientRect();
    const items = [...row.querySelectorAll('.practice-candidate')].map((c) => c.getBoundingClientRect());
    const problems = [];
    if (row.scrollWidth > row.clientWidth + 1) problems.push(`候補の行が横にはみ出す（幅 ${String(row.clientWidth)} に ${String(row.scrollWidth)}）`);
    if (box && (r.right > box.right + 1 || r.left < box.left - 1)) problems.push('候補の行が枠の外に出る');
    if (r.right > window.innerWidth + 1) problems.push('候補の行が画面の外に出る');
    // 1 つの候補が 2 行に割れる（札の高さが 1 行の高さより大きい）
    const lineH = Math.min(...items.map((x) => x.height));
    if (items.some((x) => x.height > lineH * 1.5)) problems.push('候補の札が折り返しで 2 行に割れる');
    // 札どうしが重なる
    for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) problems.push('候補の札が重なる');
    }
    return problems.length ? [...new Set(problems)].join('・') : null;
  });
}

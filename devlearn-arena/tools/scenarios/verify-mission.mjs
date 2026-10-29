#!/usr/bin/env node
// ミッション 6 本を、都市の画面から受けて最後まで通す（VERIFY-FREE.txt【4】）。
//
//   node tools/scenarios/verify-mission.mjs                 全て
//   node tools/scenarios/verify-mission.mjs https incident  ID で絞る
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-mission.mjs
//   VERIFY_JOBS=3                                          同時に通す数（既定 3）
//
// 1 本ごとに、ヒントの通り（ヒントを最後の段まで開き、最後のヒントの行を打つ）と、別解（tools/scenarios/variants/mission-<ID>.json。
// ヒントを開かない）の全ての通りを、それぞれ新しい記録で通す。1 つの通りで確かめること:
//   1. 上の帯の「ミッション」から一覧を開き、6 本が並ぶ。そのミッションを選ぶと「必要な知識」が中身の数だけ出る（決着 D-15）
//   2. 受ける → 実戦の全ての手順が達成になる。正しい操作でエラーの案内が出ない（出てよいのは、その手順の想定エラーで、その手順の間に出た物）
//   3. 結果で「ミッション達成」と報酬が出て、XP と開発資金が増える（決着 D-13）
//   4. 都市に戻ると、建設メニューの公園に報酬の景観（記念碑）が並び、置くと都市に見える
//   5. 施設の情報パネルの「ミッション」に、施設の Lv の数だけ並ぶ（決着 D-14。ヒントの通りの時だけ、
//      そのミッションの最初の分野の施設を置いて Lv1 と Lv3 で見る。Lv は記録を書き換えて上げる）
// 結果は shots/verify-mission/results.json と table.md。不合格の画面は shots/verify-mission/<ID>-<通り>.png。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { at, days, facility, untilBuilt } from './town.mjs';
import { openCity, siteRoot } from './verify-lesson.mjs';

const DIR = 'shots/verify-mission';
const ROOT = new URL('../../content/missions/', import.meta.url);
const wait = (page, ms = 250) => page.waitForTimeout(ms);
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const cell = (s) => squash(s).replace(/\|/g, '\\|');
const IDS = ['web-server', 'incident', 'https', 'git-history', 'container-run', 'k8s-app'];
/** ミッションの最初の分野の施設（docs/city-design.md の分野と施設の対応） */
const FACILITY_OF = { linux: 'server', trouble: 'incident', sec: 'security', git: 'devoffice', ctr: 'container', k8s: 'cluster', web: 'web', net: 'network', docker: 'container' };

const mission = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, ROOT), 'utf8'));
const variantsOf = (id) => {
  const f = new URL(`./variants/mission-${id}.json`, import.meta.url);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).variants : [];
};
/** 最後のヒントの `...`（打つ物） */
const answersOf = (step) => [...step.hints[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const game = (page) => page.evaluate(() => ({ xp: window.__game.progress().xp, funds: window.__cityStore.getState().city.funds, landmarks: window.__cityStore.getState().city.facilities.filter((f) => f.landmark).map((f) => f.landmark) }));

async function verifyMission(page, m, path) {
  const rec = { id: m.id, path: path.name, ok: false, stage: '一覧', did: [], saw: '', shot: null, errors: [], designed: [], notes: [] };
  const fail = (what) => new Error(what);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  try {
    // 1. 一覧から受ける。必要な知識
    await page.click('.topbar-entry:has-text("ミッション")');
    await page.waitForSelector('[data-testid="missions-screen"]');
    const rows = await page.locator('[data-testid^="mission-row-"]').count();
    if (rows !== IDS.length) throw fail(`ミッション一覧に ${String(rows)} 本（${String(IDS.length)} 本のはず）`);
    await page.click(`[data-testid="mission-row-${m.id}"]`);
    await wait(page);
    const knowledge = await page.locator('[data-testid="mission-detail"] [data-testid="mission-knowledge"] li').count();
    if (knowledge !== m.knowledge.length) throw fail(`必要な知識が ${String(knowledge)} 行（中身は ${String(m.knowledge.length)} 行）`);
    rec.did.push(`一覧から選び、必要な知識 ${String(knowledge)} 行を見た`);
    const before = await game(page);
    await page.click('[data-testid="mission-start"]');
    await page.waitForSelector('[data-testid="mission-screen"]');
    await page.waitForSelector('.term-host .xterm');
    await wait(page, 500);

    // 2. 実戦
    rec.stage = '実戦';
    await page.evaluate(() => {
      window.__seenErrors = [];
      let last = '';
      new MutationObserver(() => {
        const el = document.querySelector('[data-testid="practice-error"]');
        const sig = el ? `${el.getAttribute('data-guide')}\n${el.innerText}` : '';
        if (sig && sig !== last) window.__seenErrors.push({ guide: el.getAttribute('data-guide'), text: squashText(el.innerText), current: document.querySelector('.practice-step.is-current')?.getAttribute('data-step') ?? null });
        last = sig;
        function squashText(s) { return s.replace(/\s+/g, ' ').trim(); }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
    for (const step of m.practice.steps) {
      if ((await page.getAttribute(`[data-step="${step.id}"]`, 'data-done')) === 'true') continue;
      let lines;
      if (path.steps) {
        lines = path.steps[step.id] ?? [];
      } else {
        for (let k = 0; k < 3 && (await page.$('[data-testid="practice-hint"]')); k += 1) await page.click('[data-testid="practice-hint"]');
        lines = answersOf(step);
      }
      for (const line of lines) {
        await page.click('.term-host');
        await page.keyboard.type(line, { delay: 8 });
        await page.keyboard.press('Enter');
        await wait(page, 600);
        rec.did.push(`手順 ${step.id}: $ ${squash(line)}`);
        const seen = await page.evaluate(() => (window.__seenErrors ?? []).splice(0));
        for (const g of seen) {
          const designed = g.current === step.id && (step.expectedErrors ?? []).includes(g.guide);
          (designed ? rec.designed : rec.errors).push({ line: squash(line), step: step.id, guide: g.guide, text: g.text });
          if (!designed && !rec.shot) {
            mkdirSync(DIR, { recursive: true });
            rec.shot = `${DIR}/${m.id}-${path.tag}.png`;
            await page.screenshot({ path: rec.shot });
          }
        }
        if (await page.$('[data-testid="practice-error"]')) await page.locator('.practice-error-close').click().catch(() => {});
      }
    }
    const unfinished = await page.evaluate(() => [...document.querySelectorAll('.practice-step')].filter((s) => s.dataset.done !== 'true').map((s) => s.dataset.step));
    if (rec.errors.length) throw fail(`正しい操作でエラーの案内が出た: ${rec.errors.map((e) => `${e.line} → ${e.guide}`).join(' ／ ')}`);
    if (unfinished.length) throw fail(`全ての操作をしたのに、まだの手順がある: ${unfinished.join('・')}`);

    // 3. 結果と報酬
    rec.stage = '結果';
    await page.click('[data-testid="lesson-next"]');
    await page.waitForSelector('[data-testid="mission-result"]');
    await wait(page, 400);
    const kind = squash(await page.locator('[data-testid="mission-result-kind"]').innerText());
    const rewarded = await page.getAttribute('[data-testid="mission-result"]', 'data-rewarded');
    if (rewarded !== 'true') throw fail(`報酬が入らない: 「${kind}」`);
    const prize = squash(await page.locator('[data-testid="mission-prize"]').innerText());
    const after = await game(page);
    rec.notes.push(`${kind}。XP +${String(after.xp - before.xp)}・開発資金 +${String(after.funds - before.funds)}`);
    if (after.xp - before.xp < m.rewards.xp) throw fail(`XP が報酬（${String(m.rewards.xp)}）だけ増えない: +${String(after.xp - before.xp)}`);
    if (after.funds - before.funds < m.rewards.funds) throw fail(`開発資金が報酬（${String(m.rewards.funds)}）だけ増えない: +${String(after.funds - before.funds)}`);
    rec.did.push(`結果: ${kind}・${prize.slice(0, 80)}`);

    // 4. 都市へ戻り、報酬の景観を置く
    rec.stage = '都市へ戻る';
    await page.click('[data-testid="mission-to-city"]');
    await page.waitForSelector('[data-testid="city-screen"]');
    await wait(page, 900);
    if (m.rewards.landmark) {
      await page.keyboard.press('Escape');
      const group = page.locator('[data-testid="build-group-park"]');
      if ((await group.getAttribute('aria-pressed')) !== 'true') await group.click();
      const button = page.locator(`[data-testid="build-monument-${m.rewards.landmark}"]`);
      if (!(await button.count())) throw fail(`建設メニューの公園に、報酬の景観（${m.rewards.landmark}）が無い`);
      await button.click();
      await page.evaluate(() => window.__city.focusOn(47, 47));
      await wait(page, 300);
      // 置ける所を探す（道路の脇。置けなければ隣のマスを試す）
      for (const [x, y] of [[48, 48], [49, 48], [48, 49], [46, 48], [50, 49], [45, 45]]) {
        const p = await at(page, x, y);
        await page.mouse.move(p.sx, p.sy, { steps: 3 });
        await page.mouse.down();
        await page.mouse.up();
        await wait(page, 300);
        if ((await game(page)).landmarks.includes(m.rewards.landmark)) break;
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      if (!(await game(page)).landmarks.includes(m.rewards.landmark)) throw fail(`報酬の景観（${m.rewards.landmark}）を都市に置けない`);
      await days(page, 2);
      const seen = await page.evaluate((lm) => {
        const f = window.__cityStore.getState().city.facilities.find((x) => x.landmark === lm);
        const p = window.__city.screenOf(f.origin.x + 0.5, f.origin.y + 0.5);
        return p.sx > 0 && p.sy > 0 && p.sx < window.innerWidth && p.sy < window.innerHeight;
      }, m.rewards.landmark);
      if (!seen) throw fail('置いた景観が画面の外にある');
      mkdirSync(DIR, { recursive: true });
      await page.screenshot({ path: `${DIR}/${m.id}-${path.tag}-landmark.png` });
      rec.did.push(`都市に戻り、公園から景観 ${m.rewards.landmark} を置いた`);
    }

    // 5. 施設の情報パネルの「ミッション」の数（ヒントの通りの時だけ）
    if (path.tag === 'hint') {
      rec.stage = '情報パネル';
      const type = FACILITY_OF[m.domains[0]];
      await page.evaluate(() => {
        const s = window.__cityStore.getState();
        s.setCity({ ...s.city, funds: s.city.funds + 20000 });
        window.__city.focusOn(44, 46);
      });
      await wait(page, 300);
      await facility(page, type, [41, 45]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // 置くと申請になる。審議と工事が終わるまで時間を進める（docs/game-design.md 15 章）
      if (!(await untilBuilt(page, type))) throw fail(`施設 ${type} の申請が完成しない`);
      const count = async (level) => {
        await page.evaluate(([t, lv]) => {
          const s = window.__cityStore.getState();
          s.setCity({ ...s.city, facilities: s.city.facilities.map((f) => (f.type === t ? { ...f, level: lv } : f)) });
        }, [type, level]);
        await wait(page, 200);
        const f = await page.evaluate((t) => window.__cityStore.getState().city.facilities.find((x) => x.type === t), type);
        if (!f) throw fail(`施設 ${type} を置けない`);
        const p = await at(page, f.origin.x + 1, f.origin.y + 1);
        await page.mouse.click(p.sx, p.sy);
        await page.waitForSelector('[data-testid="info-panel"]', { timeout: 5000 });
        await wait(page, 300);
        const n = await page.locator('[data-testid="info-missions"] li').count();
        await page.keyboard.press('Escape');
        return n;
      };
      const want = (lv) => Math.min(lv, IDS.map(mission).filter((x) => x.domains.some((d) => FACILITY_OF[d] === type)).length);
      const lv1 = await count(1);
      const lv3 = await count(3);
      rec.did.push(`施設 ${type} の情報パネルのミッション: Lv1 で ${String(lv1)} 本・Lv3 で ${String(lv3)} 本`);
      if (lv1 !== want(1) || lv3 !== want(3)) throw fail(`情報パネルのミッションの数が Lv と合わない: Lv1 で ${String(lv1)}（${String(want(1))} のはず）・Lv3 で ${String(lv3)}（${String(want(3))} のはず）`);
    }
    if (pageErrors.length) throw fail(`ページの誤り: ${pageErrors.join(' ／ ')}`);
    rec.ok = true;
    rec.stage = '';
  } catch (e) {
    rec.saw = squash(e instanceof Error ? e.message : String(e)).slice(0, 600);
    if (!rec.shot) {
      mkdirSync(DIR, { recursive: true });
      rec.shot = `${DIR}/${m.id}-${path.tag}.png`;
      await page.screenshot({ path: rec.shot }).catch(() => {});
    }
  }
  return rec;
}

const args = process.argv.slice(2);
const ids = IDS.filter((id) => args.length === 0 || args.includes(id));
const { chromium } = await import('playwright');
const jobs = Number(process.env.VERIFY_JOBS ?? 3);
const { root, close } = await siteRoot();
const browser = await chromium.launch();
const results = [];
const t0 = Date.now();
try {
  const queue = ids.flatMap((id) => [{ id, path: { name: 'ヒントの通り', tag: 'hint' } }, ...variantsOf(id).map((v, k) => ({ id, path: { ...v, tag: String(k + 1) } }))]);
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const opened = await openCity(browser, root);
      const rec = await verifyMission(opened.page, mission(job.id), job.path);
      await opened.context.close();
      results.push(rec);
      console.log(`${rec.ok ? '合格' : '不合格'} ${rec.id} ${rec.path}${rec.ok ? ` ${rec.notes.join('・')}` : ` [${rec.stage}] ${rec.saw}`}`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
} finally {
  await browser.close();
  await close();
}
console.log(`（${String(Math.round((Date.now() - t0) / 1000))} 秒）`);
mkdirSync(DIR, { recursive: true });
const order = (r) => IDS.indexOf(r.id) * 10 + (r.path === 'ヒントの通り' ? 0 : 1);
results.sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path));
writeFileSync(`${DIR}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(`${DIR}/table.md`, ['| ミッション | 通り | 結果 | 起きたこと | 画像 |', '|---|---|---|---|---|', ...results.map((r) => `| ${r.id} | ${cell(r.path)} | ${r.ok ? '合格' : `不合格 [${r.stage}]`} | ${cell(r.ok ? [...r.notes, ...r.did.filter((d) => d.startsWith('施設'))].join('・') + (r.designed.length ? `。想定した案内: ${r.designed.map((d) => `${d.guide}（\`${d.line}\`）`).join('・')}` : '') : r.saw)} | ${r.ok || !r.shot ? '' : `\`${r.shot}\``} |`), ''].join('\n'));
const bad = results.filter((r) => !r.ok);
console.log(`${String(results.length)} 通り中 合格 ${String(results.length - bad.length)}・不合格 ${String(bad.length)}`);
process.exitCode = bad.length ? 1 : 0;

#!/usr/bin/env node
// 都市の画面を、小さい画面（既定 1280×720）で確かめる（VERIFY-FREE.txt【3】）。
//
//   node tools/scenarios/verify-city-size.mjs
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-city-size.mjs
//   VERIFY_SIZE=1280x720                                 画面の大きさ（既定 1280x720）
//
// 新しい記録で都市の画面を開き、操作説明を閉じてから、次を見る。
//   - 常時の UI（上の帯・おすすめの欄・建設メニュー・ミニマップ・表示切替）の面積の合計が画面の 20% 以内（docs/visual-design.md V9）
//   - ミニマップが 100×100、おすすめの欄の高さが 120 まで（画面の高さが 900 未満。docs/decisions.md D-18）
//   - 文が重ならない・切れない・はみ出さない（tools/scenarios/layoutCheck.mjs）
//   建設メニューの引き出しを開いた時も、文の崩れを見る
// 画像は shots/verify-city-<幅>/。結果は同じ場所の results.json。
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutProblems } from './layoutCheck.mjs';
import { openCity, siteRoot } from './verify-lesson.mjs';

const [W, H] = (process.env.VERIFY_SIZE ?? '1280x720').split('x').map(Number);
const DIR = `shots/verify-city-${String(W)}`;
const PARTS = { 上の帯: 'topbar', おすすめの欄: 'recommend', 建設メニュー: 'build-menu', ミニマップ: 'minimap', 表示切替: 'overlay-toggle' };

const { chromium } = await import('playwright');
const { root, close } = await siteRoot();
const browser = await chromium.launch();
const out = { size: `${String(W)}x${String(H)}`, parts: {}, ratio: 0, problems: [], shots: [] };
try {
  mkdirSync(DIR, { recursive: true });
  const { context, page } = await openCity(browser, root, { width: W, height: H });
  await page.waitForTimeout(800);
  const shot = async (name) => {
    const path = `${DIR}/${name}.png`;
    await page.screenshot({ path });
    out.shots.push(path);
  };
  for (const [name, id] of Object.entries(PARTS)) {
    const box = await page.locator(`[data-testid="${id}"]`).first().boundingBox().catch(() => null);
    out.parts[name] = box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null;
    if (!box) out.problems.push(`${name}が見えない`);
  }
  // 面積は 2 画素の格子で数える（重なった所を 2 度数えない。tools/scenarios/inspect.mjs の uiShare と同じ）
  out.ratio = await page.evaluate((ids) => {
    const rects = ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()).filter(Boolean);
    let covered = 0;
    for (let y = 1; y < window.innerHeight; y += 2) for (let x = 1; x < window.innerWidth; x += 2) if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered += 1;
    return Math.round((covered / ((window.innerWidth / 2) * (window.innerHeight / 2))) * 1000) / 10;
  }, Object.values(PARTS));
  if (out.ratio > 20) out.problems.push(`常時の UI が画面の ${String(out.ratio)}%（20% を超える）`);
  const map = await page.locator('[data-testid="minimap"] canvas').boundingBox().catch(() => null);
  out.minimap = map ? `${String(Math.round(map.width))}x${String(Math.round(map.height))}` : null;
  const small = H < 900;
  if (small && out.minimap !== '100x100') out.problems.push(`ミニマップが 100×100 でない（${String(out.minimap)}）`);
  // おすすめの欄は、中身が多くても高さ 120 まで（畳まない時）
  const rec = await page.locator('[data-testid="recommend"]').boundingBox().catch(() => null);
  out.recommend = rec ? Math.round(rec.height) : null;
  if (small && (out.recommend === null || out.recommend > 120)) out.problems.push(`おすすめの欄の高さが 120 を超える（${String(out.recommend)}）`);
  const city = await layoutProblems(page);
  if (city.length) out.problems.push(...city.map((x) => `都市: ${x}`));
  await shot('city');

  // 建設メニューの引き出し
  const first = page.locator('[data-testid="build-menu"] button').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(400);
    const drawer = await layoutProblems(page);
    if (drawer.length) out.problems.push(...drawer.map((x) => `建設メニューの引き出し: ${x}`));
    await shot('build-drawer');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  await context.close();
} finally {
  await browser.close();
  await close();
}
writeFileSync(`${DIR}/results.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
process.exitCode = out.problems.length ? 1 : 0;

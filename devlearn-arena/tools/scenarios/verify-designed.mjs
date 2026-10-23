#!/usr/bin/env node
// 「想定した失敗」の 8 本を、遊ぶ側の目で見直すための画面を撮る（VERIFY-FREE.txt【5】）。
//
//   node tools/scenarios/verify-designed.mjs
//   VERIFY_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ node tools/scenarios/verify-designed.mjs
//
// 8 本を、最後のヒントの通り（tools/scenarios/verify-lesson.mjs）に通し、想定した失敗の案内が出た瞬間の画面を撮る。
// その時の手順の目的の文と、案内の文（何と言われたか・考えられる理由・次に確かめること）を残す。
// 画像は shots/verify-designed/<ID>-<番号>.png、文は shots/verify-designed/results.json。
import { mkdirSync, writeFileSync } from 'node:fs';
import { openCity, siteRoot, verifyLesson } from './verify-lesson.mjs';

const DIR = 'shots/verify-designed';
const IDS = ['git.b.06', 'git.i.05', 'git.i.02', 'trouble.b.02', 'docker.b.01', 'net.b.03', 'net.i.01', 'net.i.02'];

const { chromium } = await import('playwright');
const { root, close } = await siteRoot();
const browser = await chromium.launch();
const out = [];
mkdirSync(DIR, { recursive: true });
try {
  for (const id of IDS) {
    const { context, page } = await openCity(browser, root);
    const seen = [];
    const rec = await verifyLesson(page, id, {
      shotDir: DIR,
      onDesigned: async (g) => {
        const shot = `${DIR}/${id}-${String(seen.length + 1)}.png`;
        await page.screenshot({ path: shot });
        const screen = await page.evaluate(() => {
          const sq = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
          const el = document.querySelector('[data-testid="practice-error"]');
          const flow = el ? [...el.querySelectorAll('.practice-error-flow > li')].map((li) => sq(li.querySelector('p')?.innerText)) : [];
          return {
            purpose: sq(document.querySelector('.practice-step.is-current .practice-step-text')?.innerText),
            title: sq(el?.querySelector('.practice-error-title, h3, header')?.innerText),
            said: sq(el?.querySelector('.practice-error-said')?.innerText),
            meaning: flow[0] ?? '',
            causes: el ? [...el.querySelectorAll('.practice-error-causes li')].map((li) => sq(li.innerText)) : [],
            next: flow[2] ?? '',
          };
        });
        seen.push({ step: g.step, line: g.line, guide: g.guide, shot, ...screen });
      },
    });
    await context.close();
    out.push({ id, ok: rec.ok, saw: rec.saw, designed: seen });
    console.log(`${id}: ${rec.ok ? '通った' : `止まった ${rec.saw}`}・想定した案内 ${String(seen.length)} 回`);
  }
} finally {
  await browser.close();
  await close();
}
writeFileSync(`${DIR}/results.json`, `${JSON.stringify(out, null, 2)}\n`);

// 成長の仕組みを確かめる台本（docs/development-plan.md Phase 4）。
//
//   SHOOT_SCRIPT=tools/scenarios/growth.mjs npm run shoot -- p4-end
//   SHOOT_SIZE=1280x720 SHOOT_SCRIPT=tools/scenarios/growth.mjs npm run shoot -- p4-end-1280
//
// 学習の記録が無い状態 → 模擬の学習記録を与える → 上の帯の XP・資金・エンジニア段階 → XP を押して成長画面 → 分野を選んで内訳 → Esc で都市へ。
import { readFileSync } from 'node:fs';
import { learn, mockRecords } from './learning.mjs';

const LESSONS = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;

async function topbar(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="topbar"]');
    return el ? el.innerText.replace(/\s+/g, ' ') : '';
  });
}

export default async function growth(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  console.log('始め', await topbar(page));
  await shot(`p4-start${tag}`);

  // 記録が無い時の成長画面
  await page.click('[data-testid="topbar-xp"]');
  await page.waitForSelector('[data-testid="growth-screen"]');
  await page.waitForTimeout(300);
  console.log('ハッシュ', await page.evaluate(() => window.location.hash));
  await shot(`p4-growth-empty${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('Esc の後', await page.evaluate(() => ({ hash: window.location.hash, open: !!document.querySelector('[data-testid="growth-screen"]') })));

  // 2 週間、毎日 4 本ずつ、各分野の初級を推奨学習順の表の順に学んだ記録（誤答・ヒント・回復・復習を含む）
  const order = LESSONS.filter((l) => l.id.includes('.b.')).map((l) => l.id);
  const result = await learn(page, mockRecords({ days: 14, perDay: 4, order }));
  console.log('学んだ後', JSON.stringify(result));
  await page.waitForTimeout(300);
  console.log('上の帯', await topbar(page));
  await shot(`p4-topbar${tag}`);

  await page.click('[data-testid="topbar-xp"]');
  await page.waitForSelector('[data-testid="growth-screen"]');
  await page.waitForTimeout(300);
  await shot(`p4-growth${tag}`);

  await page.click('[data-testid="skill-linux"]');
  await page.waitForTimeout(200);
  console.log('Linux の内訳', await page.evaluate(() => document.querySelector('[data-testid="skill-breakdown"]')?.innerText.replace(/\s+/g, ' ')));
  await shot(`p4-growth-linux${tag}`);

  // 画面の中の同じ形の札の数（V7: 6 枚以上並ばない）と、窓の大きさ
  console.log('窓', await page.evaluate(() => {
    const r = document.querySelector('.growth')?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height), share: Math.round((r.width * r.height * 1000) / (window.innerWidth * window.innerHeight)) / 10 } : null;
  }));

  // 直リンク（#/growth）でも開き、上の帯の都市名で都市へ戻れる
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.location.hash = '#/growth';
  });
  await page.waitForSelector('[data-testid="growth-screen"]');
  await page.click('.topbar-city');
  await page.waitForTimeout(200);
  console.log('都市名を押した後', await page.evaluate(() => ({ hash: window.location.hash, open: !!document.querySelector('[data-testid="growth-screen"]') })));
}

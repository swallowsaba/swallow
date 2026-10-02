// 模擬の学習記録（docs/development-plan.md Phase 4: レッスンの画面が無い間は、模擬の学習記録で動かす）。
//
// 推奨学習順（content/catalog.json の目録の順）に、毎日いくつかのレッスンを学んだ記録を作り、
// ページの window.__game.learn に渡す。誤答・ヒント・エラーからの回復・復習も混ぜる（同じ引数からは同じ記録）。
import { readFileSync } from 'node:fs';

const LESSONS = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8')).lessons;

const pad = (n) => String(n).padStart(2, '0');

/** 端末の地方時の ISO 文字列（src/screens/clock.ts と同じ形） */
export function localIso(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.trunc(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/**
 * days 日前から今日まで、1 日に perDay 本ずつ学んだ記録。
 * order を渡すと、その ID の並びで学ぶ（既定は推奨学習順の表の順）。
 */
export function mockRecords({ days = 14, perDay = 4, order = LESSONS.map((l) => l.id), reviews = true } = {}) {
  const records = [];
  const now = new Date();
  const INTERVALS = [1, 3, 7, 14, 30];
  let k = 0;
  /** 学んだレッスンの復習カードの写し（t は 0 日目からの日数） */
  const cards = [];
  for (let t = 0; t < days; t += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - t), 19, 0, 0);
    // 復習: 予定日が来たカードに答える。7 枚に 1 枚は復習をさぼり（予定日を過ぎる）、5 回に 1 回は誤答（1 日後からやり直し）
    if (reviews) {
      let i = 0;
      for (const c of cards) {
        if (c.due > t || c.skip) continue;
        const correct = (c.n + i) % 5 !== 3;
        records.push({ kind: 'review', cardId: `review.${c.id}`, correct, at: localIso(new Date(day.getTime() - 3600_000 + i * 60_000)) });
        c.interval = correct ? (INTERVALS.find((x) => x > c.interval) ?? 30) : 1;
        c.due = t + c.interval;
        c.n += 1;
        i += 1;
      }
    }
    for (let n = 0; n < perDay && k < order.length; n += 1, k += 1) {
      const id = order[k];
      const at = localIso(new Date(day.getTime() + n * 40 * 60_000));
      const quiz = [1, 2, 3, 4].flatMap((q) => {
        // 3 問に 1 問くらい初回で誤答し、2 回目で正解する
        const wrong = (k * 7 + q * 3) % 9 === 0 || (k + q) % 6 === 0;
        return wrong ? [{ quizId: `${id}.q${q}`, correct: false }, { quizId: `${id}.q${q}`, correct: true }] : [{ quizId: `${id}.q${q}`, correct: true }];
      });
      const hints = k % 4 === 1 ? 1 : k % 7 === 3 ? 2 : 0;
      const practice = k % 5 === 2 ? [{ success: false }, { success: true, hintsUsed: hints, recoveredFromError: true }] : [{ success: true, hintsUsed: hints }];
      records.push({ kind: 'lesson', lessonId: id, at, quiz, practice, complete: true });
      cards.push({ id, due: t + 1, interval: 1, n: k, skip: k % 7 === 5 });
    }
  }
  return records;
}

/** ページに記録を与え、得た資金と XP を返す */
export async function learn(page, records) {
  return page.evaluate((r) => {
    const o = window.__game.learn(r);
    return { funds: o.funds, xp: window.__game.progress().xp, skillUps: o.skillUps.length };
  }, records);
}

/** 資金が amount 以上になるまで、推奨学習順に学ぶ（町を作る台本が使う） */
export async function fundBy(page, amount) {
  const have = await page.evaluate(() => window.__cityStore.getState().city.funds);
  if (have >= amount) return;
  const records = mockRecords({ days: 30, perDay: 8 });
  for (let i = 0; i < records.length; i += 20) {
    await learn(page, records.slice(i, i + 20));
    const funds = await page.evaluate(() => window.__cityStore.getState().city.funds);
    if (funds >= amount) return;
  }
}

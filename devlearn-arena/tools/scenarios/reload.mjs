// リロードしても進捗が消えないこと（docs/data-model.md 7 章。IndexedDB に自動保存し、開き直すと元に戻る）。
//
//   SHOOT_SCRIPT=tools/scenarios/reload.mjs npm run shoot -- reload
//
// 模擬の学習記録を与え、都市を少し進め、2 秒の自動保存を待ってからリロードする。
// リロードの前後で、学習の記録・XP・都市の資金と日付を比べ、違えば誤りにする。
import { mockRecords } from './learning.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const snapshot = (page) =>
  page.evaluate(() => {
    const p = window.__game.progress();
    const done = Object.values(p.lessons).filter((l) => l.status === 'completed').length;
    return { xp: p.xp, lessons: Object.keys(p.lessons).length, done };
  });

export default async function reload(page, shot) {
  await page.evaluate((records) => window.__game.learn(records), mockRecords({ days: 5, perDay: 3 }));
  const before = await snapshot(page);
  await shot('reload-before');
  await sleep(2600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.cityReady === '1', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const after = await snapshot(page);
  console.log(`リロード前 ${JSON.stringify(before)} → 後 ${JSON.stringify(after)}`);
  if (JSON.stringify(before) !== JSON.stringify(after) || before.lessons === 0) throw new Error('リロードで学習の記録が戻らなかった');
}

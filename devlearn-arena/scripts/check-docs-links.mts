/**
 * カリキュラムに紐付いた出典 URL が生きているかを確かめる。
 *
 * ネットワークに出るので `npm run verify` には入れない。
 * 出典を足したり書き換えたりしたら `npm run links` を手で回す。
 * リダイレクトも失格にする（移動先が正典なら、そちらを書くべきなので）。
 */
import { allLessons } from '../src/content/catalog';

interface Row {
  url: string;
  status: number;
  finalUrl: string;
  lessons: string[];
}

const byUrl = new Map<string, string[]>();
for (const lesson of allLessons()) {
  for (const ref of lesson.docs) {
    const list = byUrl.get(ref.url) ?? [];
    list.push(lesson.id);
    byUrl.set(ref.url, list);
  }
}

const CONCURRENCY = 6;
const urls = [...byUrl.keys()].sort();
const rows: Row[] = [];

async function check(url: string): Promise<Row> {
  const lessons = byUrl.get(url) ?? [];
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'devlearn-arena-link-check' },
    });
    return { url, status: response.status, finalUrl: response.url, lessons };
  } catch (error) {
    return { url, status: 0, finalUrl: String(error), lessons };
  }
}

let cursor = 0;
async function worker(): Promise<void> {
  while (cursor < urls.length) {
    const url = urls[cursor];
    cursor += 1;
    if (url === undefined) return;
    rows.push(await check(url));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

const broken = rows.filter((r) => r.status !== 200);
const moved = rows.filter((r) => r.status === 200 && r.finalUrl !== r.url);

for (const row of broken) {
  process.stdout.write(`NG   ${String(row.status)} ${row.url}\n     ${row.lessons.join(', ')}\n`);
}
for (const row of moved) {
  process.stdout.write(`移動 ${row.url}\n  -> ${row.finalUrl}\n     ${row.lessons.join(', ')}\n`);
}
process.stdout.write(
  `${String(rows.length)} 件中 ${String(broken.length)} 件が到達不能、${String(moved.length)} 件が移動\n`,
);
if (broken.length > 0 || moved.length > 0) process.exitCode = 1;

/**
 * 全レッスンの目録（content/catalog.json）を、docs/curriculum.md の表から書き起こす。
 *
 *   npm run catalog
 *
 * 推奨学習順（2 章の分野の順 → 各表の行の順）に並べる。研究（総合演習）の表には実戦の列が無いので、
 * 実戦の形は docs/lessons/lab.md の設計から取る。仕様書を直したら、これを回して目録を作り直す。
 * 目録が仕様書と食い違っていないかは src/content/catalog.test.ts が確かめる。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from '../src/content/curriculum';

const root = join(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const domains = (JSON.parse(read('content/domains.json')) as { domains: { id: string; name: string }[] }).domains;
const designs = Object.fromEntries(domains.map((d) => [d.id, read(`docs/lessons/${d.id}.md`)]));
const catalog = buildCatalog(read('docs/curriculum.md'), domains, designs);
writeFileSync(join(root, 'content/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`content/catalog.json: ${String(catalog.lessons.length)} 本（分野の順: ${catalog.domainOrder.join(' → ')}）`);

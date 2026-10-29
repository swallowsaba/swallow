// 版 4 の保存データのファイルを、版 3 の形のファイルにする（e2e/saves-v4.spec.ts が、版 3 → 版 4 の移行を画面で確かめるのに使う）。
// 版 4 で足した模擬と市政の項目を除き、都市規模は版 3 の数え方（区画の建物の定員。src/city/growth.ts の statsOf）にする。
// src/save/saveData.test.ts の v3Save と同じ作り方。
//
//   npx vite-node tools/v3-save.mts <版 4 のファイル> <書き出す版 3 のファイル>
import { readFileSync, writeFileSync } from 'node:fs';
import { statsOf } from '../src/city/growth.ts';
import type { City } from '../src/city/types.ts';

const WORLD_KEYS = ['sim', 'history', 'applications', 'politics', 'budget', 'petitions', 'rewards'];
const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error('使い方: npx vite-node tools/v3-save.mts <版 4 のファイル> <版 3 のファイル>');
const v4 = JSON.parse(readFileSync(from, 'utf8')) as Record<string, unknown> & { city: City };
const v3: Record<string, unknown> = { ...v4, version: 3, city: { ...v4.city, population: statsOf(v4.city).population } };
for (const k of WORLD_KEYS) delete v3[k];
writeFileSync(to, JSON.stringify(v3));
console.log(`${to}: 版 3・都市規模 ${String((v3.city as City).population)}`);

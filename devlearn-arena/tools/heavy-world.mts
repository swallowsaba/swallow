// 最も重い見本の都市（tools/bench-sim.mjs と同じ gridCity(true)）を、保存データの世界の JSON に書き出す。
// fps を測る台本（tools/scenarios/heavy-g12.mjs）が、ページに読み込ませる。
//
//   npx vite-node tools/heavy-world.mts shots/heavy-world.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gridCity } from '../src/sim/__fixtures__/cities.ts';

const file = process.argv[2] ?? 'shots/heavy-world.json';
const { world } = gridCity(true);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(world));
console.log(`${file}: 建物 ${String(world.city.buildings.length)}・施設 ${String(world.city.facilities.length)}・人口 ${String(world.city.population)}`);

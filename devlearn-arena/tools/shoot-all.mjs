#!/usr/bin/env node
// 登録してある場面を、上から順に 1 つずつ撮る。
//
//   node tools/shoot-all.mjs [場面名...]
//
// ブラウザは同時に 1 つまで（CLAUDE.md の検証の規則 2）。
// WebGL をソフトウェアで描くブラウザは 1 つで 1〜2 GiB 使うので、
// 並べて走らせるとメモリ不足で落ちる。だから必ず直列で回す。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SCENES } from './scenes.mjs';

const asked = process.argv.slice(2);
const names = asked.length > 0 ? asked : Object.keys(SCENES);

const unknown = names.filter((name) => SCENES[name] === undefined);
if (unknown.length > 0) {
  console.error(`知らない場面: ${unknown.join(', ')}`);
  process.exit(1);
}

// dist が無いと preview が立たない。撮る前に 1 度だけ建てる
if (!existsSync('dist/index.html')) {
  console.log('dist が無いので先に組み立てる');
  const built = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status ?? 1);
  spawnSync(process.execPath, ['scripts/postbuild.mjs'], { stdio: 'inherit' });
}

const failed = [];
for (const name of names) {
  console.log(`--- ${name} ---`);
  const shot = spawnSync(process.execPath, ['tools/shoot.mjs', name], { stdio: 'inherit' });
  if (shot.status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.error(`撮れなかった場面: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`${String(names.length)} 場面を撮った`);

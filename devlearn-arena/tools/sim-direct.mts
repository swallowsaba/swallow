// 模擬を Worker を通さずに直接流す（docs/testing-strategy.md 10.1「Worker で流した結果と、同じ関数を直接呼んだ結果が等しい」）。
// e2e/determinism.spec.ts が、画面の Worker で流した結果と比べる。
//
//   npx vite-node tools/sim-direct.mts world <書き出す世界のファイル>                 見本の町（src/sim/__fixtures__/cities.ts の town）
//   npx vite-node tools/sim-direct.mts run <世界> <命令の列> <日数> <書き出す要約>   命令を日付どおりに当てながら進めた要約
import { readFileSync, writeFileSync } from 'node:fs';
import { POLITICS_RULES } from '../src/content/politics.ts';
import type { Command } from '../src/sim/commands.ts';
import { SimRunner } from '../src/sim/runner.ts';
import { summaryOf } from './sim-summary.mjs';
import type { World } from '../src/sim/types.ts';
import { town } from '../src/sim/__fixtures__/cities.ts';

const [mode, ...args] = process.argv.slice(2);
if (mode === 'world') {
  writeFileSync(args[0] as string, JSON.stringify(town().world));
} else if (mode === 'run') {
  const [worldFile, commandsFile, days, out] = args as [string, string, string, string];
  const world = JSON.parse(readFileSync(worldFile, 'utf8')) as World;
  const commands = JSON.parse(readFileSync(commandsFile, 'utf8')) as Command[];
  // 画面の Worker と同じ入れ物（SimRunner）で、命令は日の区切りで当ててから次の日へ進める
  const runner = new SimRunner(world);
  runner.load(world, 0, POLITICS_RULES);
  const end = Math.floor(world.city.day) + Number(days);
  let i = 0;
  for (let d = Math.floor(world.city.day); d <= end; d += 1) {
    while (i < commands.length && (commands[i] as Command).day <= d) {
      runner.apply(commands[i] as Command);
      i += 1;
    }
    if (d < end) runner.advance(d + 1);
  }
  writeFileSync(out, JSON.stringify(summaryOf(runner.current)));
} else {
  throw new Error('使い方: npx vite-node tools/sim-direct.mts world <ファイル> | run <世界> <命令の列> <日数> <要約>');
}

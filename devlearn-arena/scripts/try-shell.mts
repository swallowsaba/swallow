// 一時の試し台（コミットしない）: setup で端末を作り、標準入力の行を順に打つ
import { readFileSync } from 'node:fs';
import { initialShell } from '../src/engines/environments';
import { createDefaultRegistry } from '../src/engines/kernel/commands';
import { createClock } from '../src/engines/kernel/clock';
import { execute } from '../src/engines/kernel/shell';
const [env, setupPath] = process.argv.slice(2);
const setup = setupPath ? JSON.parse(readFileSync(setupPath, 'utf8')) : {};
let shell = initialShell(env ?? 'linux-basic', setup);
const reg = createDefaultRegistry();
const clock = createClock(500);
for (const line of readFileSync(0, 'utf8').split('\n').filter((l) => l.trim())) {
  const r = execute(shell, line, reg, clock);
  console.log(`$ ${line}`);
  for (const c of r.chunks) process.stdout.write((c.stream === 'stderr' ? '[err] ' : '') + c.text);
  shell = r.state;
}

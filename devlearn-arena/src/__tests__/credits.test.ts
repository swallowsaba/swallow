import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 出典とライセンス（docs/acceptance-criteria.md D5・docs/asset-policy.md）。
 * 公開する物に入る外部の包み（package.json の dependencies）は全て、CREDITS.md にライセンスと一緒に載っている
 */
const read = (path: string): string => readFileSync(join(__dirname, '..', '..', path), 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
const credits = read('CREDITS.md');

/** CREDITS.md の表の行のうち、`包みの名前` を含む行 */
const rowOf = (name: string): string | undefined =>
  credits.split(/\r?\n/).find((line) => line.startsWith('|') && line.includes(`\`${name}\``));

describe('CREDITS.md', () => {
  it.each(Object.keys(pkg.dependencies))('%s が、ライセンスと一緒に載っている', (name) => {
    const license = (JSON.parse(read(`node_modules/${name}/package.json`)) as { license: string }).license;
    const row = rowOf(name);
    expect(row, `${name} の行が無い`).toBeDefined();
    expect(row).toContain(license);
  });
});

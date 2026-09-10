/**
 * Worker を 1 ファイルにまとめる(Cloudflare ダッシュボード貼り付け用)
 *   node worker/build-single-file.mjs
 *
 * 外部ツール不要。src/ の ES モジュールを依存順に連結し、
 * 相対 import と export キーワードを取り除くだけの単純な結合器。
 * 出力: worker/dist/worker.bundled.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const OUT = path.join(HERE, 'dist', 'worker.bundled.js');

// 依存順(参照される側が先)
const ORDER = ['operators.js', 'http.js', 'odpt.js', 'geocode.js', 'bus.js', 'index.js'];

const stripImports = (s) =>
  s
    // import { a, b } from './x.js';  /  import x from './x.js';
    .replace(/^import[\s\S]*?from\s+'\.\/[^']+';\s*$/gm, '')
    .replace(/^import\s+'\.\/[^']+';\s*$/gm, '');

const stripExports = (s) =>
  s
    .replace(/^export default\s*\{/m, 'const __worker = {')
    .replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1');

let out = `/* ==================================================================
 * 首都圏ルート検索 — Cloudflare Worker(単一ファイル版)
 * ------------------------------------------------------------------
 * このファイルは worker/src/*.js から自動生成されています。
 * 直接編集せず、src/ を直して次を実行してください:
 *     node worker/build-single-file.mjs
 *
 * Cloudflare ダッシュボードの「Edit code」に丸ごと貼り付けて使えます。
 * 生成日時: ${new Date().toISOString()}
 * ================================================================== */

`;

for (const f of ORDER) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
  out += `\n/* ==================== ${f} ==================== */\n`;
  out += stripExports(stripImports(raw)).replace(/\n{3,}/g, '\n\n');
  out += '\n';
}

out += '\nexport default __worker;\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const lines = out.split('\n').length;
console.log(`生成しました: ${path.relative(process.cwd(), OUT)}  (${lines} 行 / ${(out.length / 1024).toFixed(1)} KB)`);

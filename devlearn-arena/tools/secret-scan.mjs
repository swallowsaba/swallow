// 秘密情報の簡易検査（docs/testing-strategy.md 9 章・docs/deployment.md 6 章）。
//
//   node tools/secret-scan.mjs        … git が持つ全てのファイル・dist/（あれば）・このプロジェクトのコミットの文を調べる
//
// 鍵・トークンの形をした文字列と、置いてはいけないファイル（.env・秘密鍵）を探す。見つかれば一覧を出して 1 で終わる。
// 学習の教材として、鍵やパスワードの「形だけの例」を書く所がある。それは ALLOW に、場所と理由を書いて外す。
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 鍵・トークンの形 */
export const RULES = [
  { id: 'private-key', what: '秘密鍵', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'github-token', what: 'GitHub のトークン', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { id: 'aws-key', what: 'AWS のアクセスキー', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'google-key', what: 'Google の API キー', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', what: 'Slack のトークン', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: 'ai-key', what: 'AI の API キー', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'stripe-key', what: '決済の秘密鍵', re: /\b[rs]k_live_[0-9A-Za-z]{16,}/ },
  { id: 'cloudflare', what: 'Cloudflare の秘密', re: /\b(?:CLOUDFLARE|CF)_[A-Z_]*(?:TOKEN|KEY|SECRET)\s*[=:]\s*['"]?[A-Za-z0-9_-]{20,}/ },
  {
    id: 'assigned-secret',
    what: '秘密の値を書いた設定',
    re: /\b(?:api[_-]?key|api[_-]?secret|client[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{16,}["']/i,
  },
];

/** 置いてはいけないファイルの名前（.env の見本は置いてよい） */
export const BANNED_FILES = [
  { id: 'env-file', what: '環境変数のファイル', re: /(?:^|\/)\.env(?:\.(?!example$|sample$)[^/]+)?$/ },
  { id: 'key-file', what: '鍵のファイル', re: /(?:^|\/)(?:id_(?:rsa|ecdsa|ed25519|dsa)|[^/]+\.(?:pem|key|p12|pfx))$/ },
  { id: 'wrangler-secret', what: 'Workers の手元の秘密', re: /(?:^|\/)\.dev\.vars$/ },
];

/** 教材の中の「形だけの例」。場所（前方一致）と規則と理由 */
export const ALLOW = [
  { path: 'src/engines/kernel/commands/ssh', rule: 'private-key', reason: '端末の模擬の ssh-keygen が、seed の digest から作る形だけの鍵（sec.b.04）。本物の鍵ではない' },
  { path: 'content/lessons/sec/sec.b.04.json', rule: 'private-key', reason: 'sec.b.04 のエラーの例に出す、形だけの鍵の頭の行' },
  { path: 'src/engines/kernel/webConfig', rule: 'private-key', reason: '端末の模擬の nginx が読む、形だけの鍵のファイルの頭の行（sec.i.01・sec.i.02）。本物の鍵ではない' },
  { path: 'src/engines/kernel/commands/openssl.test.ts', rule: 'private-key', reason: '端末の模擬の openssl のテストに置く、形だけの鍵のファイル' },
  { path: 'content/lessons/sec/sec.i.0', rule: 'private-key', reason: 'sec.i.01・sec.i.02 の実戦に置く、形だけの鍵のファイル（中身は対の印だけ）' },
  { path: 'content/lessons/lab/lab.i.01.json', rule: 'private-key', reason: 'lab.i.01 の実戦に置く、形だけの鍵のファイル（中身は対の印だけ）' },
  { path: 'content/lessons/trouble/trouble.i.03.json', rule: 'private-key', reason: 'trouble.i.03 の実戦に置く、形だけの鍵のファイル（中身は対の印だけ）' },
  { path: 'dist/assets/', rule: 'private-key', reason: '上の 2 つを束ねた物。束ねる前の場所を調べている' },
];

/** 調べない（文字ではない）ファイル */
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|wasm|zip|gz|mp3|ogg|wav|pdf)$/i;

/**
 * 文字列の中の秘密を探す。where はファイルの場所（ALLOW の照合と報告に使う）
 * @param {string} text
 * @param {string} where
 * @param {{ path: string; rule: string }[]} [allow]
 * @returns {{ where: string; line: number; rule: string; what: string; sample: string }[]}
 */
export function scanText(text, where, allow = ALLOW) {
  const found = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (allow.some((a) => a.rule === rule.id && where.startsWith(a.path))) continue;
      found.push({ where, line: i + 1, rule: rule.id, what: rule.what, sample: mask(m[0]) });
    }
  });
  return found;
}

/**
 * ファイルの名前が、置いてはいけない物か
 * @param {string} path
 */
export function scanName(path) {
  const rule = BANNED_FILES.find((r) => r.re.test(path));
  return rule ? [{ where: path, line: 0, rule: rule.id, what: rule.what, sample: path }] : [];
}

/** 見つけた値を、報告に全部は出さない */
function mask(s) {
  return s.length <= 12 ? s : `${s.slice(0, 8)}…（${s.length} 文字）`;
}

/** dir の下の全てのファイル（root からの場所） */
function walk(dir, root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
  const built = existsSync(join(root, 'dist')) ? walk(join(root, 'dist'), root) : [];

  const found = [];
  for (const path of [...tracked, ...built]) {
    found.push(...scanName(path));
    if (BINARY.test(path) || !existsSync(join(root, path))) continue;
    found.push(...scanText(readFileSync(join(root, path), 'utf8'), path));
  }
  found.push(...scanText(git('log', '--format=%H%n%B', '--', '.'), '(コミットの文)'));

  const files = tracked.length + built.length;
  if (found.length === 0) {
    console.log(`[secret-scan] 秘密情報は見つからなかった（${files} ファイルとコミットの文）`);
    return;
  }
  for (const f of found) console.error(`[secret-scan] ${f.where}${f.line ? `:${f.line}` : ''}  ${f.what}（${f.rule}）  ${f.sample}`);
  console.error(`[secret-scan] ${found.length} 件見つかった。値を無効にしてから消すこと（docs/deployment.md 6 章）`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

/**
 * .gitignore の決まり（管理しない物）。本物の書き方のうち、学習で使う所を扱う:
 *   空の行と # で始まる行は読まない / 先頭の ! は外す（無視しない）/ 末尾の / はディレクトリだけ /
 *   途中に / があればその .gitignore の場所から、無ければどの深さの名前にも当たる / * ? ** の形
 * どの .gitignore（ディレクトリごとに置ける）でも、後に書いた決まりが勝つ。無視したディレクトリの中は、! でも戻せない（本物と同じ）
 */

export interface IgnoreRule {
  /** 書いてある .gitignore（リポジトリの中のパス） */
  source: string;
  /** その .gitignore の何行目か */
  line: number;
  /** 書いたままの文 */
  text: string;
  negate: boolean;
  dirOnly: boolean;
  /** .gitignore の置き場所（リポジトリの中のディレクトリ。根は ''） */
  base: string;
  anchored: boolean;
  regex: RegExp;
}

const GITIGNORE = '.gitignore';

function globToRegex(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] ?? '';
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += 1;
      if (glob[i + 1] === '/') i += 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** 作業ツリーの全ての .gitignore から、決まりを浅い順・書いた順に読む */
export function ignoreRules(worktree: ReadonlyMap<string, string>): IgnoreRule[] {
  const files = [...worktree.keys()]
    .filter((p) => p === GITIGNORE || p.endsWith(`/${GITIGNORE}`))
    .sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1));
  const rules: IgnoreRule[] = [];
  for (const source of files) {
    const base = source === GITIGNORE ? '' : source.slice(0, -GITIGNORE.length - 1);
    for (const [i, raw] of (worktree.get(source) ?? '').split('\n').entries()) {
      const text = raw.replace(/\s+$/, '');
      if (text === '' || text.startsWith('#')) continue;
      const negate = text.startsWith('!');
      let body = negate ? text.slice(1) : text;
      const dirOnly = body.endsWith('/');
      if (dirOnly) body = body.slice(0, -1);
      const anchored = body.includes('/');
      if (body.startsWith('/')) body = body.slice(1);
      rules.push({ source, line: i + 1, text, negate, dirOnly, base, anchored, regex: globToRegex(body) });
    }
  }
  return rules;
}

/** 1 つの名前（ファイルかディレクトリ）に当たる最後の決まり */
function lastMatch(rules: readonly IgnoreRule[], path: string, isDir: boolean): IgnoreRule | null {
  let hit: IgnoreRule | null = null;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.base !== '' && !path.startsWith(`${rule.base}/`)) continue;
    const rel = rule.base === '' ? path : path.slice(rule.base.length + 1);
    const name = rel.split('/').pop() ?? rel;
    if (rule.regex.test(rule.anchored ? rel : name)) hit = rule;
  }
  return hit;
}

/** そのファイルを無視させている決まり（無視されなければ null）。親のディレクトリが無視されていれば、その決まり */
export function ignoredBy(rules: readonly IgnoreRule[], path: string): IgnoreRule | null {
  if (rules.length === 0) return null;
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i += 1) {
    const dir = lastMatch(rules, parts.slice(0, i).join('/'), true);
    if (dir && !dir.negate) return dir;
  }
  const file = lastMatch(rules, path, false);
  return file && !file.negate ? file : null;
}

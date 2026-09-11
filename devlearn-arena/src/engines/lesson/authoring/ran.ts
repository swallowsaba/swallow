import { KINDS } from '@/engines/kernel/commands/kubectlShared';
import { tokenize, wordText } from '@/engines/kernel/tokenizer';

/**
 * 「そのコマンドを打ったか」を見るための道具。
 *
 * 判定の主役は状態だが、「調べた」「確かめた」のように状態が変わらない手順もある。
 * そのときも履歴の文字列をそのまま比べると、大文字小文字・余分な空白・引用符の違いで落ちる。
 * ここではシェルと同じ字句解析を通し、1つずつの単語にしてから比べる。
 */

/** 期待する単語。文字列は完全一致（大文字小文字は無視）、配列はそのどれか、正規表現は照合 */
export type Want = string | RegExp | readonly string[];

/** よく使う別名の組 */
export const POD: readonly string[] = ['pod', 'pods', 'po'];
export const NODE: readonly string[] = ['node', 'nodes', 'no'];
export const DEPLOY: readonly string[] = ['deploy', 'deployment', 'deployments'];
export const SECRET: readonly string[] = ['secret', 'secrets'];
export const PVC: readonly string[] = ['pvc', 'persistentvolumeclaim', 'persistentvolumeclaims'];

/** `pod/web` を `pod web` に、`-o=yaml` を `-o yaml` にほどく */
function normalize(word: string): string[] {
  const lower = word.toLowerCase();
  const option = /^(-{1,2}[a-z-]+)=(.*)$/.exec(lower);
  if (option?.[1] !== undefined && option[2] !== undefined) return [option[1], option[2]];
  // 種別名で始まるときだけほどく。docs/guide.md のようなパスはそのまま
  const slash = /^([a-z]+)\/(.+)$/.exec(lower);
  if (slash?.[1] !== undefined && slash[2] !== undefined && slash[1] in KINDS) return [slash[1], slash[2]];
  return [lower];
}

/**
 * 1行を、実行された単純コマンドごとの単語列にする。
 * `a && b | c` のような行は3つのコマンドとして扱う。字句として読めない行は空白で割る。
 */
export function commandsOf(line: string): string[][] {
  const first = line.split('\n')[0] ?? '';
  const out: string[][] = [];
  let current: string[] = [];
  try {
    for (const token of tokenize(first)) {
      if (token.type === 'word') {
        current.push(...normalize(wordText(token.parts)));
      } else if (token.type === 'op' && ['|', '&&', '||', ';'].includes(token.value)) {
        if (current.length > 0) out.push(current);
        current = [];
      }
    }
  } catch {
    current = first.trim().split(/\s+/).flatMap(normalize);
  }
  if (current.length > 0) out.push(current);
  return out;
}

function matches(word: string, want: Want): boolean {
  if (typeof want === 'string') return word === want.toLowerCase();
  if (want instanceof RegExp) return want.test(word);
  return want.some((w) => word === w.toLowerCase());
}

/** 先頭はコマンド名と一致し、残りは順番どおりに（間に他の単語を挟んでもよい）現れるか */
function commandMatches(argv: readonly string[], wants: readonly Want[]): boolean {
  const [head, ...rest] = wants;
  if (head === undefined) return true;
  if (argv[0] === undefined || !matches(argv[0], head)) return false;
  let at = 1;
  for (const want of rest) {
    while (at < argv.length && !matches(argv[at] ?? '', want)) at += 1;
    if (at >= argv.length) return false;
    at += 1;
  }
  return true;
}

/** 何回打ったか。1行に同じコマンドが2つあれば2回と数える */
export function countRan(history: readonly string[], ...wants: readonly Want[]): number {
  return history.reduce(
    (n, line) => n + commandsOf(line).filter((argv) => commandMatches(argv, wants)).length,
    0,
  );
}

/** 一度でも打ったか */
export function ran(history: readonly string[], ...wants: readonly Want[]): boolean {
  return countRan(history, ...wants) > 0;
}

/** curl などの宛先が、その IP（ポートやパスは問わない）であるか */
export function hostIs(ip: string): RegExp {
  const escaped = ip.replace(/\./g, '[.]');
  return new RegExp(`^(https?://)?${escaped}(:\\d+)?(/.*)?$`);
}

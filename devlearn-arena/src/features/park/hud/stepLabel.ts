/**
 * 課題の札に出す小さな文字列を作る純粋関数。
 *
 * 札は狭いので、手順の名前の右に「どのコマンドの話か」を一語で添える。
 * 模範解答から取るので、手で書いた別表を持たなくてよい。
 */

/** そのあとに続く語の方が主語になるコマンド。`git commit` なら commit を見せる */
const SUBCOMMAND = new Set(['git', 'kubectl', 'kubeadm', 'gh', 'ip', 'systemctl', 'docker', 'npm']);

/** 打ち方を変えるだけの前置き。読み飛ばす */
const PREFIX = new Set(['sudo', 'time', 'env']);

/**
 * 手順の模範解答から、その手順を表すコマンド名を一語で取り出す。
 * 解答が無い手順（状態を整えるだけの手順）では空文字を返す。
 */
export function commandLabel(solution: readonly string[]): string {
  const line = solution.find((text) => text.trim() !== '');
  if (line === undefined) return '';
  const words = line.trim().split(/\s+/).filter((w) => w !== '');
  let i = 0;
  while (i < words.length && PREFIX.has(words[i] ?? '')) i += 1;
  const head = words[i] ?? '';
  if (head === '') return '';
  if (!SUBCOMMAND.has(head)) return head;
  // 次の語が旗（-x や --yes）なら、親のコマンド名をそのまま見せる
  const next = words[i + 1] ?? '';
  return next === '' || next.startsWith('-') ? head : next;
}

/** 説明は 2 行まで。長い解説は札に書かず、解説の引き出しへ回す */
export const LEAD_LINES = 2;

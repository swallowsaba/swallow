/**
 * 知らない人がつまずく硬い言葉。
 *
 * 用語集に載せてマウスで説明を出すだけでは足りない、抽象的な言葉を集めてある。
 * 文章の中で使うなら、必ずその場で「（言い換え）」を添える。
 * 「全部の口に流す（フラッディング）」のように、言い換えのほうを先に書いて括弧に入れてもよい。
 */
export const HARD_WORDS: readonly string[] = [
  '宣言的',
  '冪等',
  'reconcile',
  '収束',
  '3-way',
  '多重化',
  '輻輳',
  'フラッディング',
  'カプセル化',
  '払い出し',
  '可用性',
  '最長一致',
  'desired state',
];

/** 言い換えの括弧が、すぐ後ろかすぐ前にあるか */
function paraphrased(text: string, at: number, word: string): boolean {
  const after = text[at + word.length];
  const before = text[at - 1];
  return after === '（' || after === '(' || before === '（' || before === '(';
}

/** 言い換えを添えずに使っている硬い言葉 */
export function bareHardWords(text: string): string[] {
  const found: string[] = [];
  for (const word of HARD_WORDS) {
    let at = text.indexOf(word);
    while (at !== -1) {
      if (!paraphrased(text, at, word)) {
        found.push(word);
        break;
      }
      at = text.indexOf(word, at + word.length);
    }
  }
  return found;
}

import type { Practice } from '@/content/schema';

/**
 * 結果の段に並べる「実戦で入れた物」（docs/ui-design.md 7・7.1）。
 * 端末は打ったコマンド（$ を付ける）、模擬環境（模）は入れた操作の文（端末ではないので $ を付けない）
 */
export function attemptLines(mode: Practice['mode'], commands: readonly string[]): { title: string; text: string } {
  if (mode === 'simulation') return { title: '入れた操作の文', text: commands.join('\n') };
  return { title: '打ったコマンド', text: commands.map((c) => `$ ${c}`).join('\n') };
}

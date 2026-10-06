import type { Practice } from '@/content/schema';

/**
 * 結果の段に並べる「実戦で入れた物」（docs/ui-design.md 7・7.1）。
 * 端末は打ったコマンド（$ を付ける）、模擬環境（模）は入れた操作の文（端末ではないので $ を付けない）、
 * ブラウザ内 SQL（S）は実行した SQL（端末ではないので $ を付けない）、
 * 設定の編集（編）は最後に保存した設定（保存するたびに設定の全体を記録している）
 */
export function attemptLines(mode: Practice['mode'], commands: readonly string[]): { title: string; text: string } {
  if (mode === 'simulation') return { title: '入れた操作の文', text: commands.join('\n') };
  if (mode === 'sql') return { title: '実行した SQL', text: commands.join('\n') };
  if (mode === 'editor') return { title: `最後に保存した設定（保存 ${String(commands.length)} 回）`, text: (commands[commands.length - 1] ?? '').replace(/\n$/, '') };
  return { title: '打ったコマンド', text: commands.map((c) => `$ ${c}`).join('\n') };
}

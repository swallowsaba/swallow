import { resolve } from '../path';
import type { CommandSpec } from '../registry';
import { stat } from '../vfs';

/**
 * 簡易エディタ。端末の中で全画面編集を再現する代わりに、
 * 画面側の編集パネルを開く要求を返す。保存すると仮想FSに書き戻る。
 */
function open(tool: string): CommandSpec {
  return {
    name: tool,
    summary: `${tool} でファイルを編集する（編集パネルが開く）`,
    handler: ({ argv, shell }) => {
      const target = argv[1];
      if (target === undefined) {
        return { stderr: `${tool}: ファイル名を指定してください\n`, code: 1 };
      }
      const path = resolve(shell.cwd, target);
      const node = stat(shell.vfs, path);
      if (node?.kind === 'dir') {
        return { stderr: `${tool}: ${target}: Is a directory\n`, code: 1 };
      }
      return { editor: { path, content: node?.kind === 'file' ? node.content : '', tool } };
    },
  };
}

export const editorCommands: CommandSpec[] = [open('vi'), open('vim'), open('nano')];

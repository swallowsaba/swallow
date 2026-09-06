import { CommandRegistry } from '../registry';
import { editorCommands } from './editor';
import { fsCommands } from './fs';
import { gitCommands } from './git';
import { miscCommands } from './misc';
import { textCommands } from './text';
import { textToolCommands } from './textTools';

/**
 * P1 で用意するのは、どのトラックでも使う汎用コマンドだけ。
 * kubectl / git / curl / dig などは、それぞれのエンジンと一緒に
 * P2 以降でこのレジストリに register される。
 */
export function createDefaultRegistry(): CommandRegistry {
  return new CommandRegistry().registerAll([
    ...fsCommands,
    ...editorCommands,
    ...gitCommands,
    ...textCommands,
    ...textToolCommands,
    ...miscCommands,
  ]);
}

export { editorCommands, fsCommands, gitCommands, textCommands, textToolCommands, miscCommands };

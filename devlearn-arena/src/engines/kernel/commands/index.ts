import { CommandRegistry } from '../registry';
import { fsCommands } from './fs';
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
    ...textCommands,
    ...textToolCommands,
    ...miscCommands,
  ]);
}

export { fsCommands, textCommands, textToolCommands, miscCommands };

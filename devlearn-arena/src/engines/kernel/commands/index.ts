import { CommandRegistry } from '../registry';
import { editorCommands } from './editor';
import { fsCommands } from './fs';
import { ghCommands } from './gh';
import { gitCommands } from './git';
import { kubeadmCommands } from './kubeadm';
import { kubectlCommands } from './kubectl';
import { netCommands } from './net';
import { netToolCommands } from './netTools';
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
    ...ghCommands,
    ...kubeadmCommands,
    ...kubectlCommands,
    ...netCommands,
    ...netToolCommands,
    ...textCommands,
    ...textToolCommands,
    ...miscCommands,
  ]);
}

export {
  editorCommands, fsCommands, ghCommands, gitCommands, kubeadmCommands, kubectlCommands, netCommands,
  netToolCommands, textCommands, textToolCommands, miscCommands,
};

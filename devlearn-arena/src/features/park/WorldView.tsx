import type { ShellState } from '@/engines/kernel/registry';
import { ClusterCanvas } from '@/visual/ClusterCanvas';
import { CommitGraph } from '@/visual/CommitGraph';
import type { RunCommand } from '@/visual/commands';
import { FsTree } from '@/visual/FsTree';
import { PacketFlow } from '@/visual/PacketFlow';
import { PrTimeline } from '@/visual/PrTimeline';
import type { VisualTab } from './visualTabs';

interface Props {
  tab: VisualTab;
  state: ShellState;
  previous: ShellState | undefined;
  onCommand?: RunCommand | undefined;
  /** 説明に添える小さな図。中で送らせない */
  compact?: boolean;
}

/**
 * 砂場の、いまの状態の図。状態から毎回組み立て、押すとそのコマンドを端末に流す。
 */
export function WorldView({ tab, state, previous, onCommand, compact = false }: Props) {
  const self = state.vars.get('NET_SELF') ?? 'pc1';
  return (
    <div className="h-full bg-cream">
      {tab === 'fs' ? (
        <FsTree vfs={state.vfs} previous={previous?.vfs} cwd={state.cwd} onCommand={onCommand} />
      ) : tab === 'git' ? (
        <CommitGraph git={state.git} previous={previous?.git} vfs={state.vfs} cwd={state.cwd} onCommand={onCommand} compact={compact} />
      ) : tab === 'k8s' ? (
        <ClusterCanvas cluster={state.cluster} previous={previous?.cluster} onCommand={onCommand} />
      ) : tab === 'net' ? (
        <PacketFlow net={state.net} self={self} onCommand={onCommand} compact={compact} />
      ) : (
        <PrTimeline repo={state.repo} onCommand={onCommand} />
      )}
    </div>
  );
}


import type { ShellState } from '@/engines/kernel/registry';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { ClusterCanvas } from '@/visual/ClusterCanvas';
import { CommitGraph } from '@/visual/CommitGraph';
import type { RunCommand } from '@/visual/commands';
import { FsTree } from '@/visual/FsTree';
import { FsGame } from '@/visual/game/FsGame';
import { GhGame } from '@/visual/game/GhGame';
import { GitGame } from '@/visual/game/GitGame';
import { K8sGame } from '@/visual/game/K8sGame';
import { NetGame } from '@/visual/game/NetGame';
import { PacketFlow } from '@/visual/PacketFlow';
import { PrTimeline } from '@/visual/PrTimeline';
import type { VisualTab } from './visualTabs';

interface Props {
  tab: VisualTab;
  state: ShellState;
  previous: ShellState | undefined;
  onCommand: RunCommand;
}

/**
 * 右側の中身。設定に応じて、ゲームの世界か図のどちらかで、いまの状態を映す。
 * どちらも同じ状態から毎回組み立て、押すと同じコマンドを端末に流す。
 */
export function WorldView({ tab, state, previous, onCommand }: Props) {
  const mode = useStore((s) => s.settings.visualMode);
  const self = state.vars.get('NET_SELF') ?? 'pc1';
  if (mode === 'game') {
    if (tab === 'fs') return <FsGame vfs={state.vfs} previous={previous?.vfs} cwd={state.cwd} onCommand={onCommand} />;
    if (tab === 'git') return <GitGame git={state.git} previous={previous?.git} vfs={state.vfs} cwd={state.cwd} onCommand={onCommand} />;
    if (tab === 'k8s') return <K8sGame cluster={state.cluster} previous={previous?.cluster} onCommand={onCommand} />;
    if (tab === 'net') return <NetGame net={state.net} self={self} onCommand={onCommand} />;
    return <GhGame repo={state.repo} onCommand={onCommand} />;
  }
  return (
    <div className="h-full bg-cream">
      {tab === 'fs' ? (
        <FsTree vfs={state.vfs} previous={previous?.vfs} cwd={state.cwd} onCommand={onCommand} />
      ) : tab === 'git' ? (
        <CommitGraph git={state.git} previous={previous?.git} vfs={state.vfs} cwd={state.cwd} onCommand={onCommand} />
      ) : tab === 'k8s' ? (
        <ClusterCanvas cluster={state.cluster} previous={previous?.cluster} onCommand={onCommand} />
      ) : tab === 'net' ? (
        <PacketFlow net={state.net} self={self} onCommand={onCommand} />
      ) : (
        <PrTimeline repo={state.repo} onCommand={onCommand} />
      )}
    </div>
  );
}

/** ゲームと図を切り替える2つのボタン。light は明るい背景の上に置くとき */
export function ViewModeSwitch({ light = false }: { light?: boolean }) {
  const t = useT();
  const mode = useStore((s) => s.settings.visualMode);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <div role="group" aria-label={t('game.modeLabel')} className="ml-auto flex shrink-0 gap-1">
      {(['game', 'diagram'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          data-mode={m}
          title={t(m === 'game' ? 'game.mode.game' : 'game.mode.diagram')}
          onClick={() => {
            updateSettings({ visualMode: m });
          }}
          className={`px-2 py-1 text-xs font-extrabold ${mode === m ? 'bg-gold text-ink' : `${light ? 'text-ink' : 'text-cream'} opacity-80 hover:opacity-100`}`}
        >
          <span aria-hidden>{m === 'game' ? '🎮' : '📐'}</span>
          <span className={light ? 'ml-1' : 'sr-only'}>{t(m === 'game' ? 'game.mode.gameShort' : 'game.mode.diagramShort')}</span>
        </button>
      ))}
    </div>
  );
}

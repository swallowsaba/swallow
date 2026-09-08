import type { ShellSession } from '@/features/terminal/useShellSession';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { ClusterCanvas } from '@/visual/ClusterCanvas';
import { CommitGraph } from '@/visual/CommitGraph';
import { FileWorld } from '@/visual/FileWorld';
import { PacketFlow } from '@/visual/PacketFlow';
import { PrTimeline } from '@/visual/PrTimeline';
import type { VfsState } from '@/engines/kernel/vfs';

export type VisualTab = 'world' | 'git' | 'k8s' | 'net' | 'gh';

interface Props {
  session: ShellSession;
  tab: VisualTab;
  onTab: (tab: VisualTab) => void;
  /** 1つ前の状態。差分を動きとして見せるために使う */
  previousVfs: VfsState | undefined;
}

/**
 * 学習画面の右側。いまの状態を図で映す。
 * 図は状態から毎回組み立てる。表示のための値をどこにも溜めない。
 */
export function VisualPanel({ session, tab: rightTab, onTab: setRightTab, previousVfs }: Props) {
  const state = session.state;
  const previous = { vfs: previousVfs };
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="plate flex items-center gap-2 px-3 py-1 text-sm font-extrabold">
        <button
          type="button"
          aria-pressed={rightTab === 'world'}
          onClick={() => {
            setRightTab('world');
          }}
          className={`px-3 py-1 ${rightTab === 'world' ? 'bg-gold text-ink' : 'text-cream'}`}
        >
          🗺 村のようす
        </button>
        <button
          type="button"
          aria-pressed={rightTab === 'git'}
          onClick={() => {
            setRightTab('git');
          }}
          className={`px-3 py-1 ${rightTab === 'git' ? 'bg-gold text-ink' : 'text-cream'}`}
        >
          ⑂ 履歴
        </button>
        <button
          type="button"
          aria-pressed={rightTab === 'k8s'}
          onClick={() => {
            setRightTab('k8s');
          }}
          className={`px-3 py-1 ${rightTab === 'k8s' ? 'bg-gold text-ink' : 'text-cream'}`}
        >
          ☸ クラスタ
        </button>
        <button
          type="button"
          aria-pressed={rightTab === 'net'}
          onClick={() => {
            setRightTab('net');
          }}
          className={`px-3 py-1 ${rightTab === 'net' ? 'bg-gold text-ink' : 'text-cream'}`}
        >
          🔀 ネットワーク
        </button>
        <button
          type="button"
          aria-pressed={rightTab === 'gh'}
          onClick={() => {
            setRightTab('gh');
          }}
          className={`px-3 py-1 ${rightTab === 'gh' ? 'bg-gold text-ink' : 'text-cream'}`}
        >
          ⑃ PR
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{
          backgroundColor: 'var(--grass)',
          backgroundImage:
            'radial-gradient(circle at 12px 9px, var(--grass-dark) 2.5px, transparent 2.6px), radial-gradient(circle at 33px 19px, var(--grass-dark) 2px, transparent 2.1px)',
          backgroundSize: '46px 26px',
        }}
      >
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {rightTab === 'world' ? (
              <FileWorld vfs={state.vfs} previous={previous?.vfs} cwd={state.cwd} />
            ) : rightTab === 'git' ? (
              <div className="h-full bg-cream">
                <CommitGraph git={state.git} />
              </div>
            ) : rightTab === 'k8s' ? (
              <div className="h-full bg-cream">
                <ClusterCanvas cluster={state.cluster} />
              </div>
            ) : rightTab === 'net' ? (
              <div className="h-full bg-cream">
                <PacketFlow
                  net={state.net}
                  self={state.vars.get('NET_SELF') ?? 'pc1'}
                />
              </div>
            ) : (
              <div className="h-full bg-cream">
                <PrTimeline repo={state.repo} />
              </div>
            )}
          </div>
          <div className="bg-cream">
            <TimeScrubber session={session} />
          </div>
        </div>
      </div>

    </div>
  );
}

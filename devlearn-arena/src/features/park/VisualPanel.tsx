import { useT } from '@/i18n/useT';
import type { ShellSession } from '@/features/terminal/useShellSession';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import type { ShellState } from '@/engines/kernel/registry';
import type { RunCommand } from '@/visual/commands';
import { VISUAL_TABS, type VisualTab } from './visualTabs';
import { ViewModeSwitch, WorldView } from './WorldView';

export type { VisualTab };

const ICONS: Record<VisualTab, string> = { fs: '📁', git: '⑂', k8s: '☸', net: '🔀', gh: '⑃' };

interface Props {
  session: ShellSession;
  tab: VisualTab;
  onTab: (tab: VisualTab) => void;
  /** その任務で見る意味のある図。ほかは押せなくし、薄く出す */
  relevant: ReadonlySet<VisualTab>;
  /** 図の操作をコマンドとして端末で打つ */
  onCommand: RunCommand;
  /** 1つ前の状態。差分を動きとして見せるために使う */
  previous: ShellState | undefined;
}

/**
 * 学習画面の右側。いまの状態を図で映す。
 * 図は状態から毎回組み立てる。表示のための値をどこにも溜めない。
 */
export function VisualPanel({ session, tab: rightTab, onTab: setRightTab, relevant, onCommand, previous }: Props) {
  const t = useT();
  const state = session.state;
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="plate flex flex-wrap items-center gap-2 px-3 py-1 text-sm font-extrabold">
      <div role="tablist" aria-label={t('park.viewLabel')} className="flex flex-wrap items-center gap-1">
        {VISUAL_TABS.map((tab) => {
          const selected = rightTab === tab;
          // 学ぶ対象と関係ない図は押せなくし、薄く出す
          const dim = !selected && !relevant.has(tab);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={dim}
              title={dim ? t('park.tabUnrelated') : undefined}
              onClick={() => {
                setRightTab(tab);
              }}
              className={`px-2 py-1 ${selected ? 'bg-gold text-ink' : 'text-cream'} ${dim ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <span aria-hidden>{ICONS[tab]}</span> {t(`park.tab.${tab}`)}
            </button>
          );
        })}
      </div>
        <ViewModeSwitch />
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
            <WorldView tab={rightTab} state={state} previous={previous} onCommand={onCommand} />
          </div>
          <div className="bg-cream">
            <TimeScrubber session={session} />
          </div>
        </div>
      </div>

    </div>
  );
}

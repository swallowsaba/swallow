import type { ShellState } from '@/engines/kernel/registry';
import type { RunCommand } from '@/visual/commands';
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
 * 砂場の、いまの状態の図。
 * 旧来の図は捨てた。新しい街（src/city）ができるまでは、いまいる場所だけを文字で出す。
 */
export function WorldView({ state }: Props) {
  return (
    <div className="grid h-full place-items-center bg-cream p-4 text-sm text-ink-soft" data-testid="world-view">
      <code className="font-mono">{state.cwd}</code>
    </div>
  );
}

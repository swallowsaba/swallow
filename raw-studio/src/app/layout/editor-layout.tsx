import * as React from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { AdjustmentsPanel } from '@/features/adjustments';
import { useUiStore } from '@/stores';
import { Toolbar } from './toolbar';
import { LeftPanel } from './left-panel';
import { ViewerStage } from './viewer-stage';
import { Filmstrip } from './filmstrip';

/**
 * The Lightroom-style shell: toolbar on top, then a horizontal split of
 * library | (viewer over filmstrip) | adjustments. Panels are resizable, and
 * the library/filmstrip can be toggled from the toolbar.
 */
export function EditorLayout(): React.JSX.Element {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const filmstripOpen = useUiStore((s) => s.filmstripOpen);

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup direction="horizontal">
          {leftPanelOpen ? (
            <>
              <ResizablePanel defaultSize={18} minSize={12} maxSize={30} order={1}>
                <LeftPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          ) : null}

          <ResizablePanel defaultSize={58} minSize={30} order={2}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={filmstripOpen ? 78 : 100} minSize={40} order={1}>
                <ViewerStage />
              </ResizablePanel>
              {filmstripOpen ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={22} minSize={10} maxSize={40} order={2}>
                    <Filmstrip />
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={24} minSize={16} maxSize={36} order={3}>
            <AdjustmentsPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

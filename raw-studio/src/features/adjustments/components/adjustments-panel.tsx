import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUiStore } from '@/stores';
import type { RightTab } from '@/stores';
import { PresetsPanel } from '@/features/presets';
import { AiPanel } from '@/features/ai';
import { BasicPanel } from './basic-panel';

const TABS: readonly { value: RightTab; label: string; phase: string }[] = [
  { value: 'presets', label: 'Presets', phase: '' },
  { value: 'basic', label: 'Basic', phase: '' },
  { value: 'tone', label: 'Tone', phase: 'Phase 7+' },
  { value: 'color', label: 'Color', phase: 'Phase 7+' },
  { value: 'detail', label: 'Detail', phase: 'Phase 7+' },
  { value: 'lens', label: 'Lens', phase: 'Phase 7+' },
  { value: 'ai', label: 'AI', phase: '' },
];

function Placeholder({ phase }: { phase: string }): React.JSX.Element {
  return (
    <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
      Controls arrive in {phase}.
    </div>
  );
}

export function AdjustmentsPanel(): React.JSX.Element {
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);

  return (
    <Tabs
      value={rightTab}
      onValueChange={(v) => {
        setRightTab(v as RightTab);
      }}
      className="flex h-full flex-col"
    >
      <div className="px-2 pt-2">
        <TabsList className="grid w-full grid-cols-7">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-1 text-[10px]">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="presets" className="mt-0 h-full">
          <PresetsPanel />
        </TabsContent>
        <TabsContent value="basic" className="mt-0">
          <BasicPanel />
        </TabsContent>
        <TabsContent value="ai" className="mt-0">
          <AiPanel />
        </TabsContent>
        {TABS.filter((t) => t.value !== 'basic' && t.value !== 'presets' && t.value !== 'ai').map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            <Placeholder phase={tab.phase} />
          </TabsContent>
        ))}
      </ScrollArea>
    </Tabs>
  );
}

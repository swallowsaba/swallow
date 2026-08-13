import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUiStore } from '@/stores';
import type { RightTab } from '@/stores';
import { PresetsPanel } from '@/features/presets';
import { AiPanel } from '@/features/ai';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { BasicPanel } from './basic-panel';
import { TonePanel } from './tone-panel';
import { ColorPanel } from './color-panel';
import { DetailPanel } from './detail-panel';
import { LensPanel } from './lens-panel';

const TAB_KEYS: readonly { value: RightTab; key: TranslationKey }[] = [
  { value: 'presets', key: 'tab.presets' },
  { value: 'basic', key: 'tab.basic' },
  { value: 'tone', key: 'tab.tone' },
  { value: 'color', key: 'tab.color' },
  { value: 'detail', key: 'tab.detail' },
  { value: 'lens', key: 'tab.lens' },
  { value: 'ai', key: 'tab.ai' },
];

export function AdjustmentsPanel(): React.JSX.Element {
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const t = useT();

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
          {TAB_KEYS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-1 text-[10px]">
              {t(tab.key)}
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
        <TabsContent value="tone" className="mt-0">
          <TonePanel />
        </TabsContent>
        <TabsContent value="color" className="mt-0">
          <ColorPanel />
        </TabsContent>
        <TabsContent value="detail" className="mt-0">
          <DetailPanel />
        </TabsContent>
        <TabsContent value="lens" className="mt-0">
          <LensPanel />
        </TabsContent>
        <TabsContent value="ai" className="mt-0">
          <AiPanel />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

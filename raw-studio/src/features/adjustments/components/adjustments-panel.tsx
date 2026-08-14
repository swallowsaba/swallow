import * as React from 'react';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { BeginnerPanel } from './beginner-panel';
import { GifPanel } from '@/features/gif';
import { CollagePanel } from '@/features/collage';
import { MasksPanel } from '@/features/masks';
import { LookMixerPanel } from '@/features/look-mixer';

const TAB_KEYS: readonly { value: RightTab; key: TranslationKey }[] = [
  { value: 'presets', key: 'tab.presets' },
  { value: 'basic', key: 'tab.basic' },
  { value: 'tone', key: 'tab.tone' },
  { value: 'color', key: 'tab.color' },
  { value: 'detail', key: 'tab.detail' },
  { value: 'lens', key: 'tab.lens' },
  { value: 'masks', key: 'tab.masks' },
  { value: 'mix', key: 'tab.mix' },
  { value: 'ai', key: 'tab.ai' },
  { value: 'gif', key: 'tab.gif' },
  { value: 'collage', key: 'tab.collage' },
];

function ModeToggle(): React.JSX.Element {
  const uiMode = useUiStore((s) => s.uiMode);
  const toggleUiMode = useUiStore((s) => s.toggleUiMode);
  const t = useT();
  const isBeginner = uiMode === 'beginner';

  return (
    <div className="flex items-center justify-end px-2 pt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={toggleUiMode}
        className="h-6 gap-1 px-2 text-[11px]"
      >
        {isBeginner ? <SlidersHorizontal className="size-3" /> : <Sparkles className="size-3" />}
        {isBeginner ? t('mode.pro') : t('mode.beginner')}
      </Button>
    </div>
  );
}

export function AdjustmentsPanel(): React.JSX.Element {
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const uiMode = useUiStore((s) => s.uiMode);
  const t = useT();

  if (uiMode === 'beginner') {
    return (
      <div className="flex h-full flex-col">
        <ModeToggle />
        <ScrollArea className="min-h-0 flex-1">
          <BeginnerPanel />
        </ScrollArea>
      </div>
    );
  }

  return (
    <Tabs
      value={rightTab}
      onValueChange={(v) => {
        setRightTab(v as RightTab);
      }}
      className="flex h-full flex-col"
    >
      <ModeToggle />
      <div className="px-2 pb-2">
        <TabsList className="grid w-full grid-cols-11">
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
        <TabsContent value="masks" className="mt-0">
          <MasksPanel />
        </TabsContent>
        <TabsContent value="mix" className="mt-0">
          <LookMixerPanel />
        </TabsContent>
        <TabsContent value="ai" className="mt-0">
          <AiPanel />
        </TabsContent>
        <TabsContent value="gif" className="mt-0">
          <GifPanel />
        </TabsContent>
        <TabsContent value="collage" className="mt-0">
          <CollagePanel />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

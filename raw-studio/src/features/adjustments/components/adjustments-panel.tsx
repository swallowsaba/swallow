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
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/i18n';
import { BasicPanel } from './basic-panel';
import { TonePanel } from './tone-panel';
import { ColorPanel } from './color-panel';
import { DetailPanel } from './detail-panel';
import { LensPanel } from './lens-panel';
import { BeginnerPanel } from './beginner-panel';
import { TaskLauncher } from './task-launcher';
import { Histogram } from './histogram';
import { CopyPasteSettings } from './copy-paste-settings';
import { GifPanel } from '@/features/gif';
import { CollagePanel } from '@/features/collage';
import { MasksPanel } from '@/features/masks';
import { LookMixerPanel } from '@/features/look-mixer';
import { TextPanel } from '@/features/overlays';
import { LiquifyPanel, FacePanel } from '@/features/liquify';

const TAB_KEYS: readonly { value: RightTab; key: TranslationKey }[] = [
  { value: 'presets', key: 'tab.presets' },
  { value: 'basic', key: 'tab.basic' },
  { value: 'tone', key: 'tab.tone' },
  { value: 'color', key: 'tab.color' },
  { value: 'detail', key: 'tab.detail' },
  { value: 'lens', key: 'tab.lens' },
  { value: 'masks', key: 'tab.masks' },
  { value: 'mix', key: 'tab.mix' },
  { value: 'text', key: 'tab.text' },
  { value: 'liquify', key: 'tab.liquify' },
  { value: 'face', key: 'tab.face' },
  { value: 'ai', key: 'tab.ai' },
  { value: 'gif', key: 'tab.gif' },
  { value: 'collage', key: 'tab.collage' },
];

/** Top-level groups so the (many) tabs fit without horizontal scrolling. */
const TAB_GROUPS: readonly { key: TranslationKey; tabs: readonly RightTab[] }[] = [
  { key: 'tabGroup.adjust', tabs: ['presets', 'basic', 'tone', 'color', 'detail', 'lens'] },
  { key: 'tabGroup.retouch', tabs: ['masks', 'mix', 'liquify', 'face'] },
  { key: 'tabGroup.decorate', tabs: ['text'] },
  { key: 'tabGroup.ai', tabs: ['ai'] },
  { key: 'tabGroup.create', tabs: ['gif', 'collage'] },
];

function groupIndexOf(tab: RightTab): number {
  const i = TAB_GROUPS.findIndex((g) => g.tabs.includes(tab));
  return i === -1 ? 0 : i;
}

const TAB_LABEL: Record<RightTab, TranslationKey> = TAB_KEYS.reduce(
  (acc, t) => {
    acc[t.value] = t.key;
    return acc;
  },
  {} as Record<RightTab, TranslationKey>,
);

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
      <CopyPasteSettings />
      <Histogram />
      <div className="px-2 pb-2">
        <TaskLauncher />
      </div>
      <div className="flex flex-col gap-1.5 px-2 pb-2">
        {/* Top-level group selector. */}
        <div className="grid grid-cols-5 gap-0.5 rounded-lg bg-muted p-1">
          {TAB_GROUPS.map((group, i) => {
            const active = groupIndexOf(rightTab) === i;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => {
                  const first = group.tabs[0];
                  if (first && !group.tabs.includes(rightTab)) setRightTab(first);
                }}
                className={cn(
                  'rounded-md px-1 py-1 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-background text-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(group.key)}
              </button>
            );
          })}
        </div>
        {/* Sub-tabs for the active group (only shown when it has more than one). */}
        {TAB_GROUPS[groupIndexOf(rightTab)] &&
        (TAB_GROUPS[groupIndexOf(rightTab)]?.tabs.length ?? 0) > 1 ? (
          <TabsList className="flex w-full justify-start gap-0.5 overflow-x-auto">
            {TAB_GROUPS[groupIndexOf(rightTab)]?.tabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="shrink-0 whitespace-nowrap px-2 text-[11px]">
                {t(TAB_LABEL[tab])}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
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
        <TabsContent value="text" className="mt-0">
          <TextPanel />
        </TabsContent>
        <TabsContent value="liquify" className="mt-0">
          <LiquifyPanel />
        </TabsContent>
        <TabsContent value="face" className="mt-0">
          <FacePanel />
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

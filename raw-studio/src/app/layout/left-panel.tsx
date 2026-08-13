import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUiStore } from '@/stores';
import type { LeftTab } from '@/stores';
import { HistoryPanel } from '@/features/history';
import { LibraryPanel } from './library-panel';
import { useT } from '@/i18n';

export function LeftPanel(): React.JSX.Element {
  const leftTab = useUiStore((s) => s.leftTab);
  const setLeftTab = useUiStore((s) => s.setLeftTab);
  const t = useT();

  return (
    <Tabs
      value={leftTab}
      onValueChange={(v) => {
        setLeftTab(v as LeftTab);
      }}
      className="flex h-full flex-col"
    >
      <div className="px-2 pt-2">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library" className="text-[11px]">
            {t('tab.library')}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[11px]">
            {t('tab.history')}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="library" className="mt-0 min-h-0 flex-1">
        <LibraryPanel />
      </TabsContent>
      <TabsContent value="history" className="mt-0 min-h-0 flex-1">
        <HistoryPanel />
      </TabsContent>
    </Tabs>
  );
}

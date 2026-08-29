import * as React from 'react';
import {
  Eraser,
  Sun,
  Palette,
  Wand2,
  Focus,
  Crop as CropIcon,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useUiStore, type RightTab } from '@/stores';
import { useViewerStore } from '@/features/viewer';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';

/**
 * The Task Launcher — a goal-based entry point pinned to the top of the right
 * panel. Instead of forcing users to know which of the 14 tabs holds a feature
 * ("is removing a net under Masks or AI?"), each button names an *intent* and
 * routes to the right place: it switches the relevant tab and/or starts the
 * matching on-canvas mode. The existing tabs stay below for users who prefer
 * them. This is the fix for "I can't find how to do X".
 */

type LauncherAction =
  | { readonly type: 'tab'; readonly tab: RightTab }
  | { readonly type: 'removeMode' }
  | { readonly type: 'cropMode' }
  | { readonly type: 'snsMode' };

interface LauncherItem {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly labelKey: TranslationKey;
  readonly descKey: TranslationKey;
  readonly action: LauncherAction;
  readonly featured?: boolean;
}

const ITEMS: readonly LauncherItem[] = [
  {
    icon: Eraser,
    labelKey: 'launcher.remove',
    descKey: 'launcher.removeDesc',
    action: { type: 'removeMode' },
    featured: true,
  },
  {
    icon: Sun,
    labelKey: 'launcher.brightness',
    descKey: 'launcher.brightnessDesc',
    action: { type: 'tab', tab: 'basic' },
  },
  {
    icon: Palette,
    labelKey: 'launcher.color',
    descKey: 'launcher.colorDesc',
    action: { type: 'tab', tab: 'color' },
  },
  {
    icon: Wand2,
    labelKey: 'launcher.denoise',
    descKey: 'launcher.denoiseDesc',
    action: { type: 'tab', tab: 'ai' },
  },
  {
    icon: Focus,
    labelKey: 'launcher.sharpen',
    descKey: 'launcher.sharpenDesc',
    action: { type: 'tab', tab: 'ai' },
  },
  {
    icon: CropIcon,
    labelKey: 'launcher.crop',
    descKey: 'launcher.cropDesc',
    action: { type: 'cropMode' },
  },
  {
    icon: Share2,
    labelKey: 'launcher.sns',
    descKey: 'launcher.snsDesc',
    action: { type: 'snsMode' },
  },
];

export function TaskLauncher(): React.JSX.Element {
  const t = useT();
  const setRightTab = useUiStore((s) => s.setRightTab);
  const setSnsMode = useUiStore((s) => s.setSnsMode);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const setCropMode = useViewerStore((s) => s.setCropMode);

  const run = (action: LauncherAction): void => {
    switch (action.type) {
      case 'tab':
        setRightTab(action.tab);
        break;
      case 'removeMode':
        setRemoveMode(true);
        setRightTab('ai'); // show the AI tab, where RemovePanel appears on top
        break;
      case 'cropMode':
        setCropMode(true);
        break;
      case 'snsMode':
        setSnsMode(true);
        break;
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border-2 border-primary/40 bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" />
        {t('launcher.title')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.labelKey}
              type="button"
              onClick={() => {
                run(item.action);
              }}
              className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent ${
                item.featured ? 'border-primary/50' : 'border-border'
              }`}
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {t(item.labelKey)}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {t(item.descKey)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

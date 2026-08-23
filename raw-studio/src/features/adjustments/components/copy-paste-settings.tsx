import * as React from 'react';
import { Check, ChevronDown, ClipboardCopy, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ALL_GROUPS,
  nonNeutralGroups,
  useEditorStore,
  type SettingsGroup,
} from '@/features/editor';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import { useT, type TranslationKey } from '@/i18n';

const GROUP_LABEL: Record<SettingsGroup, TranslationKey> = {
  basic: 'copySettings.group.basic',
  toneCurves: 'copySettings.group.toneCurves',
  hsl: 'copySettings.group.hsl',
  colorGrading: 'copySettings.group.colorGrading',
  detail: 'copySettings.group.detail',
  lens: 'copySettings.group.lens',
};

/**
 * Copy the current image's adjustments and paste them onto another image. Paste
 * applies everything; the caret opens a panel to paste only chosen groups
 * (basic / tone curves / HSL / color grading / detail / lens).
 */
export function CopyPasteSettings(): React.JSX.Element | null {
  const image = useEditorStore((s) => s.image);
  const copied = useEditorStore((s) => s.copiedAdjustments);
  const copyAdjustments = useEditorStore((s) => s.copyAdjustments);
  const pasteAdjustments = useEditorStore((s) => s.pasteAdjustments);
  const resetAdjustments = useEditorStore((s) => s.resetAdjustments);
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<SettingsGroup>>(new Set(ALL_GROUPS));

  if (!image) return null;

  // Which groups the copied settings actually carry (vs a default image).
  const carried = copied
    ? new Set(nonNeutralGroups(copied, createDefaultAdjustments()))
    : new Set<SettingsGroup>();

  const toggle = (g: SettingsGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  return (
    <div className="px-2 pt-1">
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-6 flex-1 gap-1 px-2 text-[11px]"
          onClick={() => {
            copyAdjustments();
          }}
        >
          <ClipboardCopy className="size-3" />
          {t('copySettings.copy')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 flex-1 gap-1 px-2 text-[11px]"
          disabled={copied === null}
          onClick={() => {
            pasteAdjustments();
          }}
        >
          <ClipboardPaste className="size-3" />
          {t('copySettings.paste')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-0.5 px-1.5 text-[11px]"
          disabled={copied === null}
          aria-label={t('copySettings.selective')}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      {open && copied ? (
        <div className="mt-1.5 flex flex-col gap-1 rounded border border-border p-2">
          <div className="mb-0.5 text-[10px] text-muted-foreground">
            {t('copySettings.chooseGroups')}
          </div>
          {ALL_GROUPS.map((g) => {
            const on = selected.has(g);
            const has = carried.has(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  toggle(g);
                }}
                className="flex items-center gap-1.5 text-left text-[11px]"
              >
                <span
                  className={cn(
                    'grid size-3.5 place-items-center rounded-sm border',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {on ? <Check className="size-2.5" /> : null}
                </span>
                <span className={cn(!has && 'text-muted-foreground/60')}>
                  {t(GROUP_LABEL[g])}
                  {!has ? ` ${t('copySettings.none')}` : ''}
                </span>
              </button>
            );
          })}
          <div className="mt-1 flex gap-1">
            <Button
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={selected.size === 0}
              onClick={() => {
                pasteAdjustments(ALL_GROUPS.filter((g) => selected.has(g)));
                setOpen(false);
              }}
            >
              {t('copySettings.pasteSelected')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={selected.size === 0}
              onClick={() => {
                resetAdjustments(ALL_GROUPS.filter((g) => selected.has(g)));
                setOpen(false);
              }}
            >
              {t('copySettings.resetSelected')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

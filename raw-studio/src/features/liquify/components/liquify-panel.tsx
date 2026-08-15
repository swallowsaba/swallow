import * as React from 'react';
import { Expand, Move, RotateCcw, Shrink, Undo2 } from 'lucide-react';
import type { WarpTool } from '@/types';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { AdjustmentSlider } from '@/features/adjustments/components/adjustment-slider';
import { useT } from '@/i18n';
import { useLiquifyUiStore } from '../model/liquify-ui-store';

const TOOL_ICON: Record<WarpTool, React.ComponentType<{ className?: string }>> = {
  push: Move,
  bloat: Expand,
  pinch: Shrink,
};

export function LiquifyPanel(): React.JSX.Element {
  const edit = useEditorStore(selectCurrentEdit);
  const t = useT();
  const popWarp = useEditorStore((s) => s.popWarp);
  const clearWarp = useEditorStore((s) => s.clearWarp);

  const tool = useLiquifyUiStore((s) => s.tool);
  const setTool = useLiquifyUiStore((s) => s.setTool);
  const size = useLiquifyUiStore((s) => s.size);
  const setSize = useLiquifyUiStore((s) => s.setSize);
  const strength = useLiquifyUiStore((s) => s.strength);
  const setStrength = useLiquifyUiStore((s) => s.setStrength);
  const setLiquifyMode = useLiquifyUiStore((s) => s.setLiquifyMode);

  React.useEffect(() => {
    setLiquifyMode(true);
    return () => {
      setLiquifyMode(false);
    };
  }, [setLiquifyMode]);

  if (!edit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const count = edit.warp.length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('liquify.intro')}</p>

      <div className="flex gap-2">
        {(['push', 'bloat', 'pinch'] as WarpTool[]).map((tk) => {
          const Icon = TOOL_ICON[tk];
          return (
            <Toggle
              key={tk}
              size="sm"
              pressed={tool === tk}
              onPressedChange={() => {
                setTool(tk);
              }}
              className="h-8 flex-1 flex-col gap-0.5 text-[10px]"
            >
              <Icon className="size-3.5" />
              {t(`liquify.tool.${tk}`)}
            </Toggle>
          );
        })}
      </div>

      <AdjustmentSlider
        label={t('liquify.size')}
        value={Math.round(size * 100)}
        min={2}
        max={60}
        step={1}
        defaultValue={18}
        onChange={(v) => {
          setSize(v / 100);
        }}
        onCommit={(v) => {
          setSize(v / 100);
        }}
      />
      <AdjustmentSlider
        label={t('liquify.strength')}
        value={Math.round(strength * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={50}
        onChange={(v) => {
          setStrength(v / 100);
        }}
        onCommit={(v) => {
          setStrength(v / 100);
        }}
      />

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          disabled={count === 0}
          onClick={() => {
            popWarp(t('liquify.undoLabel'));
          }}
        >
          <Undo2 className="size-3.5" /> {t('liquify.undoDab')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          disabled={count === 0}
          onClick={() => {
            clearWarp(t('liquify.resetLabel'));
          }}
        >
          <RotateCcw className="size-3.5" /> {t('liquify.reset')}
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {t('liquify.count')}: {count}
      </p>
    </div>
  );
}

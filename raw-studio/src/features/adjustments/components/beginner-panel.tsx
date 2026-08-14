import * as React from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { AdjustmentSlider } from './adjustment-slider';
import { Button } from '@/components/ui/button';
import { HelpMark } from '@/components/ui/help-mark';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';
import { blurBackground } from '@/features/ai';
import { downloadBlob } from '@/features/export';
import { useT } from '@/i18n';

/**
 * A simplified panel for people who don't want to think in exposure stops or
 * HSL bands. Brighten/Vivid map onto the same real Basic adjustments Pro mode
 * uses (so they're fully non-destructive and undoable). Blur Background is a
 * one-shot action — see background-blur.ts for why it isn't a live slider.
 */
export function BeginnerPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const bitmap = useViewerStore((s) => s.bitmap);
  const t = useT();

  const [pending, setPending] = React.useState<{ brighten?: number; vivid?: number }>({});
  const [blurBusy, setBlurBusy] = React.useState(false);
  const [blurStatus, setBlurStatus] = React.useState<string | null>(null);

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const basic = currentEdit.adjustments.basic;
  // Derive a 0..100 "amount" from the underlying fields (best-effort inverse
  // of the mapping below), so the sliders restore sensibly after reload.
  const brightenAmount = pending.brighten ?? Math.round(basic.exposure * (100 / 1.5));
  const vividAmount = pending.vivid ?? Math.round(basic.vibrance);

  const applyBrighten = (amount: number, commit: boolean) => {
    const patch = {
      basic: {
        exposure: (amount / 100) * 1.5,
        whites: (amount / 100) * 15,
      },
    };
    if (commit) {
      commitAdjustments(patch, `${t('beginner.brighten')} ${String(amount)}`);
      setPending((p) => {
        const rest = { ...p };
        delete rest.brighten;
        return rest;
      });
    } else {
      setPending((p) => ({ ...p, brighten: amount }));
      setPreview(patch);
    }
  };

  const applyVivid = (amount: number, commit: boolean) => {
    const patch = { basic: { vibrance: amount, saturation: amount * 0.3 } };
    if (commit) {
      commitAdjustments(patch, `${t('beginner.vivid')} ${String(amount)}`);
      setPending((p) => {
        const rest = { ...p };
        delete rest.vivid;
        return rest;
      });
    } else {
      setPending((p) => ({ ...p, vivid: amount }));
      setPreview(patch);
    }
  };

  const runBlurBackground = async () => {
    if (!bitmap) return;
    setBlurBusy(true);
    setBlurStatus('Preparing…');
    try {
      const blob = await blurBackground(bitmap, 60, (received, total) => {
        const mb = (received / 1_000_000).toFixed(1);
        setBlurStatus(total ? `Downloading model ${mb} MB…` : `Downloading model ${mb} MB…`);
      });
      downloadBlob(blob, 'background-blur.jpg');
      setBlurStatus('Saved.');
    } catch (err) {
      setBlurStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBlurBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-start gap-1.5">
        <div className="flex-1">
          <AdjustmentSlider
            label={t('beginner.brighten')}
            min={-300}
            max={300}
            step={1}
            defaultValue={0}
            value={brightenAmount}
            onChange={(v) => {
              applyBrighten(v, false);
            }}
            onCommit={(v) => {
              applyBrighten(v, true);
            }}
          />
        </div>
        <HelpMark text="Makes the photo brighter or darker overall." className="mt-0.5" />
      </div>

      <div className="flex items-start gap-1.5">
        <div className="flex-1">
          <AdjustmentSlider
            label={t('beginner.vivid')}
            min={-300}
            max={300}
            step={1}
            defaultValue={0}
            value={vividAmount}
            onChange={(v) => {
              applyVivid(v, false);
            }}
            onCommit={(v) => {
              applyVivid(v, true);
            }}
          />
        </div>
        <HelpMark text="Makes colors more (or less) punchy." className="mt-0.5" />
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{t('beginner.softBackground')}</span>
          <HelpMark text={t('beginner.softBackgroundHelp')} />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || blurBusy}
          onClick={() => {
            void runBlurBackground();
          }}
          className="justify-start"
        >
          {blurBusy ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {t('beginner.softBackground')}
        </Button>
        {blurStatus ? (
          <div className="text-[11px] text-muted-foreground">{blurStatus}</div>
        ) : null}
        <div className="text-[10px] text-muted-foreground">
          This downloads a separate blurred-background photo rather than editing live — it
          doesn&rsquo;t plug into the undo history like the sliders above.
        </div>
      </div>
    </div>
  );
}

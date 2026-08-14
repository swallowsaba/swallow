import * as React from 'react';
import { Pipette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { computeFitScale, type Size } from '../model/viewport';
import { useViewerStore } from '../model/viewer-store';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { computeWhiteBalanceFromSample } from '@/features/adjustments/model/white-balance-picker';
import { useT } from '@/i18n';

interface Props {
  imageSize: Size;
  container: Size;
}

/** Click anywhere in the photo that should be neutral gray/white — this
 *  computes and commits the exact temperature/tint that neutralizes that
 *  sample. Same tool as Lightroom/Camera Raw's white balance selector.
 *  Rotation is not accounted for in this overlay's own placement math (a
 *  scoped simplification, same as the crop/remove-object overlays). */
export function WhiteBalancePickerOverlay({ imageSize, container }: Props): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const setWbPickMode = useViewerStore((s) => s.setWbPickMode);
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const t = useT();

  const [sampleCanvas] = React.useState(() => document.createElement('canvas'));
  const [error, setError] = React.useState<string | null>(null);

  const fitScale = computeFitScale(imageSize, container, 0);
  const dispW = imageSize.width * fitScale;
  const dispH = imageSize.height * fitScale;
  const originX = (container.width - dispW) / 2;
  const originY = (container.height - dispH) / 2;

  React.useEffect(() => {
    if (!bitmap) return;
    sampleCanvas.width = bitmap.width;
    sampleCanvas.height = bitmap.height;
    const ctx = sampleCanvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0);
  }, [bitmap, sampleCanvas]);

  const cancel = () => {
    setWbPickMode(false);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!bitmap || !currentEdit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const imgX = Math.round((e.clientX - rect.left - originX) / fitScale);
    const imgY = Math.round((e.clientY - rect.top - originY) / fitScale);
    if (imgX < 0 || imgY < 0 || imgX >= imageSize.width || imgY >= imageSize.height) return;

    const ctx = sampleCanvas.getContext('2d');
    if (!ctx) {
      setError('2D context unavailable.');
      return;
    }
    const pixel = ctx.getImageData(imgX, imgY, 1, 1).data;
    const r = pixel[0] ?? 128;
    const g = pixel[1] ?? 128;
    const b = pixel[2] ?? 128;
    const { temperature, tint } = computeWhiteBalanceFromSample(r, g, b);
    // The Basic sliders are configured to -300..300 (see basic-panel.tsx);
    // clamp the computed correction to that range so an extreme sample
    // (e.g. an accidental click on a saturated color) can't produce an
    // out-of-range value.
    const clampedTemp = Math.max(-300, Math.min(300, temperature));
    const clampedTint = Math.max(-300, Math.min(300, tint));
    commitAdjustments(
      { basic: { temperature: clampedTemp, tint: clampedTint } },
      t('wb.pickerLabel'),
    );
    setWbPickMode(false);
  };

  return (
    <div className="absolute inset-0">
      <div
        className="absolute cursor-crosshair"
        style={{ left: originX, top: originY, width: dispW, height: dispH }}
        onClick={onClick}
      />

      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex items-center gap-1.5 rounded bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow">
          <Pipette className="size-3.5" />
          {t('wb.pickerHelp')}
        </div>
        {error ? <div className="text-[11px] text-destructive">{error}</div> : null}
        <Button variant="outline" size="sm" onClick={cancel} className="h-7 gap-1 px-3 text-xs">
          <X className="size-3.5" />
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

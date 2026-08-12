import * as React from 'react';
import { Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewerStore } from '@/features/viewer';
import { MODELS } from '../model/model-registry';
import { segment, type SegmentationResult } from '../model/segmentation';

export function AiPanel(): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SegmentationResult | null>(null);

  const model = MODELS['u2netp-subject'];

  const runSegmentation = async () => {
    if (!bitmap || !model) return;
    setBusy(true);
    setResult(null);
    setStatus('Preparing model…');
    try {
      const seg = await segment(model.id, bitmap, (received, total) => {
        const mb = (received / 1_000_000).toFixed(1);
        setStatus(total ? `Downloading model ${mb} MB…` : `Downloading model ${mb} MB…`);
      });
      setStatus('Running inference…');
      setResult(seg);
      setStatus('Done.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Segmentation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-[11px] text-muted-foreground">
        Model-based tools download a model on first use ({model?.approxSizeMb ?? '~5'} MB,{' '}
        {model?.license}) and run entirely in your browser.
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={!bitmap || busy}
        onClick={() => {
          void runSegmentation();
        }}
        className="justify-start"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Scissors />}
        Detect subject / background
      </Button>

      {status ? <div className="text-[11px] text-muted-foreground">{status}</div> : null}

      {result ? (
        <div className="text-[11px] text-muted-foreground">
          Mask ready ({result.size}×{result.size}). Mask editing integration lands with the mask
          tools.
        </div>
      ) : null}

      <div className="mt-2 text-[11px] text-muted-foreground">
        Coming next: AI denoise and super-resolution (larger models, same pipeline).
      </div>
    </div>
  );
}

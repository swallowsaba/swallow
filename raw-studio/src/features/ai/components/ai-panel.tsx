import * as React from 'react';
import { Eraser, Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewerStore } from '@/features/viewer';
import { useT } from '@/i18n';
import { MODELS } from '../model/model-registry';
import { segment, type SegmentationResult } from '../model/segmentation';

export function AiPanel(): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SegmentationResult | null>(null);
  const t = useT();

  const model = MODELS['u2netp-subject'];

  const runSegmentation = async () => {
    if (!bitmap || !model) return;
    setBusy(true);
    setResult(null);
    setStatus('Preparing model…');
    try {
      const seg = await segment(model.id, bitmap, (received, total) => {
        const mb = (received / 1_000_000).toFixed(1);
        const totalMb = total ? (total / 1_000_000).toFixed(1) : '?';
        setStatus(`${mb}/${totalMb} MB…`);
      });
      setStatus('Running inference…');
      setResult(seg);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Segmentation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('ai.title')}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('ai.intro')}</p>
      </div>

      <section className="flex flex-col gap-1.5 rounded-md border p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Scissors className="size-3.5" />
          {t('ai.detectSubject')}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('ai.detectSubjectHelp')}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || busy}
          onClick={() => {
            void runSegmentation();
          }}
          className="mt-1 justify-start"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Scissors />}
          {t('ai.detectSubject')}
        </Button>
        {status ? <div className="text-[11px] text-muted-foreground">{status}</div> : null}
        {result ? (
          <div className="text-[11px] text-muted-foreground">
            {t('ai.maskReady')} ({result.size}×{result.size})
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-1.5 rounded-md border p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Eraser className="size-3.5" />
          {t('ai.removeObjectTitle')}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('ai.removeObjectHelp')}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap}
          onClick={() => {
            setRemoveMode(true);
          }}
          className="mt-1 justify-start"
        >
          <Eraser />
          {t('ai.openRemoveObject')}
        </Button>
      </section>

      <div className="text-[11px] text-muted-foreground">{t('ai.roadmap')}</div>
    </div>
  );
}

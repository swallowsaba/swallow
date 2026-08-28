import * as React from 'react';
import { Eraser, Loader2, Palette, Scissors, Sparkle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useViewerStore } from '@/features/viewer';
import { useEditorStore } from '@/features/editor';
import { downloadBlob } from '@/features/export/model/export';
import { useT } from '@/i18n';
import { MODELS } from '../model/model-registry';
import { segment, type SegmentationResult } from '../model/segmentation';
import { autoRemoveThinStructures } from '../model/auto-remove';
import { aiDenoise, isMobileDevice } from '../model/ai-denoise';
import { aiSharpen } from '../model/ai-restore';
import { DefenceGuidance } from './defence-guidance';
import { optionsForSensitivity } from '../model/thin-structure';
import { smoothPortrait } from '../model/portrait-smooth';
import { computeImageStats } from '../model/image-stats';
import { computeAutoGrade } from '../model/auto-grade';

export function AiPanel(): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SegmentationResult | null>(null);
  const [smoothStrength, setSmoothStrength] = React.useState(50);
  const [smoothBusy, setSmoothBusy] = React.useState(false);
  const [smoothStatus, setSmoothStatus] = React.useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = React.useState(false);
  const [removeStatus, setRemoveStatus] = React.useState<string | null>(null);
  const [removeSensitivity, setRemoveSensitivity] = React.useState(40);
  const [denoiseBusy, setDenoiseBusy] = React.useState(false);
  const [denoiseStatus, setDenoiseStatus] = React.useState<string | null>(null);
  const [sharpenBusy, setSharpenBusy] = React.useState(false);
  const [sharpenStatus, setSharpenStatus] = React.useState<string | null>(null);
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

  const runPortraitSmooth = async () => {
    if (!bitmap) return;
    setSmoothBusy(true);
    setSmoothStatus('Preparing model…');
    try {
      const blob = await smoothPortrait(bitmap, smoothStrength, (received, total) => {
        const mb = (received / 1_000_000).toFixed(0);
        const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
        setSmoothStatus(`${mb}/${totalMb} MB…`);
      });
      downloadBlob(blob, 'portrait-smoothed.jpg');
      setSmoothStatus(t('ai.done'));
    } catch (err) {
      setSmoothStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSmoothBusy(false);
    }
  };

  const runAiDenoise = async () => {
    if (!bitmap) return;
    setDenoiseBusy(true);
    setDenoiseStatus(t('ai.denoisePreparing'));
    try {
      const blob = await aiDenoise(bitmap, {}, (received, total) => {
        const mb = (received / 1_000_000).toFixed(0);
        const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
        setDenoiseStatus(`${mb}/${totalMb} MB…`);
      });
      downloadBlob(blob, 'denoised.jpg');
      setDenoiseStatus(t('ai.done'));
    } catch (err) {
      setDenoiseStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setDenoiseBusy(false);
    }
  };

  const runAiSharpen = async () => {
    if (!bitmap) return;
    setSharpenBusy(true);
    setSharpenStatus(t('ai.sharpenPreparing'));
    try {
      const blob = await aiSharpen(bitmap, {}, (received, total) => {
        const mb = (received / 1_000_000).toFixed(0);
        const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
        setSharpenStatus(`${mb}/${totalMb} MB…`);
      });
      downloadBlob(blob, 'sharpened.jpg');
      setSharpenStatus(t('ai.done'));
    } catch (err) {
      setSharpenStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSharpenBusy(false);
    }
  };

  const runRemoveDistractions = async () => {
    if (!bitmap) return;
    setRemoveBusy(true);
    setRemoveStatus(t('ai.removePreparing'));
    try {
      const res = await autoRemoveThinStructures(
        'lama-inpaint',
        bitmap,
        optionsForSensitivity(removeSensitivity),
        (received, total) => {
          const mb = (received / 1_000_000).toFixed(0);
          const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
          setRemoveStatus(`${mb}/${totalMb} MB…`);
        },
      );
      const { blob, coverage } = res;
      if (!blob) {
        setRemoveStatus(res.abortedTooLarge ? t('ai.removeTooLarge') : t('ai.removeNothing'));
        return;
      }
      downloadBlob(blob, 'distractions-removed.jpg');
      setRemoveStatus(`${t('ai.done')} (${(coverage * 100).toFixed(1)}%)`);
    } catch (err) {
      setRemoveStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setRemoveBusy(false);
    }
  };

  const runAutoGrade = () => {
    if (!bitmap) return;
    const stats = computeImageStats(bitmap);
    commitAdjustments(computeAutoGrade(stats), t('ai.autoGradeTitle'));
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
          <Palette className="size-3.5" />
          {t('ai.autoGradeTitle')}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('ai.autoGradeHelp')}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap}
          onClick={runAutoGrade}
          className="mt-1 justify-start"
        >
          <Palette />
          {t('ai.autoGradeTitle')}
        </Button>
      </section>

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

      <section className="flex flex-col gap-1.5 rounded-md border p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkle className="size-3.5" />
          {t('ai.portraitSmoothTitle')}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('ai.portraitSmoothHelp')}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t('ai.strength')}</span>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[smoothStrength]}
            onValueChange={(v) => {
              const n = v[0];
              if (n !== undefined) setSmoothStrength(n);
            }}
            className="flex-1"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || smoothBusy}
          onClick={() => {
            void runPortraitSmooth();
          }}
          className="mt-1 justify-start"
        >
          {smoothBusy ? <Loader2 className="animate-spin" /> : <Sparkle />}
          {t('ai.portraitSmoothTitle')}
        </Button>
        {smoothStatus ? (
          <div className="text-[11px] text-muted-foreground">{smoothStatus}</div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('ai.removeTitle')}
        </div>
        <div className="text-[11px] text-muted-foreground">{t('ai.removeDesc')}</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{t('ai.removeSensitivity')}</span>
          <Slider
            value={[removeSensitivity]}
            min={0}
            max={100}
            step={1}
            className="flex-1"
            onValueChange={(v) => {
              setRemoveSensitivity(v[0] ?? 40);
            }}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
            {removeSensitivity}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || removeBusy}
          onClick={() => {
            void runRemoveDistractions();
          }}
        >
          {removeBusy ? <Loader2 className="animate-spin" /> : <Sparkle />}
          {t('ai.removeRun')}
        </Button>
        {removeStatus ? (
          <div className="text-[11px] text-muted-foreground">{removeStatus}</div>
        ) : null}
        <div className="mt-1 text-[11px] font-medium text-foreground">{t('defence.title')}</div>
        <DefenceGuidance />
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('ai.denoiseTitle')}
        </div>
        <div className="text-[11px] text-muted-foreground">{t('ai.denoiseDesc')}</div>
        <div className="text-[11px] text-muted-foreground">
          {isMobileDevice() ? t('ai.denoiseModeMobile') : t('ai.denoiseModePc')}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || denoiseBusy}
          onClick={() => {
            void runAiDenoise();
          }}
        >
          {denoiseBusy ? <Loader2 className="animate-spin" /> : <Sparkle />}
          {t('ai.denoiseRun')}
        </Button>
        {denoiseStatus ? (
          <div className="text-[11px] text-muted-foreground">{denoiseStatus}</div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('ai.sharpenTitle')}
        </div>
        <div className="text-[11px] text-muted-foreground">{t('ai.sharpenDesc')}</div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bitmap || sharpenBusy}
          onClick={() => {
            void runAiSharpen();
          }}
        >
          {sharpenBusy ? <Loader2 className="animate-spin" /> : <Sparkle />}
          {t('ai.sharpenRun')}
        </Button>
        {sharpenStatus ? (
          <div className="text-[11px] text-muted-foreground">{sharpenStatus}</div>
        ) : null}
      </section>

      <div className="text-[11px] text-muted-foreground">{t('ai.roadmap')}</div>
    </div>
  );
}

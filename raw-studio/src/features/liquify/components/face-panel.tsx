import * as React from 'react';
import { Loader2, ScanFace, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';
import { AdjustmentSlider } from '@/features/adjustments/components/adjustment-slider';
import { useT } from '@/i18n';
import {
  DEFAULT_FACE_RESHAPE,
  proposeFaceReshape,
  type FaceReshapeParams,
} from '../model/face-reshape';
import { detectFaceLandmarks } from '../model/face-detect';
import { useLiquifyUiStore } from '../model/liquify-ui-store';

export function FacePanel(): React.JSX.Element {
  const edit = useEditorStore(selectCurrentEdit);
  const t = useT();
  const bitmap = useViewerStore((s) => s.bitmap);
  const commitWarp = useEditorStore((s) => s.commitWarp);
  const setWarpPreview = useEditorStore((s) => s.setWarpPreview);
  const clearWarpPreview = useEditorStore((s) => s.clearWarpPreview);
  const setFaceMode = useLiquifyUiStore((s) => s.setFaceMode);
  const landmarks = useLiquifyUiStore((s) => s.faceLandmarks);
  const setLandmarks = useLiquifyUiStore((s) => s.setFaceLandmarks);

  const [params, setParams] = React.useState<FaceReshapeParams>(DEFAULT_FACE_RESHAPE);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  // Enable the fit-locked face view so the warp preview lines up (no brush).
  React.useEffect(() => {
    setFaceMode(true);
    return () => {
      setFaceMode(false);
      setLandmarks(null);
      clearWarpPreview();
    };
  }, [setFaceMode, setLandmarks, clearWarpPreview]);

  // Live-preview the reshape while landmarks + params are set.
  React.useEffect(() => {
    if (!landmarks) return;
    const ops = proposeFaceReshape(landmarks, params);
    if (ops.length > 0) setWarpPreview(ops);
    else clearWarpPreview();
  }, [landmarks, params, setWarpPreview, clearWarpPreview]);

  if (!edit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const detect = async () => {
    if (!bitmap || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await detectFaceLandmarks(bitmap, edit.geometry.crop);
      if (!result) {
        setNote(t('face.notFound'));
        setLandmarks(null);
        return;
      }
      setLandmarks(result.landmarks);
      setNote(result.source === 'model' ? t('face.sourceModel') : t('face.sourceEstimate'));
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!landmarks) return;
    const ops = proposeFaceReshape(landmarks, params);
    if (ops.length === 0) return;
    commitWarp(ops, t('face.applyLabel'));
    setLandmarks(null);
    setNote(t('face.applied'));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('face.intro')}</p>

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1"
        disabled={!bitmap || busy}
        onClick={() => {
          void detect();
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ScanFace className="size-3.5" />}
        {busy ? t('face.detecting') : t('face.detect')}
      </Button>

      <AdjustmentSlider
        label={t('face.eyeSize')}
        value={Math.round(params.eyeSize * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={50}
        onChange={(v) => {
          setParams((p) => ({ ...p, eyeSize: v / 100 }));
        }}
        onCommit={(v) => {
          setParams((p) => ({ ...p, eyeSize: v / 100 }));
        }}
      />
      <AdjustmentSlider
        label={t('face.slim')}
        value={Math.round(params.faceSlim * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={40}
        onChange={(v) => {
          setParams((p) => ({ ...p, faceSlim: v / 100 }));
        }}
        onCommit={(v) => {
          setParams((p) => ({ ...p, faceSlim: v / 100 }));
        }}
      />

      <Button
        size="sm"
        className="w-full gap-1"
        disabled={!landmarks}
        onClick={apply}
      >
        <Sparkles className="size-3.5" /> {t('face.apply')}
      </Button>

      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
      {landmarks ? (
        <p className="text-[11px] leading-relaxed text-primary">{t('face.dragHint')}</p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t('face.disclaimer')}</p>
    </div>
  );
}

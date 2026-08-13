import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';

interface SliderSpec {
  key: 'distortion' | 'vignetting' | 'chromaticAberration';
  labelKey: TranslationKey;
  helpKey: TranslationKey;
}

const SLIDERS: readonly SliderSpec[] = [
  { key: 'distortion', labelKey: 'lens.distortion', helpKey: 'lens.distortionHelp' },
  { key: 'vignetting', labelKey: 'lens.vignetting', helpKey: 'lens.vignettingHelp' },
  {
    key: 'chromaticAberration',
    labelKey: 'lens.chromaticAberration',
    helpKey: 'lens.chromaticAberrationHelp',
  },
];

export function LensPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const t = useT();
  const [pending, setPending] = React.useState<
    Partial<Record<SliderSpec['key'], number>>
  >({});

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const lens = currentEdit.adjustments.lens;

  const handleChange = (key: SliderSpec['key'], value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ lens: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ lens: { [spec.key]: value } }, `${t(spec.labelKey)} ${String(value)}`);
    setPending((prev) => {
      const rest = { ...prev };
      delete rest[spec.key];
      return rest;
    });
  };

  const toggleFisheye = (checked: boolean) => {
    commitAdjustments({ lens: { fisheye: checked } }, t('lens.fisheye'));
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('lens.title')}
        </h3>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={lens.fisheye}
              onChange={(e) => {
                toggleFisheye(e.target.checked);
              }}
            />
            {t('lens.fisheye')}
          </label>
          <HelpMark text={t('lens.fisheyeHelp')} />
        </div>

        {SLIDERS.map((spec) => (
          <div key={spec.key} className="flex items-start gap-1.5">
            <div className="flex-1">
              <AdjustmentSlider
                label={t(spec.labelKey)}
                min={-100}
                max={100}
                step={1}
                defaultValue={0}
                value={pending[spec.key] ?? lens[spec.key]}
                onChange={(v) => {
                  handleChange(spec.key, v);
                }}
                onCommit={(v) => {
                  handleCommit(spec, v);
                }}
              />
            </div>
            <HelpMark text={t(spec.helpKey)} className="mt-0.5" />
          </div>
        ))}
      </section>
    </div>
  );
}

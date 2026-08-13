import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { curveFromToneSliders, toneSlidersFromCurve } from '../model/advanced-math';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';

interface ToneSliderSpec {
  key: 'shadows' | 'midtones' | 'highlights';
  labelKey: TranslationKey;
  help: string;
}

const SLIDERS: readonly ToneSliderSpec[] = [
  {
    key: 'shadows',
    labelKey: 'tone.shadows',
    help: 'Raises or lowers the darkest tones only.',
  },
  {
    key: 'midtones',
    labelKey: 'tone.midtones',
    help: 'Raises or lowers the middle tones only.',
  },
  {
    key: 'highlights',
    labelKey: 'tone.highlights',
    help: 'Raises or lowers the brightest tones only.',
  },
];

/**
 * A simplified 3-point tone curve (rather than a free-form point editor).
 * The three sliders are stored into `adjustments.toneCurves.rgb` as three
 * control points, so the data is still the standard curve shape other tools
 * could read.
 */
export function TonePanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const t = useT();

  const [pending, setPending] = React.useState<Partial<Record<ToneSliderSpec['key'], number>>>(
    {},
  );

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const deltas = toneSlidersFromCurve(currentEdit.adjustments.toneCurves.rgb);

  const handleChange = (key: ToneSliderSpec['key'], value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    const next = { ...deltas, ...pending, [key]: value };
    setPreview({ toneCurves: { rgb: curveFromToneSliders(next) } });
  };

  const handleCommit = (spec: ToneSliderSpec, value: number) => {
    const next = { ...deltas, ...pending, [spec.key]: value };
    commitAdjustments(
      { toneCurves: { rgb: curveFromToneSliders(next) } },
      `${t(spec.labelKey)} ${String(value)}`,
    );
    setPending((prev) => {
      const rest = { ...prev };
      delete rest[spec.key];
      return rest;
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('tone.title')}
        </h3>
        {SLIDERS.map((spec) => (
          <div key={spec.key} className="flex items-start gap-1.5">
            <div className="flex-1">
              <AdjustmentSlider
                label={t(spec.labelKey)}
                min={-100}
                max={100}
                step={1}
                defaultValue={0}
                value={pending[spec.key] ?? deltas[spec.key]}
                onChange={(v) => {
                  handleChange(spec.key, v);
                }}
                onCommit={(v) => {
                  handleCommit(spec, v);
                }}
              />
            </div>
            <HelpMark text={spec.help} className="mt-0.5" />
          </div>
        ))}
      </section>
    </div>
  );
}

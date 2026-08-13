import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { curveFromToneSliders, toneSlidersFromCurve } from '../model/advanced-math';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';

interface ToneSliderSpec {
  key: 'shadows' | 'midtones' | 'highlights';
  label: string;
  help: string;
}

const SLIDERS: readonly ToneSliderSpec[] = [
  { key: 'shadows', label: 'Shadows', help: 'Raises or lowers the darkest tones only.' },
  { key: 'midtones', label: 'Midtones', help: 'Raises or lowers the middle tones only.' },
  { key: 'highlights', label: 'Highlights', help: 'Raises or lowers the brightest tones only.' },
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

  const [pending, setPending] = React.useState<Partial<Record<ToneSliderSpec['key'], number>>>(
    {},
  );

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        Open an image to start editing.
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
      `Tone ${spec.label} ${String(value)}`,
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
          Tone Curve
        </h3>
        {SLIDERS.map((spec) => (
          <div key={spec.key} className="flex items-start gap-1.5">
            <div className="flex-1">
              <AdjustmentSlider
                label={spec.label}
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

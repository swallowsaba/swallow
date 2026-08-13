import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import type { LensCorrections } from '@/types';

interface SliderSpec {
  key: keyof LensCorrections;
  label: string;
  help: string;
}

const SLIDERS: readonly SliderSpec[] = [
  {
    key: 'distortion',
    label: 'Distortion',
    help: 'Corrects barrel (bulging) or pincushion (pinched) lens distortion. Positive pushes edges outward, negative pulls them inward.',
  },
  {
    key: 'vignetting',
    label: 'Vignetting',
    help: 'Darkens or brightens the corners relative to the center.',
  },
  {
    key: 'chromaticAberration',
    label: 'Chromatic Aberration',
    help: 'Reduces (or, if pushed the other way, adds) color fringing near high-contrast edges.',
  },
];

export function LensPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const [pending, setPending] = React.useState<Partial<Record<keyof LensCorrections, number>>>(
    {},
  );

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        Open an image to start editing.
      </div>
    );
  }

  const lens = currentEdit.adjustments.lens;

  const handleChange = (key: keyof LensCorrections, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ lens: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ lens: { [spec.key]: value } }, `${spec.label} ${String(value)}`);
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
          Lens Corrections
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
                value={pending[spec.key] ?? lens[spec.key]}
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

import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { AutoBar } from '@/features/ai';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import type { BasicAdjustments } from '@/types';

interface SliderSpec {
  key: keyof BasicAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

interface SliderGroup {
  title: string;
  sliders: readonly SliderSpec[];
}

const GROUPS: readonly SliderGroup[] = [
  {
    title: 'Light',
    sliders: [
      { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.05, defaultValue: 0 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'gamma', label: 'Gamma', min: 0.1, max: 3, step: 0.01, defaultValue: 1 },
    ],
  },
  {
    title: 'Color',
    sliders: [
      { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, defaultValue: 0 },
    ],
  },
];

export function BasicPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);

  // Live (uncommitted) drag values keyed by field.
  const [pending, setPending] = React.useState<Partial<Record<keyof BasicAdjustments, number>>>({});

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        Open an image to start editing.
      </div>
    );
  }

  const basic = currentEdit.adjustments.basic;

  const handleChange = (key: keyof BasicAdjustments, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ basic: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ basic: { [spec.key]: value } }, `${spec.label} ${String(value)}`);
    setPending((prev) => {
      const next = { ...prev };
      delete next[spec.key];
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <AutoBar />
      <div className="flex flex-col gap-5 p-4">
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h3>
          {group.sliders.map((spec) => (
            <AdjustmentSlider
              key={spec.key}
              label={spec.label}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              defaultValue={spec.defaultValue}
              value={pending[spec.key] ?? basic[spec.key]}
              onChange={(v) => {
                handleChange(spec.key, v);
              }}
              onCommit={(v) => {
                handleCommit(spec, v);
              }}
            />
          ))}
        </section>
      ))}
      </div>
    </div>
  );
}

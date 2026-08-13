import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import type { DetailAdjustments } from '@/types';

interface SliderSpec {
  key: keyof DetailAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  help: string;
}

interface Group {
  title: string;
  sliders: readonly SliderSpec[];
}

const GROUPS: readonly Group[] = [
  {
    title: 'Presence',
    sliders: [
      {
        key: 'clarity',
        label: 'Clarity',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Boosts (or softens) local contrast in the midtones for a punchier or dreamier look.',
      },
      {
        key: 'texture',
        label: 'Texture',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Enhances fine surface detail without affecting overall contrast as much as Clarity.',
      },
      {
        key: 'dehaze',
        label: 'Dehaze',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Cuts through atmospheric haze by boosting contrast — a simplified approximation, not a full dark-channel dehaze.',
      },
    ],
  },
  {
    title: 'Sharpening',
    sliders: [
      {
        key: 'sharpenAmount',
        label: 'Amount',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'How strongly edges are sharpened.',
      },
      {
        key: 'sharpenRadius',
        label: 'Radius',
        min: 0.5,
        max: 3,
        step: 0.1,
        defaultValue: 1,
        help: 'How wide an area around each edge is considered when sharpening.',
      },
    ],
  },
  {
    title: 'Noise Reduction',
    sliders: [
      {
        key: 'noiseReduction',
        label: 'Luminance',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Smooths brightness noise (grain). Higher values can soften fine detail.',
      },
      {
        key: 'colorNoiseReduction',
        label: 'Color',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Smooths color speckling (chroma noise) without affecting brightness detail.',
      },
    ],
  },
];

export function DetailPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const [pending, setPending] = React.useState<Partial<Record<keyof DetailAdjustments, number>>>(
    {},
  );

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        Open an image to start editing.
      </div>
    );
  }

  const detail = currentEdit.adjustments.detail;

  const handleChange = (key: keyof DetailAdjustments, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ detail: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ detail: { [spec.key]: value } }, `${spec.label} ${String(value)}`);
    setPending((prev) => {
      const rest = { ...prev };
      delete rest[spec.key];
      return rest;
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h3>
          {group.sliders.map((spec) => (
            <div key={spec.key} className="flex items-start gap-1.5">
              <div className="flex-1">
                <AdjustmentSlider
                  label={spec.label}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  defaultValue={spec.defaultValue}
                  value={pending[spec.key] ?? detail[spec.key]}
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
      ))}
    </div>
  );
}

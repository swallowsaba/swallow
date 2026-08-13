import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { AutoBar } from '@/features/ai';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { HelpMark } from '@/components/ui/help-mark';
import type { BasicAdjustments } from '@/types';

interface SliderSpec {
  key: keyof BasicAdjustments;
  labelKey: TranslationKey;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  help: string;
}

interface SliderGroup {
  titleKey: TranslationKey;
  sliders: readonly SliderSpec[];
}

const GROUPS: readonly SliderGroup[] = [
  {
    titleKey: 'basic.groupLight',
    sliders: [
      {
        key: 'exposure',
        labelKey: 'basic.exposure',
        min: -5,
        max: 5,
        step: 0.05,
        defaultValue: 0,
        help: 'Brightens or darkens the whole image, in stops (like a camera\u2019s exposure compensation).',
      },
      {
        key: 'contrast',
        labelKey: 'basic.contrast',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Increases or decreases the difference between light and dark areas.',
      },
      {
        key: 'highlights',
        labelKey: 'basic.highlights',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Recovers (or brightens) just the brightest parts of the image.',
      },
      {
        key: 'shadows',
        labelKey: 'basic.shadows',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Opens up (or darkens) just the darkest parts of the image.',
      },
      {
        key: 'whites',
        labelKey: 'basic.whites',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Sets where pure white clips \u2014 raises or lowers the brightest point.',
      },
      {
        key: 'blacks',
        labelKey: 'basic.blacks',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Sets where pure black clips \u2014 raises or lowers the darkest point.',
      },
      {
        key: 'brightness',
        labelKey: 'basic.brightness',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'A gentler, uniform brightness shift across the whole image.',
      },
      {
        key: 'gamma',
        labelKey: 'basic.gamma',
        min: 0.1,
        max: 3,
        step: 0.01,
        defaultValue: 1,
        help: 'Reshapes the overall tone curve. 1.0 is neutral.',
      },
    ],
  },
  {
    titleKey: 'basic.groupColor',
    sliders: [
      {
        key: 'temperature',
        labelKey: 'basic.temperature',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Shifts the white balance warmer (toward orange) or cooler (toward blue).',
      },
      {
        key: 'tint',
        labelKey: 'basic.tint',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Corrects a green or magenta color cast.',
      },
      {
        key: 'vibrance',
        labelKey: 'basic.vibrance',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Boosts muted colors more than already-vivid ones, so skin tones stay natural.',
      },
      {
        key: 'saturation',
        labelKey: 'basic.saturation',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
        help: 'Boosts or reduces the intensity of all colors equally.',
      },
    ],
  },
];

export function BasicPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const t = useT();

  // Live (uncommitted) drag values keyed by field.
  const [pending, setPending] = React.useState<Partial<Record<keyof BasicAdjustments, number>>>({});

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const basic = currentEdit.adjustments.basic;

  const handleChange = (key: keyof BasicAdjustments, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ basic: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ basic: { [spec.key]: value } }, `${t(spec.labelKey)} ${String(value)}`);
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
        <section key={group.titleKey} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(group.titleKey)}
          </h3>
          {group.sliders.map((spec) => (
            <div key={spec.key} className="flex items-start gap-1.5">
              <div className="flex-1">
                <AdjustmentSlider
                  label={t(spec.labelKey)}
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
              </div>
              <HelpMark text={spec.help} className="mt-0.5" />
            </div>
          ))}
        </section>
      ))}
      </div>
    </div>
  );
}

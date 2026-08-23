import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { suggestDenoiseFromIso } from '../model/iso-denoise';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import type { DetailAdjustments } from '@/types';

interface SliderSpec {
  key: keyof DetailAdjustments;
  labelKey: TranslationKey;
  helpKey: TranslationKey;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

interface Group {
  titleKey: TranslationKey;
  sliders: readonly SliderSpec[];
}

const GROUPS: readonly Group[] = [
  {
    titleKey: 'detail.presence',
    sliders: [
      {
        key: 'clarity',
        labelKey: 'detail.clarity',
        helpKey: 'detail.clarityHelp',
        min: -300,
        max: 300,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'texture',
        labelKey: 'detail.texture',
        helpKey: 'detail.textureHelp',
        min: -300,
        max: 300,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'dehaze',
        labelKey: 'detail.dehaze',
        helpKey: 'detail.dehazeHelp',
        min: -300,
        max: 300,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    titleKey: 'detail.sharpening',
    sliders: [
      {
        key: 'sharpenAmount',
        labelKey: 'detail.amount',
        helpKey: 'detail.amountHelp',
        min: 0,
        max: 300,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'sharpenRadius',
        labelKey: 'detail.radius',
        helpKey: 'detail.radiusHelp',
        min: 0.5,
        max: 3,
        step: 0.1,
        defaultValue: 1,
      },
    ],
  },
  {
    titleKey: 'detail.noiseReduction',
    sliders: [
      {
        key: 'noiseReduction',
        labelKey: 'detail.luminanceNr',
        helpKey: 'detail.luminanceNrHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'colorNoiseReduction',
        labelKey: 'detail.colorNr',
        helpKey: 'detail.colorNrHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    titleKey: 'detail.grain',
    sliders: [
      {
        key: 'grain',
        labelKey: 'detail.grainAmount',
        helpKey: 'detail.grainAmountHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'grainSize',
        labelKey: 'detail.grainSize',
        helpKey: 'detail.grainSizeHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 40,
      },
    ],
  },
  {
    titleKey: 'detail.vignette',
    sliders: [
      {
        key: 'vignetteAmount',
        labelKey: 'detail.vignetteAmount',
        helpKey: 'detail.vignetteAmountHelp',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'vignetteMidpoint',
        labelKey: 'detail.vignetteMidpoint',
        helpKey: 'detail.vignetteMidpointHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
      {
        key: 'vignetteRoundness',
        labelKey: 'detail.vignetteRoundness',
        helpKey: 'detail.vignetteRoundnessHelp',
        min: -100,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: 'vignetteFeather',
        labelKey: 'detail.vignetteFeather',
        helpKey: 'detail.vignetteFeatherHelp',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
    ],
  },
];

export function DetailPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const iso = useEditorStore((s) => s.image?.camera?.iso);
  const t = useT();
  const [pending, setPending] = React.useState<Partial<Record<keyof DetailAdjustments, number>>>(
    {},
  );

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const detail = currentEdit.adjustments.detail;

  const handleChange = (key: keyof DetailAdjustments, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ detail: { [key]: value } });
  };

  const handleCommit = (spec: SliderSpec, value: number) => {
    commitAdjustments({ detail: { [spec.key]: value } }, `${t(spec.labelKey)} ${String(value)}`);
    setPending((prev) => {
      const rest = { ...prev };
      delete rest[spec.key];
      return rest;
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {GROUPS.map((group) => (
        <section key={group.titleKey} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(group.titleKey)}
            </h3>
            {group.titleKey === 'detail.noiseReduction' && iso ? (
              <button
                type="button"
                className="text-[10px] text-primary hover:underline"
                onClick={() => {
                  const s = suggestDenoiseFromIso(iso);
                  commitAdjustments(
                    { detail: { noiseReduction: s.noiseReduction, colorNoiseReduction: s.colorNoiseReduction } },
                    t('detail.autoDenoise'),
                  );
                }}
                title={`ISO ${String(iso)}`}
              >
                {t('detail.autoDenoise')}
              </button>
            ) : null}
          </div>
          {group.sliders.map((spec) => (
            <div key={spec.key} className="flex items-start gap-1.5">
              <div className="flex-1">
                <AdjustmentSlider
                  label={t(spec.labelKey)}
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
              <HelpMark text={t(spec.helpKey)} className="mt-0.5" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

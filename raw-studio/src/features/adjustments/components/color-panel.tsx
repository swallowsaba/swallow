import * as React from 'react';
import { AdjustmentSlider } from './adjustment-slider';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { HelpMark } from '@/components/ui/help-mark';
import { HSL_BANDS, type HslBand, type HslChannel } from '@/types';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';

const BAND_KEY: Record<HslBand, TranslationKey> = {
  red: 'color.band.red',
  orange: 'color.band.orange',
  yellow: 'color.band.yellow',
  green: 'color.band.green',
  aqua: 'color.band.aqua',
  blue: 'color.band.blue',
  purple: 'color.band.purple',
  magenta: 'color.band.magenta',
};

const BAND_SWATCH: Record<HslBand, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  aqua: '#06b6d4',
  blue: '#3b82f6',
  purple: '#a855f7',
  magenta: '#ec4899',
};

const CHANNEL_KEY: Record<keyof HslChannel, TranslationKey> = {
  hue: 'color.hue',
  saturation: 'color.saturation',
  luminance: 'color.luminance',
};

const CHANNEL_HELP_KEY: Record<keyof HslChannel, TranslationKey> = {
  hue: 'color.hueHelp',
  saturation: 'color.saturationHelp',
  luminance: 'color.luminanceHelp',
};

/** The Lightroom-style "Color Mixer": pick a band, then adjust its H/S/L. */
export function ColorPanel(): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const setPreview = useEditorStore((s) => s.setPreview);
  const [activeBand, setActiveBand] = React.useState<HslBand>('red');
  const [pending, setPending] = React.useState<Partial<HslChannel>>({});
  const t = useT();

  if (!currentEdit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const channel = currentEdit.adjustments.hsl[activeBand];

  const handleChange = (key: keyof HslChannel, value: number) => {
    setPending((prev) => ({ ...prev, [key]: value }));
    setPreview({ hsl: { [activeBand]: { [key]: value } } });
  };

  const handleCommit = (key: keyof HslChannel, value: number) => {
    commitAdjustments(
      { hsl: { [activeBand]: { [key]: value } } },
      `${t(BAND_KEY[activeBand])} ${t(CHANNEL_KEY[key])} ${String(value)}`,
    );
    setPending((prev) => {
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('color.mixerTitle')}
          </h3>
          <HelpMark text={t('color.mixerHelp')} />
        </div>
        <div className="grid grid-cols-8 gap-1">
          {HSL_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              title={t(BAND_KEY[band])}
              onClick={() => {
                setActiveBand(band);
                setPending({});
              }}
              className={cn(
                'aspect-square rounded-full border-2 transition-transform',
                activeBand === band ? 'scale-110 border-foreground' : 'border-transparent',
              )}
              style={{ backgroundColor: BAND_SWATCH[band] }}
            />
          ))}
        </div>
        <div className="text-center text-[11px] font-medium text-muted-foreground">
          {t(BAND_KEY[activeBand])}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {(['hue', 'saturation', 'luminance'] as const).map((key) => (
          <div key={key} className="flex items-start gap-1.5">
            <div className="flex-1">
              <AdjustmentSlider
                label={t(CHANNEL_KEY[key])}
                min={-100}
                max={100}
                step={1}
                defaultValue={0}
                value={pending[key] ?? channel[key]}
                onChange={(v) => {
                  handleChange(key, v);
                }}
                onCommit={(v) => {
                  handleCommit(key, v);
                }}
              />
            </div>
            <HelpMark text={t(CHANNEL_HELP_KEY[key])} className="mt-0.5" />
          </div>
        ))}
      </section>
    </div>
  );
}

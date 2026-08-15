import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Download, Loader2, Type, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { HelpMark } from '@/components/ui/help-mark';
import { useLibraryStore, getCachedBitmap } from '@/features/library';
import { downloadBlob } from '@/features/export/model/export';
import { useT } from '@/i18n';
import {
  encodeCollage,
  DEFAULT_COLLAGE_OPTIONS,
  type CollageOptions,
} from '../model/collage-encode';
import type { TextAnchor } from '../model/text-layout';

const ANCHORS: readonly TextAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export function CollagePanel(): React.JSX.Element {
  // `filter()` returns a fresh array each call; a shallow compare keeps the
  // snapshot stable (same item refs) and avoids a useSyncExternalStore loop.
  const items = useLibraryStore(useShallow((s) => s.items.filter((it) => it.status === 'ready')));
  const t = useT();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [options, setOptions] = React.useState<CollageOptions>(DEFAULT_COLLAGE_OPTIONS);
  const [textEnabled, setTextEnabled] = React.useState(false);
  const [textContent, setTextContent] = React.useState('');
  const [textAnchor, setTextAnchor] = React.useState<TextAnchor>('bottom-center');
  const [textSizePct, setTextSizePct] = React.useState(6);
  const [textColor, setTextColor] = React.useState('#ffffff');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generate = async () => {
    if (selected.length < 2) return;
    setBusy(true);
    setStatus(null);
    try {
      const images = selected.map((id) => {
        const bitmap = getCachedBitmap(id);
        if (!bitmap) throw new Error('One of the selected images is no longer available.');
        return { bitmap };
      });
      const blob = await encodeCollage(images, {
        ...options,
        ...(textEnabled && textContent.trim()
          ? {
              text: {
                content: textContent,
                anchor: textAnchor,
                sizePct: textSizePct,
                color: textColor,
              },
            }
          : {}),
      });
      downloadBlob(blob, 'collage.jpg');
      setStatus(t('collage.done'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('collage.title')}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('collage.intro')}</p>
      </div>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {t('collage.pickImages')}
          <HelpMark text={t('collage.pickImagesHelp')} />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {items.map((item) => {
            const isSelected = selected.includes(item.id);
            const order = selected.indexOf(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  toggle(item.id);
                }}
                className={`relative aspect-square overflow-hidden rounded border-2 ${
                  isSelected ? 'border-primary' : 'border-transparent'
                }`}
              >
                {item.thumbUrl ? (
                  <img
                    src={item.thumbUrl}
                    alt={item.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {isSelected ? (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {order + 1}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {items.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">{t('collage.noImages')}</div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('collage.gap')}</span>
            <span>{options.gap}px</span>
          </div>
          <Slider
            min={0}
            max={40}
            step={1}
            value={[options.gap]}
            onValueChange={(v) => {
              const n = v[0];
              if (n !== undefined) setOptions((o) => ({ ...o, gap: n }));
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={textEnabled}
            onChange={(e) => {
              setTextEnabled(e.target.checked);
            }}
          />
          <Type className="size-3.5" />
          {t('collage.addText')}
        </label>

        {textEnabled ? (
          <div className="flex flex-col gap-2 pl-1">
            <Input
              value={textContent}
              onChange={(e) => {
                setTextContent(e.target.value);
              }}
              placeholder={t('collage.textPlaceholder')}
              className="h-8"
            />
            <div className="grid grid-cols-3 gap-1">
              {ANCHORS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setTextAnchor(a);
                  }}
                  className={`h-6 rounded border text-[10px] ${
                    textAnchor === a ? 'border-primary bg-accent' : 'border-input'
                  }`}
                >
                  •
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t('collage.textSize')}</span>
              <Slider
                min={2}
                max={16}
                step={0.5}
                value={[textSizePct]}
                onValueChange={(v) => {
                  const n = v[0];
                  if (n !== undefined) setTextSizePct(n);
                }}
                className="flex-1"
              />
              <input
                type="color"
                value={textColor}
                onChange={(e) => {
                  setTextColor(e.target.value);
                }}
                className="h-6 w-6 shrink-0 rounded border"
              />
            </div>
          </div>
        ) : null}
      </section>

      <Button
        size="sm"
        disabled={selected.length < 2 || busy}
        onClick={() => {
          void generate();
        }}
        className="justify-start"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        {t('collage.generate')}
      </Button>
      {status ? <div className="text-[11px] text-muted-foreground">{status}</div> : null}
      {selected.length > 0 && selected.length < 2 ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <X className="size-3" />
          {t('collage.needTwo')}
        </div>
      ) : null}
    </div>
  );
}

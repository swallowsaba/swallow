import * as React from 'react';
import { Download, GripVertical, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { HelpMark } from '@/components/ui/help-mark';
import { useLibraryStore, getCachedBitmap } from '@/features/library';
import { downloadBlob } from '@/features/export/model/export';
import { useT } from '@/i18n';
import { encodeGif, DEFAULT_GIF_OPTIONS, type GifOptions } from '../model/gif-encode';

/** Pick 2+ ready images from the library, in order, then encode a GIF. */
export function GifPanel(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items.filter((it) => it.status === 'ready'));
  const t = useT();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [options, setOptions] = React.useState<GifOptions>(DEFAULT_GIF_OPTIONS);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) return prev;
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const remove = (id: string) => {
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  const generate = async () => {
    if (selected.length < 2) return;
    setBusy(true);
    setStatus(null);
    try {
      const frames = selected.map((id) => {
        const bitmap = getCachedBitmap(id);
        if (!bitmap) throw new Error('One of the selected images is no longer available.');
        return { bitmap };
      });
      const blob = await encodeGif(frames, options);
      downloadBlob(blob, 'animation.gif');
      setStatus(t('gif.done'));
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
          {t('gif.title')}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('gif.intro')}</p>
      </div>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {t('gif.pickImages')}
          <HelpMark text={t('gif.pickImagesHelp')} />
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
          <div className="text-[11px] text-muted-foreground">{t('gif.noImages')}</div>
        ) : null}
      </section>

      {selected.length > 0 ? (
        <section className="flex flex-col gap-1">
          <div className="text-xs font-medium">{t('gif.order')}</div>
          {selected.map((id, index) => {
            const item = items.find((it) => it.id === id);
            if (!item) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded border px-2 py-1 text-[11px]"
              >
                <GripVertical className="size-3 text-muted-foreground" />
                <span className="w-4 text-center text-muted-foreground">{index + 1}</span>
                <span className="flex-1 truncate">{item.fileName}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={index === selected.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    remove(id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('gif.delay')}</span>
            <span>{options.delayMs} ms</span>
          </div>
          <Slider
            min={100}
            max={2000}
            step={50}
            value={[options.delayMs]}
            onValueChange={(v) => {
              const n = v[0];
              if (n !== undefined) setOptions((o) => ({ ...o, delayMs: n }));
            }}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('gif.size')}</span>
            <span>{options.maxEdge}px</span>
          </div>
          <Slider
            min={200}
            max={800}
            step={20}
            value={[options.maxEdge]}
            onValueChange={(v) => {
              const n = v[0];
              if (n !== undefined) setOptions((o) => ({ ...o, maxEdge: n }));
            }}
          />
        </div>
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
        {t('gif.generate')}
      </Button>
      {status ? <div className="text-[11px] text-muted-foreground">{status}</div> : null}
    </div>
  );
}

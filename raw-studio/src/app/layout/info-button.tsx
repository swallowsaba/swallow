import * as React from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/features/editor';
import { useT } from '@/i18n';

function formatBytes(n: number): string {
  if (n <= 0) return '\u2014';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatShutter(s: number): string {
  if (s >= 1) return `${s.toFixed(1)}s`;
  return `1/${Math.round(1 / s)}s`;
}

interface Row {
  label: string;
  value: string;
}

/** Toolbar button that opens a small popover with the current photo's info. */
export function InfoButton(): React.JSX.Element {
  const image = useEditorStore((s) => s.image);
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  if (!image) return <></>;

  const rows: Row[] = [
    { label: 'File', value: image.fileName },
    { label: 'Dimensions', value: `${String(image.dimensions.width)} \u00d7 ${String(image.dimensions.height)}` },
    { label: 'Format', value: image.kind.toUpperCase() },
    { label: 'Size', value: formatBytes(image.byteSize) },
  ];
  const cam = image.camera;
  if (cam) {
    const cameraName = [cam.make, cam.model].filter(Boolean).join(' ');
    if (cameraName) rows.push({ label: 'Camera', value: cameraName });
    if (cam.focalLength !== undefined) rows.push({ label: 'Focal length', value: `${String(cam.focalLength)}mm` });
    if (cam.aperture !== undefined) rows.push({ label: 'Aperture', value: `f/${cam.aperture}` });
    if (cam.shutter !== undefined) rows.push({ label: 'Shutter', value: formatShutter(cam.shutter) });
    if (cam.iso !== undefined) rows.push({ label: 'ISO', value: String(cam.iso) });
    if (cam.capturedAt !== undefined) {
      rows.push({ label: 'Captured', value: new Date(cam.capturedAt * 1000).toLocaleString() });
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Photo info"
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
            }}
          >
            <Info />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Photo info</TooltipContent>
      </Tooltip>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('info.title')}
          </div>
          <dl className="flex flex-col gap-1">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="truncate text-right font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          {!cam ? (
            <div className="mt-2 text-[10px] text-muted-foreground">
              {t('info.noCameraData')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

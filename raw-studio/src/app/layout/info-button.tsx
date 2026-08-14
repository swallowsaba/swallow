import * as React from 'react';
import { Info, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/features/editor';
import { useT } from '@/i18n';
import { lookupPlace, mapsUrl } from './geocode';

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
  const [place, setPlace] = React.useState<string | null>(null);
  const [placeBusy, setPlaceBusy] = React.useState(false);
  const [placeError, setPlaceError] = React.useState<string | null>(null);
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
    if (cam.lens) rows.push({ label: 'Lens', value: cam.lens });
    if (cam.focalLength !== undefined) rows.push({ label: 'Focal length', value: `${String(cam.focalLength)}mm` });
    if (cam.aperture !== undefined) rows.push({ label: 'Aperture', value: `f/${cam.aperture}` });
    if (cam.shutter !== undefined) rows.push({ label: 'Shutter', value: formatShutter(cam.shutter) });
    if (cam.iso !== undefined) rows.push({ label: 'ISO', value: String(cam.iso) });
    if (cam.capturedAt !== undefined) {
      rows.push({ label: 'Captured', value: new Date(cam.capturedAt * 1000).toLocaleString() });
    }
  }
  const hasGps = cam?.gpsLatitude !== undefined && cam.gpsLongitude !== undefined;

  const runLookup = async () => {
    if (!cam?.gpsLatitude || !cam.gpsLongitude) return;
    setPlaceBusy(true);
    setPlaceError(null);
    try {
      setPlace(await lookupPlace(cam.gpsLatitude, cam.gpsLongitude));
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setPlaceBusy(false);
    }
  };

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
          {hasGps && cam?.gpsLatitude !== undefined && cam.gpsLongitude !== undefined ? (
            <div className="mt-2 flex flex-col gap-1 border-t pt-2">
              <a
                href={mapsUrl(cam.gpsLatitude, cam.gpsLongitude)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <MapPin className="size-3" />
                {t('info.viewOnMap')}
              </a>
              {place ? (
                <div className="text-[11px] font-medium">{place}</div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 justify-start px-0 text-[11px] text-muted-foreground"
                  disabled={placeBusy}
                  onClick={() => {
                    void runLookup();
                  }}
                >
                  {placeBusy ? t('info.lookingUp') : t('info.lookUpPlace')}
                </Button>
              )}
              {placeError ? (
                <div className="text-[10px] text-destructive">{placeError}</div>
              ) : null}
              <div className="text-[10px] text-muted-foreground">{t('info.placeLookupNote')}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Capability {
  label: string;
  supported: boolean;
  note?: string;
}

function detectCapabilities(): Capability[] {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const hasWebGL2 = (() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  })();

  return [
    {
      label: 'Cross-Origin Isolated (WASM threads / SharedArrayBuffer)',
      supported: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
      note: 'Required for multi-threaded RAW decode & AI inference.',
    },
    { label: 'WebAssembly', supported: typeof WebAssembly !== 'undefined' },
    { label: 'Web Workers', supported: typeof Worker !== 'undefined' },
    { label: 'WebGPU', supported: hasWebGPU, note: 'Primary GPU path when available.' },
    { label: 'WebGL2', supported: hasWebGL2, note: 'Fallback GPU path.' },
    {
      label: 'File System Access API',
      supported: typeof window !== 'undefined' && 'showOpenFilePicker' in window,
      note: 'Enables folder open; Chromium only.',
    },
    { label: 'IndexedDB', supported: typeof indexedDB !== 'undefined' },
    {
      label: 'OffscreenCanvas',
      supported: typeof OffscreenCanvas !== 'undefined',
      note: 'Enables rendering inside workers.',
    },
  ];
}

export default function App(): React.JSX.Element {
  const [caps, setCaps] = useState<Capability[]>([]);

  useEffect(() => {
    setCaps(detectCapabilities());
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">RAW Studio</span>
        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Phase 1 · scaffold
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-6">
        <div>
          <h1 className="text-lg font-semibold">Environment capabilities</h1>
          <p className="text-sm text-muted-foreground">
            The scaffold is running. These checks confirm the browser can support the image and AI
            pipeline we build in later phases.
          </p>
        </div>

        <ul className="divide-y rounded-lg border">
          {caps.map((cap) => (
            <li key={cap.label} className="flex items-start gap-3 p-3">
              <span
                className={cn(
                  'mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full',
                  cap.supported ? 'bg-emerald-500' : 'bg-red-500',
                )}
                aria-hidden
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{cap.label}</span>
                {cap.note ? (
                  <span className="text-xs text-muted-foreground">{cap.note}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  'ml-auto text-xs font-medium',
                  cap.supported ? 'text-emerald-500' : 'text-red-500',
                )}
              >
                {cap.supported ? 'OK' : 'N/A'}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

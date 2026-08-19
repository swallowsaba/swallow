import * as React from 'react';
import { ImagePlus } from 'lucide-react';
import { importFiles } from '../model/import';

const ACCEPT = 'image/*,.cr2,.cr3,.arw,.nef,.raf,.rw2,.orf,.pef,.dng';

/**
 * Adds one or more images to the shared library (used by collage / GIF, which
 * need several images). Available from inside the editor, so users aren't
 * limited to the images they dropped on the initial empty state.
 */
export function AddImagesButton({ label }: { label: string }): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          inputRef.current?.click();
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <ImagePlus className="size-3.5" />
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void importFiles(files);
          e.target.value = '';
        }}
      />
    </>
  );
}

import * as React from 'react';
import { ImagePlus } from 'lucide-react';
import { importFiles } from '@/features/library';

/**
 * Full-stage drop target and file picker shown when nothing is loaded. Decoding
 * (RAW and native) runs off the main thread via the library import pipeline.
 */
export function DropZone(): React.JSX.Element {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length > 0) void importFiles(files);
  };

  return (
    <div
      className="grid h-full place-items-center bg-black/30 p-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-10 py-12 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <ImagePlus className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">Drop photos here, or click to choose</div>
        <div className="text-xs text-muted-foreground">
          JPEG · PNG · WebP · AVIF · RAW (CR2/CR3/ARW/NEF/RAF/RW2/ORF/PEF/DNG)
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.cr2,.cr3,.arw,.nef,.raf,.rw2,.orf,.pef,.dng"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

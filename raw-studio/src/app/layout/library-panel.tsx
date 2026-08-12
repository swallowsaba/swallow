import * as React from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LibraryGrid, importFiles, useLibraryStore } from '@/features/library';

export function LibraryPanel(): React.JSX.Element {
  const count = useLibraryStore((s) => s.items.length);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void importFiles(files);
  };

  return (
    <div className="flex h-full flex-col" onDragOver={(e) => { e.preventDefault(); }} onDrop={onDrop}>
      <div className="flex items-center gap-2 px-3 py-2">
        <FolderOpen className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Library
        </span>
        <span className="text-[10px] text-muted-foreground">{count}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          aria-label="Add photos"
          onClick={() => inputRef.current?.click()}
        >
          <Plus />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {count === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Drop photos here or use +. JPEG/PNG/WebP/AVIF and RAW (CR2/CR3/ARW/NEF/RAF/RW2/ORF/PEF/DNG).
          </div>
        ) : (
          <LibraryGrid />
        )}
      </ScrollArea>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.cr2,.cr3,.arw,.nef,.raf,.rw2,.orf,.pef,.dng"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void importFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

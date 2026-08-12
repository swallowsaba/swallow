import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';
import { computeImageStats } from '../model/image-stats';
import { runAuto, type AutoKind } from '../model/auto-adjust';

const ACTIONS: readonly { kind: AutoKind; label: string }[] = [
  { kind: 'all', label: 'Auto' },
  { kind: 'tone', label: 'Tone' },
  { kind: 'wb', label: 'WB' },
  { kind: 'color', label: 'Color' },
];

export function AutoBar(): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);

  const apply = (kind: AutoKind, label: string) => {
    if (!bitmap) return;
    const stats = computeImageStats(bitmap);
    commitAdjustments(runAuto(kind, stats), `Auto ${label}`);
  };

  return (
    <div className="flex items-center gap-1 border-b px-3 py-2">
      <Sparkles className="mr-1 size-3.5 text-muted-foreground" />
      {ACTIONS.map((a) => (
        <Button
          key={a.kind}
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={!bitmap}
          onClick={() => {
            apply(a.kind, a.label);
          }}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

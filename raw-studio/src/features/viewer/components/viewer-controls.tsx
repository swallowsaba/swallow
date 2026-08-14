import * as React from 'react';
import { Crop, Eraser, Eye, Maximize, Minus, Pipette, Plus, RotateCw, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { nextZoom, prevZoom } from '../model/viewport';
import { useViewerStore } from '../model/viewer-store';

interface ControlsProps {
  effectiveScale: number;
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ViewerControls({ effectiveScale }: ControlsProps): React.JSX.Element {
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const setCustomScale = useViewerStore((s) => s.setCustomScale);
  const rotateCw = useViewerStore((s) => s.rotateCw);
  const showBefore = useViewerStore((s) => s.showBefore);
  const setShowBefore = useViewerStore((s) => s.setShowBefore);
  const setCropMode = useViewerStore((s) => s.setCropMode);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const setWbPickMode = useViewerStore((s) => s.setWbPickMode);

  const percent = Math.round(effectiveScale * 100);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/90 px-1.5 py-1 shadow-md backdrop-blur">
      <Toggle
        size="sm"
        pressed={mode === 'fit'}
        onPressedChange={() => {
          setMode('fit');
        }}
        aria-label="Fit"
      >
        <Maximize className="mr-1" /> Fit
      </Toggle>
      <Toggle
        size="sm"
        pressed={mode === 'fill'}
        onPressedChange={() => {
          setMode('fill');
        }}
        aria-label="Fill"
      >
        <Scan className="mr-1" /> Fill
      </Toggle>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <IconBtn
        label="Zoom out"
        onClick={() => {
          setCustomScale(prevZoom(effectiveScale));
        }}
      >
        <Minus />
      </IconBtn>
      <button
        type="button"
        onClick={() => {
          setCustomScale(1);
        }}
        className="w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
        title="Reset to 100%"
      >
        {percent}%
      </button>
      <IconBtn
        label="Zoom in"
        onClick={() => {
          setCustomScale(nextZoom(effectiveScale));
        }}
      >
        <Plus />
      </IconBtn>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <IconBtn label="Rotate 90°" onClick={rotateCw}>
        <RotateCw />
      </IconBtn>
      <IconBtn
        label="Crop"
        onClick={() => {
          setCropMode(true);
        }}
      >
        <Crop />
      </IconBtn>
      <IconBtn
        label="Remove Object (AI)"
        onClick={() => {
          setRemoveMode(true);
        }}
      >
        <Eraser />
      </IconBtn>
      <IconBtn
        label="White Balance Picker"
        onClick={() => {
          setWbPickMode(true);
        }}
      >
        <Pipette />
      </IconBtn>
      <Toggle
        size="sm"
        pressed={showBefore}
        onPressedChange={setShowBefore}
        aria-label="Show before"
        title="Before / After"
      >
        <Eye />
      </Toggle>
    </div>
  );
}

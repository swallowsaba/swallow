import * as React from 'react';
import { Columns2, Moon, PanelBottom, Redo2, Sun, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { selectCanRedo, selectCanUndo, useEditorStore } from '@/features/editor';
import { useUiStore } from '@/stores';
import { ExportButton } from '@/features/export';

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar(): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const toggleFilmstrip = useUiStore((s) => s.toggleFilmstrip);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const image = useEditorStore((s) => s.image);

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
      <span className="px-2 text-sm font-semibold tracking-tight">RAW Studio</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        v1.0
      </span>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <IconButton label="Toggle library (left)" onClick={toggleLeftPanel}>
        <Columns2 />
      </IconButton>
      <IconButton label="Toggle filmstrip (bottom)" onClick={toggleFilmstrip}>
        <PanelBottom />
      </IconButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <IconButton label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo}>
        <Undo2 />
      </IconButton>
      <IconButton label="Redo (Ctrl/Cmd+Shift+Z)" onClick={redo} disabled={!canRedo}>
        <Redo2 />
      </IconButton>

      <div className="mx-2 truncate text-xs text-muted-foreground">
        {image ? image.fileName : 'No image'}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ExportButton />
        <IconButton label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
      </div>
    </header>
  );
}

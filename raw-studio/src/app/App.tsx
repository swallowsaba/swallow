import * as React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useKeyboardShortcuts, useLocale, useTheme } from '@/hooks';
import { initPersistence } from '@/features/persistence';
import { EditorLayout } from './layout';

export default function App(): React.JSX.Element {
  useTheme();
  useLocale();
  useKeyboardShortcuts();

  React.useEffect(() => {
    void initPersistence();
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <EditorLayout />
    </TooltipProvider>
  );
}

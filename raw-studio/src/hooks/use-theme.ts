import { useEffect } from 'react';
import { persistTheme, useUiStore } from '@/stores';

/**
 * Applies the current theme to the document root and persists changes.
 * Mount once near the app root.
 */
export function useTheme(): void {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    persistTheme(theme);
  }, [theme]);
}

import { useEffect } from 'react';
import { persistLocale, useUiStore } from '@/stores';

/** Persists locale changes. Mount once near the app root. */
export function useLocale(): void {
  const locale = useUiStore((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    persistLocale(locale);
  }, [locale]);
}

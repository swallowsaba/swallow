import * as React from 'react';
import { useUiStore } from '@/stores';
import { translate, type TranslationKey } from './translations';

/** Returns t(key), a lookup function bound to the current locale. Re-renders
 *  automatically when the locale changes. */
export function useT(): (key: TranslationKey) => string {
  const locale = useUiStore((s) => s.locale);
  return React.useCallback((key: TranslationKey) => translate(locale, key), [locale]);
}

export type { TranslationKey } from './translations';

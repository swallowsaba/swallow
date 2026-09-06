import { useCallback } from 'react';
import { useStore } from '@/store';
import { translate, type TKey } from './index';

export type Translate = (
  key: TKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

export function useT(): Translate {
  const locale = useStore((s) => s.settings.locale);
  return useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
}

import { en } from './en';
import { ja, type TKey } from './ja';

export type Locale = 'ja' | 'en';
export type { TKey };

const dictionaries: Record<Locale, Partial<Record<TKey, string>>> = { ja, en };

/** 訳が抜けている鍵。テストで空であることを確かめる */
export function missingKeys(locale: Locale): TKey[] {
  const dictionary = dictionaries[locale];
  return (Object.keys(ja) as TKey[]).filter((key) => dictionary[key] === undefined);
}

/** {name} 形式のプレースホルダを置換する。 */
export function translate(
  locale: Locale,
  key: TKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const template = dictionaries[locale][key] ?? ja[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

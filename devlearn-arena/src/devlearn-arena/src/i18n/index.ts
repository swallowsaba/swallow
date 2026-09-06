import { en } from './en';
import { ja, type TKey } from './ja';

export type Locale = 'ja' | 'en';
export type { TKey };

const dictionaries: Record<Locale, Partial<Record<TKey, string>>> = { ja, en };

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

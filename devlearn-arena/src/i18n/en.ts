import type { TKey } from './ja';

/** 未訳キーは ja にフォールバックする。構造だけ先に用意しておく。 */
export const en: Partial<Record<TKey, string>> = {
  'app.name': 'DevLearn Arena',
  'app.tagline': 'Type a command. Watch the state change.',
  'nav.map': 'World map',
  'nav.sandbox': 'Sandbox',
  'nav.dashboard': 'Progress',
  'nav.settings': 'Settings',
  'common.loading': 'Loading',
};

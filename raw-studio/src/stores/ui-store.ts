import { create } from 'zustand';

/** UI-only preferences, kept separate from image edit state. */

export type ThemeMode = 'dark' | 'light';
export type RightTab =
  | 'presets'
  | 'basic'
  | 'tone'
  | 'color'
  | 'detail'
  | 'lens'
  | 'masks'
  | 'mix'
  | 'ai'
  | 'gif'
  | 'collage';
export type LeftTab = 'library' | 'history';
export type Locale = 'ja' | 'en';
export type UiMode = 'beginner' | 'pro';

const THEME_KEY = 'raw-studio:theme';
const LOCALE_KEY = 'raw-studio:locale';

/** Read the initial theme from storage, falling back to the OS preference. */
export function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage may be unavailable (private mode); fall through.
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/** Read the initial locale from storage, falling back to the browser's
 *  language (Japanese if it starts with "ja", English otherwise). */
export function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === 'ja' || stored === 'en') return stored;
  } catch {
    // localStorage may be unavailable (private mode); fall through.
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

export interface UiState {
  theme: ThemeMode;
  locale: Locale;
  uiMode: UiMode;
  rightTab: RightTab;
  leftTab: LeftTab;
  leftPanelOpen: boolean;
  filmstripOpen: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setUiMode: (mode: UiMode) => void;
  toggleUiMode: () => void;
  setRightTab: (tab: RightTab) => void;
  setLeftTab: (tab: LeftTab) => void;
  toggleLeftPanel: () => void;
  toggleFilmstrip: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: getInitialTheme(),
  locale: getInitialLocale(),
  uiMode: 'pro',
  rightTab: 'basic',
  leftTab: 'library',
  leftPanelOpen: true,
  filmstripOpen: true,

  setTheme: (theme) => {
    set({ theme });
  },
  toggleTheme: () => {
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }));
  },
  setLocale: (locale) => {
    set({ locale });
  },
  toggleLocale: () => {
    set((s) => ({ locale: s.locale === 'ja' ? 'en' : 'ja' }));
  },
  setUiMode: (uiMode) => {
    set({ uiMode });
  },
  toggleUiMode: () => {
    set((s) => ({ uiMode: s.uiMode === 'pro' ? 'beginner' : 'pro' }));
  },
  setRightTab: (rightTab) => {
    set({ rightTab });
  },
  setLeftTab: (leftTab) => {
    set({ leftTab });
  },
  toggleLeftPanel: () => {
    set((s) => ({ leftPanelOpen: !s.leftPanelOpen }));
  },
  toggleFilmstrip: () => {
    set((s) => ({ filmstripOpen: !s.filmstripOpen }));
  },
}));

/** Persist the theme choice. Safe to call when storage is unavailable. */
export function persistTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

/** Persist the locale choice. Safe to call when storage is unavailable. */
export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore
  }
}

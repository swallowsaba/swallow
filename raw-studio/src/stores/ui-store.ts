import { create } from 'zustand';

/** UI-only preferences, kept separate from image edit state. */

export type ThemeMode = 'dark' | 'light';
export type RightTab = 'presets' | 'basic' | 'tone' | 'color' | 'detail' | 'lens' | 'ai';
export type LeftTab = 'library' | 'history';

const THEME_KEY = 'raw-studio:theme';

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

export interface UiState {
  theme: ThemeMode;
  rightTab: RightTab;
  leftTab: LeftTab;
  leftPanelOpen: boolean;
  filmstripOpen: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setRightTab: (tab: RightTab) => void;
  setLeftTab: (tab: LeftTab) => void;
  toggleLeftPanel: () => void;
  toggleFilmstrip: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: getInitialTheme(),
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

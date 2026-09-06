import type { StateCreator } from 'zustand';
import { defaultSettings } from '@/lib/storage/schema';
import type { AppState, SettingsSlice } from './types';

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  settings: { ...defaultSettings },
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
});

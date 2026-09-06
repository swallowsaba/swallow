import { create } from 'zustand';
import { createProgressSlice } from './progressSlice';
import { createSettingsSlice } from './settingsSlice';
import type { AppState } from './types';

export const useStore = create<AppState>()((...a) => ({
  ...createProgressSlice(...a),
  ...createSettingsSlice(...a),
}));

export type { AppState } from './types';

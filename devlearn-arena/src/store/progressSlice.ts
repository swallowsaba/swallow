import type { StateCreator } from 'zustand';
import { dayKey, nextStreak } from '@/lib/date';
import { createEmptySave, emptyLessonProgress } from '@/lib/storage/schema';
import type { AppState, ProgressSlice } from './types';

export const createProgressSlice: StateCreator<AppState, [], [], ProgressSlice> = (set) => ({
  hydrated: false,
  createdAt: 0,
  profile: { xp: 0, streakDays: 0, lastActiveDay: null },
  lessons: {},
  reviewQueue: [],

  hydrate: (data) =>
    set({
      hydrated: true,
      createdAt: data.createdAt,
      profile: data.profile,
      lessons: data.lessons,
      reviewQueue: data.reviewQueue,
      settings: data.settings,
    }),

  attemptLesson: (lessonId) =>
    set((state) => {
      const current = state.lessons[lessonId] ?? emptyLessonProgress();
      return {
        lessons: { ...state.lessons, [lessonId]: { ...current, attempts: current.attempts + 1 } },
      };
    }),

  useHint: (lessonId) =>
    set((state) => {
      const current = state.lessons[lessonId] ?? emptyLessonProgress();
      return {
        lessons: { ...state.lessons, [lessonId]: { ...current, hintsUsed: current.hintsUsed + 1 } },
      };
    }),

  clearLesson: ({ lessonId, score, xp, now }) =>
    set((state) => {
      const current = state.lessons[lessonId] ?? emptyLessonProgress();
      const best = current.bestScore === null ? score : Math.max(current.bestScore, score);
      const today = dayKey(now);
      // XP は初回クリアのみ加算する（周回で稼げないようにする）
      const gained = current.cleared ? 0 : xp;
      return {
        lessons: {
          ...state.lessons,
          [lessonId]: { ...current, cleared: true, bestScore: best, clearedAt: now },
        },
        profile: {
          xp: state.profile.xp + gained,
          streakDays: nextStreak(state.profile.streakDays, state.profile.lastActiveDay, today),
          lastActiveDay: today,
        },
      };
    }),

  resetProgress: (now) => {
    const empty = createEmptySave(now);
    set({
      hydrated: true,
      createdAt: empty.createdAt,
      profile: empty.profile,
      lessons: empty.lessons,
      reviewQueue: empty.reviewQueue,
    });
  },
});

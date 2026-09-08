import type { StateCreator } from 'zustand';
import { dayKey, nextStreak } from '@/lib/date';
import { createItem, schedule, upsert } from '@/lib/review';
import { createEmptySave, emptyLessonProgress } from '@/lib/storage/schema';
import type { Profile } from '@/lib/storage/schema';
import type { AppState, ProgressSlice } from './types';

/** 取り組んだ日を1日ぶん記録する。連続日数と履歴はここでだけ動かす */
const ACTIVE_DAYS_KEPT = 90;

function touchDay(profile: Profile, today: string, xp: number): Profile {
  return {
    ...profile,
    xp: profile.xp + xp,
    streakDays: nextStreak(profile.streakDays, profile.lastActiveDay, today),
    lastActiveDay: today,
    activeDays: [...new Set([...profile.activeDays, today])].sort().slice(-ACTIVE_DAYS_KEPT),
  };
}

export const createProgressSlice: StateCreator<AppState, [], [], ProgressSlice> = (set) => ({
  hydrated: false,
  createdAt: 0,
  profile: { xp: 0, streakDays: 0, lastActiveDay: null, activeDays: [], onboarded: false },
  lessons: {},
  reviewQueue: [],
  missionProgress: {},
  missionState: {},
  lastMissionId: null,

  hydrate: (data) =>
    set({
      hydrated: true,
      createdAt: data.createdAt,
      profile: data.profile,
      lessons: data.lessons,
      reviewQueue: data.reviewQueue,
      settings: data.settings,
      missionProgress: data.missionProgress,
      missionState: data.missionState,
      lastMissionId: data.lastMissionId,
    }),

  saveMission: (id, progress, state) =>
    set((s) => ({
      missionProgress: { ...s.missionProgress, [id]: progress },
      missionState: { ...s.missionState, [id]: state },
    })),

  setLastMission: (id) => set({ lastMissionId: id }),

  scheduleReview: (lessonId, today) =>
    set((s) => ({ reviewQueue: upsert(s.reviewQueue, createItem(lessonId, today)) })),

  gradeReview: (lessonId, grade, today) =>
    set((s) => {
      const item = s.reviewQueue.find((q) => q.lessonId === lessonId);
      if (!item) return {};
      return { reviewQueue: upsert(s.reviewQueue, schedule(item, grade, today)) };
    }),

  resetMission: (id) =>
    set((s) => {
      const progress = { ...s.missionProgress };
      const state = { ...s.missionState };
      delete progress[id];
      delete state[id];
      return { missionProgress: progress, missionState: state };
    }),

  attemptLesson: (lessonId) =>
    set((state) => {
      const current = state.lessons[lessonId] ?? emptyLessonProgress();
      return {
        lessons: { ...state.lessons, [lessonId]: { ...current, attempts: current.attempts + 1 } },
      };
    }),

  grantXp: (amount, now) =>
    set((state) => ({
      profile: touchDay(state.profile, dayKey(now), Math.max(0, Math.round(amount))),
    })),

  completeOnboarding: () =>
    set((state) => ({ profile: { ...state.profile, onboarded: true } })),

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
        profile: touchDay(state.profile, today, gained),
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
      missionProgress: {},
      missionState: {},
      lastMissionId: null,
    });
  },
});

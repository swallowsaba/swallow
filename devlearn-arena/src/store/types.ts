import type {
  LessonProgress, MissionProgress, Profile, ReviewItem, SaveData, Settings, ShellSnapshot,
} from '@/lib/storage/schema';

export interface ProgressSlice {
  hydrated: boolean;
  createdAt: number;
  profile: Profile;
  lessons: Record<string, LessonProgress>;
  reviewQueue: ReviewItem[];
  hydrate: (data: SaveData) => void;
  attemptLesson: (lessonId: string) => void;
  grantXp: (amount: number, now: number) => void;
  missionProgress: Record<string, MissionProgress>;
  missionState: Record<string, ShellSnapshot>;
  lastMissionId: string | null;
  saveMission: (id: string, progress: MissionProgress, state: ShellSnapshot) => void;
  setLastMission: (id: string) => void;
  resetMission: (id: string) => void;
  scheduleReview: (lessonId: string, today: string) => void;
  gradeReview: (lessonId: string, grade: 'again' | 'hard' | 'good' | 'easy', today: string) => void;
  useHint: (lessonId: string) => void;
  clearLesson: (input: { lessonId: string; score: number; xp: number; now: number }) => void;
  resetProgress: (now: number) => void;
}

export interface SettingsSlice {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

export type AppState = ProgressSlice & SettingsSlice;

export function toSaveData(state: AppState, now: number): SaveData {
  return {
    version: 1,
    createdAt: state.createdAt,
    updatedAt: now,
    profile: state.profile,
    lessons: state.lessons,
    reviewQueue: state.reviewQueue,
    settings: state.settings,
    missionProgress: state.missionProgress,
    missionState: state.missionState,
    lastMissionId: state.lastMissionId,
  };
}

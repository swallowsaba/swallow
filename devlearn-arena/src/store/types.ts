import type {
  LessonProgress, PlacementData, TownGrowthData, MissionProgress, Profile, ReviewItem, SaveData, Settings, ShellSnapshot,
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
  completeOnboarding: () => void;
  missionProgress: Record<string, MissionProgress>;
  missionState: Record<string, ShellSnapshot>;
  lastMissionId: string | null;
  /** 「学ぶ」画面を読み終えた任務 */
  introsRead: string[];
  markIntroRead: (id: string) => void;
  /** 学んで建てた街の施設 */
  facilitiesBuilt: string[];
  buildFacility: (id: string) => void;
  /** カテゴリごとの街の育ち */
  growth: Record<string, TownGrowthData>;
  /** 理解度の正解で家が 1 軒増え、コマンドの手順で階が 1 つ積み上がる */
  grow: (track: string, kind: 'houses' | 'floors', n?: number) => void;
  /** カテゴリごとに、学習者が建設メニューから置いた建物 */
  designs: Record<string, PlacementData[]>;
  /** 区画に建物を置く。建築権を 1 つ使う */
  place: (track: string, placement: PlacementData) => void;
  saveMission: (id: string, progress: MissionProgress, state: ShellSnapshot) => void;
  setLastMission: (id: string) => void;
  resetMission: (id: string) => void;
  /** カテゴリの街を最初から：施設・任務の進み・シェルの状態・要望を聞いた記録を消す（XP は残す） */
  resetCity: (missionIds: readonly string[], facilityIds: readonly string[]) => void;
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
    introsRead: state.introsRead,
    facilitiesBuilt: state.facilitiesBuilt,
    growth: state.growth,
    designs: state.designs,
  };
}

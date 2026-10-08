import { create } from 'zustand';

/** 保存の問題（読み込み・自動保存）。null なら問題なし。画面の下に 1 行で出す（src/screens/SaveNotice.tsx） */
export const useSaveStatus = create<{ message: string | null; set: (message: string | null) => void }>((set) => ({
  message: null,
  set: (message) => set({ message }),
}));

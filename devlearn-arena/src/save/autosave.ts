import type { Progress } from '@/game/types';
import { createSession, type Session } from '@/screens/session';
import { readFailureText, readSave } from './migrations';
import { fromSaveData, newPlayer, toSaveData, type PlayerMeta } from './saveData';
import { DEFAULT_SETTINGS, type SaveData, type Settings } from './schema';

/**
 * 起動時の読み込みと自動保存（docs/architecture.md 5 章・docs/data-model.md 7 章）。
 * 自動保存のきっかけは、操作の 2 秒後と、レッスンの段が進むたび。
 * 保存先は差し替えられる（ブラウザでは src/save/idb.ts の IndexedDB）。
 */

export interface SaveBackend {
  /** 保存データを読む。何も無ければ null か undefined */
  read: () => Promise<unknown>;
  write: (data: SaveData) => Promise<void>;
  /** 読めなかった保存データの写しを、別の名前で残す */
  keep: (key: string, raw: unknown) => Promise<void>;
}

export interface Opened {
  session: Session;
  player: PlayerMeta;
  settings: Settings;
  /** 読み込みで起きた問題（画面に 1 行で出す） */
  problem?: string;
  /** false なら保存しない（読めなかった保存データの写しを残せず、上書きすると失うため） */
  canSave: boolean;
}

export interface OpenOptions {
  /** 今の時刻（端末の地方時の ISO 文字列） */
  now: () => string;
  /** 新しい市長の ID */
  newId: () => string;
}

const reasonOf = (e: unknown): string => (e instanceof Error ? e.name !== 'Error' ? e.name : e.message : String(e));

/** 保存先から、遊んでいる状態を開く。読めなくても投げず、新しい都市で始めて、何が起きたかを problem に書く */
export async function openSession(backend: SaveBackend, options: OpenOptions): Promise<Opened> {
  const fresh = (problem?: string, canSave = true): Opened => ({
    session: createSession(),
    player: newPlayer(options.newId(), options.now()),
    settings: DEFAULT_SETTINGS,
    canSave,
    ...(problem === undefined ? {} : { problem }),
  });
  let raw: unknown;
  try {
    raw = await backend.read();
  } catch (e) {
    return fresh(`保存先を開けなかった（${reasonOf(e)}）。新しい都市で始めた。この回の記録は保存できないかもしれない。`);
  }
  const read = readSave(raw);
  if (read.ok) {
    const parts = fromSaveData(read.data);
    return { session: createSession(undefined, parts), player: parts.player, settings: parts.settings, canSave: true };
  }
  if (read.reason === 'empty') return fresh();
  const what = readFailureText(read.reason).what.replace(/。$/, '');
  const key = `broken-${options.now()}`;
  try {
    await backend.keep(key, raw);
  } catch {
    return fresh(`保存データを読めなかった（${what}）。上書きしないよう、この回は保存を止めている。`, false);
  }
  return fresh(`保存データを読めなかった（${what}）。写しを ${key} に残し、新しい都市で始めた。`);
}

/** レッスンを始めた・段が進んだ・修了した */
function stageMoved(prev: Progress, next: Progress): boolean {
  if (prev.lessons === next.lessons) return false;
  for (const [id, lp] of Object.entries(next.lessons)) {
    const before = prev.lessons[id];
    if (before?.stage !== lp.stage || before.status !== lp.status) return true;
  }
  return false;
}

export interface AutosaveOptions {
  now: () => string;
  /** 操作から保存までの間（既定 2 秒） */
  delayMs?: number;
  /** 保存に失敗したら 1 行の知らせ、直ったら null */
  onStatus?: (message: string | null) => void;
}

export interface Autosave {
  /** 待っている保存があれば、今すぐ書く */
  flush: () => Promise<void>;
  stop: () => void;
  /** 今の状態の保存データ（書き出しに使う） */
  snapshot: () => SaveData;
  /**
   * 保存データを丸ごと置き換える（読み込み・最初からやり直す）。書けたら見張りを止め、以後この状態では保存しない
   * （呼ぶ側が保存先から開き直す）。書けなければ投げ、今の状態の自動保存を続ける
   */
  replace: (data: SaveData) => Promise<void>;
}

const snapshotOf = ({ session, player, settings }: Opened, at: string): SaveData => {
  const p = session.progress.getState();
  return toSaveData({ player, settings, city: session.city.getState().city, progress: p.progress, practiceSessions: p.practiceSessions }, at, at.slice(0, 10));
};

/** 遊んでいる状態の変化を見張り、保存する */
export function startAutosave(opened: Opened, backend: SaveBackend, options: AutosaveOptions): Autosave {
  const { session } = opened;
  const delay = options.delayMs ?? 2000;
  const snapshot = (): SaveData => snapshotOf(opened, options.now());
  // 読めなかった保存データを残せなかった時は自動では書かない。置き換えは、利用者が選んだ時だけ書く
  if (!opened.canSave) return { flush: () => Promise.resolve(), stop: () => undefined, snapshot, replace: (data) => backend.write(data) };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  /** 置き換えを書いている間は、今の状態を書かない */
  let replacing = false;
  let failed = false;
  let writing: Promise<void> = Promise.resolve();

  const save = (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const data = snapshot();
    // 書き込みは順に（前の書き込みより古い物で上書きしない）
    writing = writing.then(() => backend.write(data)).then(
      () => {
        if (failed) {
          failed = false;
          options.onStatus?.(null);
        }
      },
      (e: unknown) => {
        failed = true;
        options.onStatus?.(`保存できなかった（${reasonOf(e)}）。記録はこの画面に残っている。次の操作で、もう一度保存する。`);
      },
    );
    return writing;
  };

  const schedule = (): void => {
    if (stopped || replacing || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, delay);
  };

  const offCity = session.city.subscribe((s, prev) => {
    if (s.city !== prev.city) schedule();
  });
  const offProgress = session.progress.subscribe((s, prev) => {
    if (stopped || replacing) return;
    if (stageMoved(prev.progress, s.progress)) void save();
    else if (s.progress !== prev.progress || s.practiceSessions !== prev.practiceSessions) schedule();
  });

  const stop = (): void => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    offCity();
    offProgress();
  };

  return {
    flush: () => (timer !== null && !replacing ? save() : writing),
    stop,
    snapshot,
    replace: async (data) => {
      replacing = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      // 前の書き込みが終わってから書く（古い状態で後から上書きしない）
      const done = writing.then(() => backend.write(data));
      writing = done.then(() => undefined, () => undefined);
      try {
        await done;
      } catch (e) {
        replacing = false;
        throw e;
      }
      stop();
    },
  };
}

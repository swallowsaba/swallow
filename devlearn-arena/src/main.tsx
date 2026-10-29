import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import sqlWasm from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { sqlConfig } from './engines/db/check';
import { cityCssVariables, cssVariables } from './ui/tokens';
import { openSession, startAutosave } from './save/autosave';
import { idbBackend } from './save/idb';
import { freshSave, newCitySave } from './save/manage';
import type { SaveControls } from './screens/settings/SettingsScreen';
import type { SaveData } from './save/schema';
import { nowIso } from './screens/clock';
import { useSaveStatus } from './screens/saveStatus';
import { applySettings } from './screens/settingsContext';
import { attachSounds } from './screens/sound';
import { sfx } from './lib/sfx';
import { finishBoot } from './ui/boot';
import { registerOffline } from './offline/register';
import './ui/fonts';
import './ui/global.css';

// 一度開いた後は、回線が無くても続けられるように（build したものだけ。docs/architecture.md 4 章）
if (import.meta.env.PROD) registerOffline(import.meta.env.BASE_URL);

const el = document.getElementById('root');
if (!el) throw new Error('#root が見つかりません');

// tokens を CSS の変数にする（CSS に生の色を書かないため）
for (const [name, value] of Object.entries({ ...cssVariables(), ...cityCssVariables() })) document.documentElement.style.setProperty(name, value);

// ブラウザ内 SQL の実戦の SQLite（WebAssembly）は、同梱したファイルを読む（サブディレクトリ配信でも同じ場所。docs/architecture.md）
sqlConfig.locateFile = () => sqlWasm;

const AFTER_REOPEN = 'devlearn-arena:after-reopen';
/** 開き直した後に、始め方の選択の窓を出す（最初からやり直す・新しい都市で始める。docs/ui-design.md 10.12） */
const CHOOSE_START = 'devlearn-arena:choose-start';
function putAfterReopen(message: string): void {
  try {
    sessionStorage.setItem(AFTER_REOPEN, message);
  } catch {
    // 知らせが出ないだけで、置き換えは済んでいる
  }
}
function takeAfterReopen(): string | null {
  try {
    const message = sessionStorage.getItem(AFTER_REOPEN);
    sessionStorage.removeItem(AFTER_REOPEN);
    return message;
  } catch {
    return null;
  }
}
function putChooseStart(): void {
  try {
    sessionStorage.setItem(CHOOSE_START, '1');
  } catch {
    // 窓が出ないだけで、新しい都市は「ふつう」で始まる
  }
}
function takeChooseStart(): boolean {
  try {
    const on = sessionStorage.getItem(CHOOSE_START) === '1';
    sessionStorage.removeItem(CHOOSE_START);
    return on;
  } catch {
    return false;
  }
}

// 保存データを読んでから描く（リロード・ブラウザの再起動の後も元に戻る。docs/data-model.md 7 章）。
// 自動保存は操作の 2 秒後とレッスンの段が進むたび。ページを離れる時も書きかけを書き切る
const backend = idbBackend();
void openSession(backend, { now: nowIso, newId: () => crypto.randomUUID() }).then((opened) => {
  if (opened.problem) useSaveStatus.getState().set(opened.problem);
  // 文字の大きさ・動き・表示品質を、描く前にページの根へ写す（変えたら、その場で写し直す）
  const settings = opened.session.settings;
  applySettings(settings.getState().settings, document.documentElement);
  settings.subscribe((s) => applySettings(s.settings, document.documentElement));
  // 効果音（設定で音を入れた時だけ。既定は消音）
  attachSounds(opened.session, (name) => sfx[name]());
  const saver = startAutosave(opened, backend, { now: nowIso, onStatus: (m) => useSaveStatus.getState().set(m) });
  const flush = (): void => void saver.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // 読み込み・やり直しの後に開き直した時は、何をしたかを都市画面で知らせる
  const after = takeAfterReopen();
  if (after) opened.session.city.getState().notify(after, performance.now());
  // 新しく始めた都市（初回・最初からやり直す・新しい都市で始める）は、始め方を選んでから遊ぶ
  if (takeChooseStart() || opened.isNew) opened.session.city.getState().openStart();
  // 最初からやり直す・新しい都市で始める時に作った保存データ（開き直した後に始め方を選ぶ）
  const starts = new WeakSet<SaveData>();
  const started = (data: SaveData): SaveData => {
    starts.add(data);
    return data;
  };
  // 書き出し・読み込み・やり直し（設定）。置き換えたら保存先から開き直し、都市画面から始める
  const saves: SaveControls = {
    snapshot: saver.snapshot,
    fresh: () => started(freshSave({ id: crypto.randomUUID(), now: nowIso(), settings: opened.session.settings.getState().settings })),
    newCity: () => started(newCitySave(saver.snapshot(), nowIso())),
    replace: async (data, message) => {
      await saver.replace(data);
      putAfterReopen(message);
      if (starts.has(data)) putChooseStart();
      window.history.replaceState(null, '', '#/city');
      window.location.reload();
    },
    download: ({ name, text }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
  createRoot(el).render(
    <StrictMode>
      <App session={opened.session} saves={saves} />
    </StrictMode>,
  );
  // 読み込み中の演出は都市が描けたら消える。描けないまま長く掛かっても、画面を覆い続けない
  window.setTimeout(() => finishBoot(), 10_000);
});

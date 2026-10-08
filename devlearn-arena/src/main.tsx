import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import sqlWasm from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { sqlConfig } from './engines/db/check';
import { cityCssVariables, cssVariables } from './ui/tokens';
import { openSession, startAutosave } from './save/autosave';
import { idbBackend } from './save/idb';
import { freshSave } from './save/manage';
import type { SaveControls } from './screens/settings/SettingsScreen';
import { nowIso } from './screens/clock';
import { useSaveStatus } from './screens/saveStatus';
import './ui/fonts';
import './ui/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root が見つかりません');

// tokens を CSS の変数にする（CSS に生の色を書かないため）
for (const [name, value] of Object.entries({ ...cssVariables(), ...cityCssVariables() })) document.documentElement.style.setProperty(name, value);

// ブラウザ内 SQL の実戦の SQLite（WebAssembly）は、同梱したファイルを読む（サブディレクトリ配信でも同じ場所。docs/architecture.md）
sqlConfig.locateFile = () => sqlWasm;

const AFTER_REOPEN = 'devlearn-arena:after-reopen';
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

// 保存データを読んでから描く（リロード・ブラウザの再起動の後も元に戻る。docs/data-model.md 7 章）。
// 自動保存は操作の 2 秒後とレッスンの段が進むたび。ページを離れる時も書きかけを書き切る
const backend = idbBackend();
void openSession(backend, { now: nowIso, newId: () => crypto.randomUUID() }).then((opened) => {
  if (opened.problem) useSaveStatus.getState().set(opened.problem);
  const saver = startAutosave(opened, backend, { now: nowIso, onStatus: (m) => useSaveStatus.getState().set(m) });
  const flush = (): void => void saver.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // 読み込み・やり直しの後に開き直した時は、何をしたかを都市画面で知らせる
  const after = takeAfterReopen();
  if (after) opened.session.city.getState().notify(after, performance.now());
  // 書き出し・読み込み・やり直し（設定）。置き換えたら保存先から開き直し、都市画面から始める
  const saves: SaveControls = {
    snapshot: saver.snapshot,
    fresh: () => freshSave({ id: crypto.randomUUID(), now: nowIso(), settings: opened.settings }),
    replace: async (data, message) => {
      await saver.replace(data);
      putAfterReopen(message);
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
});

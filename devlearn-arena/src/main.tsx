import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import sqlWasm from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { sqlConfig } from './engines/db/check';
import { cityCssVariables, cssVariables } from './ui/tokens';
import { openSession, startAutosave } from './save/autosave';
import { idbBackend } from './save/idb';
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
  createRoot(el).render(
    <StrictMode>
      <App session={opened.session} />
    </StrictMode>,
  );
});

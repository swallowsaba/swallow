import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import sqlWasm from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { sqlConfig } from './engines/db/check';
import { cityCssVariables, cssVariables } from './ui/tokens';
import './ui/fonts';
import './ui/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root が見つかりません');

// tokens を CSS の変数にする（CSS に生の色を書かないため）
for (const [name, value] of Object.entries({ ...cssVariables(), ...cityCssVariables() })) document.documentElement.style.setProperty(name, value);

// ブラウザ内 SQL の実戦の SQLite（WebAssembly）は、同梱したファイルを読む（サブディレクトリ配信でも同じ場所。docs/architecture.md）
sqlConfig.locateFile = () => sqlWasm;

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

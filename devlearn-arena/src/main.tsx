import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyFallbackRedirect } from './lib/spaFallback';
import { hydrateStore } from './store/persistence';
import './styles/index.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root が見つかりません');

// ルートの 404.html から振り替えられて来た場合、ルータが読む前に URL を戻す
applyFallbackRedirect();
// 保存データの読み込みは描画前に同期で終わらせる（初回フレームのちらつき防止）
hydrateStore();

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { cityCssVariables, cssVariables } from './ui/tokens';
import './ui/fonts';
import './ui/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root が見つかりません');

// tokens を CSS の変数にする（CSS に生の色を書かないため）
for (const [name, value] of Object.entries({ ...cssVariables(), ...cityCssVariables() })) document.documentElement.style.setProperty(name, value);

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

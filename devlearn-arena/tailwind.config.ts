import type { Config } from 'tailwindcss';

// 色は CSS 変数を単一の情報源にする（テーマ切替・トラックアクセントのため）。
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: 'var(--c-void)',
        panel: 'var(--c-panel)',
        raised: 'var(--c-raised)',
        line: 'var(--c-line)',
        ink: 'var(--c-text)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        ok: 'var(--c-ok)',
        warn: 'var(--c-warn)',
        bad: 'var(--c-bad)',
      },
      fontFamily: {
        mono: ['var(--f-mono)'],
        sans: ['var(--f-sans)'],
      },
      borderRadius: { xs: '3px' },
      boxShadow: { glow: '0 0 0 1px var(--c-accent), 0 0 24px -6px var(--c-accent)' },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from 'tailwindcss';

// 色は CSS 変数を単一の情報源にする（テーマ切替・トラックアクセントのため）。
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wood: 'var(--wood)',
        'wood-dark': 'var(--wood-dark)',
        'wood-light': 'var(--wood-light)',
        cream: 'var(--cream)',
        'cream-dark': 'var(--cream-dark)',
        gold: 'var(--gold)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        sky: 'var(--sky)',
        grass: 'var(--grass)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
      },
      fontFamily: {
        mono: ['var(--f-mono)'],
        sans: ['var(--f-sans)'],
      },
      borderRadius: { xs: '3px' },

    },
  },
  plugins: [],
};
export default config;

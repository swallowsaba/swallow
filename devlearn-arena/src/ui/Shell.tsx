import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useT } from '@/i18n/useT';
import { xpProgress } from '@/lib/xp';
import { useStore } from '@/store';
import { ProgressBar } from './components/ProgressBar';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  `px-3 py-2 text-base font-medium transition-colors ${
    isActive
      ? 'text-ink shadow-[inset_0_-3px_0_0_var(--c-accent)]'
      : 'text-muted hover:text-ink'
  }`;

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const xp = useStore((s) => s.profile.xp);
  const progress = xpProgress(xp);

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-raised focus:px-4 focus:py-3"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-void/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          <NavLink to="/" className="display text-xl text-ink">
            DEVLEARN
            <span className="text-accent"> ARENA</span>
          </NavLink>

          <nav className="flex items-center gap-1" aria-label={t('app.name')}>
            <NavLink to="/" end className={navClass}>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/map" className={navClass}>
              {t('nav.map')}
            </NavLink>
            <NavLink to="/sandbox" className={navClass}>
              {t('nav.sandbox')}
            </NavLink>
            <NavLink to="/dashboard" className={navClass}>
              {t('nav.dashboard')}
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              {t('nav.settings')}
            </NavLink>
          </nav>

          <div className="ml-auto flex min-w-[220px] items-center gap-3">
            <span className="display text-lg text-accent">{progress.rank}</span>
            <div className="flex-1">
              <ProgressBar
                ratio={progress.ratio}
                size="sm"
                label={t('dash.rank')}
                valueText={t('dash.xp', { a: progress.intoLevel, b: progress.levelSpan })}
              />
            </div>
            <span className="font-mono text-sm text-muted">Lv.{progress.level}</span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-10">
        {children}
      </main>

      <footer className="border-t border-line px-6 py-5">
        <p className="mx-auto max-w-[1400px] font-mono text-sm text-muted">{t('app.tagline')}</p>
      </footer>
    </div>
  );
}

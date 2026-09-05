import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useT } from '@/i18n/useT';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-2 py-1 text-sm ${isActive ? 'text-ink shadow-[inset_0_-2px_0_0_var(--c-accent)]' : 'text-muted hover:text-ink'}`;

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-panel focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-void/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <NavLink to="/map" className="font-mono text-sm tracking-tight text-ink">
            {t('app.name')}
            <span aria-hidden className="ml-1 inline-block h-3.5 w-1.5 translate-y-[2px] bg-accent" />
          </NavLink>
          <nav className="flex items-center gap-1" aria-label={t('app.name')}>
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
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-line px-4 py-4">
        <p className="mx-auto max-w-6xl font-mono text-xs text-muted">{t('app.tagline')}</p>
      </footer>
    </div>
  );
}

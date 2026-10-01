import { useEffect, useState } from 'react';

/**
 * 画面の道すじ（docs/architecture.md 4 章）。ハッシュで切り替える（#/city など）。
 * GitHub Pages の直リンクとリロードで 404 にならない。
 */
export type Route = { name: 'city' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  switch (path.split('/')[1] ?? '') {
    default:
      return { name: 'city' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/**
 * オフライン（docs/architecture.md 4 章・docs/product-spec.md 5 章: 一度開いた後は、回線無しで続けられることを目指す）。
 * Service Worker（src/offline/sw.ts）が、どの読み込みをどう扱うかを決める純粋な関数。
 *
 * - ページ（index.html）: 回線を先に試し、つながらなければ保持した物を返す（公開し直した版を、つながった時に取る）
 * - 素材（assets/ の下。名前に中身の指紋が付き、変わらない）: 保持した物を先に返し、無ければ取って保持する
 * - それ以外（外のサイト・GET 以外・Service Worker 自身）: 手を出さない
 * 保持する所は版ごとに分け、新しい版が動き出したら古い版の物を消す。
 */

export type Route = 'page' | 'asset' | 'pass';

export const CACHE_PREFIX = 'devlearn-arena-';

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** 消してよい保持（このゲームの、今の版でない物）。同じオリジンの他のアプリの保持には触らない */
export function staleCaches(names: readonly string[], version: string): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== cacheName(version));
}

/** scope（配信の場所。`https://example.github.io/swallow/devlearn-arena/`）の中の URL か */
function inScope(url: URL, scope: URL): boolean {
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
}

export function routeOf(req: { method: string; mode: string; url: string }, scope: string): Route {
  if (req.method !== 'GET') return 'pass';
  const url = new URL(req.url);
  const base = new URL(scope);
  if (!inScope(url, base)) return 'pass';
  if (req.mode === 'navigate') return 'page';
  const rest = url.pathname.slice(base.pathname.length);
  if (rest.startsWith('assets/') && !rest.endsWith('.map')) return 'asset';
  return 'pass';
}

/** 読み込み済みの物のうち、保持する素材（Service Worker が動き出す前に読んだ物を、後から保持するため） */
export function assetsToKeep(urls: readonly string[], scope: string): string[] {
  const keep = new Set<string>();
  for (const u of urls) {
    try {
      const url = new URL(u, scope);
      url.hash = '';
      if (routeOf({ method: 'GET', mode: 'no-cors', url: url.href }, scope) === 'asset') keep.add(url.href);
    } catch {
      // 読めない URL は保持しない
    }
  }
  return [...keep];
}

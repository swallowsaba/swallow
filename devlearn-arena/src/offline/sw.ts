/**
 * Service Worker（docs/architecture.md 4 章のオフライン）。build で dist/sw.js になる（vite.config.ts）。
 * 何をどう扱うかは src/offline/policy.ts。ここは、それをブラウザの読み込みにつなぐだけ。
 *
 * 型: tsconfig は画面（DOM）の型で見るので、Service Worker の型は使う所だけを書く。
 */
import { assetsToKeep, cacheName, routeOf, staleCaches } from './policy';

declare const __BUILD_ID__: string;

interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface MessageEvt extends ExtendableEvent {
  data: unknown;
}
interface SwScope {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
  addEventListener(type: 'message', fn: (e: MessageEvt) => void): void;
}

const sw = self as unknown as SwScope;
const CACHE = cacheName(__BUILD_ID__);
const scope = (): string => sw.registration.scope;

sw.addEventListener('install', (e) => {
  // ページ（index.html）を先に保持し、待たずに今の版にする
  e.waitUntil(caches.open(CACHE).then((c) => c.add(scope())).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(staleCaches(names, __BUILD_ID__).map((n) => caches.delete(n))))
      .then(() => sw.clients.claim()),
  );
});

async function page(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(scope(), res.clone());
    return res;
  } catch {
    // 回線が無い: 保持したページを返す（直リンクのハッシュは、ページの中で読む）
    return (await cache.match(scope(), { ignoreVary: true })) ?? Response.error();
  }
}

async function asset(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  // 配信の Vary（Origin など）で外さない。中身は名前の指紋で決まっている
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

sw.addEventListener('fetch', (e) => {
  const route = routeOf(e.request, scope());
  if (route === 'page') e.respondWith(page(e.request));
  else if (route === 'asset') e.respondWith(asset(e.request));
});

// ページが、Service Worker が動き出す前に読んだ素材を知らせてくる（src/offline/register.ts）
sw.addEventListener('message', (e) => {
  const data = e.data as { type?: string; urls?: unknown } | null;
  if (data?.type !== 'keep' || !Array.isArray(data.urls)) return;
  const urls = assetsToKeep(data.urls.filter((u): u is string => typeof u === 'string'), scope());
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const u of urls) {
      if (await c.match(u, { ignoreVary: true })) continue;
      try {
        await c.add(u);
      } catch {
        // 取れなかった物は、次に読んだ時に保持する
      }
    }
  }));
});

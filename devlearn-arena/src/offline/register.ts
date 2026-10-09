/**
 * Service Worker を登録する（build したものだけ。開発用のサーバでは登録しない）。
 * 初めて開いた時は、Service Worker が動き出す前に本体を読み終えているので、読んだ素材の一覧を渡して保持させる。
 * 登録できないブラウザ・失敗した時は、何もしない（回線があれば今までどおり遊べる）。
 */
export function registerOffline(base: string): void {
  if (!('serviceWorker' in navigator)) return;
  const send = (to: ServiceWorker | null): void => {
    const urls = performance.getEntriesByType('resource').map((r) => r.name);
    to?.postMessage({ type: 'keep', urls });
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => send(reg.active))
      .catch(() => undefined);
  });
}

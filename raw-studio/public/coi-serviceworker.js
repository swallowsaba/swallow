/*
 * Cross-Origin Isolation service worker.
 *
 * Adds COOP/COEP (and CORP) response headers on the client so that
 * `self.crossOriginIsolated === true`, which unlocks SharedArrayBuffer and
 * multi-threaded WebAssembly on static hosts (e.g. GitHub Pages) that cannot
 * set HTTP headers.
 *
 * Logic is a clean-room reimplementation based on the MIT-licensed
 * `coi-serviceworker` project by Guido Zuidhof
 * (https://github.com/gzuidhof/coi-serviceworker). You may replace this file
 * with the upstream minified build if you prefer.
 */

if (typeof window === 'undefined') {
  let coepCredentialless = false;

  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((client) => client.navigate(client.url)));
    } else if (event.data.type === 'coepCredentialless') {
      coepCredentialless = event.data.value;
    }
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const outgoing =
      coepCredentialless && request.mode === 'no-cors'
        ? new Request(request, { credentials: 'omit' })
        : request;

    event.respondWith(
      fetch(outgoing)
        .then((response) => {
          if (response.status === 0) return response;
          const headers = new Headers(response.headers);
          headers.set(
            'Cross-Origin-Embedder-Policy',
            coepCredentialless ? 'credentialless' : 'require-corp',
          );
          if (!coepCredentialless) headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch((error) => console.error(error)),
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');

    const coi = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
      ...window.coi,
    };

    const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage({ type: 'coepCredentialless', value: coi.coepCredentialless() });
      if (coi.shouldDeregister()) controller.postMessage({ type: 'deregister' });
    }

    if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

    if (!window.isSecureContext) {
      if (!coi.quiet) {
        console.warn('COI service worker not registered: a secure context (https/localhost) is required.');
      }
      return;
    }

    if (navigator.serviceWorker) {
      navigator.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          registration.addEventListener('updatefound', () => {
            window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
            coi.doReload();
          });
          if (registration.active && !controller) {
            window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
            coi.doReload();
          }
        },
        (error) => {
          if (!coi.quiet) console.error('COI service worker failed to register:', error);
        },
      );
    }
  })();
}

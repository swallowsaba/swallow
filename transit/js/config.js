/**
 * アプリ設定
 * ------------------------------------------------------------------
 * ★ デプロイ前に WORKER_URL を自分の Worker の URL に書き換えてください。
 *   例: https://kanto-transit-proxy.<あなたのサブドメイン>.workers.dev
 *
 * ここには秘密情報を置かないこと。ODPT のアクセストークンは
 * Worker の Secrets にのみ保持します(フロントには一切出しません)。
 */

const DEFAULT_WORKER_URL = 'https://kanto-transit.kimut999.workers.dev';

/**
 * 動作確認用に ?worker=https://... で一時的に差し替えられる。
 * 指定した値は localStorage に保存され、次回以降も使われる。
 */
export function resolveWorkerUrl() {
  try {
    const param = new URLSearchParams(location.search).get('worker');
    if (param) {
      localStorage.setItem('kanto-transit:worker', param);
      return param.replace(/\/+$/, '');
    }
    const saved = localStorage.getItem('kanto-transit:worker');
    if (saved) return saved.replace(/\/+$/, '');
  } catch {
    /* localStorage が使えない環境でも既定値で動く */
  }
  return DEFAULT_WORKER_URL.replace(/\/+$/, '');
}

export const IS_PLACEHOLDER_URL = () => resolveWorkerUrl().includes('example.workers.dev');

/**
 * Swallow 構成（1リポジトリに複数プロジェクト）では、GitHub Pages が読む 404.html は
 * サイトルートの1枚だけで、サブフォルダの 404.html は使われない。
 * そこでルートの 404.html が /<repo>/<project>/?p=<残りのパス> に振り替え、
 * ここで元の URL に戻す。history を書き換えるだけなので再読み込みは起きない。
 */
export const FALLBACK_PARAM = 'p';

/** 戻すべき URL を返す。復元不要なら null。 */
export function restoredUrl(search: string, baseUrl: string): string | null {
  const encoded = new URLSearchParams(search).get(FALLBACK_PARAM);
  if (encoded === null || encoded === '') return null;
  // 外部サイトへ飛ばされないよう、相対パス（/ 始まり・// でない）だけ受け付ける
  if (!encoded.startsWith('/') || encoded.startsWith('//')) return null;
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${encoded}`;
}

export function applyFallbackRedirect(): void {
  const url = restoredUrl(window.location.search, import.meta.env.BASE_URL);
  if (url !== null) window.history.replaceState(null, '', url);
}

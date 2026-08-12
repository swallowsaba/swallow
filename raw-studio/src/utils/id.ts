/**
 * Small, dependency-free ID helper. Uses the Web Crypto API, which is available
 * in browsers, Web Workers and Node 20+, so the same code runs everywhere.
 */

/** Create a short, URL-safe, collision-resistant id, optionally prefixed. */
export function createId(prefix?: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return prefix ? `${prefix}_${hex}` : hex;
}

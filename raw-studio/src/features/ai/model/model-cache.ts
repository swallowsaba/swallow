const CACHE_NAME = 'raw-studio-models-v1';

/**
 * Fetch a model binary, caching it in the Cache Storage API so it downloads only
 * once. Reports byte progress. Falls back to a plain fetch if caches are absent.
 */
export async function fetchModel(
  url: string,
  onProgress?: (received: number, total: number) => void,
): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  } catch {
    cache = null;
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download model (${String(response.status)}).`);
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  if (cache) {
    try {
      await cache.put(url, new Response(buffer, { headers: { 'content-length': String(received) } }));
    } catch {
      // cache write failed; not fatal
    }
  }
  return buffer.buffer;
}

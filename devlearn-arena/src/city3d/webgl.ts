/**
 * WebGL が使えるかを調べる。
 *
 * 使えない環境（古い端末、GPU を切っている、テストの jsdom）では
 * 3D を読み込まず 2D に落とす。真っ白な画面を出さないため。
 */

let cached: boolean | null = null;

/** 一度だけ調べて覚える。調べるたびに canvas を作らない */
export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  cached = probe();
  return cached;
}

/** テストから調べ直せるようにする */
export function resetWebGL(): void {
  cached = null;
}

function probe(): boolean {
  if (typeof document === 'undefined') return false;
  // 型そのものが無い環境（jsdom など）では、文脈を取りに行かない。
  // 取りに行くと「実装されていない」という騒がしい知らせが出るため
  if (typeof WebGL2RenderingContext === 'undefined' && typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl: unknown = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl !== null && gl !== undefined;
  } catch {
    // 例外を投げる実装もある。使えないものとして扱う
    return false;
  }
}

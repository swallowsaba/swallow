/**
 * Raster mask helpers: encode/decode the stored coverage bitmap and resample it
 * to a target grid. All pure and framework-free (a hand-rolled base64 codec so
 * it runs identically in the browser, a worker and Node without depending on
 * `atob`/`btoa` or `Buffer`), so the fiddly bits are unit-tested.
 *
 * Stored convention: row-major 8-bit alpha, row 0 = image top, in the cropped
 * image's normalized space — the same space every other mask kind uses.
 */
/** Local clamp to 0..1 (kept local to avoid an import cycle with mask-alpha). */
function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Encode bytes to a base64 string. */
export function encodeBase64(bytes) {
    let out = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i] ?? 0;
        const b1 = i + 1 < len ? (bytes[i + 1] ?? 0) : 0;
        const b2 = i + 2 < len ? (bytes[i + 2] ?? 0) : 0;
        const triple = (b0 << 16) | (b1 << 8) | b2;
        out += B64[(triple >> 18) & 63];
        out += B64[(triple >> 12) & 63];
        out += i + 1 < len ? B64[(triple >> 6) & 63] : '=';
        out += i + 2 < len ? B64[triple & 63] : '=';
    }
    return out;
}
const B64_LOOKUP = (() => {
    const table = new Int16Array(256).fill(-1);
    for (let i = 0; i < B64.length; i++)
        table[B64.charCodeAt(i)] = i;
    return table;
})();
/** Decode a base64 string back to bytes. */
export function decodeBase64(str) {
    let clean = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 256 && B64_LOOKUP[c] !== -1)
            clean++;
    }
    const outLen = Math.floor((clean * 3) / 4);
    const out = new Uint8ClampedArray(outLen);
    let acc = 0;
    let bits = 0;
    let o = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c >= 256)
            continue;
        const v = B64_LOOKUP[c];
        if (v === undefined || v === -1)
            continue;
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (acc >> bits) & 0xff;
        }
    }
    return out;
}
// Small LRU-ish cache so repeated rasterization of the same stored bitmap
// (e.g. across frames) does not re-decode the base64 each time.
const DECODE_CACHE = new Map();
const DECODE_CACHE_MAX = 16;
/** Decode a raster mask's bitmap, memoized by its data string. */
export function decodeRaster(data) {
    const hit = DECODE_CACHE.get(data);
    if (hit)
        return hit;
    const decoded = decodeBase64(data);
    DECODE_CACHE.set(data, decoded);
    if (DECODE_CACHE.size > DECODE_CACHE_MAX) {
        const first = DECODE_CACHE.keys().next().value;
        if (first !== undefined)
            DECODE_CACHE.delete(first);
    }
    return decoded;
}
/** Bilinear sample of a decoded alpha buffer at normalized (u,v), returns 0..1. */
export function sampleRasterAt(decoded, width, height, u, v) {
    if (width <= 0 || height <= 0)
        return 0;
    const fx = clamp01(u) * (width - 1);
    const fy = clamp01(v) * (height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = decoded[y0 * width + x0] ?? 0;
    const b = decoded[y0 * width + x1] ?? 0;
    const c = decoded[y1 * width + x0] ?? 0;
    const d = decoded[y1 * width + x1] ?? 0;
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return (top + (bottom - top) * ty) / 255;
}
/** Separable box blur (used for feathering), radius in pixels. Pure. */
export function boxBlurAlpha(src, width, height, radius) {
    const r = Math.max(0, Math.round(radius));
    if (r === 0)
        return src;
    const tmp = new Uint8ClampedArray(width * height);
    const out = new Uint8ClampedArray(width * height);
    const window = r * 2 + 1;
    // Horizontal.
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = -r; x <= r; x++)
            sum += src[row + Math.min(width - 1, Math.max(0, x))] ?? 0;
        for (let x = 0; x < width; x++) {
            tmp[row + x] = Math.round(sum / window);
            const add = row + Math.min(width - 1, x + r + 1);
            const sub = row + Math.max(0, x - r);
            sum += (src[add] ?? 0) - (src[sub] ?? 0);
        }
    }
    // Vertical.
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++)
            sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x] ?? 0;
        for (let y = 0; y < height; y++) {
            out[y * width + x] = Math.round(sum / window);
            const add = Math.min(height - 1, y + r + 1) * width + x;
            const sub = Math.max(0, y - r) * width + x;
            sum += (tmp[add] ?? 0) - (tmp[sub] ?? 0);
        }
    }
    return out;
}
/**
 * Resample a raster mask to a target grid, applying invert and feather.
 * Feather is a fraction of the smaller output dimension.
 */
export function rasterizeRaster(m, outW, outH) {
    const out = new Uint8ClampedArray(outW * outH);
    if (outW <= 0 || outH <= 0 || m.width <= 0 || m.height <= 0)
        return out;
    const decoded = decodeRaster(m.data);
    for (let y = 0; y < outH; y++) {
        const v = (y + 0.5) / outH;
        const row = y * outW;
        for (let x = 0; x < outW; x++) {
            const u = (x + 0.5) / outW;
            let a = sampleRasterAt(decoded, m.width, m.height, u, v);
            if (m.invert)
                a = 1 - a;
            out[row + x] = Math.round(a * 255);
        }
    }
    const feather = clamp01(m.feather);
    if (feather > 0) {
        const radius = feather * 0.08 * Math.min(outW, outH);
        return boxBlurAlpha(out, outW, outH, radius);
    }
    return out;
}
/**
 * Map a square segmentation alpha (segSize×segSize, covering the FULL image in
 * normalized space) into the cropped image's normalized space at outW×outH, so
 * the stored raster lives in the same space as every other mask kind.
 */
export function alphaToCroppedRaster(seg, segSize, crop, outW, outH) {
    const out = new Uint8ClampedArray(outW * outH);
    if (outW <= 0 || outH <= 0 || segSize <= 0)
        return out;
    for (let y = 0; y < outH; y++) {
        const cv = (y + 0.5) / outH; // cropped-space v
        const fullV = crop.y + cv * crop.height; // full-image v
        const row = y * outW;
        for (let x = 0; x < outW; x++) {
            const cu = (x + 0.5) / outW;
            const fullU = crop.x + cu * crop.width;
            out[row + x] = Math.round(sampleRasterAt(seg, segSize, segSize, fullU, fullV) * 255);
        }
    }
    return out;
}
/**
 * Separable morphological grow (max filter): expands the covered region by
 * `radius` pixels. Pure. Used to enlarge an AI mask so it fully covers a subject
 * (e.g. hair edges) before applying local adjustments.
 */
export function dilateAlpha(alpha, width, height, radius) {
    return morph(alpha, width, height, Math.max(0, Math.round(radius)), true);
}
/** Separable morphological shrink (min filter): contracts the region by
 *  `radius` pixels — handy to pull a mask in from a haloed edge. Pure. */
export function erodeAlpha(alpha, width, height, radius) {
    return morph(alpha, width, height, Math.max(0, Math.round(radius)), false);
}
function morph(alpha, width, height, radius, grow) {
    if (radius <= 0 || width <= 0 || height <= 0)
        return alpha.slice();
    const pick = (a, b) => (grow ? Math.max(a, b) : Math.min(a, b));
    const tmp = new Uint8ClampedArray(width * height);
    // horizontal pass
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let v = grow ? 0 : 255;
            const x0 = Math.max(0, x - radius);
            const x1 = Math.min(width - 1, x + radius);
            for (let xx = x0; xx <= x1; xx++)
                v = pick(v, alpha[row + xx] ?? 0);
            tmp[row + x] = v;
        }
    }
    // vertical pass
    const out = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let v = grow ? 0 : 255;
            const y0 = Math.max(0, y - radius);
            const y1 = Math.min(height - 1, y + radius);
            for (let yy = y0; yy <= y1; yy++)
                v = pick(v, tmp[yy * width + x] ?? 0);
            out[y * width + x] = v;
        }
    }
    return out;
}

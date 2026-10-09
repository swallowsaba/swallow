/**
 * 文字と地の明るさの差（docs/product-spec.md 5 章: 4.5:1 以上。WCAG 2 の相対輝度の比）。
 * 半透明の地は、下に見える物（都市の明るい所・暗い所）と重ねた色で測る。
 */
type RGBA = [number, number, number, number];

export function parseColor(c: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(c);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  throw new Error(`読めない色 ${c}`);
}

/** 半透明の色 top を、不透明な色 under の上に重ねた色 */
export function over(top: string, under: string): string {
  const [r, g, b, a] = parseColor(top);
  const [r2, g2, b2] = parseColor(under);
  const mixc = (x: number, y: number): string => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0');
  return `#${mixc(r, r2)}${mixc(g, g2)}${mixc(b, b2)}`;
}

function luminance(c: string): number {
  const [r, g, b] = parseColor(c).map((v, i) => (i < 3 ? v / 255 : v)) as RGBA;
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 明るさの比（1〜21） */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

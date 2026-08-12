export interface FilenameContext {
  name: string; // original basename (no extension)
  seq: number;
  width: number;
  height: number;
  date: Date;
  ext: string; // extension without dot
}

function pad(n: number, width: number): string {
  return String(Math.trunc(n)).padStart(width, '0');
}

/** Strip characters that are illegal in filenames on common platforms. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Expand a filename template and append the correct extension. Supported tokens:
 * {name} {date} {time} {seq} {seq:N} {w} {h}. Unknown tokens become empty.
 */
export function expandFilename(template: string, ctx: FilenameContext): string {
  const d = ctx.date;
  const two = (n: number) => pad(n, 2);
  const values: Record<string, string> = {
    name: ctx.name,
    date: `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
    time: `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`,
    seq: String(ctx.seq),
    w: String(ctx.width),
    h: String(ctx.height),
  };

  let out = template.replace(/\{seq:(\d+)\}/g, (_, n: string) => pad(ctx.seq, Number(n)));
  out = out.replace(/\{(name|date|time|seq|w|h)\}/g, (_, key: string) => values[key] ?? '');
  out = out.replace(/\{[^}]*\}/g, ''); // drop any unknown tokens
  out = sanitizeFilename(out);
  if (!out || /^[_\s]+$/.test(out)) out = 'export';
  return `${out}.${ctx.ext}`;
}

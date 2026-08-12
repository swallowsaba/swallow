/**
 * Format detection. Decides whether a file needs the LibRaw WASM decoder (RAW)
 * or can be decoded by the browser directly (JPEG/PNG/...). Pure and testable:
 * it operates on the file name plus the first bytes of the header.
 */

export type ImageClass = 'raw' | 'native' | 'unknown';

export interface FormatInfo {
  readonly imageClass: ImageClass;
  /** Lowercase extension without the dot, or '' if none. */
  readonly ext: string;
  /** Detected format id when recognizable (e.g. 'cr3', 'arw'), else null. */
  readonly format: string | null;
}

const RAW_EXTENSIONS = new Set([
  'cr2',
  'cr3',
  'crw',
  'arw',
  'arq',
  'sr2',
  'srf',
  'nef',
  'nrw',
  'raf',
  'rw2',
  'rwl',
  'orf',
  'pef',
  'dng',
  'srw',
  '3fr',
  'dcr',
  'kdc',
  'mrw',
  'x3f',
  'iiq',
  'raw',
]);

const NATIVE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']);

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

/**
 * Best-effort RAW identification from the file header. Returns a format id or
 * null. Recognizes the container signatures for the required formats; formats
 * that share the generic TIFF header (NEF/ARW/DNG/PEF/ORF/RW2) are resolved by
 * extension in {@link detectFormat}.
 */
export function detectRawByMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;

  // Fujifilm RAF: ASCII "FUJIFILMCCD-RAW"
  if (ascii(bytes, 0, 15) === 'FUJIFILMCCD-RAW') return 'raf';

  // Canon CR3 / ISO-BMFF: bytes 4..7 == 'ftyp', major brand 'crx '
  if (ascii(bytes, 4, 4) === 'ftyp' && ascii(bytes, 8, 4) === 'crx ') return 'cr3';

  // Sigma X3F: "FOVb"
  if (ascii(bytes, 0, 4) === 'FOVb') return 'x3f';

  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  // Little-endian TIFF ("II", 0x2A)
  if (b0 === 0x49 && b1 === 0x49) {
    // Canon CR2: II 2A 00 ... "CR" at offset 8
    if (b2 === 0x2a && ascii(bytes, 8, 2) === 'CR') return 'cr2';
    // Panasonic RW2: II U(0x55) 0x00
    if (b2 === 0x55 && b3 === 0x00) return 'rw2';
    // Olympus ORF: "IIRO" / "IIRS"
    if (b2 === 0x52 && (b3 === 0x4f || b3 === 0x53)) return 'orf';
    // Generic little-endian TIFF (NEF/ARW/DNG/PEF/…) — needs extension to refine
    if (b2 === 0x2a && b3 === 0x00) return 'tiff';
  }

  // Big-endian TIFF ("MM", 0x2A)
  if (b0 === 0x4d && b1 === 0x4d) {
    if (b2 === 0x4f && b3 === 0x52) return 'orf'; // "MMOR"
    if (b2 === 0x00 && b3 === 0x2a) return 'tiff';
  }

  return null;
}

/** Classify a file for the decode pipeline using magic bytes + extension. */
export function detectFormat(fileName: string, header: Uint8Array): FormatInfo {
  const ext = extensionOf(fileName);
  const magic = detectRawByMagic(header);

  // A recognized RAW magic (other than the ambiguous generic TIFF) is decisive.
  if (magic && magic !== 'tiff') {
    return { imageClass: 'raw', ext, format: magic };
  }

  if (RAW_EXTENSIONS.has(ext)) {
    return { imageClass: 'raw', ext, format: magic === 'tiff' ? ext : (magic ?? ext) };
  }

  if (NATIVE_EXTENSIONS.has(ext)) {
    return { imageClass: 'native', ext, format: ext === 'jpg' ? 'jpeg' : ext };
  }

  // Generic TIFF with a non-raw extension (e.g. .tif) is treated as native-ish
  // but browsers can't decode TIFF; leave unknown so the UI can warn.
  return { imageClass: 'unknown', ext, format: magic };
}

import { describe, expect, it } from 'vitest';
import { detectFormat, detectRawByMagic, extensionOf } from './raw-format';

function bytes(...vals: (number | string)[]): Uint8Array {
  const flat: number[] = [];
  for (const v of vals) {
    if (typeof v === 'string') for (const ch of v) flat.push(ch.charCodeAt(0));
    else flat.push(v);
  }
  while (flat.length < 16) flat.push(0);
  return new Uint8Array(flat);
}

describe('format detection', () => {
  it('reads extensions', () => {
    expect(extensionOf('IMG_1234.CR3')).toBe('cr3');
    expect(extensionOf('photo.jpeg')).toBe('jpeg');
    expect(extensionOf('noext')).toBe('');
  });

  it('detects Canon CR3 by ISO-BMFF ftyp/crx brand', () => {
    expect(detectRawByMagic(bytes(0, 0, 0, 0x18, 'ftypcrx '))).toBe('cr3');
  });

  it('detects Canon CR2 (II* + CR at offset 8)', () => {
    expect(detectRawByMagic(bytes(0x49, 0x49, 0x2a, 0x00, 0x10, 0, 0, 0, 'CR', 2, 0))).toBe('cr2');
  });

  it('detects Fujifilm RAF', () => {
    expect(detectRawByMagic(bytes('FUJIFILMCCD-RAW'))).toBe('raf');
  });

  it('detects Panasonic RW2 and Olympus ORF', () => {
    expect(detectRawByMagic(bytes(0x49, 0x49, 0x55, 0x00))).toBe('rw2');
    expect(detectRawByMagic(bytes(0x49, 0x49, 0x52, 0x4f))).toBe('orf');
  });

  it('returns generic tiff for plain little-endian TIFF header', () => {
    expect(detectRawByMagic(bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0))).toBe('tiff');
  });

  it('classifies ARW/NEF (generic TIFF magic) as raw via extension', () => {
    const tiff = bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0);
    expect(detectFormat('a7iv.ARW', tiff)).toMatchObject({ imageClass: 'raw', ext: 'arw' });
    expect(detectFormat('nikon.NEF', tiff)).toMatchObject({ imageClass: 'raw', ext: 'nef' });
  });

  it('classifies CR3 as raw from magic even with odd extension', () => {
    const cr3 = bytes(0, 0, 0, 0x18, 'ftypcrx ');
    expect(detectFormat('weird.bin', cr3).imageClass).toBe('raw');
    expect(detectFormat('weird.bin', cr3).format).toBe('cr3');
  });

  it('classifies JPEG/PNG as native', () => {
    expect(detectFormat('p.jpg', bytes(0xff, 0xd8, 0xff)).imageClass).toBe('native');
    expect(detectFormat('p.png', bytes(0x89, 0x50, 0x4e, 0x47)).imageClass).toBe('native');
  });

  it('marks unknown extensions with no raw magic as unknown', () => {
    expect(detectFormat('file.tif', bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0)).imageClass).toBe(
      'unknown',
    );
  });
});

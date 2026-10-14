import { describe, expect, it } from 'vitest';
import { byteLength, charsetOf, decodeAs, encodeAs, forDisplay, fromBytes, guessCharset, toBytes } from './bytes';

const bytesOf = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe('ファイルの 0 と 1', () => {
  it('UTF-8 の文字列は、そのままの 0 と 1 になる（日本語は 1 文字 3 バイト）', () => {
    expect([...toBytes('こ')]).toEqual([0xe3, 0x81, 0x93]);
    expect(byteLength('こんにちは\n')).toBe(16);
  });

  it('UTF-8 として読めないバイトは、印の文字に置いて持ち、0 と 1 に戻すと元のバイトになる', () => {
    const sjis = bytesOf(0x82, 0xb1, 0x41, 0x8d, 0x60);
    const text = fromBytes(sjis);
    expect(text).toContain('A');
    expect([...toBytes(text)]).toEqual([...sjis]);
    expect(byteLength(text)).toBe(5);
  });

  it('端末に出す時は、読めないバイトを 1 つずつ ? にする（� は升目に収まらない書体が多い）。本物の文字（絵文字の対も）はそのまま', () => {
    expect(forDisplay(fromBytes(bytesOf(0x82, 0xb1, 0x41)))).toBe('??A');
    expect(forDisplay('港😀')).toBe('港😀');
  });
});

describe('文字コード', () => {
  it('Shift_JIS と EUC-JP で書き、読み直すと元の文になる', () => {
    const text = 'こんにちは。港の祭りは土曜日です。\n会場は港の広場、朝 10 時から。\n';
    for (const cs of ['SHIFT_JIS', 'EUC-JP'] as const) {
      const encoded = encodeAs(text, cs);
      expect(encoded.error).toBeUndefined();
      expect(decodeAs(encoded.value, cs)).toEqual({ value: text });
    }
    expect([...encodeAs('こ', 'SHIFT_JIS').value]).toEqual([0x82, 0xb1]);
    expect([...encodeAs('こ', 'EUC-JP').value]).toEqual([0xa4, 0xb3]);
  });

  it('その文字コードで読めない所があれば、そこまでの文と位置を返す', () => {
    // Shift_JIS の「こ」を UTF-8 として読むと、先頭で止まる
    expect(decodeAs(bytesOf(0x41, 0x82, 0xb1), 'UTF-8')).toEqual({ value: 'A', error: 1 });
    expect(decodeAs(bytesOf(0x41, 0x82), 'ASCII')).toEqual({ value: 'A', error: 1 });
    // 書けない文字（ASCII に日本語）は、その文字の前で止まる
    expect(encodeAs('ab港', 'ASCII').error).toBe(2);
  });

  it('名前は本物の iconv の別名と大小を問わず受け、//TRANSLIT などの印は外す', () => {
    expect(charsetOf('sjis')).toBe('SHIFT_JIS');
    expect(charsetOf('Shift_JIS')).toBe('SHIFT_JIS');
    expect(charsetOf('utf8')).toBe('UTF-8');
    expect(charsetOf('ASCII//TRANSLIT')).toBe('ASCII');
    expect(charsetOf('KLINGON')).toBeUndefined();
  });

  it('見当を付ける: 英字だけ・UTF-8・Shift_JIS・EUC-JP', () => {
    const text = 'こんにちは。港の祭りは土曜日です。\n';
    expect(guessCharset(toBytes('hello\n'))).toBe('ASCII');
    expect(guessCharset(toBytes(text))).toBe('UTF-8');
    expect(guessCharset(encodeAs(text, 'SHIFT_JIS').value)).toBe('Shift_JIS');
    expect(guessCharset(encodeAs(text, 'EUC-JP').value)).toBe('EUC-JP');
  });
});

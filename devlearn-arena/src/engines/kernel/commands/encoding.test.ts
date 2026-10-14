import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { createClock } from '../clock';
import { createSession, restoreShell, snapshotShell, type Session, type ShellSnapshotData } from '../session';
import { execute } from '../shell';
import { readFile } from '../vfs';
import { createDefaultRegistry } from '.';

/** 文字化けの実戦（found.b.08）の道具: file・iconv・nkf・xxd と、文字コードを持つファイル（setup の encodings） */

const TEXT = 'こんにちは。港の祭りは土曜日です。\n';

function open(): { run: (line: string) => { out: string; err: string; code: number }; s: () => Session } {
  let session: Session = {
    ...createSession(),
    state: initialShell('linux-basic', {
      files: { '/home/learner/sjis.txt': TEXT, '/home/learner/euc.txt': TEXT, '/home/learner/utf8.txt': TEXT, '/home/learner/en.txt': 'hello\n', '/home/learner/one.txt': 'no newline' },
      encodings: { '/home/learner/sjis.txt': 'SHIFT_JIS', '/home/learner/euc.txt': 'EUC-JP' },
    }),
    registry: createDefaultRegistry(),
    clock: createClock(),
  };
  return {
    run: (line) => {
      const o = execute(session.state, line, session.registry, session.clock);
      session = { ...session, state: o.state };
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    s: () => session,
  };
}

describe('文字コードを持つファイル', () => {
  it('Shift_JIS で置いたファイルは、その 0 と 1 の大きさで、cat すると UTF-8 としては読めない', () => {
    const t = open();
    expect(t.run('wc -c sjis.txt utf8.txt').out).toBe('35 sjis.txt\n52 utf8.txt\n87 total\n');
    expect(t.run('cat sjis.txt').out).not.toContain('こんにちは');
  });

  it('保存して戻しても、元の 0 と 1 のまま', () => {
    const t = open();
    const back = restoreShell(JSON.parse(JSON.stringify(snapshotShell(t.s().state))) as ShellSnapshotData);
    expect(readFile(back.vfs, '/home/learner/sjis.txt')).toBe(readFile(t.s().state.vfs, '/home/learner/sjis.txt'));
  });
});

describe('file', () => {
  it('本物と同じ言い方で中身の種類を言う。名前は揃えて並べる', () => {
    const t = open();
    expect(t.run('file utf8.txt sjis.txt euc.txt en.txt one.txt').out).toBe([
      'utf8.txt: Unicode text, UTF-8 text',
      'sjis.txt: Non-ISO extended-ASCII text',
      'euc.txt:  ISO-8859 text',
      'en.txt:   ASCII text',
      'one.txt:  ASCII text, with no line terminators',
      '',
    ].join('\n'));
  });

  it('-i は MIME の形、-b は名前を出さない。無いファイル・ディレクトリも本物と同じ', () => {
    const t = open();
    expect(t.run('file -i sjis.txt utf8.txt').out).toBe('sjis.txt: text/plain; charset=unknown-8bit\nutf8.txt: text/plain; charset=utf-8\n');
    expect(t.run('file -b /home').out).toBe('directory\n');
    expect(t.run('file nope.txt').out).toBe("nope.txt: cannot open `nope.txt' (No such file or directory)\n");
  });
});

describe('nkf', () => {
  it('-g は文字コードの見当、--guess は改行の形も添える', () => {
    const t = open();
    expect(t.run('nkf -g sjis.txt').out).toBe('Shift_JIS\n');
    expect(t.run('nkf -g euc.txt').out).toBe('EUC-JP\n');
    expect(t.run('nkf --guess utf8.txt').out).toBe('UTF-8 (LF)\n');
    expect(t.run('nkf -g en.txt').out).toBe('ASCII\n');
  });

  it('-w は見当を付けた文字コードから UTF-8 に直して出す', () => {
    const t = open();
    expect(t.run('nkf -w sjis.txt').out).toBe(TEXT);
  });
});

describe('iconv', () => {
  it('-f の文字コードで読み、-t の文字コードで書く。> でファイルにすると UTF-8 の文になる', () => {
    const t = open();
    expect(t.run('iconv -f SHIFT_JIS -t UTF-8 sjis.txt > fixed.txt').code).toBe(0);
    expect(readFile(t.s().state.vfs, '/home/learner/fixed.txt')).toBe(TEXT);
    expect(t.run('iconv -f EUC-JP -t UTF-8 euc.txt').out).toBe(TEXT);
    // パイプを通しても元の 0 と 1 のまま届く
    expect(t.run('cat sjis.txt | iconv -f SJIS -t UTF-8').out).toBe(TEXT);
    // UTF-8 から Shift_JIS に書くと、元のファイルと同じ 0 と 1 になる
    expect(t.run('iconv -f UTF-8 -t SHIFT_JIS utf8.txt | wc -c').out).toBe('35\n');
  });

  it('-o で書き出す先を決められる', () => {
    const t = open();
    t.run('iconv -f SHIFT_JIS -t UTF-8 -o out.txt sjis.txt');
    expect(readFile(t.s().state.vfs, '/home/learner/out.txt')).toBe(TEXT);
  });

  it('違う文字コードで読むと、読めない所の位置を言って止まる。そこまでは書き出す', () => {
    const t = open();
    const r = t.run('iconv -f EUC-JP -t UTF-8 sjis.txt');
    expect(r.err).toBe('iconv: illegal input sequence at position 0\n');
    expect(r.code).toBe(1);
    const ascii = t.run('iconv -f UTF-8 -t ASCII en.txt utf8.txt');
    expect(ascii.out).toBe('hello\n');
    expect(ascii.err).toBe('iconv: illegal input sequence at position 0\n');
  });

  it('知らない文字コードは本物と同じ文で断る', () => {
    const t = open();
    expect(t.run('iconv -f KLINGON -t UTF-8 sjis.txt').err).toBe("iconv: conversion from `KLINGON' is not supported\nTry `iconv --help' or `iconv --usage' for more information.\n");
    expect(t.run('iconv -f UTF-8 -t KLINGON sjis.txt').err).toContain("conversion to `KLINGON' is not supported");
  });
});

describe('xxd', () => {
  it('16 進数で、位置・2 バイトずつの組・読める文字を並べる', () => {
    const t = open();
    expect(t.run('xxd en.txt').out).toBe('00000000: 6865 6c6c 6f0a                           hello.\n');
  });

  it('-b は 0 と 1 で 6 バイトずつ。-l で長さを決める。同じ「こ」でも文字コードで 0 と 1 が違う', () => {
    const t = open();
    expect(t.run('xxd -b -l 3 utf8.txt').out).toBe('00000000: 11100011 10000001 10010011                             ...\n');
    expect(t.run('xxd -b -l 2 sjis.txt').out).toBe('00000000: 10000010 10110001                                      ..\n');
    expect(t.run('xxd -b en.txt').out).toBe('00000000: 01101000 01100101 01101100 01101100 01101111 00001010  hello.\n');
  });

  it('-p は位置も文字も付けない 16 進数', () => {
    const t = open();
    expect(t.run('xxd -p -l 2 sjis.txt').out).toBe('82b1\n');
  });
});

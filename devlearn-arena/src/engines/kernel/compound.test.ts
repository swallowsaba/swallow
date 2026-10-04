import { describe, expect, it } from 'vitest';
import { feedLine } from './continuation';
import { parse } from './parser';
import { createSession, type Session, type SessionOptions } from './session';
import { execute } from './shell';
import { ParseError } from './tokenizer';
import { readFile } from './vfs';

/**
 * シェルスクリプトの形（docs/lessons/linux.md の linux.i.07・linux.i.08）:
 * if・for・while、test と [ ]、set -e、exit、行の途中からの注釈
 */

function open(options: SessionOptions = {}): { run: (line: string) => { out: string; err: string; code: number }; s: () => Session } {
  let session = createSession(options);
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

describe('組み立ての形を読む（parse）', () => {
  it('if・for・while を 1 つのコマンドとして読む。予約語は行の頭でだけ効く', () => {
    const list = parse('if [ -f a ]; then echo yes; else echo no; fi; echo done');
    expect(list.items).toHaveLength(2);
    expect(list.items[0]?.pipeline.commands[0]).toMatchObject({ kind: 'if' });
    expect(parse('for f in a b\ndo\n  echo $f\ndone').items[0]?.pipeline.commands[0]).toMatchObject({ kind: 'for', name: 'f' });
  });

  it('閉じていない if・for はエラー（続きを待てるよう、終わりが足りないと分かる）', () => {
    expect(() => parse('if true; then echo a')).toThrow(ParseError);
    expect(() => parse('for f in a b; do echo $f')).toThrow(ParseError);
    expect(() => parse('fi')).toThrow(ParseError);
  });

  it('行の途中の # から後ろは注釈', () => {
    expect(parse('echo a # note').items[0]?.pipeline.commands[0]).toMatchObject({ words: [{ raw: 'echo' }, { raw: 'a' }] });
  });
});

describe('組み立ての形を動かす', () => {
  it('if は条件の終了コードで分かれる。elif・else も', () => {
    const t = open({ files: { '/home/learner/a.txt': 'x\n' } });
    expect(t.run('if [ -f a.txt ]; then echo yes; else echo no; fi').out).toBe('yes\n');
    expect(t.run('if [ -d a.txt ]; then echo dir; elif [ -e a.txt ]; then echo file; fi').out).toBe('file\n');
    expect(t.run('if false; then echo a; fi').code).toBe(0);
  });

  it('for は並べた語を 1 つずつ変数に入れて繰り返す。* はファイルの名前に広がる', () => {
    const t = open({ files: { '/home/learner/x.log': '', '/home/learner/y.log': '' } });
    expect(t.run('for f in a b; do echo $f; done').out).toBe('a\nb\n');
    expect(t.run('for f in *.log; do echo "found $f"; done > list.txt').out).toBe('');
    expect(readFile(t.s().state.vfs, '/home/learner/list.txt')).toBe('found x.log\nfound y.log\n');
  });

  it('while は条件が成り立つ間だけ繰り返す', () => {
    const t = open();
    t.run('n=0');
    expect(t.run('while [ $n -lt 3 ]; do echo $n; n=$((n + 1)); done').out).toBe('0\n1\n2\n');
  });

  it('[ ] の数の比べ方。数でない物は、本物と同じ文言のエラー', () => {
    const t = open();
    expect(t.run('[ 91 -gt 80 ] && echo over').out).toBe('over\n');
    expect(t.run('[ 5 -ge 10 ] || echo under').out).toBe('under\n');
    expect(t.run('[ "91%" -gt 80 ]')).toEqual({ out: '', err: '[: 91%: integer expression expected\n', code: 2 });
    expect(t.run('[ -z "" ] && [ -n x ] && [ a = a ] && [ a != b ] && echo ok').out).toBe('ok\n');
    expect(t.run('[ 1 -eq 1').err).toBe("[: missing `]'\n");
    expect(t.run('test ! -e nope && echo none').out).toBe('none\n');
  });
});

describe('スクリプト（set -e・exit・引数）', () => {
  const files = {
    '/home/learner/check.sh': '#!/bin/sh\n# 使用率を比べる\nused=$1\nif [ "$used" -gt 80 ]; then\n  echo "warn $used" # 知らせる\n  exit 3\nfi\necho fine\n',
    '/home/learner/stop.sh': '#!/bin/sh\nset -e\necho one\nfalse\necho two\n',
    '/home/learner/go.sh': '#!/bin/sh\necho one\nfalse\necho two\n',
  };

  it('複数の行にまたがる if を読み、exit でそこで終わる。終了コードが呼んだ側に返る', () => {
    const t = open({ files });
    expect(t.run('sh check.sh 91')).toEqual({ out: 'warn 91\n', err: '', code: 3 });
    expect(t.run('sh check.sh 40')).toEqual({ out: 'fine\n', err: '', code: 0 });
    expect(t.run('chmod +x check.sh && ./check.sh 95; echo "code=$?"').out).toBe('warn 95\ncode=3\n');
  });

  it('set -e があると、失敗した所で止まる。無ければ続ける', () => {
    const t = open({ files });
    expect(t.run('sh stop.sh')).toEqual({ out: 'one\n', err: '', code: 1 });
    expect(t.run('sh go.sh')).toEqual({ out: 'one\ntwo\n', err: '', code: 0 });
    expect(t.run('echo after').out).toBe('after\n');
  });

  it('端末で打った exit と set -e は、その行だけで終わる（端末は閉じない）', () => {
    const t = open();
    expect(t.run('exit 4; echo no')).toEqual({ out: '', err: '', code: 4 });
    t.run('set -e');
    t.run('false');
    expect(t.run('echo still').out).toBe('still\n');
  });
});

describe('打ち込みの続き（continuation）', () => {
  it('閉じていない if・for は、続きの行を待つ', () => {
    const first = feedLine(null, 'for f in a b');
    expect(first.kind).toBe('more');
    if (first.kind !== 'more') return;
    const second = feedLine(first.pending, 'do echo $f');
    expect(second.kind).toBe('more');
    if (second.kind !== 'more') return;
    expect(feedLine(second.pending, 'done')).toEqual({ kind: 'run', text: 'for f in a b\ndo echo $f\ndone' });
  });
});

describe('df --output', () => {
  it('--output=pcent は使用率だけを出す（数を取り出して比べるのに使う）', () => {
    const t = open({ vars: { __DISK_SIZE: String(1024 ** 3) } });
    expect(t.run('df --output=pcent /').out).toMatch(/^Use%\n +\d+%\n$/);
  });
});

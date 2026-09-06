import { describe, expect, it } from 'vitest';
import {
  decode, encode, hashBlob, hashObject, ObjectStore, parseCommit, parseTree,
  serialize, serializeCommit, serializeTree, toHex, type Signature,
} from './objects';

const sig: Signature = {
  name: 'Learner',
  email: 'learner@example.com',
  timestamp: 1_700_000_000,
  timezone: '+0900',
};

describe('本物の git と同じハッシュになる', () => {
  // git hash-object の既知の値。ここがずれたら実装が偽物
  it('空の blob', () => {
    expect(hashBlob('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  it("blob 'test content\\n'", () => {
    expect(hashBlob('test content\n')).toBe('d670460b4b4aece5915caf5c68d12f560a9fe3e4');
  });

  it("blob 'hello\\n'", () => {
    expect(hashBlob('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('ヘッダは "type size\\0" の形', () => {
    const raw = decode(serialize('blob', encode('abc')));
    expect(raw).toBe('blob 3\u0000abc');
  });

  it('同じ内容は同じハッシュ（内容アドレス）', () => {
    expect(hashBlob('same')).toBe(hashBlob('same'));
    expect(hashBlob('same')).not.toBe(hashBlob('other'));
  });

  it('バイト数で数える（マルチバイト文字）', () => {
    const raw = decode(serialize('blob', encode('あ')));
    expect(raw.startsWith('blob 3\u0000')).toBe(true);
  });
});

describe('tree', () => {
  const blobA = hashBlob('a\n');
  const blobB = hashBlob('b\n');

  it('名前順に並べる', () => {
    const body = serializeTree([
      { mode: '100644', name: 'b.txt', hash: blobB },
      { mode: '100644', name: 'a.txt', hash: blobA },
    ]);
    expect(parseTree(body).map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('往復して同じになる', () => {
    const entries = [
      { mode: '100644', name: 'a.txt', hash: blobA },
      { mode: '040000', name: 'sub', hash: blobB },
    ];
    expect(parseTree(serializeTree(entries))).toEqual(
      [...entries].sort((x, y) => (x.name < y.name ? -1 : 1)),
    );
  });

  it('ディレクトリは名前に / を補って並べる', () => {
    const body = serializeTree([
      { mode: '040000', name: 'lib', hash: blobA },
      { mode: '100644', name: 'lib.txt', hash: blobB },
    ]);
    // 'lib/' > 'lib.txt' なので lib.txt が先
    expect(parseTree(body).map((e) => e.name)).toEqual(['lib.txt', 'lib']);
  });

  it('ハッシュは20バイトで格納される', () => {
    const body = serializeTree([{ mode: '100644', name: 'a', hash: blobA }]);
    expect(body.length).toBe('100644 a\0'.length + 20);
  });
});

describe('commit', () => {
  const tree = hashBlob('tree-ish');

  it('親なしの commit を組み立てて読み戻せる', () => {
    const body = serializeCommit({
      tree,
      parents: [],
      author: sig,
      committer: sig,
      message: 'first commit',
    });
    const parsed = parseCommit(body);
    expect(parsed.tree).toBe(tree);
    expect(parsed.parents).toEqual([]);
    expect(parsed.author.name).toBe('Learner');
    expect(parsed.author.timestamp).toBe(1_700_000_000);
    expect(parsed.message.trim()).toBe('first commit');
  });

  it('マージコミットは親を2つ持つ', () => {
    const body = serializeCommit({
      tree,
      parents: ['a'.repeat(40), 'b'.repeat(40)],
      author: sig,
      committer: sig,
      message: 'merge',
    });
    expect(parseCommit(body).parents).toHaveLength(2);
  });

  it('本文の形式が本物と同じ', () => {
    const text = decode(
      serializeCommit({ tree, parents: [], author: sig, committer: sig, message: 'msg' }),
    );
    expect(text).toBe(
      `tree ${tree}\n` +
        'author Learner <learner@example.com> 1700000000 +0900\n' +
        'committer Learner <learner@example.com> 1700000000 +0900\n' +
        '\nmsg\n',
    );
  });

  it('同じ内容の commit は同じハッシュになる（決定論）', () => {
    const make = () =>
      hashObject(
        'commit',
        serializeCommit({ tree, parents: [], author: sig, committer: sig, message: 'x' }),
      );
    expect(make()).toBe(make());
  });
});

describe('ObjectStore', () => {
  it('書いたものを読み戻せる', () => {
    const store = new ObjectStore();
    const hash = store.write('blob', encode('hello\n'));
    expect(hash).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(decode(store.read(hash)?.body ?? new Uint8Array())).toBe('hello\n');
  });

  it('同じ内容は重複して持たない', () => {
    const store = new ObjectStore();
    store.write('blob', encode('same'));
    store.write('blob', encode('same'));
    expect(store.size()).toBe(1);
  });

  it('短縮ハッシュで引ける', () => {
    const store = new ObjectStore();
    const hash = store.write('blob', encode('hello\n'));
    expect(store.resolve(hash.slice(0, 7))).toBe(hash);
    expect(store.resolve('zzzzzzz')).toBeUndefined();
  });

  it('cat-file -p が blob の中身を返す', () => {
    const store = new ObjectStore();
    const hash = store.write('blob', encode('content\n'));
    expect(store.pretty(hash)).toBe('content\n');
  });

  it('cat-file -p が tree を一覧形式で返す', () => {
    const store = new ObjectStore();
    const blob = store.write('blob', encode('a\n'));
    const tree = store.write('tree', serializeTree([{ mode: '100644', name: 'a.txt', hash: blob }]));
    expect(store.pretty(tree)).toBe(`100644 blob ${blob}\ta.txt\n`);
  });

  it('無いハッシュは undefined', () => {
    expect(new ObjectStore().pretty('0'.repeat(40))).toBeUndefined();
  });

  it('16進変換が往復する', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
});

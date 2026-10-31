import { describe, expect, it } from 'vitest';
import { formatResult, isCommitted, matchesExpected, openDb } from './db';

const SETUP = `
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL);
INSERT INTO products (name, price, stock) VALUES ('ペン', 120, 30), ('ノート', 200, 0), ('はさみ', 450, 5);
`;

describe('確定した状態の判定（committed）', () => {
  it('BEGIN の途中は確定していない。COMMIT の後は確定している', async () => {
    const db = await openDb(SETUP);
    expect(isCommitted(db)).toBe(true);
    db.exec('BEGIN');
    db.exec("UPDATE products SET stock = 1 WHERE name = 'ペン'");
    expect(isCommitted(db)).toBe(false);
    expect(matchesExpected(db, "SELECT stock FROM products WHERE name = 'ペン'", 1)).toBe(true);
    db.exec('COMMIT');
    expect(isCommitted(db)).toBe(true);
    expect(matchesExpected(db, "SELECT stock FROM products WHERE name = 'ペン'", 1)).toBe(true);
    db.close();
  });
});

describe('実行中の処理を見て止める（PostgreSQL と同じ名前。db.a.02）', () => {
  const ACTIVITY = `
CREATE TABLE pg_stat_activity (pid INTEGER PRIMARY KEY, state TEXT, wait_event_type TEXT, query TEXT);
CREATE TABLE _pg_locks (pid INTEGER, blocker INTEGER);
INSERT INTO pg_stat_activity VALUES (412, 'idle in transaction', 'Client', 'UPDATE orders SET status = 1'), (415, 'active', 'Lock', 'UPDATE orders SET status = 2'), (418, 'active', 'Lock', 'UPDATE orders SET status = 3'), (420, 'active', NULL, 'SELECT 1');
INSERT INTO _pg_locks VALUES (415, 412), (418, 415);
`;

  it('pg_blocking_pids は、待っている相手を返す', async () => {
    const db = await openDb(ACTIVITY);
    expect(db.rows('SELECT pg_blocking_pids(415) AS b')).toEqual([{ b: '{412}' }]);
    expect(db.rows('SELECT pg_blocking_pids(420) AS b')).toEqual([{ b: '{}' }]);
    db.close();
  });

  it('pg_terminate_backend は処理を止め、待っていた処理を進める。無い処理は false', async () => {
    const db = await openDb(ACTIVITY);
    expect(db.rows('SELECT pg_terminate_backend(999) AS r')).toEqual([{ r: 'false' }]);
    expect(db.rows('SELECT pg_terminate_backend(412) AS r')).toEqual([{ r: 'true' }]);
    expect(db.rows("SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock'")).toEqual([{ pid: 418 }]);
    expect(db.rows('SELECT pg_blocking_pids(418) AS b')).toEqual([{ b: '{415}' }]);
    db.exec('SELECT pg_terminate_backend(415)');
    expect(matchesExpected(db, "SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'", 0)).toBe(true);
    db.close();
  });

  it('表の無い実戦では、本物と同じく読めない', async () => {
    const db = await openDb(SETUP);
    expect(db.exec('SELECT pg_terminate_backend(1)').ok).toBe(false);
    db.close();
  });
});

describe('DB（sql.js の SQLite で本物の SQL を実行する）', () => {
  it('初期状態の SQL から開き、問い合わせの結果を列の名前の付いた行で返す', async () => {
    const db = await openDb(SETUP);
    expect(db.rows('SELECT name, price FROM products WHERE stock > 0 ORDER BY price')).toEqual([{ name: 'ペン', price: 120 }, { name: 'はさみ', price: 450 }]);
    db.close();
  });

  it('更新は DB の状態に残り、判定は状態で行う', async () => {
    const db = await openDb(SETUP);
    const r = db.exec("UPDATE products SET stock = 10 WHERE name = 'ノート'");
    expect(r).toMatchObject({ ok: true, changes: 1 });
    expect(matchesExpected(db, "SELECT stock FROM products WHERE name = 'ノート'", 10)).toBe(true);
    expect(matchesExpected(db, 'SELECT COUNT(*) AS n FROM products WHERE stock = 0', 0)).toBe(true);
    expect(matchesExpected(db, 'SELECT name FROM products ORDER BY id', [{ name: 'ペン' }, { name: 'ノート' }, { name: 'はさみ' }])).toBe(true);
    expect(matchesExpected(db, 'SELECT name FROM products ORDER BY id', [{ name: 'ペン' }])).toBe(false);
    db.close();
  });

  it('誤った SQL は SQLite のエラーの文を返し、落ちない。判定の問い合わせの誤りは「満たさない」', async () => {
    const db = await openDb(SETUP);
    expect(db.exec('SELEC * FROM products')).toEqual({ ok: false, error: 'near "SELEC": syntax error' });
    expect(db.exec('SELECT * FROM product')).toEqual({ ok: false, error: 'no such table: product' });
    expect(matchesExpected(db, 'SELECT nope FROM products', 1)).toBe(false);
    db.close();
  });

  it('実戦ごとに別の DB（他の実戦の変更が混ざらない）', async () => {
    const a = await openDb(SETUP);
    const b = await openDb(SETUP);
    a.exec('DELETE FROM products');
    expect(b.rows('SELECT COUNT(*) AS n FROM products')).toEqual([{ n: 3 }]);
    a.close();
    b.close();
  });

  it('結果を表の形にする', async () => {
    const db = await openDb(SETUP);
    const r = db.exec('SELECT name, stock FROM products WHERE id = 1');
    expect(r.ok && formatResult(r.results[0] ?? { columns: [], rows: [] })).toBe(['┌──────┬───────┐', '│ name │ stock │', '├──────┼───────┤', '│ ペン   │ 30    │', '└──────┴───────┘'].join('\n'));
    db.close();
  });
});

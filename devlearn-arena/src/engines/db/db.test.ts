import { describe, expect, it } from 'vitest';
import { formatResult, matchesExpected, openDb } from './db';

const SETUP = `
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL);
INSERT INTO products (name, price, stock) VALUES ('ペン', 120, 30), ('ノート', 200, 0), ('はさみ', 450, 5);
`;

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

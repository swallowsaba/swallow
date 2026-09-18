/**
 * 路線・バスの区分のテスト
 *   node tests/category.test.mjs
 *
 * 除外の一覧で「JR」「地下鉄」「私鉄」のように、使う人に通じる言い方で
 * 区切れていることを確かめる。事業者 ID やデータ提供元の名前は出さない。
 */

import assert from 'node:assert/strict';
import {
  railCategory,
  busCategory,
  RAIL_CATEGORIES,
  BUS_CATEGORIES,
  categoryOrder,
} from '../transit/js/category.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

const RW = (s) => `odpt.Railway:${s}`;

console.log('\n鉄道の区分');

test('JR は JR', () => {
  assert.equal(railCategory(RW('JR-East.Yamanote'), 'JR-East'), 'JR');
});

test('東京メトロは地下鉄', () => {
  assert.equal(railCategory(RW('TokyoMetro.Ginza'), 'TokyoMetro'), '地下鉄');
});

test('都営は路線で分ける(浅草線は地下鉄、都電は路面電車)', () => {
  assert.equal(railCategory(RW('Toei.Asakusa'), 'Toei'), '地下鉄');
  assert.equal(railCategory(RW('Toei.Oedo'), 'Toei'), '地下鉄');
  assert.equal(railCategory(RW('Toei.Arakawa'), 'Toei'), 'モノレール・新交通・路面電車');
  assert.equal(railCategory(RW('Toei.NipporiToneri'), 'Toei'), 'モノレール・新交通・路面電車');
});

test('横浜市営地下鉄は地下鉄', () => {
  assert.equal(railCategory(RW('YokohamaMunicipal.Blueline'), 'YokohamaMunicipal'), '地下鉄');
});

test('大手私鉄は私鉄', () => {
  for (const op of ['Tobu', 'Seibu', 'Keio', 'Odakyu', 'Keikyu', 'Tokyu', 'Sotetsu', 'Keisei']) {
    assert.equal(railCategory(RW(`${op}.Line`), op), '私鉄', `${op} が私鉄になっていない`);
  }
});

test('ゆりかもめ・多摩モノレールは新交通の側', () => {
  assert.equal(railCategory(RW('Yurikamome.Yurikamome'), 'Yurikamome'), 'モノレール・新交通・路面電車');
  assert.equal(railCategory(RW('TamaMonorail.TamaMonorail'), 'TamaMonorail'), 'モノレール・新交通・路面電車');
});

test('第三セクターは私鉄に混ぜず「その他」', () => {
  assert.equal(railCategory(RW('TWR.Rinkai'), 'TWR'), 'その他');
  assert.equal(railCategory(RW('MIR.TX'), 'MIR'), 'その他');
});

test('判らないものは勝手に分類せず「その他」', () => {
  assert.equal(railCategory(RW('Unknown.Line'), 'Unknown'), 'その他');
  assert.equal(railCategory('', null), 'その他');
});

test('事業者 ID を渡さなくても路線 ID から判る', () => {
  assert.equal(railCategory(RW('TokyoMetro.Tozai')), '地下鉄');
});

test('区分の名前にデータ提供元の言葉が混ざっていない', () => {
  for (const c of [...RAIL_CATEGORIES, ...BUS_CATEGORIES]) {
    assert(!/odpt|ODPT|API|オープンデータ/i.test(c), `区分名が内部用語になっている: ${c}`);
  }
});

console.log('\nバスの区分');

test('都営・市営は公営バス', () => {
  assert.equal(busCategory('Toei', '東京都交通局'), '公営バス');
  assert.equal(busCategory('YokohamaMunicipal', '横浜市交通局'), '公営バス');
});

test('私鉄系は民営バス', () => {
  assert.equal(busCategory('TokyuBus', '東急バス'), '民営バス');
  assert.equal(busCategory('KeioBus', '京王バス'), '民営バス');
  assert.equal(busCategory('KantoBus', '関東バス'), '民営バス');
});

test('ID が判らなくても名前から見当を付ける', () => {
  assert.equal(busCategory(null, '川崎市交通局'), '公営バス');
  assert.equal(busCategory(null, '〇〇バス'), '民営バス');
});

test('どちらとも言えなければ「その他」', () => {
  assert.equal(busCategory(null, ''), 'その他');
  assert.equal(busCategory('Nazo', 'なぞの会社'), 'その他');
});

console.log('\n並び順');

test('JR → 地下鉄 → 私鉄 の順に並ぶ', () => {
  const shuffled = ['私鉄', 'その他', 'JR', '地下鉄'];
  shuffled.sort((a, b) => categoryOrder(RAIL_CATEGORIES, a) - categoryOrder(RAIL_CATEGORIES, b));
  assert.deepEqual(shuffled, ['JR', '地下鉄', '私鉄', 'その他']);
});

test('一覧に無い区分は最後に回す', () => {
  assert(categoryOrder(RAIL_CATEGORIES, '知らない区分') >= RAIL_CATEGORIES.length);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);

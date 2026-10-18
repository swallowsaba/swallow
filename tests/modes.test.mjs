/**
 * 「電車 ○ 本」の数え方のテスト
 *   node tests/modes.test.mjs
 *
 * 【何が起きていたか】
 * 行程には電車が 4 本しか出ていないのに、見出しだけ「電車 5 本」になっていた。
 * 原因は数え方。レグを
 *
 *     経由 → 乗換 → バス → それ以外は電車
 *
 * の順に振り分けていたため、**両端の徒歩(walkAccess)が「電車」に落ちていた**。
 * 歩いた回数も 1 回少なく出ていた。
 *
 * 画面に出る数字が実際の行程と食い違うと、他の表示まで疑われる。
 * 乗り物でないものを先に外して数える。
 */

import assert from 'node:assert/strict';
import { countModes } from '../transit/js/ui.js';

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

const walkAccess = (side) => ({ walkAccess: true, kind: 'walk', side, minutes: 17 });
const transfer = () => ({ transfer: true, kind: 'walk', minutes: 5 });
const rail = (rw) => ({ railway: rw, departure: 0, arrival: 10 });
const bus = () => ({ bus: true, departure: 0, arrival: 10 });
const via = () => ({ via: true, label: '経由地', arrival: 10 });

test('両端の徒歩を電車に数えない', () => {
  const legs = [walkAccess('from'), rail('A'), transfer(), rail('B'), rail('C')];
  const m = countModes({ legs });
  assert.equal(m.rail, 3, '電車は 3 本');
});

test('両端の徒歩も徒歩に数える', () => {
  const legs = [walkAccess('from'), rail('A'), transfer(), rail('B'), walkAccess('to')];
  const m = countModes({ legs });
  assert.equal(m.walk, 3, '出発側 + 乗換 + 到着側');
});

test('乗り換えのうち、歩かないもの(同一ホーム等)は徒歩に数えない', () => {
  const legs = [rail('A'), { transfer: true, kind: 'same', minutes: 0 }, rail('B')];
  assert.equal(countModes({ legs }).walk, 0);
});

test('バスと電車を取り違えない', () => {
  const legs = [walkAccess('from'), bus(), transfer(), rail('A')];
  const m = countModes({ legs });
  assert.equal(m.bus, 1);
  assert.equal(m.rail, 1);
});

test('経由地は乗り物でも徒歩でもない', () => {
  const legs = [rail('A'), via(), rail('B')];
  const m = countModes({ legs });
  assert.equal(m.via, 1);
  assert.equal(m.rail, 2);
  assert.equal(m.walk, 0);
});

test('徒歩だけの経路は電車 0 本', () => {
  const m = countModes({ legs: [walkAccess('from')] });
  assert.deepEqual(m, { rail: 0, bus: 0, walk: 1, via: 0 });
});

test('レグが無くても落ちない', () => {
  assert.deepEqual(countModes({}), { rail: 0, bus: 0, walk: 0, via: 0 });
});

console.log(`\n${passed} 件のテストが成功`);

/**
 * 地図の補助関数のテスト(Leaflet も DOM も使わない部分)
 *   node tests/map.test.mjs
 */

import assert from 'node:assert/strict';
import { TransitNetwork } from '../transit/js/network.js';
import { distanceKm, routeToPoints, routeToSegments, SEGMENT_STYLE } from '../transit/js/map.js';

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

const RW = 'odpt.Railway:TokyoMetro.Ginza';
const ST = (n) => `odpt.Station:TokyoMetro.Ginza.${n}`;

const NET = new TransitNetwork(
  {
    railways: [
      {
        id: RW,
        title: '銀座線',
        operator: 'TokyoMetro',
        ascending: 'odpt.RailDirection:TokyoMetro.Asakusa',
        descending: 'odpt.RailDirection:TokyoMetro.Shibuya',
        stations: [ST('Shibuya'), ST('Omotesando'), ST('Aoyama'), ST('Akasaka')],
      },
    ],
    stations: [
      { id: ST('Shibuya'), title: '渋谷', railway: RW, lat: 35.658, lon: 139.7016, connecting: [] },
      { id: ST('Omotesando'), title: '表参道', railway: RW, lat: 35.6652, lon: 139.7124, connecting: [] },
      { id: ST('Aoyama'), title: '青山一丁目', railway: RW, lat: 35.6725, lon: 139.724, connecting: [] },
      { id: ST('Akasaka'), title: '赤坂見附', railway: RW, lat: 35.6772, lon: 139.737, connecting: [] },
    ],
    errors: [],
  },
  {}
);

console.log('\n距離');
test('東京駅〜新宿駅はおよそ 6km', () => {
  const km = distanceKm(35.6812, 139.7671, 35.6905, 139.7005);
  assert(km > 5.5 && km < 7, `想定と違う: ${km}`);
});
test('同じ地点は 0km', () => {
  assert.equal(distanceKm(35.68, 139.76, 35.68, 139.76), 0);
});

console.log('\n経路 → 地図の点列');
test('鉄道の経路は通過駅もすべて点にする', () => {
  const route = {
    legs: [{ railway: RW, from: ST('Shibuya'), to: ST('Akasaka'), departure: 540, arrival: 550, stops: 3 }],
  };
  const pts = routeToPoints(route, NET, new Map());
  assert.equal(pts.length, 4, `通過駅が落ちている: ${pts.length}`);
  assert.deepEqual(pts.map((p) => p.title), ['渋谷', '表参道', '青山一丁目', '赤坂見附']);
  assert(pts.every((p) => p.bus === false));
});

test('逆方向でも駅の並びが正しい', () => {
  const route = {
    legs: [{ railway: RW, from: ST('Akasaka'), to: ST('Shibuya'), departure: 540, arrival: 550, stops: 3 }],
  };
  const pts = routeToPoints(route, NET, new Map());
  assert.deepEqual(pts.map((p) => p.title), ['赤坂見附', '青山一丁目', '表参道', '渋谷']);
});

test('バスのレグは座標が判っているバス停だけ点にする', () => {
  const index = new Map([
    ['pole:A', { id: 'pole:A', title: '桜台三丁目', lat: 35.74, lon: 139.66 }],
    // pole:B は座標を持っていない(系統データからは名前しか取れない)
  ]);
  const route = {
    legs: [
      {
        bus: true,
        from: 'pole:A',
        to: 'pole:B',
        fromTitle: '桜台三丁目',
        toTitle: '上野駅前',
        departure: 540,
        arrival: 554,
      },
      { transfer: true, kind: 'walk', from: 'pole:B', to: ST('Shibuya'), minutes: 5 },
      { railway: RW, from: ST('Shibuya'), to: ST('Omotesando'), departure: 560, arrival: 566, stops: 1 },
    ],
  };
  const pts = routeToPoints(route, NET, index);
  assert.deepEqual(pts.map((p) => p.title), ['桜台三丁目', '渋谷', '表参道']);
  assert.equal(pts[0].bus, true);
  assert.equal(pts[1].bus, false);
});

test('徒歩のレグは点にしない', () => {
  const route = { legs: [{ transfer: true, kind: 'walk', from: 'a', to: 'b', minutes: 5 }] };
  assert.deepEqual(routeToPoints(route, NET, new Map()), []);
});

test('同じ座標が連続しても重複させない', () => {
  const route = {
    legs: [
      { railway: RW, from: ST('Shibuya'), to: ST('Omotesando'), departure: 540, arrival: 546, stops: 1 },
      { railway: RW, from: ST('Omotesando'), to: ST('Aoyama'), departure: 550, arrival: 556, stops: 1 },
    ],
  };
  const pts = routeToPoints(route, NET, new Map());
  assert.deepEqual(pts.map((p) => p.title), ['渋谷', '表参道', '青山一丁目']);
});

test('未知の路線は無視して落ちない', () => {
  const route = { legs: [{ railway: 'odpt.Railway:Unknown.X', from: 'a', to: 'b' }] };
  assert.deepEqual(routeToPoints(route, NET, new Map()), []);
});

console.log('\n経路 → 地図の区間');

test('乗り物ごとに区間を分ける', () => {
  const index = new Map([['pole:A', { id: 'pole:A', title: '桜台三丁目', lat: 35.74, lon: 139.66 }]]);
  const route = {
    legs: [
      { walkAccess: true, kind: 'walk', side: 'from', fromTitle: '地点', toTitle: '桜台三丁目', lat: 35.741, lon: 139.661, minutes: 4 },
      { bus: true, from: 'pole:A', to: 'pole:B', fromTitle: '桜台三丁目', toTitle: '渋谷駅前', departure: 540, arrival: 554, lineTitle: '渋88' },
      { transfer: true, kind: 'walk', from: 'pole:B', to: ST('Shibuya'), minutes: 5 },
      { railway: RW, from: ST('Shibuya'), to: ST('Akasaka'), departure: 560, arrival: 572, stops: 3 },
    ],
  };
  const segs = routeToSegments(route, NET, index);
  assert.deepEqual(segs.map((x) => x.mode), ['walk', 'bus', 'rail']);
  assert.equal(segs[1].title, '渋88');
  assert.equal(segs[2].title, '銀座線');
});

test('徒歩の区間は次の乗車地点まで線にする', () => {
  const index = new Map([['pole:A', { id: 'pole:A', title: '桜台三丁目', lat: 35.74, lon: 139.66 }]]);
  const route = {
    legs: [
      { walkAccess: true, kind: 'walk', side: 'from', fromTitle: '地点', toTitle: '桜台三丁目', lat: 35.741, lon: 139.661, minutes: 4 },
      { bus: true, from: 'pole:A', to: 'pole:A', fromTitle: '桜台三丁目', toTitle: '桜台三丁目', departure: 540, arrival: 554 },
    ],
  };
  const segs = routeToSegments(route, NET, index);
  assert.equal(segs[0].mode, 'walk');
  assert.equal(segs[0].points.length, 2, '徒歩が線になっていない');
  assert.equal(segs[0].points[0].title, '地点');
  assert.equal(segs[0].points[1].title, '桜台三丁目');
});

test('到着側の徒歩は直前の乗車地点から線にする', () => {
  const route = {
    legs: [
      { railway: RW, from: ST('Shibuya'), to: ST('Omotesando'), departure: 540, arrival: 546, stops: 1 },
      { walkAccess: true, kind: 'walk', side: 'to', fromTitle: '表参道', toTitle: '目的地', lat: 35.666, lon: 139.713, minutes: 3 },
    ],
  };
  const segs = routeToSegments(route, NET, new Map());
  const walk = segs.find((x) => x.mode === 'walk');
  assert.equal(walk.points.length, 2);
  assert.equal(walk.points[0].title, '表参道');
  assert.equal(walk.points[1].title, '目的地');
});

test('鉄道の区間は路線の色を持つ', () => {
  const route = { legs: [{ railway: RW, from: ST('Shibuya'), to: ST('Omotesando'), departure: 540, arrival: 546, stops: 1 }] };
  const [seg] = routeToSegments(route, NET, new Map());
  assert.equal(seg.mode, 'rail');
  assert.equal(seg.title, '銀座線');
});

test('点が 1 つも無い区間は捨てる', () => {
  const route = { legs: [{ bus: true, from: 'x', to: 'y', fromTitle: 'X', toTitle: 'Y', departure: 1, arrival: 2 }] };
  assert.deepEqual(routeToSegments(route, NET, new Map()), []);
});

test('印の色は乗り物ごとに違う', () => {
  assert.notEqual(SEGMENT_STYLE.rail.color, SEGMENT_STYLE.bus.color);
  assert.notEqual(SEGMENT_STYLE.bus.color, SEGMENT_STYLE.walk.color);
});

test('乗降する地点だけを major にする(通過駅は印にしない)', () => {
  const route = { legs: [{ railway: RW, from: ST('Shibuya'), to: ST('Akasaka'), departure: 540, arrival: 552, stops: 3 }] };
  const [seg] = routeToSegments(route, NET, new Map());
  const majors = seg.points.filter((p) => p.major).map((p) => p.title);
  assert.deepEqual(majors, ['渋谷', '赤坂見附'], '乗る駅と降りる駅だけが印になるべき');
  assert.equal(seg.points.length, 4, '通過駅の情報自体は保持する');
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);

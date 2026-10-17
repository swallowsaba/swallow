/**
 * 背景地図(タイル)のテスト
 *   node tests/tiles.test.mjs
 *
 * 地理院タイルから OpenStreetMap に替えたときの決まりを固定する。
 *
 * 【なぜ単体テストなのか】
 * OSM の規約は「出典を常時出す」「先読みしない」「no-cache を送らない」など、
 * **設定が正しいかどうか**で決まる。実際のタイルを取りに行かなくても確かめられる
 * ので、Leaflet を偽物に差し替えて設定だけを見る。
 * 見た目はスモークテスト側で確認する。
 */

import assert from 'node:assert/strict';
import { TransitMap, DEFAULT_TILE } from '../transit/js/map.js';

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

/* ------------------------------------------------------------------ *
 *  偽の Leaflet
 * ------------------------------------------------------------------ */

function fakeLeaflet() {
  const made = { tileLayers: [], controls: [], map: null };

  class Layer {
    constructor() {
      this.handlers = new Map();
      this.added = false;
    }
    addTo(map) {
      this.added = true;
      map.layers.add(this);
      return this;
    }
    on(ev, fn) {
      if (!this.handlers.has(ev)) this.handlers.set(ev, []);
      this.handlers.get(ev).push(fn);
      return this;
    }
    fire(ev, arg) {
      for (const fn of this.handlers.get(ev) || []) fn(arg);
    }
  }

  class TileLayer extends Layer {
    constructor(url, opts) {
      super();
      this.url = url;
      this.opts = opts || {};
      made.tileLayers.push(this);
    }
  }

  class FakeMap {
    constructor() {
      this.layers = new Set();
      this.handlers = new Map();
      made.map = this;
    }
    on(ev, fn) {
      if (!this.handlers.has(ev)) this.handlers.set(ev, []);
      this.handlers.get(ev).push(fn);
      return this;
    }
    fire(ev, arg) {
      for (const fn of this.handlers.get(ev) || []) fn(arg);
    }
    removeLayer(layer) {
      this.layers.delete(layer);
      layer.added = false;
    }
  }

  const L = {
    map: () => new FakeMap(),
    tileLayer: (url, opts) => new TileLayer(url, opts),
    layerGroup: () => new Layer(),
    control: {
      layers: (base, overlays, opts) => {
        const c = new Layer();
        c.base = base;
        c.opts = opts;
        made.controls.push(c);
        return c;
      },
    },
  };
  return { L, made };
}

/** localStorage の代わり。読めない状態も作れるようにする。 */
function installStorage({ broken = false, initial = null } = {}) {
  const store = new Map();
  if (initial) store.set('kanto-transit:tile', initial);
  globalThis.localStorage = {
    getItem: (k) => {
      if (broken) throw new Error('保存が拒否されています');
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('保存が拒否されています');
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  };
  return store;
}

/** 地図を 1 つ作って、偽 Leaflet の記録を返す */
function build({ storage = {}, handlers = {} } = {}) {
  const store = installStorage(storage);
  const { L, made } = fakeLeaflet();
  globalThis.window = { L };
  const map = new TransitMap({}, handlers);
  const ok = map.init();
  assert.equal(ok, true, '地図を作れていない');
  return { map, made, store };
}

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/* ================================================================== */
console.log('\n既定の背景地図');

test('既定は OpenStreetMap', () => {
  assert.equal(DEFAULT_TILE, 'osm');
  const { map } = build();
  assert.equal(map.activeTile, 'osm');
  assert.equal(map.tileLabel(), 'OpenStreetMap');
});

// 規約で URL の形まで決められている。勝手に別のホストや拡張子にしない。
test('OSM の URL は規約どおりの形', () => {
  const { made } = build();
  const osm = made.tileLayers.find((t) => t.url.includes('openstreetmap'));
  assert.equal(osm.url, OSM_URL);
  assert(osm.url.startsWith('https://'), 'http:// は規約で禁止されている');
});

test('地理院タイルも残っている', () => {
  const { made } = build();
  const gsi = made.tileLayers.find((t) => t.url.includes('cyberjapandata'));
  assert(gsi, '地理院タイルが消えている');
  assert(gsi.url.startsWith('https://'));
});

test('はじめに地図へ載るのは OSM だけ', () => {
  const { made } = build();
  const added = made.tileLayers.filter((t) => t.added);
  assert.equal(added.length, 1, `背景地図が ${added.length} 枚載っている`);
  assert(added[0].url.includes('openstreetmap'));
});

/* ================================================================== */
console.log('\n出典表示(両方とも表示が条件)');

test('OSM の出典が入っている', () => {
  const { made } = build();
  const osm = made.tileLayers.find((t) => t.url.includes('openstreetmap'));
  assert(/OpenStreetMap/.test(osm.opts.attribution), '出典に OpenStreetMap が無い');
  assert(/contributors/.test(osm.opts.attribution), '「contributors」が無い');
  assert(
    /openstreetmap\.org\/copyright/.test(osm.opts.attribution),
    '著作権ページへのリンクが無い'
  );
});

test('地理院タイルの出典が入っている', () => {
  const { made } = build();
  const gsi = made.tileLayers.find((t) => t.url.includes('cyberjapandata'));
  assert(/地理院タイル/.test(gsi.opts.attribution));
});

// 出典は Leaflet が選択中のレイヤーのものに自動で入れ替える。
// 自前で書くと、使っていない方の出典を出し続ける事故が起きる。
test('出典はレイヤーごとに持たせている(自前で固定しない)', () => {
  const { made } = build();
  for (const t of made.tileLayers) {
    assert(t.opts.attribution, `出典を持たないタイルがある: ${t.url}`);
  }
  const attrs = new Set(made.tileLayers.map((t) => t.opts.attribution));
  assert.equal(attrs.size, made.tileLayers.length, '出典が使い回されている');
});

/* ================================================================== */
console.log('\n規約で禁止されていること');

// 「Cache-Control: no-cache を既定で送るな」と明記されている。
// タイルの取得にこちらから no-cache を付けないこと。
test('タイルに no-cache を付けていない', () => {
  const { made } = build();
  for (const t of made.tileLayers) {
    const json = JSON.stringify(t.opts);
    assert(!/no-cache/i.test(json), `no-cache を付けている: ${t.url}`);
  }
});

// 表示していないタイルの先読みは禁止。Leaflet の keepBuffer を広げたり
// 事前取得の仕組みを足したりしないこと。
test('先読みの設定を入れていない', () => {
  const { made } = build();
  for (const t of made.tileLayers) {
    assert.equal(t.opts.keepBuffer, undefined, '先読みの設定が入っている');
    assert.equal(t.opts.bounds, undefined);
  }
});

test('ズームの範囲を決めている(広域で無駄に取りに行かない)', () => {
  const { made } = build();
  const osm = made.tileLayers.find((t) => t.url.includes('openstreetmap'));
  const gsi = made.tileLayers.find((t) => t.url.includes('cyberjapandata'));
  assert.equal(osm.opts.minZoom, 9);
  assert.equal(osm.opts.maxZoom, 19);
  // 地理院の淡色地図は 18 まで。19 を指定すると空のタイルを取りに行く。
  assert.equal(gsi.opts.maxZoom, 18);
});

/* ================================================================== */
console.log('\n切り替え');

test('右上に切り替えを出す', () => {
  const { made } = build();
  assert.equal(made.controls.length, 1, '切り替えが出ていない');
  assert.equal(made.controls[0].opts.position, 'topright');
});

test('切り替えの選択肢は日本語と OSM の 2 つ', () => {
  const { made } = build();
  const labels = Object.keys(made.controls[0].base);
  assert.deepEqual(labels.sort(), ['OpenStreetMap', '地理院タイル']);
});

test('選んだ背景地図を覚える', () => {
  const { made, store } = build();
  const gsi = made.tileLayers.find((t) => t.url.includes('cyberjapandata'));
  made.map.fire('baselayerchange', { layer: gsi });
  assert.equal(store.get('kanto-transit:tile'), 'gsi');
});

test('次に開いたときは覚えた方を出す', () => {
  const { map, made } = build({ storage: { initial: 'gsi' } });
  assert.equal(map.activeTile, 'gsi');
  const added = made.tileLayers.filter((t) => t.added);
  assert.equal(added.length, 1);
  assert(added[0].url.includes('cyberjapandata'));
});

test('覚えた値が壊れていれば既定に戻る', () => {
  const { map } = build({ storage: { initial: 'ないタイル' } });
  assert.equal(map.activeTile, 'osm');
});

// プライベートウィンドウなどで localStorage が使えないことがある。
// そこで落ちると地図が出なくなるので、必ず動くこと。
test('保存が使えなくても地図は出る', () => {
  const { map } = build({ storage: { broken: true } });
  assert.equal(map.activeTile, 'osm');
  assert.equal(map.ready, true);
});

/* ================================================================== */
console.log('\n読めなくなったときの逃げ道');

/** タイルの失敗を n 回起こす */
function failTimes(made, n, which = 'openstreetmap') {
  const layer = made.tileLayers.find((t) => t.url.includes(which));
  for (let i = 0; i < n; i += 1) layer.fire('tileerror', {});
  return layer;
}

// OSM は best-effort で、過剰な利用は予告なく遮断されると規約に書かれている。
test('続けて読めなければ地理院タイルに切り替わる', () => {
  const calls = [];
  const { map, made } = build({ handlers: { onTileFallback: (x) => calls.push(x) } });
  failTimes(made, 6);
  assert.equal(map.activeTile, 'gsi', '切り替わっていない');
  assert.equal(calls.length, 1, '呼び出し側に知らせていない');
  assert.equal(calls[0].from, 'OpenStreetMap');
  assert.equal(calls[0].to, '地理院タイル');
});

test('切り替わると、載っているのは地理院タイルだけ', () => {
  const { made } = build();
  failTimes(made, 6);
  const added = made.tileLayers.filter((t) => t.added);
  assert.equal(added.length, 1);
  assert(added[0].url.includes('cyberjapandata'));
});

// 端のタイルが 1 枚無いだけで地図が入れ替わると、かえって驚かせる。
test('数回の失敗では切り替えない', () => {
  const { map, made } = build();
  failTimes(made, 5);
  assert.equal(map.activeTile, 'osm', '早すぎる切り替え');
});

test('間に 1 枚でも読めたら、数え直す', () => {
  const { map, made } = build();
  const osm = failTimes(made, 5);
  osm.fire('tileload', {});
  failTimes(made, 5);
  assert.equal(map.activeTile, 'osm', '連続していない失敗で切り替えている');
});

test('選んでいない方の失敗では切り替えない', () => {
  const { map, made } = build();
  failTimes(made, 6, 'cyberjapandata'); // 表示していない地理院側のエラー
  assert.equal(map.activeTile, 'osm');
});

test('黙って切り替えない(知らせる手段が無くても落ちない)', () => {
  const { map, made } = build(); // onTileFallback を渡していない
  failTimes(made, 6);
  assert.equal(map.activeTile, 'gsi');
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);

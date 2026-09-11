/**
 * UI スモークテスト(Playwright + モックサーバ)
 *   node tests/mock-server.mjs 8099 &
 *   node tests/ui.smoke.mjs
 *
 * 目的は「壊れていないこと」の確認:
 *   ・JS エラーが出ない
 *   ・検索して結果カードが描画される
 *   ・運行情報の警告が出る
 *   ・除外を入れると経路が変わる
 *   ・スクリーンショットを保存(モバイル / デスクトップ)
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

/**
 * Leaflet の最小スタブ。
 * この環境は CDN にも npm にも到達できないため本物を用意できない。
 * 地図描画そのものは検証できないが、
 * 「マーカーを作る → タップ → 出発/到着に設定する」という
 * こちらのコードの筋道は、これで確認できる。
 */
const LEAFLET_STUB = () => {
  window.__map = { markers: [], routes: [], tiles: [] };
  const layerGroup = () => ({
    layers: [],
    clearLayers() { this.layers.length = 0; return this; },
    addTo() { return this; },
  });
  const marker = (latlng, opts) => ({
    latlng, opts, handlers: {},
    bindTooltip(t) { this.tooltip = t; return this; },
    bindPopup(c) { this.popup = c; return this; },
    openPopup() { document.body.appendChild(this.popup); return this; },
    closePopup() { this.popup?.remove(); return this; },
    on(ev, fn) { this.handlers[ev] = fn; return this; },
    addTo(g) { g.layers?.push(this); return this; },
  });
  window.L = {
    map: () => {
      const m = {
        handlers: {},
        zoom: 15,
        setView() { return this; },
        fitBounds() { return this; },
        on(ev, fn) { this.handlers[ev] = fn; return this; },
        invalidateSize() {},
        getZoom() { return this.zoom; },
        getBounds() {
          return {
            getNorth: () => 35.75,
            getSouth: () => 35.60,
            getEast: () => 139.75,
            getWest: () => 139.50,
          };
        },
      };
      window.__map.instance = m;
      return m;
    },
    tileLayer: (url) => ({ addTo() { window.__map.tiles.push(url); return this; } }),
    layerGroup,
    circleMarker: (latlng, opts) => {
      const m = marker(latlng, opts);
      window.__map.markers.push(m);
      return m;
    },
    polyline: (pts, opts) => ({
      bindTooltip(t) { this.tooltip = t; return this; },
      addTo() { window.__map.routes.push({ points: pts, opts }); return this; },
    }),
    latLngBounds: () => ({ pad() { return this; } }),
    DomEvent: { stopPropagation() {} },
  };
};

const BASE = 'http://localhost:8099';
const URL = `${BASE}/?worker=${BASE}`;

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // このサンドボックスは CDN に到達できない。リソース取得の失敗は
    // アプリの不具合ではないので、エラー扱いしない。
    if (/Failed to load resource|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  return { ctx, page };
}

async function search(page, from, to) {
  await page.fill('#from-input', from);
  await page.waitForSelector('#from-list li[role="option"]');
  await page.click('#from-list li[role="option"]');
  await page.fill('#to-input', to);
  await page.waitForSelector('#to-list li[role="option"]');
  await page.click('#to-list li[role="option"]');
  await page.fill('#depart-input', '2026-09-02T09:00');
  await page.click('#search-btn');
  await page.waitForSelector('.route, .empty strong', { timeout: 15000 });
}

/* ---------------- デスクトップ ---------------- */
{
  const { ctx, page } = await newPage({ width: 1200, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.waitForSelector('#status-card', { state: 'attached' });

  // 提供終了した事業者は、黙って欠けさせず理由を出す
  await page.click('#coverage-toggle');
  await page.waitForSelector('#coverage-unsupported li');
  const cov = await page.textContent('#coverage-unsupported');
  const sup = await page.textContent('#coverage-supported');
  assert(sup.includes('京王バス'), 'GTFS で取り込んだ事業者が対応側に出ていない');
  assert(/取り込み済み/.test(sup), '取り込み済みである旨が出ていない');
  assert(!cov.includes('京王バス'), '取り込み済みなのに非対応側にも出ている');
  console.log('  ok  GTFS を取り込んだ事業者は対応側に取り込み日つきで表示');
  await page.click('#coverage-toggle');

  await search(page, '渋谷', '大手町');

  const routes = await page.$$('.route');
  assert(routes.length >= 1, '結果カードが描画されていない');
  console.log(`  ok  結果カード ${routes.length} 件`);

  const firstTime = await page.textContent('.route .route__time');
  assert(/分|時間/.test(firstTime), `所要時間の表示が不正: ${firstTime}`);
  console.log(`  ok  所要時間: ${firstTime.trim()}`);

  const span = await page.textContent('.route .route__span');
  assert(/\d\d:\d\d → \d\d:\d\d/.test(span), `発着時刻の表示が不正: ${span}`);
  console.log(`  ok  発着: ${span.trim()}`);

  // 運行情報は折りたたみ。見出しの要約でわかり、押すと開く
  const summary = await page.textContent('#status-summary');
  assert(/運転見合わせ 1 件/.test(summary), `要約が出ていない: ${summary}`);
  assert(!(await page.isVisible('#status-body')), '運行情報が既定で開いている');
  console.log(`  ok  運行情報は折りたたみ(要約: ${summary.trim()})`);
  await page.click('#status-toggle');
  await page.waitForSelector('#status-body', { state: 'visible' });
  const statusText = await page.textContent('#status-body');
  assert(statusText.includes('運転見合わせ'), '運転見合わせが表示されていない');
  assert(statusText.includes('遅延'), '遅延が表示されていない');
  console.log('  ok  開くと運行情報の分類が表示されている');
  await page.click('#status-toggle');
  await page.waitForTimeout(150);
  assert(!(await page.isVisible('#status-body')), 'もう一度押しても閉じない');
  console.log('  ok  もう一度押すと閉じる');

  // 取得時刻スタンプ
  const stamp = await page.textContent('#foot-status-stamp');
  assert(/運行情報: \d\d:\d\d 時点/.test(stamp), `取得時刻が出ていない: ${stamp}`);
  console.log(`  ok  ${stamp.trim()}`);

  // 並べ替え
  await page.click('.sorter__btn[data-sort="transfers"]');
  await page.waitForTimeout(200);
  const t0 = Number((await page.textContent('.route .route__meta')).match(/乗換 (\d+) 回/)[1]);
  const all = await page.$$eval('.route .route__meta', (els) =>
    els.map((e) => Number(e.textContent.match(/乗換 (\d+) 回/)[1]))
  );
  assert.deepEqual(all, [...all].sort((a, b) => a - b), '乗換回数でソートされていない');
  console.log(`  ok  乗換回数で並べ替え(先頭 ${t0} 回)`);

  await page.screenshot({ path: 'tests/screenshot-desktop.png', fullPage: true });

  // 直通バスが鉄道と並んで出ているか
  {
    await page.fill('#from-input', '渋谷');
    await page.waitForSelector('#from-list li[role="option"]');
    await page.click('#from-list li[role="option"]');
    await page.fill('#to-input', '新橋');
    await page.waitForSelector('#to-list li[role="option"]');
    await page.click('#to-list li[role="option"]');
    await page.click('#search-btn');
    await page.waitForSelector('.route, .empty strong', { timeout: 15000 });
    await page.waitForTimeout(500);
    const busCards = await page.$$('.badge--bus');
    assert(busCards.length >= 1, 'バスの経路が出ていない');
    const busText = await page.textContent('.route:has(.badge--bus)');
    assert(busText.includes('渋谷駅前'), 'バス停名が出ていない');
    assert(busText.includes('停留所'), '停留所数が出ていない');
    console.log(`  ok  直通バスが ${busCards.length} 件表示された`);
    await page.screenshot({ path: 'tests/screenshot-bus.png', fullPage: true });

    // チェックを外すとバスが消える
    await page.uncheck('#include-bus');
    await page.waitForTimeout(1500);
    assert.equal((await page.$$('.badge--bus')).length, 0, 'チェックを外してもバスが出ている');
    console.log('  ok  チェックを外すとバスを検索しない');
    await page.check('#include-bus');
    await page.waitForTimeout(1200);
  }

  // バス停を出発地にして、バス→鉄道の乗り継ぎが出るか
  {
    await page.fill('#from-input', '桜台三丁目');
    await page.waitForSelector('#from-list li[role="option"]');
    const items = await page.$$('#from-list li[role="option"]');
    let picked = false;
    for (const li of items) {
      const t = await li.textContent();
      if (t.includes('バス停として検索')) {
        await li.click();
        picked = true;
        break;
      }
    }
    assert(picked, 'バス停として検索する候補が出ていない');
    await page.waitForFunction(() => document.querySelector('#from-hint').textContent.includes('都営バス'), null, {
      timeout: 10000,
    });
    await page.fill('#to-input', '大手町');
    await page.waitForSelector('#to-list li[role="option"]');
    await page.click('#to-list li[role="option"]');
    await page.click('#search-btn');
    await page.waitForSelector('.route, .empty strong', { timeout: 20000 });
    await page.waitForTimeout(600);

    const mixed = await page.$$('.badge--bus');
    assert(mixed.length >= 1, 'バスと鉄道の乗り継ぎ経路が出ていない');
    const txt = await page.textContent('.route:has(.badge--bus)');
    assert(txt.includes('桜台三丁目'), 'バス停名が出ていない');
    assert(txt.includes('徒歩'), '徒歩の乗り継ぎが出ていない');
    assert(txt.includes('上野'), '乗り継ぎ駅が出ていない');
    console.log('  ok  バス停発 → バス → 徒歩 → 鉄道 の複合経路が出た');
    await page.screenshot({ path: 'tests/screenshot-intermodal.png', fullPage: true });
  }

  // 地図(ライブラリが読めない環境なので、理由が表示されることを確認する)
  {
    await page.click('#map-toggle');
    await page.waitForTimeout(800);
    assert(!(await page.isVisible('#map')), 'Leaflet が無いのに地図が開いている');
    const alerts = await page.textContent('#alerts');
    assert(alerts.includes('地図を読み込めませんでした'), '地図が使えない理由が表示されていない');
    console.log('  ok  地図ライブラリが無いときは理由を表示し、他の機能は動く');
  }

  // GTFS から取り込んだ事業者(京王バス)の直通バスが出る
  {
    await page.fill('#from-input', '渋谷駅前');
    await page.waitForSelector('#from-list li[role="option"]');
    const items = await page.$$('#from-list li[role="option"]');
    for (const li of items) {
      const t = await li.textContent();
      if (t.includes('バス停として検索')) { await li.click(); break; }
    }
    await page.waitForFunction(() => /バス/.test(document.querySelector('#from-hint').textContent), null, { timeout: 10000 });
    await page.fill('#to-input', '調布駅北口');
    await page.waitForSelector('#to-list li[role="option"]');
    const dst = await page.$$('#to-list li[role="option"]');
    for (const li of dst) {
      const t = await li.textContent();
      if (t.includes('バス停として検索')) { await li.click(); break; }
    }
    await page.waitForFunction(() => /京王バス/.test(document.querySelector('#to-hint').textContent), null, { timeout: 10000 });
    await page.fill('#depart-input', '2026-09-02T09:00');
    await page.click('#search-btn');
    await page.waitForSelector('.route, .empty strong', { timeout: 20000 });
    await page.waitForTimeout(500);

    const cards = await page.textContent('#results-body');
    assert(cards.includes('渋33'), `GTFS の系統が出ていない: ${cards.slice(0, 300)}`);
    assert(cards.includes('09:05'), '取り込んだダイヤの時刻が出ていない');
    const alerts = await page.textContent('#alerts');
    assert(/京王バス.*取り込み/.test(alerts), `取り込み日の断りが出ていない: ${alerts.slice(0, 200)}`);
    console.log('  ok  GTFS から取り込んだ京王バスの経路が出る(取り込み日を明示)');
    await page.screenshot({ path: 'tests/screenshot-gtfs.png', fullPage: true });
  }

  // 経由地と滞在時間
  {
    await page.fill('#from-input', '渋谷');
    await page.waitForSelector('#from-list li[role="option"]');
    await page.click('#from-list li[role="option"]');
    await page.fill('#to-input', '浅草');
    await page.waitForSelector('#to-list li[role="option"]');
    await page.click('#to-list li[role="option"]');
    await page.fill('#depart-input', '2026-09-02T09:00');
    await page.click('#search-btn');
    await page.waitForSelector('.route', { timeout: 20000 });
    const plain = await page.textContent('.route .route__span');

    await page.click('#via-add');
    await page.waitForSelector('.via');
    await page.fill('.via input[type="text"]', '大手町');
    await page.waitForSelector('.via .suggest li[role="option"]');
    await page.click('.via .suggest li[role="option"]');
    await page.fill('.via input[type="number"]', '30');
    await page.click('#search-btn');
    await page.waitForSelector('.route, .empty strong', { timeout: 25000 });
    await page.waitForTimeout(400);

    const card = await page.textContent('.route');
    assert(card.includes('大手町'), '経由地が行程に出ていない');
    assert(/ここに 30分 とどまる/.test(card), `滞在時間が出ていない: ${card.slice(0, 200)}`);
    assert(card.includes('経由 1 箇所'), '経由の件数が出ていない');
    const viaSpan = await page.textContent('.route .route__span');
    assert.notEqual(viaSpan, plain, '経由地を入れても結果が変わっていない');
    console.log('  ok  経由地 + 滞在30分が経路に反映された');
    await page.screenshot({ path: 'tests/screenshot-via.png', fullPage: true });

    // 電車とバスの内訳が出ている
    const modes = await page.textContent('.route .route__modes');
    assert(/電車 \d+ 本/.test(modes), `内訳が出ていない: ${modes}`);
    const modeTags = await page.$$eval('.leg--rail .leg__mode--rail', (els) => els.map((e) => e.textContent));
    assert(modeTags.length >= 1 && modeTags.every((t) => t === '電車'), '行程に「電車」のラベルが無い');
    console.log(`  ok  経路の内訳と行程のモード表示(${modes.trim()})`);

    // 経由地を消すと元に戻る
    await page.click('.via__del');
    await page.waitForTimeout(1500);
    assert.equal((await page.$$('.via')).length, 0, '経由地が消えていない');
    console.log('  ok  経由地を削除できる');
  }

  // 除外を入れると結果が変わる
  const before = await page.$$eval('.route .route__span', (els) => els.map((e) => e.textContent));
  await page.click('.excludes__add summary');
  await page.waitForSelector('#ex-railway', { state: 'visible' });
  await page.selectOption('#ex-railway', { label: '銀座線' });
  await page.click('#ex-add-line');
  await page.waitForTimeout(1500);
  const chips = await page.$$eval('.chip-x', (els) => els.map((e) => e.textContent));
  assert(chips.some((c) => c.includes('銀座線')), '除外チップが出ていない');
  const after = await page.$$eval('.route .route__span, .empty strong', (els) => els.map((e) => e.textContent));
  assert.notDeepEqual(after, before, '除外しても結果が変わっていない');
  console.log(`  ok  除外を反映して再計算(${chips[0].trim()})`);

  await page.screenshot({ path: 'tests/screenshot-excluded.png', fullPage: true });
  await ctx.close();
}

/* ---------------- 地図(Leaflet スタブ) ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror(map): ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/.test(m.text())) return;
    errors.push(`console(map): ${m.text()}`);
  });
  await page.addInitScript(LEAFLET_STUB);
  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.click('#map-toggle');
  await page.waitForTimeout(500);
  assert(await page.isVisible('#map'), '地図が開かない');

  const tiles = await page.evaluate(() => window.__map.tiles);
  assert(tiles.some((t) => t.includes('cyberjapandata.gsi.go.jp')), '地理院タイルを使っていない');
  console.log('  ok  地理院タイルを読み込む設定になっている');

  const markerCount = await page.evaluate(() => window.__map.markers.length);
  assert(markerCount > 10, `駅のマーカーが少なすぎる: ${markerCount}`);
  console.log(`  ok  駅のマーカーを ${markerCount} 個作成`);

  // マーカーのクリックハンドラを呼び、ポップアップから「出発に設定」する
  const title = await page.evaluate(() => {
    const m = window.__map.markers[0];
    m.handlers.click({});
    return m.tooltip;
  });
  await page.waitForSelector('.map-pick__actions', { timeout: 5000 });
  await page.click('.map-pick__actions button:nth-child(1)');
  await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#from-input'), title, '地図から出発地を設定できていない');
  assert((await page.textContent('#from-hint')).includes('地図'), 'ヒントが出ていない');
  console.log(`  ok  地図から出発地を設定(${title})`);

  // 到着も設定して検索し、経路を地図に描く
  const title2 = await page.evaluate(() => {
    const m = window.__map.markers.find((x) => x.tooltip === '大手町');
    m.handlers.click({});
    return m.tooltip;
  });
  await page.waitForSelector('.map-pick__actions', { timeout: 5000 });
  await page.click('.map-pick__actions button:nth-child(2)');
  await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#to-input'), title2);

  await page.fill('#depart-input', '2026-09-02T09:00');
  await page.click('#search-btn');
  await page.waitForSelector('.route', { timeout: 20000 });
  // 地図が開いていれば、検索しただけで乗降地点の印が出る
  assert.equal(await page.evaluate(() => window.__map.routes.length), 0, '直線を引いてはいけない');
  const auto = await page.evaluate(() => window.__map.markers.filter((m) => /^\d+\. /.test(m.tooltip || '')).length);
  assert(auto > 0, '検索しても経路の印が出ない');
  assert(await page.isVisible('#map-legend'), '凡例が出ていない');
  console.log(`  ok  検索すると乗降地点の印を自動で出す(${auto} 箇所・線は引かない)`);
  const shown = await page.textContent('.route .route__map');
  assert.equal(shown.trim(), '地図に表示中', `表示中の印が出ていない: ${shown}`);

  // 別の案に切り替えると、その案の印が作り直される
  const before = await page.evaluate(() => window.__map.markers.filter((m) => /^\d+\. /.test(m.tooltip || '')).length);
  await page.click('.route .route__map');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__map.markers.filter((m) => /^\d+\. /.test(m.tooltip || '')).length);
  assert(after > before, '「地図で見る」で印が作り直されていない');
  console.log(`  ok  「地図で見る」で乗降地点を表示(${after - before} 箇所)`);

  // GTFS のバス停が表示範囲に出る(ODPT では出せなかったもの)
  {
    await page.waitForFunction(
      () => window.__map.markers.some((m) => /バス停/.test(m.tooltip || '')),
      null,
      { timeout: 8000 }
    );
    const busStops = await page.evaluate(() =>
      window.__map.markers.filter((m) => /バス停/.test(m.tooltip || '')).map((m) => m.tooltip)
    );
    assert(busStops.some((t) => t.includes('渋谷駅前')), `GTFS のバス停が出ていない: ${busStops.join(', ')}`);
    assert(await page.isVisible('#map-hint'), '件数の案内が出ていない');
    console.log(`  ok  表示範囲の GTFS バス停を地図に表示(${busStops.length} 件)`);
  }

  // 駅のポップアップから経由地に追加できる
  await page.evaluate(() => {
    const m = window.__map.markers.find((x) => x.tooltip === '上野');
    m.handlers.click({});
  });
  await page.waitForSelector('.map-pick__actions button[data-which="via"]', { timeout: 5000 });
  await page.click('.map-pick__actions button[data-which="via"]');
  await page.waitForSelector('.via', { timeout: 5000 });
  assert.equal(await page.inputValue('.via input[type="text"]'), '上野', '経由地に入っていない');
  console.log('  ok  地図の駅から経由地に追加できる');
  await page.click('.via__del');
  await page.waitForTimeout(200);

  // 地図の任意の場所をタップ → その地点を出発地にできる(徒歩つき)
  await page.evaluate(() => {
    window.__map.instance.handlers.click({ latlng: { lat: 35.659, lng: 139.703 } });
  });
  await page.waitForSelector('.map-pick__actions button[data-which="from"]', { timeout: 5000 });
  const note = await page.textContent('.map-pick__note');
  assert(/最寄/.test(note), `最寄駅の案内が出ていない: ${note}`);
  await page.click('.map-pick__actions button[data-which="from"]');
  await page.waitForTimeout(300);
  const fromVal = await page.inputValue('#from-input');
  assert(/^地点 35\.\d+, 139\.\d+$/.test(fromVal), `地点が入っていない: ${fromVal}`);
  console.log(`  ok  地図の任意地点を出発地にできる(${fromVal})`);

  await page.fill('#depart-input', '2026-09-02T09:00');
  await page.click('#search-btn');
  await page.waitForSelector('.route, .empty strong', { timeout: 25000 });
  await page.waitForTimeout(400);
  const numbered = await page.evaluate(() =>
    window.__map.markers.filter((m) => /^\d+\. /.test(m.tooltip || '')).map((m) => m.tooltip)
  );
  assert(numbered.length >= 2, `乗降地点の印が足りない: ${numbered.length}`);
  assert(numbered[0].startsWith('1. '), `番号が付いていない: ${numbered[0]}`);
  console.log(`  ok  乗降地点に順番の番号を付けて表示(${numbered.length} 箇所)`);

  const walkCard = await page.textContent('.route');
  assert(/徒歩 約\d+分/.test(walkCard), `徒歩の区間が出ていない: ${walkCard.slice(0, 300)}`);
  assert(/直線 約/.test(walkCard), '徒歩時間の根拠(直線距離)が出ていない');
  assert(/推定/.test(walkCard), '徒歩が推定だと明示されていない');
  console.log('  ok  任意地点からの徒歩が推定として経路に入る');
  await page.screenshot({ path: 'tests/screenshot-walk.png', fullPage: true });

  await ctx.close();
}

/* ---------------- モバイル ---------------- */
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await search(page, '新宿', '浅草');
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(w <= 390 + 1, `横スクロールが発生している (scrollWidth=${w})`);
  console.log('  ok  モバイル幅で横スクロールなし');
  await page.screenshot({ path: 'tests/screenshot-mobile.png', fullPage: true });
  await ctx.close();
}

/* ---------------- ダークモード ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, colorScheme: 'dark', locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror(dark): ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await search(page, '渋谷', '上野');
  await page.screenshot({ path: 'tests/screenshot-dark.png', fullPage: true });
  console.log('  ok  ダークモードで描画');
  await ctx.close();
}

await browser.close();

if (errors.length) {
  console.error('\nJS エラーが発生しました:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exitCode = 1;
} else {
  console.log('\nJS エラーなし。スモークテスト成功。\n');
}

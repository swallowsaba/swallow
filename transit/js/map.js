/**
 * 地図(Leaflet + 地理院タイル)
 * ==================================================================
 * 地図から出発地・到着地を選べるようにする。
 *
 * 【何を出せて、何を出せないか】
 * ・駅   … 全駅の座標を持っているので全部プロットできる
 * ・バス停 … ODPT は全停留所を一括取得できず、範囲指定の検索も無いため
 *            「今わかっているバス停」しか出せない。具体的には
 *              - 名前で検索して見つかったバス停
 *              - 表示中の経路に含まれるバス停
 *              - 駅をタップしたときに、その駅名で見つかったバス停
 *
 * Leaflet は CDN から読み込む。読み込めなかった場合でもアプリ本体は
 * そのまま使えるように、地図だけを無効化して理由を表示する。
 */

/** 地理院タイル(出典表示が条件。申請不要) */
const GSI_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

/** 区間ごとの線のスタイル。色だけでなく線の形でも区別する。 */
export const SEGMENT_STYLE = {
  rail: { color: '#00713c', weight: 5, opacity: 0.85, dashArray: null },
  bus: { color: '#1c5fb0', weight: 5, opacity: 0.85, dashArray: '10 7' },
  walk: { color: '#8a4b1c', weight: 4, opacity: 0.9, dashArray: '2 7' },
};

/** 初期表示(東京駅あたり) */
const DEFAULT_CENTER = [35.6812, 139.7671];
const DEFAULT_ZOOM = 12;

export class TransitMap {
  /**
   * @param {HTMLElement} container
   * @param {object} handlers
   *   onPickStation(groupId, title, which) / onPickBusStop(stop, which)
   *   onPickPoint({lat,lon}, which) / describePoint(lat, lon) / onStationBusStops(group)
   *   which は 'from' | 'to' | 'via'
   */
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.map = null;
    this.stationLayer = null;
    this.busLayer = null;
    this.routeLayer = null;
    this.pointLayer = null;
    this.markerByGroup = new Map();
    this.busMarkers = new Map();
    this.pointMarkers = new Map(); // which('from'|'to'|via id) → marker
    this.ready = false;
  }

  /** Leaflet が読めていれば地図を作る。読めていなければ false を返す。 */
  init() {
    if (this.ready) return true;
    if (typeof window.L === 'undefined') return false;
    const L = window.L;

    this.map = L.map(this.container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });
    L.tileLayer(GSI_TILE, {
      attribution: GSI_ATTRIBUTION,
      maxZoom: 18,
      minZoom: 9,
    }).addTo(this.map);

    this.stationLayer = L.layerGroup().addTo(this.map);
    this.busLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);

    this.pointLayer = L.layerGroup().addTo(this.map);

    // 地図の任意の場所をタップ → その地点そのものを出発地・到着地・経由地にできる
    this.map.on('click', (e) => {
      this.#openPointPicker(e.latlng.lat, e.latlng.lng);
    });

    // 表示範囲が変わったら知らせる(範囲内のバス停を出すため)
    const notify = () => this.#notifyView();
    this.map.on('moveend', notify);
    this.map.on('zoomend', notify);

    this.ready = true;
    return true;
  }

  /** コンテナのサイズが変わったあとに呼ぶ(隠れている間に作ると 0px になるため) */
  refresh() {
    if (this.ready) {
      setTimeout(() => {
        this.map.invalidateSize();
        this.#notifyView();
      }, 0);
    }
  }

  /** 今の表示範囲とズーム。読めなければ null。 */
  viewport() {
    if (!this.ready) return null;
    const b = this.map.getBounds?.();
    if (!b) return null;
    return {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
      zoom: this.map.getZoom?.() ?? null,
    };
  }

  /** 表示範囲が変わったことを呼び出し側に伝える(連続する移動はまとめる) */
  #notifyView() {
    if (!this.handlers.onViewChange) return;
    clearTimeout(this.viewTimer);
    this.viewTimer = setTimeout(() => {
      const v = this.viewport();
      if (v) this.handlers.onViewChange(v);
    }, 250);
  }

  /* ---------------- 駅 ---------------- */

  /** 駅グループをすべてプロットする */
  renderStations(net) {
    if (!this.ready) return;
    const L = window.L;
    this.stationLayer.clearLayers();
    this.markerByGroup.clear();

    for (const g of net.groups.values()) {
      if (g.lat == null || g.lon == null) continue;
      const marker = L.circleMarker([g.lat, g.lon], {
        radius: 5,
        weight: 2,
        color: '#00713c',
        fillColor: '#ffffff',
        fillOpacity: 1,
      });
      marker.bindTooltip(g.title, { direction: 'top' });
      marker.on('click', (e) => {
        window.L.DomEvent.stopPropagation(e); // 地図クリック(任意地点)を発火させない
        this.#openPicker(marker, g.title, {
          onPick: (which) => {
            if (this.handlers.onPickStation) this.handlers.onPickStation(g.id, g.title, which);
          },
          onBus: this.handlers.onStationBusStops ? () => this.handlers.onStationBusStops(g) : null,
        });
      });
      marker.addTo(this.stationLayer);
      this.markerByGroup.set(g.id, marker);
    }
  }

  /* ---------------- バス停 ---------------- */

  /**
   * バス停を追加表示する(消さずに足していく)。
   * @param {Array<{id,title,lat,lon}>} stops
   */
  addBusStops(stops) {
    if (!this.ready) return 0;
    const L = window.L;
    let added = 0;
    for (const s of stops || []) {
      if (s.lat == null || s.lon == null) continue;
      if (this.busMarkers.has(s.id)) continue;
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 5,
        weight: 2,
        color: '#1c4f8a',
        fillColor: '#dbe8f7',
        fillOpacity: 1,
      });
      marker.bindTooltip(`${s.title}(バス停)`, { direction: 'top' });
      marker.on('click', (e) => {
        window.L.DomEvent.stopPropagation(e);
        this.#openPicker(marker, `${s.title}(バス停)`, {
          onPick: (which) => {
            if (this.handlers.onPickBusStop) this.handlers.onPickBusStop(s, which);
          },
        });
      });
      marker.addTo(this.busLayer);
      this.busMarkers.set(s.id, marker);
      added += 1;
    }
    return added;
  }

  clearBusStops() {
    if (!this.ready) return;
    this.busLayer.clearLayers();
    this.busMarkers.clear();
  }

  /* ---------------- 経路の表示 ---------------- */

  /**
   * 選んだ経路の乗降地点を地図に示す。
   *
   * 【線は引かない】
   * 線路やバス路線の実際の形(線形)のデータは持っていない。
   * 駅どうしを直線で結んでも実際の走行経路とは違うものになり、
   * 見た人を誤解させるだけなので描かない。
   * 出すのは「どこで乗って、どこで降りるか」の位置だけにする。
   *
   * @param {Array} segments routeToSegments の結果
   */
  renderRoute(segments) {
    if (!this.ready) return;
    const L = window.L;
    this.routeLayer.clearLayers();

    const list = Array.isArray(segments) ? segments : [];
    const marks = [];
    for (const seg of list) {
      for (const p of seg.points || []) {
        if (p.lat == null || p.lon == null) continue;
        // 通過駅は出さない。乗る・降りる・歩く地点だけを示す。
        if (!p.major) continue;
        const last = marks[marks.length - 1];
        if (last && last.lat === p.lat && last.lon === p.lon) continue;
        marks.push(p);
      }
    }
    if (!marks.length) return;

    marks.forEach((p, i) => {
      const isEnd = i === 0 || i === marks.length - 1;
      const style = SEGMENT_STYLE[p.mode] || SEGMENT_STYLE.rail;
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: isEnd ? 9 : 7,
        weight: 4,
        color: p.color || style.color,
        fillColor: isEnd ? style.color : '#ffffff',
        fillOpacity: 1,
      });
      marker.bindTooltip(`${i + 1}. ${p.title}`, { direction: 'top', permanent: false });
      marker.addTo(this.routeLayer);
    });

    this.map.fitBounds(L.latLngBounds(marks.map((p) => [p.lat, p.lon])).pad(0.25));
  }

  clearRoute() {
    if (this.ready) this.routeLayer.clearLayers();
  }

  /* ---------------- 表示位置 ---------------- */

  focus(lat, lon, zoom = 15) {
    if (this.ready) this.map.setView([lat, lon], zoom);
  }

  fitGroups(groups) {
    if (!this.ready) return;
    const pts = groups.filter((g) => g && g.lat != null && g.lon != null).map((g) => [g.lat, g.lon]);
    if (!pts.length) return;
    if (pts.length === 1) this.map.setView(pts[0], 15);
    else this.map.fitBounds(window.L.latLngBounds(pts).pad(0.3));
  }

  /* ---------------- 任意地点 ---------------- */

  /**
   * 地図をタップした場所そのものを地点として使えるようにする。
   * 最寄駅までの徒歩は呼び出し側(main.js)が距離から見積もる。
   */
  #openPointPicker(lat, lon) {
    if (!this.handlers.onPickPoint) return;
    const L = window.L;
    const marker = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 3,
      color: '#8a4b1c',
      fillColor: '#ffffff',
      fillOpacity: 1,
    });
    marker.addTo(this.pointLayer);

    const nearby = this.handlers.describePoint ? this.handlers.describePoint(lat, lon) : '';
    this.#openPicker(marker, 'この地点', {
      note: nearby,
      onPick: (which) => {
        this.handlers.onPickPoint({ lat, lon }, which);
      },
      onCancel: () => marker.remove(),
    });
  }

  /** 選ばれた地点に印を残す(出発 / 到着 / 経由) */
  markPoint(key, lat, lon, label) {
    if (!this.ready) return;
    const L = window.L;
    this.pointMarkers.get(key)?.remove();
    const m = L.circleMarker([lat, lon], {
      radius: 8,
      weight: 3,
      color: '#8a4b1c',
      fillColor: '#f6e5d6',
      fillOpacity: 1,
    });
    m.bindTooltip(label, { direction: 'top' });
    m.addTo(this.pointLayer);
    this.pointMarkers.set(key, m);
  }

  clearPoint(key) {
    this.pointMarkers.get(key)?.remove();
    this.pointMarkers.delete(key);
  }

  /* ---------------- 内部 ---------------- */

  /**
   * マーカーのポップアップに「出発/到着/経由に設定」を出す。
   * @param {{onPick:Function, onBus?:Function, note?:string, onCancel?:Function}} opts
   */
  #openPicker(marker, title, opts) {
    const box = document.createElement('div');
    box.className = 'map-pick';

    const h = document.createElement('div');
    h.className = 'map-pick__title';
    h.textContent = title;
    box.append(h);

    if (opts.note) {
      const n = document.createElement('div');
      n.className = 'map-pick__note';
      n.textContent = opts.note;
      box.append(n);
    }

    const row = document.createElement('div');
    row.className = 'map-pick__actions';
    const mk = (label, which, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--sm ${cls || ''}`.trim();
      b.textContent = label;
      b.dataset.which = which;
      b.addEventListener('click', () => {
        opts.onPick(which);
        marker.closePopup();
      });
      return b;
    };
    row.append(mk('出発に設定', 'from'), mk('到着に設定', 'to'), mk('経由に追加', 'via', 'btn--ghost'));
    box.append(row);

    if (opts.onBus) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--ghost btn--sm map-pick__bus';
      b.textContent = 'この駅のバス停を表示';
      b.addEventListener('click', () => {
        opts.onBus();
        marker.closePopup();
      });
      box.append(b);
    }

    marker.bindPopup(box).openPopup();
    if (opts.onCancel) marker.on('popupclose', () => opts.onCancel());
  }
}

/* ================================================================== *
 *  純粋な補助関数(地図なしでもテストできるようにここに置く)
 * ================================================================== */

/** 2 点間の距離(km) */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * 経路を「区間の並び」にする。区間ごとに線の色と形を変えて描くため。
 *
 * 徒歩の区間は、地点と駅・バス停を結ぶ線として作る。
 * 直前・直後に座標が判っている乗車地点があれば、そこまでを線でつなぐ。
 *
 * @returns {Array<{mode:'rail'|'bus'|'walk', color:?string, title:string, points:Array}>}
 */
export function routeToSegments(route, net, busStopIndex) {
  const segments = [];
  const index = busStopIndex || new Map();

  /** 乗車区間の点(徒歩の線をつなぐときに使う) */
  const rideEndpoints = [];

  for (const leg of route.legs || []) {
    if (leg.transfer || leg.via) continue;

    if (leg.walkAccess) {
      // 座標が判るのは地点側だけ。相手側は後で埋める。
      segments.push({
        mode: 'walk',
        title: `徒歩 約${Math.round(leg.minutes)}分`,
        pending: leg.side, // 'from' なら次の乗車地点へ、'to' なら前の乗車地点から
        points:
          leg.lat != null && leg.lon != null
            ? [{ lat: leg.lat, lon: leg.lon, title: leg.side === 'from' ? leg.fromTitle : leg.toTitle, mode: 'walk', major: true }]
            : [],
      });
      continue;
    }

    if (leg.bus) {
      const pts = [];
      const a = index.get(leg.from);
      const b = index.get(leg.to);
      if (a) pts.push({ lat: a.lat, lon: a.lon, title: leg.fromTitle || a.title, mode: 'bus', major: true });
      if (b) pts.push({ lat: b.lat, lon: b.lon, title: leg.toTitle || b.title, mode: 'bus', major: true });
      segments.push({ mode: 'bus', title: leg.lineTitle || 'バス', points: pts });
      for (const p of pts) rideEndpoints.push({ seg: segments.length - 1, point: p });
      continue;
    }

    const railway = net.railways.get(leg.railway);
    if (!railway) continue;
    const fi = net.indexOnRailway(leg.railway, leg.from);
    const ti = net.indexOnRailway(leg.railway, leg.to);
    if (fi < 0 || ti < 0) continue;
    const step = ti > fi ? 1 : -1;
    const pts = [];
    for (let i = fi; i !== ti + step; i += step) {
      const st = net.stations.get(railway.stations[i]);
      if (!st || st.lat == null || st.lon == null) continue;
      pts.push({
        lat: st.lat,
        lon: st.lon,
        title: st.title,
        mode: 'rail',
        color: railway.color || null,
        major: i === fi || i === ti,
      });
    }
    segments.push({ mode: 'rail', color: railway.color || null, title: railway.title || leg.railway, points: pts });
    for (const p of pts) rideEndpoints.push({ seg: segments.length - 1, point: p });
  }

  // 徒歩の区間に、隣り合う乗車地点をつないで線にする
  segments.forEach((seg, i) => {
    if (seg.mode !== 'walk' || !seg.pending) return;
    if (seg.pending === 'from') {
      const next = segments.slice(i + 1).find((x) => x.points.length);
      if (next) seg.points.push({ ...next.points[0], mode: 'walk', major: true });
    } else {
      const prev = [...segments.slice(0, i)].reverse().find((x) => x.points.length);
      if (prev) seg.points.unshift({ ...prev.points[prev.points.length - 1], mode: 'walk', major: true });
    }
    delete seg.pending;
  });

  return segments.filter((seg) => seg.points.length);
}

/** 経路から地図に描く点の並びを作る(範囲合わせ・テスト用の平坦版) */
export function routeToPoints(route, net, busStopIndex) {
  const points = [];
  const push = (p) => {
    const last = points[points.length - 1];
    if (last && last.lat === p.lat && last.lon === p.lon) return;
    points.push({ lat: p.lat, lon: p.lon, title: p.title, bus: p.mode === 'bus', walk: p.mode === 'walk' });
  };
  for (const seg of routeToSegments(route, net, busStopIndex)) {
    for (const p of seg.points) push(p);
  }
  return points;
}

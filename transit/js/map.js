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

/** 初期表示(東京駅あたり) */
const DEFAULT_CENTER = [35.6812, 139.7671];
const DEFAULT_ZOOM = 12;

export class TransitMap {
  /**
   * @param {HTMLElement} container
   * @param {object} handlers { onPickStation(groupId, title), onPickBusStop(stop), onNearby(lat, lon) }
   */
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.map = null;
    this.stationLayer = null;
    this.busLayer = null;
    this.routeLayer = null;
    this.markerByGroup = new Map();
    this.busMarkers = new Map();
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

    // 地図の任意の場所をタップ → 近くの駅を提案する
    this.map.on('click', (e) => {
      if (this.handlers.onNearby) this.handlers.onNearby(e.latlng.lat, e.latlng.lng);
    });

    this.ready = true;
    return true;
  }

  /** コンテナのサイズが変わったあとに呼ぶ(隠れている間に作ると 0px になるため) */
  refresh() {
    if (this.ready) setTimeout(() => this.map.invalidateSize(), 0);
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
        window.L.DomEvent.stopPropagation(e); // 地図クリック(近くの駅)を発火させない
        this.#openPicker(marker, g.title, () => {
          if (this.handlers.onPickStation) this.handlers.onPickStation(g.id, g.title, 'from');
        }, () => {
          if (this.handlers.onPickStation) this.handlers.onPickStation(g.id, g.title, 'to');
        }, this.handlers.onStationBusStops ? () => this.handlers.onStationBusStops(g) : null);
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
        this.#openPicker(marker, `${s.title}(バス停)`, () => {
          if (this.handlers.onPickBusStop) this.handlers.onPickBusStop(s, 'from');
        }, () => {
          if (this.handlers.onPickBusStop) this.handlers.onPickBusStop(s, 'to');
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
   * 選んだ経路を地図に描く。
   * @param {Array<{lat:number, lon:number, title:string, bus:boolean}>} points 経由地(順番どおり)
   */
  renderRoute(points) {
    if (!this.ready) return;
    const L = window.L;
    this.routeLayer.clearLayers();
    const usable = (points || []).filter((p) => p.lat != null && p.lon != null);
    if (!usable.length) return;

    const latlngs = usable.map((p) => [p.lat, p.lon]);
    L.polyline(latlngs, { color: '#00713c', weight: 4, opacity: 0.8 }).addTo(this.routeLayer);
    usable.forEach((p, i) => {
      const isEnd = i === 0 || i === usable.length - 1;
      L.circleMarker([p.lat, p.lon], {
        radius: isEnd ? 7 : 5,
        weight: 3,
        color: p.bus ? '#1c4f8a' : '#00713c',
        fillColor: '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip(p.title, { direction: 'top' })
        .addTo(this.routeLayer);
    });
    this.map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
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

  /* ---------------- 内部 ---------------- */

  /** マーカーのポップアップに「出発/到着に設定」を出す */
  #openPicker(marker, title, onFrom, onTo, onBus) {
    const box = document.createElement('div');
    box.className = 'map-pick';

    const h = document.createElement('div');
    h.className = 'map-pick__title';
    h.textContent = title;
    box.append(h);

    const row = document.createElement('div');
    row.className = 'map-pick__actions';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--sm';
      b.textContent = label;
      b.addEventListener('click', () => {
        fn();
        marker.closePopup();
      });
      return b;
    };
    row.append(mk('出発に設定', onFrom), mk('到着に設定', onTo));
    box.append(row);

    if (onBus) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--ghost btn--sm map-pick__bus';
      b.textContent = 'この駅のバス停を表示';
      b.addEventListener('click', () => {
        onBus();
        marker.closePopup();
      });
      box.append(b);
    }

    marker.bindPopup(box).openPopup();
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

/** 経路から地図に描く点の並びを作る */
export function routeToPoints(route, net, busStopIndex) {
  const points = [];
  const push = (lat, lon, title, bus) => {
    if (lat == null || lon == null) return;
    const last = points[points.length - 1];
    if (last && last.lat === lat && last.lon === lon) return;
    points.push({ lat, lon, title, bus });
  };

  for (const leg of route.legs || []) {
    if (leg.transfer) continue;
    if (leg.bus) {
      const a = busStopIndex.get(leg.from);
      const b = busStopIndex.get(leg.to);
      if (a) push(a.lat, a.lon, leg.fromTitle || a.title, true);
      if (b) push(b.lat, b.lon, leg.toTitle || b.title, true);
      continue;
    }
    const railway = net.railways.get(leg.railway);
    if (!railway) continue;
    const fi = net.indexOnRailway(leg.railway, leg.from);
    const ti = net.indexOnRailway(leg.railway, leg.to);
    if (fi < 0 || ti < 0) continue;
    const step = ti > fi ? 1 : -1;
    for (let i = fi; i !== ti + step; i += step) {
      const st = net.stations.get(railway.stations[i]);
      if (!st) continue;
      push(st.lat, st.lon, st.title, false);
    }
  }
  return points;
}

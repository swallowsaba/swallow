/**
 * 路線・バスの「利用者にとっての区分」
 * ==================================================================
 * 除外の一覧などで路線を並べるとき、事業者 ID(TokyoMetro, TWR …)や
 * データ提供元の都合(ODPT)で区切っても、使う人には意味が無い。
 *
 * 「JR」「地下鉄」「私鉄」のような、時刻表や路線図で使われている
 * 普通の言い方で区切る。
 *
 * 判らないものは「その他」に入れる。勝手に私鉄などへ入れない
 * (間違った区分で出すくらいなら「その他」の方が正直)。
 */

/** 並べる順。上にあるものほど先に出す。 */
export const RAIL_CATEGORIES = ['JR', '地下鉄', '私鉄', 'モノレール・新交通・路面電車', 'その他'];
export const BUS_CATEGORIES = ['公営バス', '民営バス', 'その他'];

/**
 * 事業者 ID → 日本語名。
 * 対応範囲の応答に名前が入っていないときの保険。
 * ここに無いものは、内部の ID を画面に出すくらいなら何も出さない。
 */
export const OPERATOR_TITLES = {
  'JR-East': 'JR東日本',
  'JR-Central': 'JR東海',
  'JR-West': 'JR西日本',
  Toei: '東京都交通局',
  TokyoMetro: '東京メトロ',
  TWR: '東京臨海高速鉄道',
  MIR: '首都圏新都市鉄道',
  Yurikamome: 'ゆりかもめ',
  TamaMonorail: '多摩都市モノレール',
  TokyoMonorail: '東京モノレール',
  ShonanMonorail: '湘南モノレール',
  YokohamaMunicipal: '横浜市交通局',
  Tobu: '東武鉄道',
  Seibu: '西武鉄道',
  Keio: '京王電鉄',
  Odakyu: '小田急電鉄',
  Keikyu: '京急電鉄',
  Tokyu: '東急電鉄',
  Sotetsu: '相模鉄道',
  Keisei: '京成電鉄',
};

/** 事業者 ID → 区分(鉄道) */
const RAIL_BY_OPERATOR = {
  'JR-East': 'JR',
  'JR-Central': 'JR',
  'JR-West': 'JR',
  TokyoMetro: '地下鉄',
  Tobu: '私鉄',
  Seibu: '私鉄',
  Keio: '私鉄',
  Odakyu: '私鉄',
  Keikyu: '私鉄',
  Tokyu: '私鉄',
  Sotetsu: '私鉄',
  Keisei: '私鉄',
  Yurikamome: 'モノレール・新交通・路面電車',
  TamaMonorail: 'モノレール・新交通・路面電車',
  TokyoMonorail: 'モノレール・新交通・路面電車',
  ShonanMonorail: 'モノレール・新交通・路面電車',
  // 第三セクター。私鉄とも地下鉄とも言いにくいので「その他」に置く。
  TWR: 'その他',
  MIR: 'その他',
};

/**
 * 都営・横浜市営は路線によって区分が変わる。
 * 浅草線などは地下鉄、都電荒川線は路面電車、日暮里・舎人ライナーは新交通。
 * 路線 ID の末尾(路線名)で見分ける。
 */
const LINE_OVERRIDES = [
  { match: /Toei\.(Asakusa|Mita|Shinjuku|Oedo)$/i, category: '地下鉄' },
  { match: /Toei\.Arakawa$/i, category: 'モノレール・新交通・路面電車' },
  { match: /Toei\.NipporiToneri$/i, category: 'モノレール・新交通・路面電車' },
  { match: /YokohamaMunicipal\.(Blue|Green)line$/i, category: '地下鉄' },
];

/**
 * 路線の区分を返す。
 * @param {string} railwayId 例: odpt.Railway:TokyoMetro.Ginza
 * @param {?string} operatorId 例: TokyoMetro
 * @returns {string} RAIL_CATEGORIES のいずれか
 */
export function railCategory(railwayId, operatorId) {
  const id = String(railwayId || '');
  for (const rule of LINE_OVERRIDES) {
    if (rule.match.test(id)) return rule.category;
  }
  // `odpt.Operator:TokyoMetro` の形で渡ってくることがあるので、後ろだけ使う
  const op = shortId(operatorId) || operatorFromRailwayId(id);
  const hit = RAIL_BY_OPERATOR[op];
  return hit || 'その他';
}

/** `odpt.Operator:X` → `X`。既に短ければそのまま。 */
function shortId(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1) || null : s;
}

/** 事業者 ID → 区分(バス) */
const BUS_BY_OPERATOR = {
  Toei: '公営バス',
  YokohamaMunicipal: '公営バス',
  KawasakiMunicipal: '公営バス',
  TokyuBus: '民営バス',
  SeibuBus: '民営バス',
  SotetsuBus: '民営バス',
  KeioBus: '民営バス',
  OdakyuBus: '民営バス',
  NishiTokyoBus: '民営バス',
  KantoBus: '民営バス',
  Kanachu: '民営バス',
  TobuBus: '民営バス',
  KokusaiKogyoBus: '民営バス',
  KeikyuBus: '民営バス',
  TachikawaBus: '民営バス',
};

/** 事業者名から判る場合の手がかり(ID が判らないときの保険) */
const PUBLIC_BUS_NAME = /(都営|市交通局|市営|区営|町営|村営|県営)/;

/**
 * バス事業者の区分を返す。
 * @param {?string} operatorId 例: Toei
 * @param {?string} operatorTitle 例: 東京都交通局
 */
export function busCategory(operatorId, operatorTitle) {
  const byId = BUS_BY_OPERATOR[shortId(operatorId)];
  if (byId) return byId;
  const title = String(operatorTitle || '');
  if (PUBLIC_BUS_NAME.test(title)) return '公営バス';
  if (/バス|交通/.test(title)) return '民営バス';
  return 'その他';
}

/** 区分の並び順(一覧に無いものは最後) */
export function categoryOrder(list, name) {
  const i = list.indexOf(name);
  return i < 0 ? list.length : i;
}

function operatorFromRailwayId(railwayId) {
  const m = /^odpt\.Railway:([A-Za-z0-9-]+)\./.exec(railwayId || '');
  return m ? m[1] : null;
}

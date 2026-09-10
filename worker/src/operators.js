/**
 * 対応事業者レジストリ
 * ------------------------------------------------------------------
 * ODPT は事業者ごとにライセンスが異なり、API ホストまで分かれている。
 *   - CC BY 4.0                 : api-public.odpt.org  (トークン不要)
 *   - 公共交通オープンデータ基本ライセンス : api.odpt.org         (トークン必須)
 *   - チャレンジ限定ライセンス          : api-challenge.odpt.org (コンテスト目的外は利用禁止)
 *
 * 既定では、一般公開できる上 2 つのライセンスの事業者だけを扱う。
 * チャレンジ限定ライセンスの事業者(JR東日本・東武・西武・京王・小田急・
 * 京急・東急・相鉄 など)は UNSUPPORTED_OPERATORS に理由とともに列挙し、
 * UI で「非対応」として明示する。
 *
 * ただし「公共交通オープンデータチャレンジ」に応募し、その作品として
 * 公開する場合に限り、環境変数 ENABLE_CHALLENGE=1 と Secret の
 * ODPT_CHALLENGE_TOKEN を設定することでチャレンジ事業者を有効化できる。
 *
 * 【重要】ENABLE_CHALLENGE を有効にしたアプリは、チャレンジの作品としてのみ
 * 公開できる。コンテスト終了後はトークンが失効し、機能も停止する前提で運用すること。
 */

export const HOSTS = {
  public: 'https://api-public.odpt.org/api/v4',
  basic: 'https://api.odpt.org/api/v4',
  challenge: 'https://api-challenge.odpt.org/api/v4',
};

/** 対応事業者。id は ODPT の odpt.Operator: 以下の識別子。 */
export const OPERATORS = [
  {
    id: 'Toei',
    title: '東京都交通局',
    short: '都営',
    host: 'public',
    license: 'CC BY 4.0',
    modes: ['地下鉄', '路面電車', '新交通'],
    note: '浅草線・三田線・新宿線・大江戸線 / 都電荒川線 / 日暮里・舎人ライナー',
  },
  {
    id: 'TokyoMetro',
    title: '東京メトロ',
    short: 'メトロ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['地下鉄'],
    note: '銀座・丸ノ内・日比谷・東西・千代田・有楽町・半蔵門・南北・副都心',
  },
  {
    id: 'TWR',
    title: '東京臨海高速鉄道',
    short: 'りんかい線',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['鉄道'],
    note: 'りんかい線',
  },
  {
    id: 'MIR',
    title: '首都圏新都市鉄道',
    short: 'TX',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['鉄道'],
    note: 'つくばエクスプレス',
  },
  {
    id: 'Yurikamome',
    title: 'ゆりかもめ',
    short: 'ゆりかもめ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['新交通'],
    note: '東京臨海新交通臨海線',
  },
  {
    id: 'TamaMonorail',
    title: '多摩都市モノレール',
    short: '多摩モノ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['モノレール'],
    note: '多摩都市モノレール線',
  },
  {
    id: 'YokohamaMunicipal',
    title: '横浜市交通局',
    short: '横浜市営',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['地下鉄'],
    note: 'ブルーライン / グリーンライン',
  },
];

/**
 * チャレンジ限定ライセンスの鉄道事業者。
 * ENABLE_CHALLENGE=1 かつ ODPT_CHALLENGE_TOKEN が設定されているときだけ有効になる。
 * データ構造は基本ライセンスの事業者と同じなので、経路探索側の変更は不要。
 */
export const CHALLENGE_OPERATORS = [
  {
    id: 'JR-East',
    title: 'JR東日本',
    short: 'JR東',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '山手線・中央線・京浜東北線 ほか',
  },
  {
    id: 'Tobu',
    title: '東武鉄道',
    short: '東武',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: 'スカイツリーライン・東上線 ほか',
  },
  {
    id: 'Seibu',
    title: '西武鉄道',
    short: '西武',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '池袋線・新宿線 ほか',
  },
  {
    id: 'Keio',
    title: '京王電鉄',
    short: '京王',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '京王線・井の頭線 ほか',
  },
  {
    id: 'Odakyu',
    title: '小田急電鉄',
    short: '小田急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '小田原線・江ノ島線・多摩線',
  },
  {
    id: 'Keikyu',
    title: '京急電鉄',
    short: '京急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '本線・空港線 ほか',
  },
  {
    id: 'Tokyu',
    title: '東急電鉄',
    short: '東急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '東横線・田園都市線 ほか',
  },
  {
    id: 'Sotetsu',
    title: '相模鉄道',
    short: '相鉄',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '本線・いずみ野線・新横浜線',
  },
];

/** 非対応事業者。UI で理由とともに提示するために保持する。 */
export const UNSUPPORTED_OPERATORS = [
  { title: 'JR東日本', reason: 'チャレンジ2026限定ライセンス(コンテスト目的外の利用不可)' },
  { title: '東武鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '西武鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京王電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '小田急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '東急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '相模鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京成電鉄・北総鉄道・埼玉高速 ほか', reason: 'ODPT 未提供、またはチャレンジ限定' },
];

const BY_ID = new Map([...OPERATORS, ...CHALLENGE_OPERATORS].map((o) => [o.id, o]));

/**
 * アクセストークンを取り出す。
 * コピー&ペーストで前後に空白・改行が混ざると ODPT に弾かれるため、
 * 必ずここで除去する。空白だけの場合は「未設定」として扱う。
 */
export function odptToken(env) {
  return String(env.ODPT_TOKEN || '').trim();
}

/** チャレンジ用トークン(api-challenge.odpt.org 用。ODPT_TOKEN とは別物) */
export function challengeToken(env) {
  return String(env.ODPT_CHALLENGE_TOKEN || '').trim();
}

/**
 * チャレンジ事業者を有効にしてよいか。
 * ENABLE_CHALLENGE が明示的に有効で、かつ専用トークンがあるときだけ true。
 * どちらか欠けていれば黙って無効化する(誤って規約違反の状態で公開しないため)。
 */
export function challengeEnabled(env) {
  const flag = String(env.ENABLE_CHALLENGE || '').trim().toLowerCase();
  const on = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  return on && Boolean(challengeToken(env));
}

/** ホスト種別に対応するトークンを返す。public は不要なので null。 */
export function tokenForHost(env, hostKey) {
  if (hostKey === 'basic') return odptToken(env);
  if (hostKey === 'challenge') return challengeToken(env);
  return null;
}

export function getOperator(id) {
  return BY_ID.get(id) || null;
}

/** odpt.Operator:TokyoMetro のような完全 ID を返す */
export function operatorUrn(id) {
  return `odpt.Operator:${id}`;
}

/**
 * 環境変数 ENABLED_OPERATORS(カンマ区切り)で対応事業者を絞り込める。
 * 未設定なら全件。トークンが無いホストの事業者は自動的に除外する。
 */
export function resolveEnabledOperators(env) {
  const filter = (env.ENABLED_OPERATORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const pool = challengeEnabled(env) ? [...OPERATORS, ...CHALLENGE_OPERATORS] : OPERATORS;

  return pool.filter((op) => {
    if (filter.length && !filter.includes(op.id)) return false;
    if (op.host === 'basic' && !odptToken(env)) return false;
    if (op.host === 'challenge' && !challengeEnabled(env)) return false;
    return true;
  });
}

/**
 * 現在の設定で実際に使える事業者を ID から引く。
 * 無効な事業者(トークン未設定・チャレンジ無効・絞り込みで除外)は null を返し、
 * 呼び出し側で「対応範囲外」として扱えるようにする。
 * getOperator() は全事業者を引いてしまうので、リクエスト処理ではこちらを使うこと。
 */
export function getEnabledOperator(env, id) {
  if (!id) return null;
  return resolveEnabledOperators(env).find((o) => o.id === id) || null;
}

/** UI に出す「非対応」一覧。チャレンジ有効時は該当分を取り除く。 */
export function resolveUnsupported(env) {
  if (!challengeEnabled(env)) return UNSUPPORTED_OPERATORS;
  const enabledTitles = new Set(CHALLENGE_OPERATORS.map((o) => o.title));
  return UNSUPPORTED_OPERATORS.filter((o) => !enabledTitles.has(o.title));
}

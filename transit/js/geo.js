/**
 * 現在地の取得
 * ------------------------------------------------------------------
 * ブラウザの Geolocation API のみを使う。外部 API もキーも不要で、
 * 位置情報がサーバに送られることもない(最寄駅の計算はブラウザ内)。
 */

export class GeoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  UNSUPPORTED: 'このブラウザは位置情報に対応していません。駅名で入力してください。',
  PERMISSION_DENIED: '位置情報の利用が許可されませんでした。駅名または住所で入力してください。',
  POSITION_UNAVAILABLE: '現在地を取得できませんでした。屋内では取得しにくいことがあります。',
  TIMEOUT: '現在地の取得がタイムアウトしました。もう一度お試しください。',
  INSECURE: '現在地の取得には HTTPS 接続が必要です。',
};

export function currentPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoError('UNSUPPORTED', MESSAGES.UNSUPPORTED));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeoError('INSECURE', MESSAGES.INSECURE));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        const map = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
        const code = map[err.code] || 'POSITION_UNAVAILABLE';
        reject(new GeoError(code, MESSAGES[code]));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

/** 距離(km)を「約 350m」「約 1.2km」に整形 */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `約 ${Math.round(km * 1000 / 10) * 10}m`;
  return `約 ${km.toFixed(1)}km`;
}

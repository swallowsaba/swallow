import { pageOf, type LocalRequest, type Route } from './http';

/**
 * ログインを覚える後ろのアプリ（PHP のセッション）の模型（docs/lessons/web.md の web.b.06）。純粋な関数。
 *
 * - 札（Cookie）の決まりは、本物の PHP と同じく php.ini の [Session] の項目（session.name・session.cookie_path・
 *   session.cookie_secure・session.cookie_httponly）で決まる。アプリを動かした時に読む（直したら再起動するまで変わらない）
 * - POST でログインの道に利用者とパスワードを送ると、ようこその中身と Set-Cookie を返す
 * - ログインが要る道は、正しい札が付いていれば利用者の中身、付いていなければ「ログインしてください」を返す
 */

/** アプリの作り（setup の services の session） */
export interface SessionApp {
  /** php.ini の場所 */
  ini: string;
  /** ログインの道（POST で user と pass を送る） */
  login: string;
  user: string;
  pass: string;
  /** 画面に出す利用者の呼び名（港 さん） */
  display: string;
  /** ログインで渡すセッション ID */
  id: string;
  /** ログインが要る道 → ログインした利用者に見せる中身 */
  pages: Readonly<Record<string, string>>;
  /** 札が無い・違う時の中身 */
  guest: string;
}

/** php.ini から読んだ、札の決まり */
export interface SessionCookie {
  name: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
}

/** PHP の既定（session.cookie_path は /、secure と httponly は付けない） */
export const PHP_DEFAULTS: SessionCookie = { name: 'PHPSESSID', path: '/', secure: false, httpOnly: false };

/** PHP の真偽の書き方（On・1・true・yes が真。空や Off は偽） */
const truthy = (v: string): boolean => /^(on|1|true|yes)$/i.test(v.trim());

/** php.ini を読む。; で始まる行は注釈。値の引用符は外す。書いていない項目は PHP の既定 */
export function readSessionIni(text: string): SessionCookie {
  const out: SessionCookie = { ...PHP_DEFAULTS };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('[')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).replace(/\s;.*$/, '').trim().replace(/^"(.*)"$/, '$1');
    if (key === 'session.name' && value !== '') out.name = value;
    else if (key === 'session.cookie_path') out.path = value === '' ? '/' : value;
    else if (key === 'session.cookie_secure') out.secure = truthy(value);
    else if (key === 'session.cookie_httponly') out.httpOnly = truthy(value);
  }
  return out;
}

/** PHP が送る Set-Cookie の値 */
export function setCookieOf(c: SessionCookie, id: string): string {
  return [`${c.name}=${id}`, `path=${c.path}`, ...(c.secure ? ['secure'] : []), ...(c.httpOnly ? ['HttpOnly'] : [])].join('; ');
}

/** 送られた中身（user=…&pass=…）を読む */
function formOf(data: string | undefined): Map<string, string> {
  return new Map((data ?? '').split('&').map((kv) => {
    const [k = '', ...v] = kv.split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.join('=').replace(/\+/g, ' '))] as const;
  }));
}

/** 頼みに付いた札に、正しいセッション ID があるか */
function signedIn(app: SessionApp, c: SessionCookie, cookie: string | undefined): boolean {
  return (cookie ?? '').split(';').some((kv) => kv.trim() === `${c.name}=${app.id}`);
}

const html = (inner: string): string => `<html><body>${inner}</body></html>`;

/** アプリの答え */
export function sessionAnswer(app: SessionApp, c: SessionCookie, req: LocalRequest): Route {
  const p = (req.path.split('?')[0] ?? '/') || '/';
  if (p === app.login) {
    if (req.method === 'GET' || req.method === 'HEAD') return { status: 200, body: html('<h1>ログイン</h1><form method="post"><input name="user"><input name="pass" type="password"></form>') };
    if (req.method !== 'POST') return { status: 405, body: pageOf(405), headers: { Allow: 'GET, POST' } };
    const form = formOf(req.data);
    if (form.get('user') !== app.user || form.get('pass') !== app.pass) return { status: 401, body: html('<p>利用者の名前かパスワードが違います</p>') };
    return { status: 200, body: html(`<p>ようこそ、${app.display} さん</p>`), headers: { 'Set-Cookie': setCookieOf(c, app.id) } };
  }
  const page = app.pages[p];
  if (page === undefined) return { status: 404, body: pageOf(404) };
  return { status: 200, body: html(signedIn(app, c, req.cookie) ? page : app.guest) };
}

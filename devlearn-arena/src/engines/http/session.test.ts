import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { readFile } from '@/engines/kernel/vfs';
import { certText } from '@/engines/kernel/webConfig';
import { DEMO_INTERMEDIATE, leafFor } from '@/engines/tls/tls';
import { checkState } from '@/learning/practice';
import { readSessionIni, sessionAnswer, setCookieOf, PHP_DEFAULTS, type SessionApp } from './session';

const app: SessionApp = {
  ini: '/etc/php/8.3/apache2/php.ini', login: '/login', user: 'minato', pass: 'harbor', display: '港', id: 'q8v3k2m7t1c5',
  pages: { '/cart': 'カート（2 点）', '/orders': '注文の履歴（3 件）' }, guest: 'ログインしてください',
};

describe('ログインを覚えるアプリ（PHP のセッション）', () => {
  it('php.ini の [Session] から札の決まりを読む。注釈と書いていない項目は PHP の既定', () => {
    expect(readSessionIni('[Session]\nsession.name = PHPSESSID\nsession.cookie_path = /login\n;session.cookie_secure = On\nsession.cookie_httponly = 1\n')).toEqual({ name: 'PHPSESSID', path: '/login', secure: false, httpOnly: true });
    expect(readSessionIni('')).toEqual(PHP_DEFAULTS);
    expect(readSessionIni('session.cookie_path = "/shop" ; 店の下だけ\nsession.cookie_secure = On\n')).toMatchObject({ path: '/shop', secure: true });
  });

  it('Set-Cookie は PHP と同じ形（path・secure・HttpOnly の順）', () => {
    expect(setCookieOf({ name: 'PHPSESSID', path: '/', secure: true, httpOnly: true }, 'abc')).toBe('PHPSESSID=abc; path=/; secure; HttpOnly');
    expect(setCookieOf({ ...PHP_DEFAULTS, path: '/login' }, 'abc')).toBe('PHPSESSID=abc; path=/login');
  });

  it('正しい利用者とパスワードでログインすると札を渡す。札が付いた依頼にだけ、利用者の中身を返す', () => {
    const c = { ...PHP_DEFAULTS };
    const req = { scheme: 'https' as const, host: 'shop.example', port: 443 };
    const ok = sessionAnswer(app, c, { ...req, method: 'POST', path: '/login', data: 'user=minato&pass=harbor' });
    expect(ok.headers?.['Set-Cookie']).toBe('PHPSESSID=q8v3k2m7t1c5; path=/');
    expect(sessionAnswer(app, c, { ...req, method: 'POST', path: '/login', data: 'user=minato&pass=x' })).toMatchObject({ status: 401 });
    expect(sessionAnswer(app, c, { ...req, method: 'GET', path: '/cart' }).body).toContain('ログインしてください');
    expect(sessionAnswer(app, c, { ...req, method: 'GET', path: '/cart', cookie: 'PHPSESSID=q8v3k2m7t1c5' }).body).toContain('カート（2 点）');
    expect(sessionAnswer(app, c, { ...req, method: 'GET', path: '/cart', cookie: 'PHPSESSID=other' }).body).toContain('ログインしてください');
  });
});

/** 店のサーバ: nginx が https で受けて、後ろのアプリ（apache2 の PHP）へ中継する */
const PHP_INI = '/etc/php/8.3/apache2/php.ini';
const setup = {
  hostname: 'shop-web',
  files: {
    '/etc/hosts': '127.0.0.1\tlocalhost shop.example\n',
    '/etc/nginx/conf.d/shop.conf': 'server {\n  listen 443 ssl;\n  server_name shop.example;\n  ssl_certificate /etc/nginx/certs/fullchain.crt;\n  location / {\n    proxy_pass http://127.0.0.1:8080;\n  }\n}\n',
    '/etc/nginx/certs/fullchain.crt': certText(leafFor('shop.example')) + certText(DEMO_INTERMEDIATE),
    [PHP_INI]: '[Session]\nsession.name = PHPSESSID\nsession.cookie_path = /login\nsession.cookie_secure = Off\nsession.cookie_httponly = Off\n',
  },
  services: {
    nginx: { description: 'nginx web server', enabled: true, config: '/etc/nginx/conf.d/shop.conf' },
    apache2: { description: 'The Apache HTTP Server', enabled: true, port: 8080, address: '127.0.0.1', session: app },
  },
  sites: [],
  run: ['systemctl start nginx', 'systemctl start apache2'],
};

describe('curl の札（-b・-c）と、設定を読み直すアプリ', () => {
  const registry = createDefaultRegistry();
  const clock = createClock();
  const play = (shell: ShellState, lines: string[]): { shell: ShellState; out: string } => {
    let s = shell;
    let out = '';
    for (const line of lines) {
      const r = execute(s, line, registry, clock);
      s = r.state;
      out += r.chunks.map((c) => c.text).join('');
    }
    return { shell: s, out };
  };
  const login = "curl -s -i -c cookies.txt -d 'user=minato&pass=harbor' https://shop.example/login";

  it('-c で受け取った札を Netscape の形で書き、-b で読んで、範囲に合う依頼にだけ付ける', () => {
    const first = play(initialShell('linux-server', setup), [login]);
    expect(first.out).toContain('Set-Cookie: PHPSESSID=q8v3k2m7t1c5; path=/login');
    expect(readFile(first.shell.vfs, '/root/cookies.txt')).toContain('shop.example\tFALSE\t/login\tFALSE\t0\tPHPSESSID\tq8v3k2m7t1c5');
    // 範囲（/login）の外の /cart には札が付かず、ログインしていない扱い
    expect(play(first.shell, ['curl -s -b cookies.txt https://shop.example/cart']).out).toContain('ログインしてください');
    // -b に 名前=値 を書けば、そのまま送る
    expect(play(first.shell, ['curl -s -b PHPSESSID=q8v3k2m7t1c5 https://shop.example/cart']).out).toContain('カート（2 点）');
    // 札を覚えずに打った curl は、受け取った札を書かない
    expect(play(initialShell('linux-server', setup), ["curl -s -d 'user=minato&pass=harbor' https://shop.example/login", 'ls']).out).not.toContain('cookies.txt');
  });

  it('-v は付けた札と、受け取った札を示す', () => {
    const first = play(initialShell('linux-server', setup), [login]);
    const v = play(first.shell, ['curl -v -b cookies.txt https://shop.example/login']).out;
    expect(v).toContain('> Cookie: PHPSESSID=q8v3k2m7t1c5');
    expect(play(initialShell('linux-server', setup), ["curl -v -c cookies.txt -d 'user=minato&pass=harbor' https://shop.example/login"]).out).toContain('* Added cookie PHPSESSID="q8v3k2m7t1c5" for domain shop.example, path /login, expire 0');
  });

  it('php.ini を直しても、アプリを再起動するまで札の決まりは変わらない。再起動してログインし直すと、範囲の広い札で全てのページが開く', () => {
    const edited = play(initialShell('linux-server', setup), [`sed -i 's|^session.cookie_path = /login|session.cookie_path = /|' ${PHP_INI}`, login]);
    expect(edited.out).toContain('path=/login');
    const restarted = play(edited.shell, ['systemctl restart apache2', login, 'curl -s -b cookies.txt https://shop.example/orders']);
    expect(restarted.out).toContain('Set-Cookie: PHPSESSID=q8v3k2m7t1c5; path=/\n');
    expect(restarted.out).toContain('注文の履歴（3 件）');
  });

  it('判定の http は、POST と送る中身で頼み、返事の見出しを確かめられる（Secure と HttpOnly の付いた札）', () => {
    const check = { kind: 'http' as const, url: 'https://shop.example/login', method: 'POST' as const, data: 'user=minato&pass=harbor', status: 200, header: 'set-cookie: PHPSESSID=q8v3k2m7t1c5; path=/; secure; HttpOnly' };
    const before = play(initialShell('linux-server', setup), []);
    expect(checkState(check, { shell: before.shell })).toBe(false);
    // 値は同じ物だけ（一部が合うだけでは満たさない）
    expect(checkState({ ...check, header: 'Set-Cookie: path=/login' }, { shell: before.shell })).toBe(false);
    expect(checkState({ ...check, header: 'Set-Cookie: PHPSESSID=q8v3k2m7t1c5; path=/login' }, { shell: before.shell })).toBe(true);
    const after = play(before.shell, [
      `sed -i 's|^session.cookie_path = /login|session.cookie_path = /|;s/^session.cookie_secure = Off/session.cookie_secure = On/;s/^session.cookie_httponly = Off/session.cookie_httponly = On/' ${PHP_INI}`,
      'systemctl restart apache2',
    ]);
    expect(checkState(check, { shell: after.shell })).toBe(true);
    // Secure の札も、https の依頼には付く
    expect(play(after.shell, [login, 'curl -s -b cookies.txt https://shop.example/cart']).out).toContain('カート（2 点）');
    expect(readFile(play(after.shell, [login]).shell.vfs, '/root/cookies.txt')).toContain('#HttpOnly_shop.example\tFALSE\t/\tTRUE\t0\tPHPSESSID');
  });
});

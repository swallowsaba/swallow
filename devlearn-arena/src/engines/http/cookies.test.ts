import { describe, expect, it } from 'vitest';
import { addCookie, cookieHeader, defaultPath, jarText, parseJar, parseSetCookie, pathMatches } from './cookies';

describe('Cookie の模型（curl -b・-c と同じ決まり）', () => {
  it('Set-Cookie を読む。Path・Secure・HttpOnly は大文字・小文字を問わない', () => {
    expect(parseSetCookie('PHPSESSID=q8v3; path=/login; secure; HttpOnly', 'Shop.example', '/login')).toEqual({
      domain: 'shop.example', path: '/login', secure: true, httpOnly: true, name: 'PHPSESSID', value: 'q8v3',
    });
    expect(parseSetCookie('=x; path=/', 'shop.example', '/')).toBeNull();
  });

  it('Path が無い札は、頼んだ道のディレクトリが範囲になる', () => {
    expect(defaultPath('/shop/login')).toBe('/shop');
    expect(defaultPath('/login')).toBe('/');
    expect(defaultPath('/a/b?x=1/2')).toBe('/a');
    expect(parseSetCookie('sid=1', 'shop.example', '/shop/login')?.path).toBe('/shop');
  });

  it('道が範囲に入るか: 同じ道か、範囲の下の道だけ（/login は /loginx を含まない）', () => {
    expect([pathMatches('/login', '/login'), pathMatches('/login/again', '/login'), pathMatches('/loginx', '/login'), pathMatches('/cart', '/login'), pathMatches('/cart?id=1', '/')]).toEqual([true, true, false, false, true]);
  });

  it('頼む時は、ホスト・範囲・暗号化が合う札だけを付ける。長い範囲の札を先に並べる', () => {
    let jar = addCookie([], { domain: 'shop.example', path: '/login', secure: false, httpOnly: false, name: 'PHPSESSID', value: 'old' });
    expect(cookieHeader(jar, 'https', 'shop.example', '/cart')).toBe('');
    expect(cookieHeader(jar, 'https', 'shop.example', '/login')).toBe('PHPSESSID=old');
    jar = addCookie(jar, { domain: 'shop.example', path: '/', secure: true, httpOnly: true, name: 'PHPSESSID', value: 'new' });
    expect(cookieHeader(jar, 'https', 'shop.example', '/login')).toBe('PHPSESSID=old; PHPSESSID=new');
    expect(cookieHeader(jar, 'https', 'shop.example', '/orders')).toBe('PHPSESSID=new');
    expect(cookieHeader(jar, 'http', 'shop.example', '/orders')).toBe('');
    expect(cookieHeader(jar, 'https', 'evil.example', '/orders')).toBe('');
  });

  it('名前・ホスト・範囲が同じ札は置き換える', () => {
    const a = { domain: 'shop.example', path: '/', secure: false, httpOnly: false, name: 'sid', value: '1' };
    expect(addCookie(addCookie([], a), { ...a, value: '2' })).toEqual([{ ...a, value: '2' }]);
  });

  it('入れ物の文書は curl と同じ Netscape の形で、書いて読み直すと同じ札に戻る', () => {
    const jar = [
      { domain: 'shop.example', path: '/login', secure: false, httpOnly: false, name: 'PHPSESSID', value: 'old' },
      { domain: 'shop.example', path: '/', secure: true, httpOnly: true, name: 'PHPSESSID', value: 'new' },
    ];
    const text = jarText(jar);
    expect(text.split('\n')[0]).toBe('# Netscape HTTP Cookie File');
    expect(text).toContain('shop.example\tFALSE\t/login\tFALSE\t0\tPHPSESSID\told\n');
    expect(text).toContain('#HttpOnly_shop.example\tFALSE\t/\tTRUE\t0\tPHPSESSID\tnew\n');
    expect(parseJar(text)).toEqual(jar);
  });
});

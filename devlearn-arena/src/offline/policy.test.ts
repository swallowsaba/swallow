import { describe, expect, it } from 'vitest';
import { assetsToKeep, cacheName, routeOf, staleCaches } from './policy';

const SCOPE = 'https://swallowsaba.github.io/swallow/devlearn-arena/';
const get = (url: string, mode = 'cors') => routeOf({ method: 'GET', mode, url }, SCOPE);

describe('オフラインの扱い', () => {
  it('ページの読み込み（直リンク・リロード）は、回線を先に試すページとして扱う', () => {
    expect(get(SCOPE, 'navigate')).toBe('page');
    expect(get(`${SCOPE}index.html`, 'navigate')).toBe('page');
  });

  it('assets の下の素材（指紋付きの JS・CSS・フォント・wasm・レッスンの中身）は保持する', () => {
    for (const f of ['index-ede_NDyh.js', 'index-DAIVimsl.css', 'noto-sans-jp-6-400-normal-Bb-Rv9Wm.woff2', 'sql-wasm-browser-DfANybxk.wasm', 'linux.b.00-CkIIPZ7D.js']) {
      expect(get(`${SCOPE}assets/${f}`), f).toBe('asset');
    }
  });

  it('外のサイト・同じオリジンの別のアプリ・GET 以外・ソースマップ・Service Worker 自身には手を出さない', () => {
    expect(get('https://example.com/assets/x.js')).toBe('pass');
    expect(get('https://swallowsaba.github.io/swallow/other/assets/x.js')).toBe('pass');
    expect(routeOf({ method: 'POST', mode: 'cors', url: `${SCOPE}assets/x.js` }, SCOPE)).toBe('pass');
    expect(get(`${SCOPE}assets/index-ede_NDyh.js.map`)).toBe('pass');
    expect(get(`${SCOPE}sw.js`)).toBe('pass');
  });

  it('新しい版が動き出したら、このゲームの古い版の保持だけを消す', () => {
    expect(staleCaches([cacheName('a1'), cacheName('b2'), 'other-app-v1'], 'b2')).toEqual([cacheName('a1')]);
  });

  it('Service Worker が動く前に読んだ物から、保持する素材だけを選ぶ（重なりを除く）', () => {
    const urls = [`${SCOPE}assets/index-ede_NDyh.js`, `${SCOPE}assets/index-ede_NDyh.js`, `${SCOPE}#/city`, 'https://example.com/a.js', 'assets/linux.b.00-CkIIPZ7D.js', '::'];
    expect(assetsToKeep(urls, SCOPE)).toEqual([`${SCOPE}assets/index-ede_NDyh.js`, `${SCOPE}assets/linux.b.00-CkIIPZ7D.js`]);
  });
});

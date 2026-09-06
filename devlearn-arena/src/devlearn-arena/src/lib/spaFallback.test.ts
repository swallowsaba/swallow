import { describe, expect, it } from 'vitest';
import { restoredUrl } from './spaFallback';

const BASE = '/swallow-repo/devlearn-arena/';

describe('SPA フォールバックの復元', () => {
  it('パスを base の後ろに戻す', () => {
    expect(restoredUrl('?p=%2Flesson%2Fgit%2F01%2Fobjects', BASE)).toBe(
      '/swallow-repo/devlearn-arena/lesson/git/01/objects',
    );
  });

  it('クエリとハッシュも保持する', () => {
    expect(restoredUrl('?p=%2Fmap%3Fq%3D1%23top', BASE)).toBe('/swallow-repo/devlearn-arena/map?q=1#top');
  });

  it('末尾スラッシュの無い base でも二重スラッシュにしない', () => {
    expect(restoredUrl('?p=%2Fmap', '/devlearn-arena')).toBe('/devlearn-arena/map');
  });

  it('p が無ければ何もしない', () => {
    expect(restoredUrl('', BASE)).toBeNull();
    expect(restoredUrl('?q=1', BASE)).toBeNull();
    expect(restoredUrl('?p=', BASE)).toBeNull();
  });

  it('外部URLへのオープンリダイレクトを弾く', () => {
    expect(restoredUrl('?p=https%3A%2F%2Fevil.example', BASE)).toBeNull();
    expect(restoredUrl('?p=%2F%2Fevil.example', BASE)).toBeNull();
    expect(restoredUrl('?p=lesson', BASE)).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOT_SECONDS, bootMarkup, bootStrokes, finishBoot } from './boot';

/** 読み込み中の演出（docs/ui-design.md 9 章: 都市の輪郭が描かれていく。2 秒以内） */

/** index.html に書き込まれた時と同じように、演出を置いて小さな script を動かす */
function mount(): HTMLElement {
  document.body.innerHTML = bootMarkup();
  const script = document.querySelector('script');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(script?.textContent ?? '') as () => void;
  run();
  const el = document.getElementById('boot');
  if (!el) throw new Error('演出が無い');
  return el;
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.motion;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('読み込み中の演出', () => {
  it('地面 → 道路 → 建物 の順に線を引き、2 秒以内に描き終える', () => {
    const s = bootStrokes();
    const first = (kind: string): number => Math.min(...s.filter((x) => x.kind === kind).map((x) => x.at));
    expect(first('ground')).toBeLessThan(first('road'));
    expect(first('road')).toBeLessThan(first('build'));
    expect(Math.max(...s.map((x) => x.at + x.dur))).toBeLessThanOrEqual(BOOT_SECONDS);
    expect(BOOT_SECONDS).toBeLessThanOrEqual(2);
  });

  it('線は全て時間どおりに動き、文字を出さず、読み上げには何をしているかを伝える', () => {
    const el = mount();
    const paths = [...el.querySelectorAll('path')];
    expect(paths.length).toBe(bootStrokes().length);
    for (const p of paths) {
      // 線は長さを 1 として引き、建物の影絵（奥の線を隠す）は線と同時に現れる
      if (!p.classList.contains('mass')) expect(p.getAttribute('pathLength')).toBe('1');
      expect(p.style.animationDelay).toMatch(/s$/);
    }
    expect(el.querySelectorAll('path.mass').length).toBeGreaterThan(0);
    expect(el.textContent).toBe('');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('都市を読み込んでいる');
  });

  it('動きを減らす設定（保存の写し）なら、本体より先に止めた絵にする', () => {
    localStorage.setItem('devlearn-arena:settings', JSON.stringify({ reduceMotion: true }));
    mount();
    expect(document.documentElement.dataset.motion).toBe('reduced');
  });

  it('保存の写しが無い・壊れている時は、そのまま動かす', () => {
    localStorage.setItem('devlearn-arena:settings', '{壊れた');
    mount();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('都市が描けたら 0.3 秒で薄れて消え、その間も操作を妨げない', () => {
    vi.useFakeTimers();
    const el = mount();
    finishBoot();
    expect(el.classList.contains('is-done')).toBe(true);
    expect(document.getElementById('boot')).not.toBeNull();
    vi.advanceTimersByTime(300);
    expect(document.getElementById('boot')).toBeNull();
    // 2 回目は何もしない
    expect(() => finishBoot()).not.toThrow();
  });

  it('動きを減らす設定では、すぐ消える', () => {
    const el = mount();
    document.documentElement.dataset.motion = 'reduced';
    finishBoot();
    expect(el.isConnected).toBe(false);
  });
});

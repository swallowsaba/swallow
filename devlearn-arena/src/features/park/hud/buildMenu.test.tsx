import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DesignKind } from '@/city/model';
import { click, mount } from '@/visual/mountForTest';
import { BuildMenu } from './BuildMenu';
import { BUILD_TOOLS, isLocked, variantById, variantsOf, type BuildVariant } from './buildTools';

/**
 * 下の建設メニュー。8 つの道具が並び、未解放のものは暗い。
 * 道具を選ぶと、その上に種類の引き出しが開く。
 */

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('建設メニューの中身', () => {
  it('道具は 8 つ。順は道路・区画・住宅・オフィス・記念碑・倉庫・市役所・中継塔', () => {
    expect(BUILD_TOOLS.map((tool) => tool.kind)).toEqual([
      'road', 'zone', 'house', 'office', 'monument', 'depot', 'hall', 'relay',
    ]);
  });

  it('市役所と中継塔は 4 段目で解放される', () => {
    const late = BUILD_TOOLS.filter((tool) => tool.needs >= 4).map((tool) => tool.kind);
    expect(late).toEqual(['hall', 'relay']);
  });

  it('いまの段に届かない道具は使えない', () => {
    expect(isLocked(4, 1)).toBe(true);
    expect(isLocked(4, 4)).toBe(false);
    expect(isLocked(1, 1)).toBe(false);
  });

  it('どの道具にも建てられるものがある。規模は小さい順', () => {
    for (const tool of BUILD_TOOLS) {
      const list = variantsOf(tool.kind);
      expect(list.length, tool.kind).toBeGreaterThan(0);
      expect(list.every((v) => v.kind === tool.kind)).toBe(true);
      const levels = list.map((v) => v.level);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    }
  });

  it('種類は id から引ける', () => {
    expect(variantById('tower')?.kind).toBe('office');
    expect(variantById('nope')).toBeUndefined();
  });
});

/** 選んだ状態を持って描く。押した結果がそのまま見えるようにする */
function Harness({ milestone = 4, rights = 3 }: { milestone?: number; rights?: number }) {
  const [tool, setTool] = useState<DesignKind | null>(null);
  const [variant, setVariant] = useState<BuildVariant | null>(null);
  return (
    <BuildMenu
      milestone={milestone}
      rights={rights}
      tool={tool}
      variant={variant}
      onTool={(kind) => {
        setTool(kind);
        setVariant(kind === null ? null : (variantsOf(kind)[0] ?? null));
      }}
      onVariant={setVariant}
    />
  );
}

describe('建設メニューの操作', () => {
  it('8 つの道具が並ぶ', () => {
    const view = mount(<Harness />);
    expect([...view.querySelectorAll('[data-tool]')].map((el) => el.getAttribute('data-tool'))).toEqual([
      'road', 'zone', 'house', 'office', 'monument', 'depot', 'hall', 'relay',
    ]);
  });

  it('未解放の道具は暗くして、解放される段を出す', () => {
    const view = mount(<Harness milestone={1} />);
    const hall = view.querySelector('[data-tool="hall"]');
    expect(hall?.getAttribute('data-locked')).toBe('true');
    expect(hall?.hasAttribute('disabled')).toBe(true);
    expect(hall?.textContent).toContain('M4 で解放');
    // 開いているものには解放の断りを出さない
    expect(view.querySelector('[data-tool="road"]')?.getAttribute('data-locked')).toBeNull();
  });

  it('道具を選ぶと引き出しが開く。もう一度押すと閉じる', () => {
    const view = mount(<Harness />);
    expect(view.querySelector('[data-testid="build-drawer"]')).toBeNull();
    click(view, '[data-tool="office"]');
    const drawer = view.querySelector('[data-testid="build-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('小型オフィス');
    expect(drawer?.textContent).toContain('高層タワー');
    click(view, '[data-tool="office"]');
    expect(view.querySelector('[data-testid="build-drawer"]')).toBeNull();
  });

  it('引き出しの中も、段に届かないものは選べない', () => {
    const view = mount(<Harness milestone={2} />);
    click(view, '[data-tool="office"]');
    expect(view.querySelector('[data-variant="office1"]')?.hasAttribute('disabled')).toBe(false);
    expect(view.querySelector('[data-variant="tower"]')?.hasAttribute('disabled')).toBe(true);
    expect(view.querySelector('[data-variant="tower"]')?.textContent).toContain('M4 で解放');
  });

  it('種類を選ぶと、その種類だけが押された印になる', () => {
    const view = mount(<Harness />);
    click(view, '[data-tool="office"]');
    click(view, '[data-variant="office2"]');
    expect(view.querySelector('[data-variant="office2"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.querySelector('[data-variant="office1"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('建築権が無いときは、その旨を出す', () => {
    expect(mount(<Harness rights={0} />).querySelector('[data-testid="build-lead"]')?.textContent).toContain(
      '建築権がありません',
    );
  });
});

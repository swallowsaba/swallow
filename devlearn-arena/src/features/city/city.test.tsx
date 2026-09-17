import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CITIES } from '@/content/city';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import { FacilityLesson } from './FacilityLesson';

// jsdom では退場のアニメーションが終わらないので、動きを止めて段の切り替えをすぐ反映させる
beforeAll(() => {
  act(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, motion: 'reduced' } }));
  });
});

const record = CITIES.git.facilities[0];
if (!record) throw new Error('施設がありません');

function answerAll(view: HTMLElement, wrongFirst = false): void {
  for (let i = 0; i < 10; i += 1) {
    if (wrongFirst && view.querySelector('[data-correct="false"]:not([disabled])')) {
      click(view, '[data-correct="false"]:not([disabled])');
    }
    click(view, '[data-correct="true"]');
    const next = view.querySelector('[data-testid="exam-next"]');
    if (!next) return;
    click(view, '[data-testid="exam-next"]');
    if (view.querySelector('[data-testid="facility-built"]')) return;
  }
}

describe('施設の学習', () => {
  it('困りごと → 何なのか → なぜ → 仕組み → 落とし穴 → 審査 の順に進み、コマンドは打たない', () => {
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={vi.fn()} onClose={vi.fn()} firstMissionId={null} />
      </MemoryRouter>,
    );
    expect(view.textContent).toContain(record.trouble.text);
    // どの段にも絵があり、「次へ」はいつも同じ操作帯にある
    expect(view.querySelector('[data-testid="visual-trouble"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="footer-bar"] [data-testid="lesson-next"]')).not.toBeNull();
    click(view, '[data-testid="lesson-next"]');
    expect(view.textContent).toContain(record.analogy);
    expect(view.querySelector('[data-testid="visual-analogy"]')).not.toBeNull();
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('why');
    expect(view.querySelector('[data-testid="visual-why"]')).not.toBeNull();
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[data-station-state="now"]')?.getAttribute('data-station')).toBe('0');
    // 仕組みは 1 手順ずつ積み上がる
    expect(view.querySelectorAll('ol > li')).toHaveLength(1);
    for (let i = 1; i < record.how.length; i += 1) click(view, '[data-testid="lesson-next"]');
    expect(view.querySelectorAll('ol > li')).toHaveLength(record.how.length);
    click(view, '[data-testid="lesson-next"]');
    // 動きを見る：模範解答を 1 コマンドずつ、実際の状態図で見られる
    expect(view.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('demo');
    expect(view.querySelector('[data-testid="visual-demo"]')).not.toBeNull();
    const before = view.querySelector('[data-testid="demo-command"]')?.textContent;
    click(view, '[data-testid="demo-next"]');
    expect(view.querySelector('[data-testid="demo-command"]')?.textContent).not.toBe(before);
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('field');
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[data-testid="exam"]')).not.toBeNull();
    expect(view.querySelector('.xterm')).toBeNull();
  });

  it('間違えても建たず、理由を読んで全部正しく判断すると施設が建つ', () => {
    const onBuild = vi.fn();
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={onBuild} onClose={vi.fn()} firstMissionId="git/01/objects" />
      </MemoryRouter>,
    );
    click(view, '[data-step="exam"]');
    click(view, '[data-correct="false"]');
    expect(onBuild).not.toHaveBeenCalled();
    expect(view.querySelector('[data-testid="exam-next"]')).toBeNull();
    answerAll(view, true);
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(view.querySelector('[data-testid="facility-built"]')).not.toBeNull();
    expect(view.querySelector('a[href="/?mission=git%2F01%2Fobjects"]')).not.toBeNull();
  });

  it('正解すると、なぜそれが正しいのかを見せる', () => {
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={vi.fn()} onClose={vi.fn()} firstMissionId={null} />
      </MemoryRouter>,
    );
    click(view, '[data-step="exam"]');
    click(view, '[data-correct="true"]');
    expect(view.querySelector('[data-testid="explain"]')?.textContent?.length).toBeGreaterThan(10);
  });
});

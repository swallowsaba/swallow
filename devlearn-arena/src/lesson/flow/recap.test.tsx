import { describe, expect, it, vi } from 'vitest';
import { missionById } from '@/engines/lesson/registry';
import { click, mount } from '@/visual/mountForTest';
import { RecapScreen, type RecapData } from './RecapScreen';

/**
 * 学びの流れの 5 段目「振り返り」（REWORK 1-6・2-3）。
 * 始める前と終えた後の街を左右に並べ、分かったことを 3 行でまとめる。
 */

const lesson = missionById('k8s/01/first-kubectl')?.build();
if (lesson === undefined) throw new Error('任務が無い');

function data(overrides: Partial<RecapData> = {}): RecapData {
  return {
    key: 1,
    title: lesson?.title ?? '',
    score: 90,
    xp: 40,
    rights: 2,
    recap: lesson?.recap ?? { before: '', after: '', lines: ['', '', ''] },
    before: 'data:image/jpeg;base64,AAAA',
    after: 'data:image/jpeg;base64,BBBB',
    ...overrides,
  };
}

const q = (view: Element, id: string) => view.querySelector(`[data-testid="${id}"]`);

describe('振り返りの画面', () => {
  it('始める前と終えた後の街を、写真と一言で左右に並べる', () => {
    const view = mount(<RecapScreen data={data()} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(q(view, 'recap-before')?.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(q(view, 'recap-after')?.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB');
    expect(q(view, 'recap-before')?.textContent).toContain(lesson.recap.before);
    expect(q(view, 'recap-after')?.textContent).toContain(lesson.recap.after);
  });

  it('分かったことを 3 行で出し、手に入れた建築権を出す', () => {
    const view = mount(<RecapScreen data={data({ rights: 2 })} onRetry={vi.fn()} onClose={vi.fn()} />);
    const lines = [...(q(view, 'recap-lines')?.querySelectorAll('li') ?? [])].map((li) => li.textContent);
    expect(lines).toHaveLength(3);
    lesson.recap.lines.forEach((line, i) => {
      expect(lines[i]).toContain(line);
    });
    expect(q(view, 'recap-rights')?.textContent).toContain('+2');
  });

  it('写真が撮れなかったときは、枠に理由を出す（空の画像を出さない）', () => {
    const view = mount(<RecapScreen data={data({ before: null })} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(q(view, 'recap-before')?.querySelector('img')).toBeNull();
    expect(q(view, 'recap-before')?.textContent).toContain('写真を撮れなかった');
  });

  it('次の任務・もう一度・街を眺める、の 3 つの道がある', () => {
    const onNext = vi.fn();
    const onRetry = vi.fn();
    const onClose = vi.fn();
    const view = mount(<RecapScreen data={data()} nextLabel="次の任務" onNext={onNext} onRetry={onRetry} onClose={onClose} />);
    expect(q(view, 'recap-next')?.textContent).toContain('次の任務');
    click(view, '[data-testid="recap-next"]');
    click(view, '[data-testid="recap-retry"]');
    click(view, '[data-testid="recap-close"]');
    expect([onNext.mock.calls.length, onRetry.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('次の任務が無ければ、次へのボタンを出さない', () => {
    const view = mount(<RecapScreen data={data()} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(q(view, 'recap-next')).toBeNull();
  });

  it('学びの流れの印は 5 段目「振り返り」にいる', () => {
    const view = mount(<RecapScreen data={data()} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(view.querySelector('[aria-current="step"]')?.textContent).toContain('振り返り');
  });
});

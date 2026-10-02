import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_FUNDS } from '@/city/rules';
import type { LearningRecord } from '@/game/records';
import { localIso } from '../clock';
import { createSession, type Session } from '../session';
import { parseHash } from '../../router';
import { TopBar } from '@/ui/TopBar';
import { GrowthScreen } from './GrowthScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 今日から days 日前の 19 時（端末の地方時） */
const daysAgo = (days: number): string => {
  const d = new Date();
  return localIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, 19, 0, 0));
};

/** Linux の初級 1 本: 4 問を全て初回で正解・実戦はヒント無しで成功・まとめまで */
const linux = (at: string): LearningRecord => ({
  kind: 'lesson', lessonId: 'linux.b.01', at,
  quiz: [1, 2, 3, 4].map((n) => ({ quizId: `q${String(n)}`, correct: true })),
  practice: [{ success: true }],
  complete: true,
});

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

const text = (host: HTMLElement, id: string): string => host.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

function open(session: Session, onClose = () => {}): HTMLDivElement {
  return mount(<GrowthScreen session={session} onClose={onClose} />);
}

describe('学習で得た開発資金（docs/game-design.md 2 章）', () => {
  it('学習の記録を与えると、得た XP と同じ量が都市の資金に入る', () => {
    const session = createSession(1);
    expect(session.city.getState().city.funds).toBe(INITIAL_FUNDS);
    const outcome = session.progress.getState().learn([linux(daysAgo(0))]);
    expect(outcome.funds).toBeGreaterThan(0);
    expect(outcome.funds).toBe(session.progress.getState().progress.xp);
    expect(session.city.getState().city.funds).toBe(INITIAL_FUNDS + outcome.funds);
  });

  it('同じレッスンを同じ日に繰り返しても、資金は増えない（稼ぎ防止）', () => {
    const session = createSession(1);
    session.progress.getState().learn([linux(daysAgo(0))]);
    const funds = session.city.getState().city.funds;
    const again = session.progress.getState().learn([{ ...linux(daysAgo(0)), at: localIso(new Date()) }]);
    expect(again.funds).toBe(0);
    expect(session.city.getState().city.funds).toBe(funds);
  });
});

describe('成長画面（docs/ui-design.md 2 章: XP・スキル・学習履歴）', () => {
  it('記録が無ければ、見習い・0 XP・全分野のスキル 0 で、学習履歴は案内だけ', () => {
    const host = open(createSession(1));
    expect(text(host, 'growth-rank')).toBe('見習い');
    expect(text(host, 'growth-xp')).toBe('0');
    expect(host.querySelectorAll('[data-testid^="skill-"]:not([data-testid="skill-breakdown"])')).toHaveLength(16);
    expect(host.querySelector('[data-testid="history-empty"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="history-entry"]')).toHaveLength(0);
  });

  it('学ぶと XP・スキルの値・学習履歴が出て、一番高い分野の内訳を「何をしたからこの値か」で見せる', () => {
    const session = createSession(1);
    session.progress.getState().learn([linux(daysAgo(0))]);
    const host = open(session);
    const xp = session.progress.getState().progress.xp;
    expect(text(host, 'growth-xp')).toBe(xp.toLocaleString('ja-JP'));
    // 修了 1/37（重み）× 40 = 1.08 + クイズ 25 + 実戦 25 + 定着 10 → 61（中級）
    expect(text(host, 'skill-linux')).toContain('61');
    expect(text(host, 'skill-linux')).toContain('中級');
    const breakdown = text(host, 'skill-breakdown');
    expect(breakdown).toContain('Linux / CLI 中級エンジニア');
    expect(breakdown).toContain('修了 1 / 21 本');
    expect(text(host, 'part-completion')).toContain('1.1 / 40');
    expect(text(host, 'part-quizFirstTry')).toContain('直近 4 問のうち 4 問を初回で正解');
    expect(text(host, 'part-practiceSuccess')).toContain('ヒント無しで成功 1');
    expect(text(host, 'part-retention')).toContain('10 / 10');
    expect(host.querySelectorAll('[data-testid="history-entry"]').length).toBeGreaterThan(0);
  });

  it('分野を押すと、その分野の内訳に切り替わる', () => {
    const session = createSession(1);
    session.progress.getState().learn([linux(daysAgo(0))]);
    const host = open(session);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="skill-k8s"]')?.click());
    expect(host.querySelector('[data-testid="skill-k8s"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(text(host, 'skill-breakdown')).toContain('Kubernetes');
    expect(text(host, 'skill-breakdown')).toContain('まだ学習の記録が無い');
  });

  it('予定日を過ぎた復習があれば、定着度が下がったことを罰ではなく知らせとして出す', () => {
    const session = createSession(1);
    // 10 日前に修了し、翌日の復習をしていない
    session.progress.getState().learn([linux(daysAgo(10))]);
    const host = open(session);
    expect(text(host, 'part-retention')).toContain('0 / 10');
    expect(text(host, 'review-notice')).toContain('予定日を過ぎた復習が 1 枚');
  });

  it('次のエンジニア段階までの XP を示す', () => {
    const session = createSession(1);
    session.progress.getState().learn([{ kind: 'mission', missionId: 'm1', xp: 400, at: daysAgo(0) }]);
    const host = open(session);
    expect(host.textContent).toContain('次の「ジュニア」まで あと 600 XP');
  });

  it('Esc と「都市へ戻る」で閉じる', () => {
    const onClose = vi.fn();
    const host = open(createSession(1), onClose);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    act(() => host.querySelector<HTMLButtonElement>('.window-close')?.click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('上の帯の XP（docs/ui-design.md 2・3 章）', () => {
  it('XP とエンジニア段階を出し、押すと成長画面への入口を呼ぶ', () => {
    const onEntry = vi.fn();
    const host = mount(<TopBar cityName="みどり市" funds={1500} xp={1234} rankName="ジュニア" population={0} stageName="村" onEntry={onEntry} />);
    const xp = host.querySelector<HTMLButtonElement>('[data-testid="topbar-xp"]');
    expect(xp?.textContent).toContain('ジュニア');
    expect(xp?.textContent).toContain('1,234');
    act(() => xp?.click());
    expect(onEntry).toHaveBeenCalledWith('growth');
  });

  it('成長画面は直リンク（#/growth）で開ける', () => {
    expect(parseHash('#/growth')).toEqual({ name: 'growth' });
    expect(parseHash('#/city')).toEqual({ name: 'city' });
  });
});

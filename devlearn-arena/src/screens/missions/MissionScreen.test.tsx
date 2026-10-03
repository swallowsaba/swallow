import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { missionOf } from '@/content/missions';
import { answerOf } from '@/learning/practice';
import { FakeScreen } from '../lesson/terminal/fakeScreen';
import { createSession, type Session } from '../session';
import { MissionScreen } from './MissionScreen';
import { MissionsScreen } from './MissionsScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* 本物の xterm は jsdom で描けないので、画面の模型で受ける（src/screens/lesson/LessonScreen.test.tsx と同じ） */
const terms: { screen: FakeScreen; feed: ((d: string) => void) | null }[] = [];
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    private t = { screen: new FakeScreen(80), feed: null as ((d: string) => void) | null };
    constructor() {
      terms.push(this.t);
    }
    loadAddon(): void {}
    open(): void {}
    write(data: string): void {
      this.t.screen.write(data);
    }
    onData(cb: (d: string) => void) {
      this.t.feed = cb;
      return { dispose: () => undefined };
    }
    focus(): void {}
    dispose(): void {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
    proposeDimensions() {
      return undefined;
    }
  },
}));
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function typeLine(line: string): void {
  const t = terms[terms.length - 1];
  if (!t?.feed) throw new Error('端末が開いていない');
  const feed = t.feed;
  act(() => {
    for (const ch of line) feed(ch);
    feed('\r');
  });
}

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(node: JSX.Element): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}
const $ = <T extends Element = HTMLElement>(host: ParentNode, sel: string): T => {
  const el = host.querySelector<T>(sel);
  if (!el) throw new Error(`見つからない: ${sel}`);
  return el;
};
const click = (el: Element): void => act(() => (el as HTMLElement).click());

function openRun(session: Session, id: string) {
  const handlers = { onExit: vi.fn(), onBoard: vi.fn(), onLesson: vi.fn(), onGlossary: vi.fn() };
  const host = mount(<MissionScreen session={session} missionId={id} {...handlers} />);
  return { host, ...handlers };
}

/** 全ての手順の最後のヒントの答えを打つ */
function solve(id: string): void {
  const m = missionOf(id);
  if (!m) throw new Error(id);
  for (const step of m.practice.steps) for (const line of answerOf(step)) typeLine(line);
}

describe('ミッション一覧（docs/ui-design.md 2 章・docs/game-design.md 8 章）', () => {
  it('6 本の全てが並び、選ぶと都市の課題・必要な知識・おすすめのレッスン・報酬と、できるようになることが出る', () => {
    const onSelect = vi.fn();
    const host = mount(<MissionsScreen session={createSession(1)} onClose={vi.fn()} onSelect={onSelect} onStart={vi.fn()} onLesson={vi.fn()} onGlossary={vi.fn()} />);
    expect(host.querySelectorAll('.mission-row')).toHaveLength(6);
    click($(host, '[data-testid="mission-row-https"]'));
    expect(onSelect).toHaveBeenCalledWith('https');
    expect($(host, '[data-testid="mission-title"]').textContent).toBe('HTTPS を有効にせよ');
    expect($(host, '[data-testid="mission-knowledge"]').querySelectorAll('li')).toHaveLength(3);
    expect($(host, '[data-testid="mission-lessons"]').textContent).toContain('Web サーバに TLS を設定する');
    const reward = $(host, '[data-testid="mission-reward"]').textContent ?? '';
    expect(reward).toContain('+200');
    expect(reward).toContain('鍵の門');
    expect(reward).toContain('できるようになること');
  });

  it('どのミッションも前提なしで「受ける」を押せ、押すとそのミッションの実戦へ', () => {
    const onStart = vi.fn();
    const host = mount(<MissionsScreen session={createSession(1)} missionId="k8s-app" onClose={vi.fn()} onSelect={vi.fn()} onStart={onStart} onLesson={vi.fn()} onGlossary={vi.fn()} />);
    const start = $<HTMLButtonElement>(host, '[data-testid="mission-start"]');
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain('このミッションを受ける');
    click(start);
    expect(onStart).toHaveBeenCalledWith('k8s-app');
  });
});

describe('ミッションの実戦（docs/ui-design.md 2.1）', () => {
  it('開くと挑戦中になり、依頼を出した施設の中の景色で、実戦の手順と端末が出る', () => {
    const session = createSession(1);
    const { host } = openRun(session, 'web-server');
    expect(session.progress.getState().progress.missions['web-server']?.status).toBe('in-progress');
    expect($(host, '[data-testid="mission-backdrop"]').dataset.facility).toBe('server');
    expect(host.querySelectorAll('.practice-step')).toHaveLength(4);
  });

  it('最後のヒントの通りに打つと達成し、報酬（XP・XP と同じ量 + 報酬の資金）が入り、受け取った報酬と記念碑が出る', () => {
    const session = createSession(1);
    const funds = session.city.getState().city.funds;
    const { host, onExit } = openRun(session, 'web-server');
    solve('web-server');
    click($(host, '[data-testid="lesson-next"]'));
    const result = $(host, '[data-testid="mission-result"]');
    expect(result.dataset.rewarded).toBe('true');
    expect($(host, '[data-testid="mission-result-kind"]').textContent).toContain('ミッション達成');
    const p = session.progress.getState().progress;
    expect(p.missions['web-server']?.status).toBe('completed');
    expect(p.xp).toBe(150);
    expect(session.city.getState().city.funds).toBe(funds + 150 + 400);
    expect($(host, '[data-testid="mission-prize"]').textContent).toContain('灯台の記念碑');
    click($(host, '[data-testid="mission-to-city"]'));
    expect(onExit).toHaveBeenCalled();
  });

  it('途中で終えると未達で、報酬は無く、残った手順と再挑戦の道が出る。再挑戦は初めの状態から', () => {
    const session = createSession(1);
    const { host } = openRun(session, 'git-history');
    typeLine('git add notice.txt');
    typeLine('git commit -m "平日は 8 時に開館"');
    click($(host, '[data-testid="practice-giveup"]'));
    expect($(host, '[data-testid="mission-result"]').dataset.result).toBe('retry');
    expect(session.progress.getState().progress.xp).toBe(0);
    expect(session.progress.getState().progress.missions['git-history']).toMatchObject({ status: 'in-progress', practice: [{ success: false }] });
    expect(host.querySelectorAll('.result-list.is-todo li')).toHaveLength(3);
    click($(host, '[data-testid="lesson-back"]'));
    expect(host.querySelectorAll('.practice-step.is-done')).toHaveLength(0);
  });

  it('達成した後にもう一度通しても、報酬は無い', () => {
    const session = createSession(1);
    let opened = openRun(session, 'container-run');
    solve('container-run');
    click($(opened.host, '[data-testid="lesson-next"]'));
    const xp = session.progress.getState().progress.xp;
    act(() => roots.forEach((r) => r.unmount()));
    roots = [];
    opened = openRun(session, 'container-run');
    solve('container-run');
    click($(opened.host, '[data-testid="lesson-next"]'));
    expect($(opened.host, '[data-testid="mission-result"]').dataset.rewarded).toBe('false');
    expect(session.progress.getState().progress.xp).toBe(xp);
  });
});

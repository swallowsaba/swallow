import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRIES, entryOf, recommendedRank } from '@/content/catalog';
import type { DomainId } from '@/content/schema';
import type { LearningRecord } from '@/game/records';
import { localIso } from '../clock';
import { createSession, type Session } from '../session';
import { hashOf, parseHash, type Route } from '../../router';
import { LearnScreen } from './LearnScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return { host, root };
}

interface Opened {
  host: HTMLDivElement;
  onClose: ReturnType<typeof vi.fn>;
  onView: ReturnType<typeof vi.fn>;
  onSelect: ReturnType<typeof vi.fn>;
  onStart: ReturnType<typeof vi.fn>;
}

function open(session: Session, opts: { view?: 'list' | 'graph'; lessonId?: string; domain?: DomainId; start?: (id: string) => void } = {}): Opened {
  const onClose = vi.fn();
  const onView = vi.fn();
  const onSelect = vi.fn();
  const onStart = vi.fn(opts.start ?? (() => {}));
  const { host } = mount(
    <LearnScreen
      session={session}
      view={opts.view ?? 'list'}
      lessonId={opts.lessonId}
      domain={opts.domain}
      onClose={onClose}
      onView={onView}
      onSelect={onSelect}
      onStart={onStart}
    />,
  );
  return { host, onClose, onView, onSelect, onStart };
}

const $ = <T extends Element = HTMLElement>(host: HTMLElement, sel: string): T => {
  const el = host.querySelector<T>(sel);
  if (!el) throw new Error(`見つからない: ${sel}`);
  return el;
};
const click = (el: Element): void => act(() => (el as HTMLElement).click());
const type = (input: HTMLInputElement, value: string): void => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const key = (k: string, target: EventTarget = window): void => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});
const rows = (host: HTMLElement): string[] => [...host.querySelectorAll<HTMLElement>('.lib-row')].map((r) => r.dataset.lesson ?? '');
const count = (host: HTMLElement): number => Number(($(host, '[data-testid="lib-count"]').textContent ?? '').replace(/\D/g, ''));

/** 今日の 19 時に、そのレッスンを全問正解・ヒント無しで修了した記録 */
const done = (lessonId: string): LearningRecord => {
  const d = new Date();
  return {
    kind: 'lesson', lessonId, at: localIso(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 0, 0)),
    quiz: [1, 2, 3].map((n) => ({ quizId: `q${String(n)}`, correct: true })),
    practice: [{ success: true }],
    complete: true,
  };
};

describe('学習ライブラリ（docs/ui-design.md 6 章）', () => {
  it('全レッスンを、分野ごと・推奨学習順に並べる', () => {
    const { host } = open(createSession(1));
    const ids = rows(host);
    expect(ids).toHaveLength(ENTRIES.length);
    expect(count(host)).toBe(ENTRIES.length);
    expect(ids).toEqual([...ENTRIES].sort((a, b) => recommendedRank(a.id) - recommendedRank(b.id)).map((e) => e.id));
    expect(ids[0]).toBe('found.b.01');
  });

  it('どのレッスンも、選ぶと「このまま始める」が押せて、押すとそのレッスンを始める（ロックが無い）', () => {
    const { host, onStart } = open(createSession(1));
    for (const id of rows(host)) {
      click($(host, `[data-lesson="${id}"]`));
      const card = $(host, '[data-testid="entry-card"]');
      expect(card.querySelector('.entry-id')?.textContent, id).toBe(id);
      // 札の中に、押せないボタンが 1 つも無い
      const disabled = [...card.querySelectorAll('button')].filter((b) => b.disabled || b.getAttribute('aria-disabled') === 'true');
      expect(disabled, id).toEqual([]);
      click($(host, '[data-testid="entry-start"]'));
      expect(onStart).toHaveBeenLastCalledWith(id);
    }
    expect(onStart).toHaveBeenCalledTimes(ENTRIES.length);
  });

  it('推奨前提を学んでいない時は「先に見ると分かりやすい」と案内し、「このまま始める」と「先に〇〇を見る」を並べる', () => {
    const { host, onSelect } = open(createSession(1), { lessonId: 'linux.i.01' });
    const pre = entryOf('linux.b.08');
    expect($(host, '[data-testid="entry-advice"]').textContent).toBe(`先に「${pre?.title ?? ''}」を見ておくと分かりやすい。このまま始めてもよい。`);
    expect($(host, '[data-testid="entry-start"]').textContent).toBe('このまま始める');
    expect($(host, '[data-testid="entry-first"]').textContent).toBe(`先に「${pre?.title ?? ''}」を見る`);
    // 先に見る → 札が前提のレッスンに移る（1 回で飛べる）
    click($(host, '[data-testid="entry-first"]'));
    expect($(host, '.entry-id').textContent).toBe('linux.b.08');
    expect(onSelect).toHaveBeenLastCalledWith('linux.b.08');
  });

  it('推奨前提を修了していれば、案内も「先に見る」も出さない', () => {
    const session = createSession(1);
    session.progress.getState().learn([done('linux.b.08')]);
    const { host } = open(session, { lessonId: 'linux.i.01' });
    expect(host.querySelector('[data-testid="entry-advice"]')).toBeNull();
    expect(host.querySelector('[data-testid="entry-first"]')).toBeNull();
    expect($(host, '.entry-links[aria-label="推奨前提"] .entry-link').className).toContain('is-completed');
  });

  it('前提・関連・次のレッスンを押すと、その札へ移る', () => {
    const { host } = open(createSession(1), { lessonId: 'linux.i.01' });
    click($(host, '.entry-links[aria-label="次に学ぶとよい"] .entry-link'));
    expect($(host, '.entry-id').textContent).toBe('linux.i.02');
    click($(host, '.entry-links[aria-label="関連"] .entry-link'));
    expect($(host, '.entry-id').textContent).toBe(entryOf('linux.i.02')?.related[0]);
  });

  it('始めると学習中になり、ボタンが「続きから学ぶ」に、修了すると「もう一度学ぶ」に変わる', () => {
    const session = createSession(1);
    const { host } = open(session, { lessonId: 'found.b.04', start: (id) => session.progress.getState().start(id, localIso(new Date())) });
    click($(host, '[data-testid="entry-start"]'));
    expect(session.progress.getState().progress.lessons['found.b.04']?.status).toBe('in-progress');
    expect($(host, '[data-testid="entry-status"]').className).toContain('is-in-progress');
    expect($(host, '[data-testid="entry-start"]').textContent).toBe('続きから学ぶ');
    expect($(host, '[data-lesson="found.b.04"] .lib-row-status').textContent).toBe('学習中');
    act(() => {
      session.progress.getState().learn([done('found.b.04')]);
    });
    expect($(host, '[data-testid="entry-start"]').textContent).toBe('もう一度学ぶ');
  });

  it('書き起こしたレッスンは、目安の時間を中身から読む。まだのレッスンは 10〜20 分', async () => {
    const { host } = open(createSession(1), { lessonId: 'linux.i.01' });
    // 中身は後から読み込む。全てのテストを並べて動かすと 50ms では読み終わらないことがあるので、読めるまで待つ
    await vi.waitFor(() => {
      expect($(host, '.entry-facts').textContent).toMatch(/目安\d+ 分/);
    });
    click($(host, '[data-lesson="net.b.01"]'));
    expect($(host, '.entry-facts').textContent).toContain('目安10〜20 分');
  });

  it('検索は題名・目標・テーマ・分野の名前に当たる。当たらなければ案内を出す', () => {
    const { host } = open(createSession(1));
    const search = $<HTMLInputElement>(host, '[data-testid="lib-search"]');
    type(search, 'systemd');
    expect(rows(host)).toContain('linux.i.01');
    expect(count(host)).toBe(rows(host).length);
    expect(rows(host).every((id) => {
      const e = entryOf(id);
      return [e?.title, e?.goal, e?.theme].some((s) => s?.toLowerCase().includes('systemd'));
    })).toBe(true);
    type(search, 'Kubernetes');
    expect(rows(host).length).toBeGreaterThan(0);
    expect(rows(host).filter((id) => id.startsWith('k8s.'))).toHaveLength(ENTRIES.filter((e) => e.domain === 'k8s').length);
    type(search, 'ありえない言葉xyz');
    expect(rows(host)).toEqual([]);
    expect($(host, '.lib-none').textContent).toContain('当てはまるレッスンが無い');
  });

  it('難易度と修了状況で絞り込める（重ねて絞れる。もう一度押すと外れる）', () => {
    const session = createSession(1);
    session.progress.getState().learn([done('linux.b.01'), done('net.b.01')]);
    const { host } = open(session);
    const chip = (label: string): HTMLButtonElement => {
      const b = [...host.querySelectorAll<HTMLButtonElement>('.lib-chip')].find((x) => x.textContent === label);
      if (!b) throw new Error(label);
      return b;
    };
    click(chip('上級'));
    expect(rows(host).length).toBe(ENTRIES.filter((e) => e.level === 'advanced').length);
    expect(rows(host).every((id) => entryOf(id)?.level === 'advanced')).toBe(true);
    click(chip('上級'));
    click($(host, '[data-testid="lib-status-completed"]'));
    expect(rows(host)).toEqual(['linux.b.01', 'net.b.01']);
    click(chip('中級'));
    expect(rows(host)).toEqual([]);
  });

  it('分野を渡されると（情報パネルの「全部見る」）、その分野だけを出し、絞り込みは外せる', () => {
    const { host } = open(createSession(1), { domain: 'k8s' });
    expect(rows(host).every((id) => id.startsWith('k8s.'))).toBe(true);
    expect(rows(host)).toHaveLength(ENTRIES.filter((e) => e.domain === 'k8s').length);
    click($(host, '.lib-chip.is-domain'));
    expect(rows(host)).toHaveLength(ENTRIES.length);
  });

  it('分野の目次に、修了の数と全体の数を出す', () => {
    const session = createSession(1);
    session.progress.getState().learn([done('linux.b.01')]);
    const { host } = open(session);
    expect($(host, '[data-testid="lib-index-linux"] .lib-index-count').textContent).toBe(`1/${String(ENTRIES.filter((e) => e.domain === 'linux').length)}`);
  });

  it('Esc で都市へ戻る。G で知識グラフ、L で一覧（検索欄に打っている間は切り替えない）', () => {
    const { host, onClose, onView } = open(createSession(1));
    key('g', $(host, '[data-testid="lib-search"]'));
    expect(onView).not.toHaveBeenCalled();
    key('g');
    expect(onView).toHaveBeenLastCalledWith('graph');
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('「都市へ戻る」で閉じる', () => {
    const { host, onClose } = open(createSession(1));
    click($(host, '.window-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('知識グラフ（docs/ui-design.md 6 章）', () => {
  it('分野を大きな点、レッスンを小さな点で描き、分野どうしの推奨前提を矢印で描く', () => {
    const { host } = open(createSession(1), { view: 'graph' });
    expect(host.querySelectorAll('.graph-domain')).toHaveLength(16);
    expect(host.querySelectorAll('.graph-lesson')).toHaveLength(ENTRIES.length);
    expect(host.querySelectorAll('.graph-domain-edge').length).toBeGreaterThan(0);
    for (const e of host.querySelectorAll('.graph-domain-edge')) expect(e.getAttribute('marker-end')).toBe('url(#kg-arrow)');
  });

  it('修了したレッスンが光り、分野の輪が修了の割合だけ光る', () => {
    const session = createSession(1);
    session.progress.getState().learn([done('linux.b.01')]);
    const { host } = open(session, { view: 'graph' });
    const lit = [...host.querySelectorAll('.graph-lesson.is-completed')].map((g) => g.querySelector('[data-lesson]')?.getAttribute('data-lesson'));
    expect(lit).toEqual(['linux.b.01']);
    expect(host.querySelector('.graph-lesson.is-completed .graph-glow')).not.toBeNull();
    expect(host.querySelector('[data-domain="linux"] .graph-domain-ring')).not.toBeNull();
    expect(host.querySelector('[data-domain="net"] .graph-domain-ring')).toBeNull();
  });

  it('レッスンの点を押すと入口の札が出て、その推奨前提（入る辺）と、それを前提にするレッスン（出る辺）を描く', () => {
    const { host, onSelect } = open(createSession(1), { view: 'graph' });
    act(() => {
      $(host, 'circle[data-lesson="linux.i.01"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenLastCalledWith('linux.i.01');
    expect($(host, '.entry-id').textContent).toBe('linux.i.01');
    const into = ENTRIES.filter((e) => e.id === 'linux.i.01').flatMap((e) => e.prerequisites);
    const out = ENTRIES.filter((e) => e.prerequisites.includes('linux.i.01'));
    expect(host.querySelectorAll('.graph-lesson-edge.is-in')).toHaveLength(into.length);
    expect(host.querySelectorAll('.graph-lesson-edge.is-out')).toHaveLength(out.length);
    // 札の「このまま始める」はグラフからでも押せる
    expect($<HTMLButtonElement>(host, '[data-testid="entry-start"]').disabled).toBe(false);
  });

  it('L で一覧へ戻す', () => {
    const { onView } = open(createSession(1), { view: 'graph' });
    key('l');
    expect(onView).toHaveBeenLastCalledWith('list');
  });
});

describe('道すじ（docs/ui-design.md 2.1: 直リンクとブラウザの「戻る」）', () => {
  it('学習ライブラリ・知識グラフ・用語集のハッシュを読み書きできる', () => {
    const routes: Route[] = [
      { name: 'learn', view: 'list' },
      { name: 'learn', view: 'list', lessonId: 'linux.i.01' },
      { name: 'learn', view: 'graph', lessonId: 'found.b.04' },
      { name: 'learn', view: 'list', domain: 'k8s' },
      { name: 'glossary' },
      { name: 'glossary', termId: 'path' },
    ];
    for (const r of routes) expect(parseHash(hashOf(r))).toEqual(r);
    expect(hashOf({ name: 'learn', view: 'list', lessonId: 'linux.i.01' })).toBe('#/learn/linux.i.01');
  });

  it('知らない分野やレッスン ID の形でない物は無視する', () => {
    expect(parseHash('#/learn/<script>?domain=nope')).toEqual({ name: 'learn', view: 'list' });
    expect(parseHash('#/glossary/../x')).toEqual({ name: 'glossary' });
  });
});

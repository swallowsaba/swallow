import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryOf } from '@/content/catalog';
import { termOf, wordOf } from '@/content/glossary';
import { loadLesson } from '@/content/lessons';
import type { Lesson } from '@/content/schema';
import { createSession, type Session } from '../session';
import { LessonScreen } from './LessonScreen';
import { FakeScreen } from './terminal/fakeScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * 本物の xterm は jsdom で描けないので、書き込まれた文字を画面の模型（FakeScreen）で受け、
 * キーの入力は onData の受け口へ直接流す（src/screens/lesson/terminal/terminalView.test.tsx と同じ）
 */
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

/** 今の端末で 1 行打って Enter */
function typeLine(line: string): void {
  const t = terms[terms.length - 1];
  if (!t?.feed) throw new Error('端末が開いていない');
  const feed = t.feed;
  act(() => {
    for (const ch of line) feed(ch);
    feed('\r');
  });
}
const screenText = (): string => terms[terms.length - 1]?.screen.lines().join('\n') ?? '';

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

interface Opened {
  host: HTMLDivElement;
  root: Root;
  onExit: ReturnType<typeof vi.fn>;
  onLesson: ReturnType<typeof vi.fn>;
  onGlossary: ReturnType<typeof vi.fn>;
}

/** レッスン画面を開き、中身の読み込みを待つ */
async function open(session: Session, lessonId: string): Promise<Opened> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onExit = vi.fn();
  const onLesson = vi.fn();
  const onGlossary = vi.fn();
  act(() => {
    root.render(<LessonScreen session={session} lessonId={lessonId} onExit={onExit} onLesson={onLesson} onGlossary={onGlossary} />);
  });
  // 中身の読み込み（分野ごとに後から読む）を待つ
  for (let i = 0; i < 100 && !host.querySelector('.stage'); i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  return { host, root, onExit, onLesson, onGlossary };
}

const $ = <T extends Element = HTMLElement>(host: ParentNode, sel: string): T => {
  const el = host.querySelector<T>(sel);
  if (!el) throw new Error(`見つからない: ${sel}`);
  return el;
};
const click = (el: Element): void => act(() => (el as HTMLElement).click());
const next = (host: HTMLElement): void => click($(host, '[data-testid="lesson-next"]'));
const nextEnabled = (host: HTMLElement): boolean => !$<HTMLButtonElement>(host, '[data-testid="lesson-next"]').disabled;
const key = (k: string): void => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
});
const stageOf = (s: Session, id: string): string | undefined => s.progress.getState().progress.lessons[id]?.stage;
/** クイズで得た XP（スキルの段階の上がりの +50 は別に数える） */
const quizXp = (s: Session): number => s.progress.getState().progress.xpLog.filter((e) => e.source === 'quiz').reduce((n, e) => n + e.amount, 0);
const lesson = async (id: string): Promise<Lesson> => {
  const l = await loadLesson(id);
  if (!l) throw new Error(id);
  return l;
};

/** 解説の 5 画面を進めて、理解の段へ */
function throughExplain(host: HTMLElement): void {
  for (let i = 0; i < 5; i += 1) next(host);
}

/** 理解の段を正しく答えて進む（found.b.04） */
function throughUnderstand(host: HTMLElement, l: Lesson): void {
  // 図を押す
  act(() => {
    $(host, '[data-testid="lesson-figure"] [data-part="minato"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  next(host);
  // 用語と説明を結ぶ
  const u = l.understand[1];
  if (u?.kind !== 'match') throw new Error('2 問目が結ぶ問題でない');
  const [lefts, rights] = [...host.querySelectorAll('.match-col')].map((c) => [...c.querySelectorAll<HTMLButtonElement>('.match-item')]);
  for (const [a, b] of u.pairs) {
    const word = a.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, id: string) => wordOf(id));
    click(lefts?.find((x) => x.textContent?.includes(word)) as HTMLButtonElement);
    click(rights?.find((x) => x.textContent?.includes(b)) as HTMLButtonElement);
  }
  click($(host, '.stage-check'));
  next(host);
  // はい・いいえ
  click([...host.querySelectorAll('.yesno-button')].find((b) => b.textContent === 'いいえ') as HTMLElement);
  next(host);
}

describe('レッスン画面の枠（docs/ui-design.md 7 章）', () => {
  it('施設の中の景色を敷き、上の帯に施設名・レッスン名・7 段の進みを出す。始めると学習中になる', async () => {
    const session = createSession(1);
    const { host } = await open(session, 'found.b.04');
    expect($(host, '[data-testid="lesson-backdrop"]').dataset.facility).toBe('academy');
    expect($(host, '[data-testid="lesson-facility"]').textContent).toBe('市立 IT 学院');
    expect($(host, '[data-testid="lesson-title"]').textContent).toBe('ファイルとディレクトリ');
    const stages = [...host.querySelectorAll<HTMLButtonElement>('.lesson-stage button')];
    expect(stages.map((b) => b.textContent?.replace(/^\d/, ''))).toEqual(['解説', '理解', 'クイズ', '実戦', '結果', 'まとめ', 'XP / スキル']);
    // 進んでいない段へは飛べない（終わった段は戻って見られる）
    expect(stages.map((b) => b.disabled)).toEqual([false, true, true, true, true, true, true]);
    expect(session.progress.getState().progress.lessons['found.b.04']).toMatchObject({ status: 'in-progress', stage: 'explain' });
  });

  it('linux.i.01 はサーバ施設の中で学ぶ', async () => {
    const { host } = await open(createSession(1), 'linux.i.01');
    expect($(host, '[data-testid="lesson-backdrop"]').dataset.facility).toBe('server');
    expect($(host, '[data-testid="lesson-facility"]').textContent).toBe('サーバ施設');
  });

  it('下の帯の推奨前提・関連・次を押すと、その入口の札へ', async () => {
    const { host, onLesson } = await open(createSession(1), 'found.b.04');
    const links = [...host.querySelectorAll<HTMLButtonElement>('.lesson-link')];
    const e = entryOf('found.b.04');
    expect(links.map((b) => b.textContent)).toEqual([...(e?.prerequisites ?? []), ...(e?.related ?? []), ...(e?.next ?? [])].map((id) => entryOf(id)?.title));
    click(links[0] as HTMLButtonElement);
    expect(onLesson).toHaveBeenCalledWith('found.b.03');
  });

  it('中身をまだ書き起こしていないレッスンは「準備中」と出し、学習中として記録しない', async () => {
    const session = createSession(1);
    const { host } = await open(session, 'k8s.b.01');
    expect(host.querySelector('[data-testid="lesson-preparing"]')).not.toBeNull();
    expect(session.progress.getState().progress.lessons['k8s.b.01']).toBeUndefined();
    expect($(host, '[data-testid="lesson-backdrop"]').dataset.facility).toBe('cluster');
  });

  it('Esc と「中断して都市へ」で都市へ戻る', async () => {
    const { host, onExit } = await open(createSession(1), 'found.b.04');
    key('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
    click($(host, '[data-testid="lesson-exit"]'));
    expect(onExit).toHaveBeenCalledTimes(2);
  });
});

describe('解説（docs/learning-design.md 3 章）', () => {
  it('何か → なぜ必要か → 何に使うか → どんな場面で使うか → 状況説明 の順に 1 画面ずつ進み、最後に理解の段へ', async () => {
    const session = createSession(1);
    const l = await lesson('found.b.04');
    const { host } = await open(session, 'found.b.04');
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      seen.push($(host, '[data-testid="explain-title"]').textContent ?? '');
      next(host);
    }
    expect(seen).toEqual(['何か', 'なぜ必要か', '何に使うか', 'どんな場面で使うか', 'こんな場面']);
    expect(host.querySelector('[data-testid="stage-understand"]')).not.toBeNull();
    expect(stageOf(session, 'found.b.04')).toBe('understand');
    // 解説のどの画面にも図がある。本文にコマンドを打つ欄は無い
    expect(l.explain.figures.length).toBeGreaterThan(0);
    expect(host.querySelector('input, textarea')).toBeNull();
  });

  it('終わった段は上の帯から戻って見られ、戻っても進んだ段は変わらない', async () => {
    const session = createSession(1);
    const { host } = await open(session, 'found.b.04');
    throughExplain(host);
    click($(host, '.lesson-stage button[data-stage="explain"]'));
    expect(host.querySelector('[data-testid="stage-explain"]')).not.toBeNull();
    expect(stageOf(session, 'found.b.04')).toBe('understand');
  });
});

describe('用語の小窓（docs/learning-design.md 9 章）', () => {
  it('本文の用語を押すと、簡単な説明・なぜ重要か・関連する技術が出る。関連を押すと切り替わり、Esc で小窓だけ閉じる', async () => {
    const { host, onExit, onGlossary } = await open(createSession(1), 'found.b.04');
    const term = $(host, '[data-testid="explain-text"] .rich-term');
    const id = term.dataset.term ?? '';
    click(term);
    const pop = $(host, '[data-testid="term-popover"]');
    const t = termOf(id);
    expect(pop.textContent).toContain(t?.word);
    expect(pop.textContent).toContain('なぜ重要か');
    expect([...pop.querySelectorAll('.term-pop-chip')].map((b) => b.textContent)).toEqual(t?.related.map(wordOf));
    click($(pop, '.term-pop-chip'));
    expect($(host, '.term-pop-word').textContent).toBe(wordOf(t?.related[0] ?? ''));
    click($(host, '.term-pop-more'));
    expect(onGlossary).toHaveBeenCalledWith(t?.related[0]);
    key('Escape');
    expect(host.querySelector('[data-testid="term-popover"]')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('理解（採点しない。docs/learning-design.md 4 章）', () => {
  it('図の違う所を押すと、見直す解説の箇所を示して次へ進ませない。正しい所を押すと進める。XP は増えない', async () => {
    const session = createSession(1);
    const { host } = await open(session, 'found.b.04');
    throughExplain(host);
    act(() => {
      $(host, '[data-testid="lesson-figure"] [data-part="home"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect($(host, '[data-testid="feedback"]').textContent).toContain('もう一度考えてみよう');
    expect($(host, '[data-testid="feedback-see"]').textContent).toContain('解説の「何に使うか」');
    expect(nextEnabled(host)).toBe(false);
    act(() => {
      $(host, '[data-testid="lesson-figure"] [data-part="minato"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect($(host, '[data-testid="feedback"]').textContent).toContain('その通り');
    expect(nextEnabled(host)).toBe(true);
    expect(session.progress.getState().progress.xp).toBe(0);
  });

  it('図の部分はキーボードでも押せる', async () => {
    const { host } = await open(createSession(1), 'found.b.04');
    throughExplain(host);
    const part = $(host, '[data-testid="lesson-figure"] [data-part="minato"]');
    expect(part.getAttribute('tabindex')).toBe('0');
    expect(part.getAttribute('role')).toBe('button');
    act(() => {
      part.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect($(host, '[data-testid="feedback"]').textContent).toContain('その通り');
  });

  it('用語と説明を結ぶ・はい／いいえ を答えて、クイズの段へ進む', async () => {
    const session = createSession(1);
    const l = await lesson('found.b.04');
    const { host } = await open(session, 'found.b.04');
    throughExplain(host);
    throughUnderstand(host, l);
    expect(host.querySelector('[data-testid="stage-quiz"]')).not.toBeNull();
    expect(stageOf(session, 'found.b.04')).toBe('quiz');
  });

  it('関係性: 2 つの関係を選ぶ（linux.i.01）', async () => {
    const { host } = await open(createSession(1), 'linux.i.01');
    throughExplain(host);
    act(() => {
      $(host, '[data-testid="lesson-figure"] [data-part="active"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    next(host);
    click([...host.querySelectorAll('.yesno-button')].find((b) => b.textContent === 'いいえ') as HTMLElement);
    next(host);
    expect($(host, '[data-testid="understand-item"]').dataset.kind).toBe('relation');
    const pick = (text: string): void => click([...host.querySelectorAll('.choice-button')].find((b) => b.textContent?.includes(text)) as HTMLElement);
    pick('より先に起きる');
    expect($(host, '[data-testid="feedback-see"]').textContent).toContain('どんな場面で使うか');
    pick('が原因で');
    expect($(host, '[data-testid="feedback"]').textContent).toContain('その通り');
  });
});

describe('クイズ（docs/learning-design.md 5 章）', () => {
  async function toQuiz(session: Session): Promise<HTMLDivElement> {
    const l = await lesson('found.b.04');
    const { host } = await open(session, 'found.b.04');
    throughExplain(host);
    throughUnderstand(host, l);
    return host;
  }
  const choose = (host: HTMLElement, id: string): void => {
    click($(host, `.choice-button[data-choice="${id}"]`));
    click($(host, '[data-testid="quiz-submit"]'));
  };

  it('誤答には「なぜ違うか」を添えてもう一度答えられ、正答には「なぜ正しいか」と XP（2 回目の正解は 2）', async () => {
    const session = createSession(1);
    const host = await toQuiz(session);
    const q1 = (await lesson('found.b.04')).quiz[0];
    choose(host, 'b');
    expect($(host, '.choice.is-bad .choice-note').textContent).toContain(wordOf('current-directory'));
    expect(nextEnabled(host)).toBe(false);
    expect(session.progress.getState().progress.xp).toBe(0);
    choose(host, 'a');
    expect($(host, '[data-testid="feedback"]').textContent).toBe(`正解 +2 XP${q1?.explanation ?? ''}`);
    // ほかの選択肢がなぜ違うかも出る
    expect(host.querySelectorAll('.choice-note')).toHaveLength(2);
    expect(session.progress.getState().progress.xp).toBe(2);
    expect($(host, '[data-testid="lesson-xp"]').textContent).toBe('+2');
    expect(nextEnabled(host)).toBe(true);
  });

  it('初回で正解すると 5 XP。得た XP（スキルの段階が上がった分も）と同じ量が都市の資金に入る', async () => {
    const session = createSession(1);
    const funds = session.city.getState().city.funds;
    const host = await toQuiz(session);
    choose(host, 'a');
    expect($(host, '[data-testid="feedback"]').textContent).toContain('正解 +5 XP');
    expect(quizXp(session)).toBe(5);
    const xp = session.progress.getState().progress.xp;
    // 初回正解率が上がり、IT 基礎のスキルが未修得から見習いへ（+50。docs/game-design.md 3 章）
    expect(xp).toBe(55);
    expect(session.city.getState().city.funds).toBe(funds + xp);
    // 上の帯はこのレッスンの回で得た XP（スキルの段階の上がりは分野の XP として、XP / スキルの段で見せる）
    expect($(host, '[data-testid="lesson-xp"]').textContent).toBe('+5');
  });

  it('材料のコマンドと記録を出す（結果予測・原因特定）', async () => {
    const session = createSession(1);
    const host = await toQuiz(session);
    choose(host, 'a');
    next(host);
    expect($(host, '[data-testid="quiz-command"]').textContent).toBe('$ cd minato');
    const { host: linux } = await open(createSession(1), 'linux.i.01');
    expect(linux.querySelector('[data-testid="quiz-log"]')).toBeNull();
  });

  it('選択肢は seed で決めた順に出る（いつも同じ順。正答がいつも先頭ではない）', async () => {
    const host = await toQuiz(createSession(1));
    const order1 = [...host.querySelectorAll<HTMLElement>('.choice-button')].map((b) => b.dataset.choice);
    act(() => roots.forEach((r) => r.unmount()));
    roots = [];
    const again = await toQuiz(createSession(1));
    expect([...again.querySelectorAll<HTMLElement>('.choice-button')].map((b) => b.dataset.choice)).toEqual(order1);
  });

  it('全問に正解すると実戦の段へ。実戦の目的と、手順の目的を打つ前に示す', async () => {
    const session = createSession(1);
    const l = await lesson('found.b.04');
    const host = await toQuiz(session);
    for (const q of l.quiz) {
      choose(host, (q.choices ?? []).find((c) => c.correct)?.id ?? '');
      next(host);
    }
    expect(host.querySelector('[data-testid="stage-practice"]')).not.toBeNull();
    expect(stageOf(session, 'found.b.04')).toBe('practice');
    expect($(host, '[data-testid="stage-practice"]').textContent).toContain('/srv/app へ移る');
    expect(quizXp(session)).toBe(20);
  });
});

describe('途中保存と再開（docs/learning-design.md 2 章）', () => {
  it('クイズの途中で中断して開き直すと、クイズの段の、まだ正解していない問題から続く', async () => {
    const session = createSession(1);
    const l = await lesson('found.b.04');
    const first = await open(session, 'found.b.04');
    throughExplain(first.host);
    throughUnderstand(first.host, l);
    click($(first.host, '.choice-button[data-choice="a"]'));
    click($(first.host, '[data-testid="quiz-submit"]'));
    next(first.host);
    act(() => first.root.unmount());
    roots = roots.filter((r) => r !== first.root);

    const { host } = await open(session, 'found.b.04');
    expect(host.querySelector('[data-testid="stage-quiz"]')).not.toBeNull();
    expect($(host, '[data-testid="quiz-question"]').dataset.quiz).toBe('q2');
    // 前に正解した問題へ戻ると、正解の形で見える
    click($(host, '[data-testid="lesson-back"]'));
    expect($(host, '[data-testid="quiz-question"]').dataset.quiz).toBe('q1');
    expect($(host, '[data-testid="feedback"]').textContent).toContain('正解');
    expect(quizXp(session)).toBe(5);
  });
});

describe('見本の 2 本を最後まで通せる（docs/development-plan.md Phase 6・7 の完成条件）', () => {
  /** 理解の 1 問を、データの答えで答える */
  function answerUnderstand(host: HTMLElement, item: Lesson['understand'][number]): void {
    const byText = (sel: string, text: string): HTMLElement => {
      const el = [...host.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.includes(text));
      if (!el) throw new Error(`${sel} に「${text}」が無い`);
      return el;
    };
    const plain = (rich: string): string => rich.replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, id: string) => wordOf(id)).replace(/`/g, '');
    switch (item.kind) {
      case 'figure-pick':
        for (const part of item.answer) {
          act(() => {
            $(host, `[data-testid="lesson-figure"] [data-part="${part}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
        }
        break;
      case 'yesno':
        click(byText('.yesno-button', item.answer ? 'はい' : 'いいえ'));
        break;
      case 'relation':
        click(byText('.choice-button', { contains: 'を含む', before: 'より先に起きる', cause: 'が原因で' }[item.answer]));
        break;
      case 'situation':
        click($(host, `.choice-button[data-choice="${item.choices.find((c) => c.correct)?.id ?? ''}"]`));
        break;
      case 'order':
        for (const x of item.items) click(byText('.order-item.is-pool', plain(x)));
        click($(host, '.stage-check'));
        break;
      case 'match':
        for (const [a, b] of item.pairs) {
          click(byText('.match-col:first-child .match-item', plain(a)));
          click(byText('.match-col:last-child .match-item', plain(b)));
        }
        click($(host, '.stage-check'));
        break;
    }
  }

  /** 解説・理解・クイズを、データの答えで通して実戦の段へ（クイズは全て初回で正解） */
  async function toPractice(session: Session, id: string, l: Lesson): Promise<Opened> {
    const opened = await open(session, id);
    const { host } = opened;
    throughExplain(host);
    expect(stageOf(session, id)).toBe('understand');
    for (const item of l.understand) {
      answerUnderstand(host, item);
      expect($(host, '[data-testid="feedback"]').textContent, `${id} ${item.kind}`).toContain('その通り');
      next(host);
    }
    expect(stageOf(session, id)).toBe('quiz');
    for (const q of l.quiz) {
      if (q.kind === 'order') {
        for (const x of q.order ?? []) click([...host.querySelectorAll<HTMLElement>('.order-item.is-pool')].find((b) => b.textContent === x) as HTMLElement);
      } else {
        for (const c of (q.choices ?? []).filter((x) => x.correct)) click($(host, `.choice-button[data-choice="${c.id}"]`));
      }
      click($(host, '[data-testid="quiz-submit"]'));
      expect($(host, '[data-testid="feedback"]').textContent, `${id} ${q.id}`).toContain('正解 +5 XP');
      next(host);
    }
    expect(stageOf(session, id)).toBe('practice');
    expect(quizXp(session)).toBe(5 * l.quiz.length);
    return opened;
  }

  /** 結果 → まとめ → XP / スキル → 都市へ */
  function throughEnd({ host, onExit }: Opened, session: Session, id: string, l: Lesson): void {
    next(host);
    expect(stageOf(session, id)).toBe('summary');
    const summary = $(host, '[data-testid="stage-summary"]');
    expect(summary.querySelectorAll('.summary-point')).toHaveLength(l.summary.points.length);
    expect([...summary.querySelectorAll('.summary-next .lesson-link')].map((b) => b.textContent)).toEqual(l.summary.next.map((n) => entryOf(n)?.title));
    next(host);
    expect(session.progress.getState().progress.lessons[id]).toMatchObject({ status: 'completed', stage: 'done', completions: 1 });
    const done = $(host, '[data-testid="stage-done"]');
    expect(done.textContent).toContain(l.goal);
    expect($(host, '[data-testid="done-xp"]').textContent).toContain('まとめまで到達');
    click($(host, '[data-testid="lesson-to-city"]'));
    expect(onExit).toHaveBeenCalled();
  }

  it('found.b.04: わざと誤ると原因候補とヒントが出て、打ち直して成功する。結果・まとめ・XP / スキルまで通る', async () => {
    const session = createSession(1);
    const id = 'found.b.04';
    const l = await lesson(id);
    const funds0 = session.city.getState().city.funds;
    const opened = await toPractice(session, id, l);
    const { host } = opened;
    // 手順の目的と、今打てるコマンドの候補を、打つ前に示す
    expect($(host, '[data-testid="stage-practice"]').textContent).toContain('/srv/app へ移す');
    expect($(host, '[data-testid="practice-candidates"]').textContent).toContain('pwd');
    expect(screenText()).toContain('learner@arena:~$');

    typeLine('cd /srv/ap');
    const err = $(host, '[data-testid="practice-error"]');
    expect(err.dataset.guide).toBe('enoent');
    expect(err.textContent).toContain('No such file or directory');
    expect(err.textContent).toContain('何と言われたか');
    expect(err.querySelectorAll('.practice-error-causes li').length).toBeGreaterThanOrEqual(2);
    expect(err.textContent).toContain('次に確かめること');
    expect(stageOf(session, id)).toBe('practice');

    typeLine('cd /srv/app');
    expect(host.querySelector('[data-testid="practice-error"]')).toBeNull();
    expect($(host, '[data-testid="practice-afterward"]').textContent).toContain('現在地が /srv/app になった');
    next(host);

    // 結果: ヒント無し・エラーから自力で立て直した
    expect($(host, '[data-testid="stage-result"]').dataset.result).toBe('success');
    expect($(host, '[data-testid="result-commands"]').textContent).toBe('$ cd /srv/ap\n$ cd /srv/app');
    const log = session.progress.getState().progress.xpLog;
    expect(log.filter((e) => e.source === 'practice').map((e) => e.amount)).toEqual([20]);
    expect(log.filter((e) => e.source === 'troubleshoot').map((e) => e.amount)).toEqual([10]);

    throughEnd(opened, session, id, l);
    expect(session.progress.getState().progress.xpLog.filter((e) => e.source === 'lesson-complete').map((e) => e.amount)).toEqual([30]);
    // 得た XP と同じ量が都市の資金に入る（スキルの段階の上がりを含む）
    expect(session.city.getState().city.funds - funds0).toBe(session.progress.getState().progress.xp);
  });

  it('linux.i.01: ヒントを 3 段まで開き、最後のヒントをそのまま打てば通る（結果はヒントあり）', async () => {
    const session = createSession(1);
    const id = 'linux.i.01';
    const l = await lesson(id);
    const opened = await toPractice(session, id, l);
    const { host } = opened;
    expect(screenText()).toContain('root@server:/root#');
    typeLine('systemctl start wbe');
    expect($(host, '[data-testid="practice-error"]').dataset.guide).toBe('unit-not-found');
    // start だけでは「次の起動でも動く」にならない
    typeLine('systemctl start web');
    expect(host.querySelector('[data-testid="practice-afterward"]')).toBeNull();
    for (let i = 0; i < 3; i += 1) click($(host, '[data-testid="practice-hint"]'));
    expect(host.querySelectorAll('.practice-hint')).toHaveLength(3);
    expect(host.querySelector('[data-testid="practice-hint"]')).toBeNull();
    typeLine('systemctl enable --now web');
    expect(host.querySelector('[data-testid="practice-afterward"]')).not.toBeNull();
    next(host);
    expect($(host, '[data-testid="stage-result"]').dataset.result).toBe('partial');
    expect(session.progress.getState().progress.xpLog.filter((e) => e.source === 'practice').map((e) => e.amount)).toEqual([18]);
    throughEnd(opened, session, id, l);
  });

  it('未達のまま終えても責めず、もう一度挑戦すると模擬環境は初めから。途中で中断して開き直すと、打った所から続く', async () => {
    const session = createSession(1);
    const id = 'found.b.04';
    const l = await lesson(id);
    const first = await toPractice(session, id, l);
    typeLine('cd /srv');
    act(() => first.root.unmount());
    roots = roots.filter((r) => r !== first.root);

    const { host } = await open(session, id);
    expect(host.querySelector('[data-testid="stage-practice"]')).not.toBeNull();
    expect(screenText()).toContain('中断した所から続ける');
    expect(screenText()).toContain('learner@arena:/srv$');
    click($(host, '[data-testid="practice-giveup"]'));
    expect($(host, '[data-testid="stage-result"]').dataset.result).toBe('retry');
    expect(session.progress.getState().progress.lessons[id]?.practice.at(-1)).toMatchObject({ success: false, commands: ['cd /srv'] });
    click($(host, '[data-testid="lesson-back"]'));
    expect(screenText()).toContain('learner@arena:~$');
    typeLine('cd /srv/app');
    next(host);
    expect($(host, '[data-testid="stage-result"]').dataset.result).toBe('success');
  });
});

import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { DOMAIN_DEFS, ENTRIES } from '@/content/catalog';
import { AUTHORED, loadLesson } from '@/content/lessons';
import type { DomainId } from '@/content/schema';
import { knowledgeGraph } from '@/learning/graph';
import { entryCardOf, libraryOf, NO_FILTER, type LibraryFilter } from '@/learning/library';
import { Icon } from '@/ui/icons/Icon';
import { HudWindow } from '@/ui/Window';
import type { Session } from '../session';
import { EntryCardView, EntryEmpty } from './EntryCardView';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { LibraryList } from './LibraryList';
import './LearnScreen.css';

/**
 * 学習ライブラリと知識グラフ（docs/ui-design.md 6 章）。都市の上に重ねる大きな窓（画面の 80%）。
 * 一覧（L）⇄ 知識グラフ（G）を切り替え、右に入口の札を出す。どのレッスンも「このまま始める」を押せる。
 */

const DOMAIN_NAMES = Object.fromEntries(DOMAIN_DEFS.map((d) => [d.id, d.name]));

export function LearnScreen({ session, view, lessonId, domain, onClose, onView, onSelect, onStart }: {
  session: Session;
  view: 'list' | 'graph';
  lessonId?: string | undefined;
  domain?: DomainId | undefined;
  onClose: () => void;
  onView: (view: 'list' | 'graph') => void;
  /** 選んだレッスンを道すじに写す */
  onSelect: (id: string | null) => void;
  onStart: (id: string) => void;
}) {
  const progress = useStore(session.progress, (s) => s.progress);
  const [selected, setSelected] = useState<string | null>(lessonId ?? null);
  const [filter, setFilter] = useState<LibraryFilter>({ ...NO_FILTER, domain });
  const [minutes, setMinutes] = useState<Record<string, number>>({});

  // 直リンクや情報パネルから別のレッスン・分野が渡されたら合わせる
  useEffect(() => {
    if (lessonId) setSelected(lessonId);
  }, [lessonId]);
  useEffect(() => {
    setFilter((f) => ({ ...f, domain }));
  }, [domain]);

  // 書き起こしたレッスンは、目安の時間を中身から読む
  useEffect(() => {
    if (!selected || !AUTHORED.has(selected) || minutes[selected] !== undefined) return;
    let alive = true;
    void loadLesson(selected).then((l) => {
      if (alive && l) setMinutes((m) => ({ ...m, [l.id]: l.minutes }));
    });
    return () => {
      alive = false;
    };
  }, [selected, minutes]);

  // G で知識グラフ、L で一覧（文字を打っている間は切り替えない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g' && view !== 'graph') onView('graph');
      if (k === 'l' && view !== 'list') onView('list');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onView]);

  const library = useMemo(() => libraryOf(progress, filter), [progress, filter]);
  const graph = useMemo(() => knowledgeGraph(progress), [progress]);
  const card = selected ? entryCardOf(selected, progress, minutes[selected]) : null;
  const first = ENTRIES[0];

  const pick = (id: string): void => {
    setSelected(id);
    onSelect(id);
  };

  return (
    <HudWindow
      testId="learn-screen"
      icon={view === 'graph' ? 'graph' : 'learn'}
      title={view === 'graph' ? '知識グラフ' : '学習ライブラリ'}
      sub={view === 'graph' ? '分野とレッスンのつながり。矢印は「先に学ぶと分かりやすい」の向き' : `全 ${String(ENTRIES.length)} 本。並びは推奨学習順。どのレッスンからでも始められる`}
      onClose={onClose}
      focusClose={view === 'graph'}
      className={`learn is-${view}`}
      tools={(
        <div className="window-switch" role="group" aria-label="表示">
          <button type="button" aria-pressed={view === 'list'} onClick={() => onView('list')} data-testid="learn-view-list">
            <Icon name="list" size={16} />一覧<kbd>L</kbd>
          </button>
          <button type="button" aria-pressed={view === 'graph'} onClick={() => onView('graph')} data-testid="learn-view-graph">
            <Icon name="graph" size={16} />知識グラフ<kbd>G</kbd>
          </button>
        </div>
      )}
    >
      <div className="learn-body">
        {view === 'list' ? (
          <LibraryList library={library} filter={filter} onFilter={setFilter} selected={selected} onSelect={pick} domainNames={DOMAIN_NAMES} />
        ) : (
          <KnowledgeGraphView graph={graph} selected={selected} onSelect={pick} />
        )}
        <aside className="learn-card" aria-label="入口の札">
          {card ? (
            <EntryCardView card={card} onStart={onStart} onPick={pick} />
          ) : first ? (
            <EntryEmpty onPick={pick} firstId={first.id} firstTitle={first.title} />
          ) : null}
        </aside>
      </div>
    </HudWindow>
  );
}

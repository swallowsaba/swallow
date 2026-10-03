import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { LESSONS } from '@/game/lessons';
import { activeMissions } from '@/learning/missions';
import { recommend, reviewsDue, type RecommendReason } from '@/learning/recommend';
import { Icon } from '@/ui/icons/Icon';
import { today } from '../clock';
import type { ProgressStore } from '../progressStore';
import './RecommendPanel.css';

/**
 * おすすめの欄（docs/ui-design.md 3 章: 左上、幅 300、高さ 160 まで。畳むと見出しだけ）。
 * 次に学ぶとよい内容（推奨学習順と学習履歴から）と、復習の予定。押すとそのレッスンを始める。
 * 挑戦中のミッションがあれば先頭に 1 つ（押すとミッション一覧でそのミッションを開く）。高さ 160 に収まる 3 行まで。
 */

const MARKS: Record<RecommendReason, string> = { continue: '続き', 'shore-up': '土台', next: '次', order: '順' };

export function RecommendPanel({ progress, onLesson, onMission }: { progress: ProgressStore; onLesson: (id: string) => void; onMission?: (id: string) => void }) {
  const p = useStore(progress, (s) => s.progress);
  const [open, setOpen] = useState(true);
  const day = today();
  const missions = useMemo(() => (onMission ? activeMissions(p).slice(0, 1) : []), [p, onMission]);
  const reviews = useMemo(() => reviewsDue(p, day, 1), [p, day]);
  const items = useMemo(() => recommend(p, LESSONS, 3 - reviews.length - missions.length), [p, reviews.length, missions.length]);
  return (
    <aside className={`recommend${open ? '' : ' is-closed'}`} aria-label="おすすめ" data-testid="recommend" data-label-block>
      <button type="button" className="recommend-head" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={open ? '畳む' : '開く'}>
        <Icon name="learn" size={16} />
        <span className="recommend-title">おすすめ</span>
        <span className="recommend-toggle" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <ol className="recommend-list">
          {missions.map((m) => (
            <li key={m.id}>
              <button type="button" className="recommend-item is-mission" onClick={() => onMission?.(m.id)} data-mission={m.id} title={`「${m.title}」をミッション一覧で開く`}>
                <span className="recommend-mark">任務</span>
                <span className="recommend-body">
                  <span className="recommend-name">{m.title}</span>
                  <span className="recommend-why">挑戦中のミッション</span>
                </span>
              </button>
            </li>
          ))}
          {items.map((r) => (
            <li key={r.lessonId}>
              <button
                type="button"
                className="recommend-item"
                style={{ '--c': `var(--domain-${r.domain})` } as CSSProperties}
                onClick={() => onLesson(r.lessonId)}
                data-lesson={r.lessonId}
                data-reason={r.reason}
                title={`「${r.title}」を始める`}
              >
                <span className="recommend-mark">{MARKS[r.reason]}</span>
                <span className="recommend-body">
                  <span className="recommend-name">{r.title}</span>
                  <span className="recommend-why">{r.why}</span>
                </span>
              </button>
            </li>
          ))}
          {reviews.map((c) => (
            <li key={c.cardId}>
              <button type="button" className="recommend-item is-review" onClick={() => onLesson(c.lessonId)} data-review={c.lessonId} title={`「${c.title}」を見直す`}>
                <span className="recommend-mark">復習</span>
                <span className="recommend-body">
                  <span className="recommend-name">{c.title}</span>
                  <span className="recommend-why">{c.inDays > 1 ? `${String(c.inDays)} 日後` : c.inDays === 1 ? '明日' : c.inDays === 0 ? '今日' : `予定日を ${String(-c.inDays)} 日過ぎた`}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}

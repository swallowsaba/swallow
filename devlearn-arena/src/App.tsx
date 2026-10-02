import { useCallback, useEffect, useMemo } from 'react';
import type { LearningRecord } from './game/records';
import { go, mark, parseHash, useRoute, type Route } from './router';
import { CityScreen } from './screens/city/CityScreen';
import { GlossaryScreen } from './screens/glossary/GlossaryScreen';
import { GrowthScreen } from './screens/growth/GrowthScreen';
import { LearnScreen } from './screens/learn/LearnScreen';
import { LessonScreen } from './screens/lesson/LessonScreen';
import { createSession, type Session } from './screens/session';
import type { EntryId } from './ui/TopBar';

/**
 * 画面の切り替え（docs/ui-design.md 2 章）。起動直後は都市画面。
 * 都市画面は常に下にあり、学習ライブラリ・知識グラフ・用語集・成長画面は都市の上に重ねる窓として開く（閉じると都市に戻る）。
 * レッスン画面は、都市の施設の中に入る別の画面として全面に開く（docs/decisions.md D-07）。
 */

const ENTRY_ROUTES: Partial<Record<EntryId, Route>> = {
  learn: { name: 'learn', view: 'list' },
  graph: { name: 'learn', view: 'graph' },
  glossary: { name: 'glossary' },
  growth: { name: 'growth' },
};

function currentEntry(route: Route): EntryId | undefined {
  if (route.name === 'learn') return route.view === 'graph' ? 'graph' : 'learn';
  if (route.name === 'glossary' || route.name === 'growth') return route.name;
  return undefined;
}

export function App({ session: given }: { session?: Session } = {}) {
  const route = useRoute();
  const session = useMemo(() => given ?? createSession(), [given]);

  // 撮影と計測の道具（tools/shoot.mjs）から、模擬の学習記録を与える（docs/development-plan.md Phase 4）
  useEffect(() => {
    const w = window as unknown as { __game?: { learn: (r: LearningRecord[]) => unknown; progress: () => unknown } };
    w.__game = { learn: (r) => session.progress.getState().learn(r), progress: () => session.progress.getState().progress };
    return () => {
      delete w.__game;
    };
  }, [session]);

  const toCity = useCallback((): void => go({ name: 'city' }), []);
  /** レッスンを始める（レッスン画面へ）。どのレッスンも、前提に関係なく始められる */
  const startLesson = useCallback((id: string): void => go({ name: 'lesson', lessonId: id }), []);

  return (
    <>
      <CityScreen
        session={session}
        active={route.name === 'city'}
        current={currentEntry(route)}
        onEntry={(id) => {
          const r = ENTRY_ROUTES[id];
          if (r) go(r);
        }}
        onLesson={startLesson}
        onLibrary={(domain) => go(domain ? { name: 'learn', view: 'list', domain } : { name: 'learn', view: 'list' })}
      />
      {route.name === 'growth' ? <GrowthScreen session={session} onClose={toCity} /> : null}
      {route.name === 'learn' ? (
        <LearnScreen
          session={session}
          view={route.view}
          lessonId={route.lessonId}
          domain={route.domain}
          onClose={toCity}
          onView={(view) => {
            // 選んだレッスンは履歴に積まずにハッシュへ写しているので、今のハッシュから読む
            const now = parseHash(window.location.hash);
            go(now.name === 'learn' ? { ...now, view } : { ...route, view });
          }}
          onSelect={(id) => mark(id ? { ...route, lessonId: id } : { name: 'learn', view: route.view })}
          onStart={startLesson}
        />
      ) : null}
      {route.name === 'lesson' ? (
        <LessonScreen
          session={session}
          lessonId={route.lessonId}
          onExit={toCity}
          onLesson={(id) => go({ name: 'learn', view: 'list', lessonId: id })}
          onGlossary={(id) => go({ name: 'glossary', termId: id })}
        />
      ) : null}
      {route.name === 'glossary' ? (
        <GlossaryScreen
          termId={route.termId}
          onClose={toCity}
          onTerm={(id) => mark({ name: 'glossary', termId: id })}
          onLesson={(id) => go({ name: 'learn', view: 'list', lessonId: id })}
        />
      ) : null}
      <div className="too-small" role="alert">
        <h1>PC の大きな画面で遊んでください</h1>
        <p>このゲームは横 1280・縦 720 以上の画面に合わせて作っています。</p>
      </div>
    </>
  );
}

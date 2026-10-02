import { useEffect, useMemo } from 'react';
import type { LearningRecord } from './game/records';
import { useRoute } from './router';
import { CityScreen } from './screens/city/CityScreen';
import { GrowthScreen } from './screens/growth/GrowthScreen';
import { createSession, type Session } from './screens/session';

/**
 * 画面の切り替え（docs/ui-design.md 2 章）。起動直後は都市画面。
 * 都市画面は常に下にあり、成長画面などは都市の上に重ねる窓として開く（閉じると都市に戻る）。
 */
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

  const toCity = (): void => {
    window.location.hash = '#/city';
  };
  return (
    <>
      <CityScreen
        session={session}
        active={route.name === 'city'}
        onEntry={(id) => {
          if (id === 'growth') window.location.hash = '#/growth';
        }}
      />
      {route.name === 'growth' ? <GrowthScreen session={session} onClose={toCity} /> : null}
      <div className="too-small" role="alert">
        <h1>PC の大きな画面で遊んでください</h1>
        <p>このゲームは横 1280・縦 720 以上の画面に合わせて作っています。</p>
      </div>
    </>
  );
}

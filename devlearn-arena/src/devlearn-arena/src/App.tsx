import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Shell } from './ui/Shell';
import { Loading } from './ui/components/Loading';

// ルート単位のコード分割。コンテンツ本体は各画面から動的 import する。
const WorldMapPage = lazy(() => import('./features/map/WorldMapPage'));
const TrackPage = lazy(() => import('./features/track/TrackPage'));
const LessonPage = lazy(() => import('./features/lesson/LessonPage'));
const ParkPage = lazy(() => import('./features/park/ParkPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./features/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* 園内は1枚で完結するので外枠を付けない */}
            <Route path="/" element={<ParkPage />} />
            <Route
              path="*"
              element={
                <Shell>
                  <Routes>
                    <Route path="/map" element={<WorldMapPage />} />
                    <Route path="/track/:trackId" element={<TrackPage />} />
                    <Route
                      path="/lesson/:trackId/:chapterNo/:lessonSlug"
                      element={<LessonPage />}
                    />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Shell>
              }
            />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

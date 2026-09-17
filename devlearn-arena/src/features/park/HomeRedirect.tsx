import { Navigate, useSearchParams } from 'react-router-dom';
import { missionById } from '@/engines/lesson/registry';

/**
 * 入口。任務の指定（/?mission=）があれば、その任務のカテゴリの作業画面へ。
 * 指定が無ければ全体図へ（全体図でカテゴリを選んでから作業画面に入る）。
 */
export default function HomeRedirect() {
  const [params] = useSearchParams();
  const requested = params.get('mission');
  const track = requested === null ? undefined : missionById(requested)?.track;
  if (requested !== null && track !== undefined) {
    return <Navigate to={`/world/${track}?mission=${encodeURIComponent(requested)}`} replace />;
  }
  return <Navigate to="/map" replace />;
}

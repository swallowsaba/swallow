import { Link } from 'react-router-dom';
import { findMissionById } from '@/engines/lesson/catalog';
import { dayKey } from '@/lib/date';
import { dueItems } from '@/lib/review';
import { useStore } from '@/store';

/** 今日の見直し。躓いた任務が日を置いて戻ってくる */
export function ReviewQueue() {
  const queue = useStore((s) => s.reviewQueue);
  const today = dayKey(Date.now());
  const due = dueItems(queue, today);

  return (
    <section className="bevel p-5">
      <h2 className="text-xl font-extrabold">今日の見直し</h2>
      {queue.length === 0 ? (
        <p className="mt-2 text-base text-ink-soft">
          まだありません。ヒントを使ったり失敗した任務が、日を置いてここに戻ってきます。
        </p>
      ) : due.length === 0 ? (
        <p className="mt-2 text-base text-ink-soft">
          今日の分は終わりました。次は {queue.map((q) => q.due).sort()[0] ?? ''} です。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {due.map((item) => {
            const mission = findMissionById(item.lessonId);
            return (
              <li key={item.lessonId}>
                <Link
                  to={`/?mission=${encodeURIComponent(item.lessonId)}`}
                  className="flex items-center gap-3 border-2 border-wood-dark bg-[var(--cream-dark)] px-4 py-3 hover:bg-white"
                >
                  <span aria-hidden className="text-xl">
                    🔁
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {mission?.title ?? item.lessonId}
                    </span>
                    <span className="block font-mono text-sm text-ink-soft">
                      {item.due} 予定 · 間隔 {item.intervalDays} 日 · 通算 {item.reps} 回
                    </span>
                  </span>
                  <span className="font-mono text-sm">もう一度やる →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {queue.length > 0 ? (
        <p className="mt-3 font-mono text-sm text-ink-soft">
          待ち行列 {queue.length} 件 / 今日の分 {due.length} 件
        </p>
      ) : null}
    </section>
  );
}

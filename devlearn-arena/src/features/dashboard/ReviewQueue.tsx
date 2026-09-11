import { Link } from 'react-router-dom';
import { missionById } from '@/engines/lesson/registry';
import { useT } from '@/i18n/useT';
import { dayKey } from '@/lib/date';
import { dueItems } from '@/lib/review';
import { useStore } from '@/store';

/** 今日の見直し。躓いた任務が日を置いて戻ってくる */
export function ReviewQueue() {
  const t = useT();
  const queue = useStore((s) => s.reviewQueue);
  const today = dayKey(Date.now());
  const due = dueItems(queue, today);

  return (
    <section className="bevel p-5">
      <h2 className="text-xl font-extrabold">{t('review.title')}</h2>
      {queue.length === 0 ? (
        <p className="mt-2 text-base text-ink-soft">
          {t('review.empty')}
        </p>
      ) : due.length === 0 ? (
        <p className="mt-2 text-base text-ink-soft">
          {t('review.doneToday', { d: queue.map((q) => q.due).sort()[0] ?? '' })}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {due.map((item) => {
            // 演習も見直しに積まれるので、目次に書いた任務だけでなく全部から引く
            const mission = missionById(item.lessonId);
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
                      {t('review.item', {
                        d: item.due,
                        n: item.intervalDays,
                        r: item.reps,
                      })}
                    </span>
                  </span>
                  <span className="font-mono text-sm">{t('review.again')}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {queue.length > 0 ? (
        <p className="mt-3 font-mono text-sm text-ink-soft">
          {t('review.counts', { a: queue.length, b: due.length })}
        </p>
      ) : null}
    </section>
  );
}

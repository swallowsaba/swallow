import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { countAll, TRACKS } from '@/content/catalog';
import type { Chapter } from '@/content/types';
import { missions } from '@/engines/lesson/missions';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';

/**
 * どこからでも始められるようにするための索引。
 * 飾りの道はやめ、探して跳べることに徹する。
 */
export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const [query, setQuery] = useState('');
  const [onlyPlayable, setOnlyPlayable] = useState(false);

  const cleared = useMemo(
    () =>
      new Set(
        Object.entries(lessons)
          .filter(([, p]) => p.cleared)
          .map(([id]) => id),
      ),
    [lessons],
  );
  const totals = countAll();
  const keyword = query.trim().toLowerCase();

  const matches = (chapter: Chapter): boolean => {
    if (keyword === '') return true;
    if (chapter.title.toLowerCase().includes(keyword)) return true;
    return chapter.lessons.some((l) => l.title.toLowerCase().includes(keyword));
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="sign inline-block px-6 py-2 text-3xl font-extrabold">{t('map.title')}</h1>
        <p className="mt-4 max-w-3xl text-base text-ink-soft">
          今すぐ挑戦できるものと、これから作られるものの一覧です。名前で絞り込めます。
        </p>
        <p className="mt-1 font-mono text-sm text-ink-soft">
          {totals.lessons} {t('map.lessons')} / {totals.bosses} {t('map.bosses')} / 実装済み{' '}
          {missions.length}
        </p>
      </header>

      {/* 探す */}
      <div className="bevel flex flex-wrap items-center gap-4 p-4">
        <label className="flex flex-1 items-center gap-3">
          <span className="font-bold">探す</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="例: ネットワーク、rebase、Pod"
            className="min-w-0 flex-1 border-2 border-wood-dark bg-white px-3 py-2 text-base"
          />
        </label>
        <button
          type="button"
          aria-pressed={onlyPlayable}
          onClick={() => {
            setOnlyPlayable((v) => !v);
          }}
          className="knob px-4 py-2 text-sm font-bold"
        >
          今できるものだけ
        </button>
      </div>

      {/* 今すぐ挑戦できるもの */}
      <section className="bevel p-5">
        <h2 className="text-xl font-extrabold">今すぐ挑戦できる</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {missions.map((m) => {
            const done = cleared.has(m.id);
            return (
              <li key={m.id}>
                <Link
                  to="/"
                  className="flex items-center gap-4 border-2 border-wood-dark bg-[var(--cream-dark)] px-4 py-3 hover:bg-white"
                >
                  <span
                    aria-hidden
                    className={`grid h-10 w-10 shrink-0 place-items-center border-2 border-wood-dark text-lg font-bold ${
                      done ? 'bg-[var(--ok)] text-white' : 'bg-gold'
                    }`}
                  >
                    {m.kind === 'boss' ? '★' : '▶'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{m.title}</span>
                    <span className="block text-sm text-ink-soft">
                      {done ? 'クリア済み' : m.kind === 'boss' ? '障害対応' : '練習'} ·{' '}
                      {m.steps.length} 手順
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* これから作られるもの */}
      {onlyPlayable
        ? null
        : TRACKS.map((track) => {
            const chapters = track.chapters.filter(matches);
            if (chapters.length === 0) return null;
            const all = track.chapters.flatMap((c) => c.lessons);
            const done = all.filter((l) => cleared.has(l.id)).length;
            return (
              <section key={track.id} className="bevel p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-xl font-extrabold">{track.title}</h2>
                  <span className="font-mono text-sm text-ink-soft">
                    {done}/{all.length} · 実装フェーズ {track.phase}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{track.goal}</p>

                <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {chapters.map((ch) => {
                    const chDone = ch.lessons.filter((l) => cleared.has(l.id)).length;
                    const boss = ch.lessons.some((l) => l.kind === 'boss');
                    return (
                      <li key={ch.id}>
                        <Link
                          to={`/track/${track.id}#${ch.id.replace('/', '-')}`}
                          className="flex items-center gap-3 border-2 border-[var(--cream-dark)] px-3 py-2 hover:border-wood-dark hover:bg-white"
                        >
                          <span
                            aria-hidden
                            className="grid h-8 w-8 shrink-0 place-items-center border-2 border-[var(--cream-dark)] font-mono text-sm"
                          >
                            {String(ch.no).padStart(2, '0')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{ch.title}</span>
                            <span className="block font-mono text-xs text-ink-soft">
                              {chDone}/{ch.lessons.length}
                              {boss ? ' · ★ボスあり' : ''}
                            </span>
                          </span>
                          <span aria-hidden className="text-sm text-ink-soft">
                            準備中
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
    </div>
  );
}

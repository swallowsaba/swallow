import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChapter, TRACKS } from '@/content/catalog';
import { missions } from '@/engines/lesson/missions';
import { useT } from '@/i18n/useT';
import { xpProgress } from '@/lib/xp';
import { useStore } from '@/store';
import { IslandBoard } from './IslandBoard';
import { toStages } from './stages';
import { Overworld, type IslandInfo } from './Overworld';

const PROLOGUE = 'prologue';

const ACCENT: Record<string, string> = {
  prologue: '#c0442f',
  k8s: '#4d9bff',
  net: '#22c3b3',
  git: '#ff8a3d',
  github: '#b98bff',
};

export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const xp = useStore((s) => s.profile.xp);
  const lastMissionId = useStore((s) => s.lastMissionId);
  const [island, setIsland] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);

  const cleared = useMemo(
    () =>
      new Set(
        Object.entries(lessons)
          .filter(([, p]) => p.cleared)
          .map(([id]) => id),
      ),
    [lessons],
  );

  const rank = xpProgress(xp);
  const prologueDone = missions.filter((m) => cleared.has(m.id)).length;

  const islands: IslandInfo[] = [
    {
      id: PROLOGUE,
      title: '序章の島',
      subtitle: '端末を手に入れる',
      done: prologueDone,
      total: missions.length,
      ratio: missions.length === 0 ? 0 : prologueDone / missions.length,
      playable: true,
      current: lastMissionId !== null,
      color: ACCENT[PROLOGUE] ?? '#c0442f',
    },
    ...TRACKS.map((track) => {
      const all = track.chapters.flatMap((c) => c.lessons);
      const done = all.filter((l) => cleared.has(l.id)).length;
      return {
        id: track.id,
        title: track.title,
        subtitle: track.goal,
        done,
        total: all.length,
        ratio: all.length === 0 ? 0 : done / all.length,
        playable: all.some((l) => l.status === 'ready'),
        current: false,
        color: ACCENT[track.id] ?? '#4d9bff',
      };
    }),
  ];

  const selected = islands.find((i) => i.id === island);
  const track = TRACKS.find((tr) => tr.id === island);
  const stage = stageId === null ? undefined : getChapter(stageId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="sign inline-block px-6 py-2 text-3xl font-extrabold">{t('map.title')}</h1>
        <p className="font-mono text-base text-ink-soft">
          {rank.rank} · Lv.{rank.level} · 攻略済み {cleared.size} / 210
        </p>
      </div>

      {island === null ? (
        <>
          <p className="text-base text-ink-soft">島をクリックすると、その中のステージが開きます。</p>
          <div className="bevel overflow-hidden p-2">
            <Overworld
              islands={islands}
              onSelect={(id) => {
                setIsland(id);
                setStageId(null);
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setIsland(null);
                setStageId(null);
              }}
              className="knob px-4 py-2 text-base font-bold"
            >
              ← 海図へ戻る
            </button>
            <span className="text-xl font-extrabold">{selected?.title}</span>
            <span className="text-base text-ink-soft">{selected?.subtitle}</span>
          </div>

          {island === PROLOGUE ? (
            <div className="bevel p-5">
              <ul className="grid gap-3 sm:grid-cols-2">
                {missions.map((m) => {
                  const done = cleared.has(m.id);
                  return (
                    <li key={m.id}>
                      <Link
                        to="/"
                        className="flex items-center gap-4 border-4 border-wood-dark bg-[var(--cream-dark)] px-4 py-4 hover:bg-white"
                      >
                        <span
                          aria-hidden
                          className={`grid h-12 w-12 shrink-0 place-items-center border-4 border-wood-dark text-2xl ${
                            done ? 'bg-[var(--ok)]' : 'bg-gold'
                          }`}
                        >
                          {m.kind === 'boss' ? '★' : '▶'}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-extrabold">{m.title}</span>
                          <span className="block text-sm text-ink-soft">
                            {done ? 'クリア済み' : '挑戦できます'} · {m.steps.length} 手順
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : track ? (
            <>
              <div className="bevel overflow-hidden p-2">
                <IslandBoard
                  title={track.title}
                  stages={toStages(track.chapters, cleared)}
                  selectedId={stageId}
                  onPick={setStageId}
                />
              </div>

              {stage ? (
                <div className="bevel p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-xl font-extrabold">
                      {String(stage.no).padStart(2, '0')} {stage.title}
                    </h2>
                    <Link to={`/track/${track.id}#${stage.id.replace('/', '-')}`} className="knob px-4 py-2 text-sm font-bold">
                      詳しく見る
                    </Link>
                  </div>
                  <p className="mt-2 text-base text-ink-soft">{stage.summary}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {stage.lessons.map((l) => (
                      <li
                        key={l.id}
                        className="border-2 border-[var(--cream-dark)] bg-white/70 px-3 py-1 text-sm"
                      >
                        {l.kind === 'boss' ? '★ ' : ''}
                        {l.title}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-ink-soft">
                    この島はまだ開拓中です。実装フェーズ {track.phase} で挑戦できるようになります。
                  </p>
                </div>
              ) : (
                <p className="text-base text-ink-soft">
                  ステージを選ぶと、そこで学ぶ内容が表示されます。
                </p>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

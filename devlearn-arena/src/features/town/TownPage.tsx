import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QUEST_GIVER } from '@/engines/lesson/briefing';
import { missionById } from '@/engines/lesson/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { useMotionEnabled } from '@/ui/motion';
import { QuestGiverPortrait } from '@/visual/game/townArt';
import { buildingName, townName, townOf } from './townName';
import { TownMap } from './TownMap';

const TRACKS: readonly MissionTrack[] = ['kernel', 'git', 'k8s', 'net', 'github'];
const BAG_LIMIT = 30;

function isTrack(value: string | undefined): value is MissionTrack {
  return TRACKS.includes(value as MissionTrack);
}

/**
 * 世界ごとの町。任務（依頼）を終えるほど建物が建ち、人が増え、町の格が上がる。
 * 依頼主が次の依頼を勧め、建物を押すと中の依頼（1 本 = 1 階）から選んで入れる。
 * 道具袋には、終えた依頼で使ったコマンドがたまっていく。
 */
export default function TownPage() {
  const { trackId } = useParams();
  const t = useT();
  const animate = useMotionEnabled();
  const lessons = useStore((s) => s.lessons);
  const missionProgress = useStore((s) => s.missionProgress);
  const track: MissionTrack = isTrack(trackId) ? trackId : 'kernel';
  const town = useMemo(() => townOf(track, lessons, missionProgress), [track, lessons, missionProgress]);
  const buildings = town.districts.flatMap((d) => d.buildings.map((b) => ({ district: d, building: b })));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = buildings.find((b) => b.building.id === picked) ?? buildings.find((b) => b.building.next) ?? buildings[0];

  const name = townName(t, track, town.stats.rank);
  const giver = QUEST_GIVER[track];
  const next = town.nextMissionId === null ? undefined : missionById(town.nextMissionId);
  const nextDistrict = town.districts.find((d) => d.buildings.some((b) => b.next));
  const { stats } = town;
  const rankSpan = stats.nextRankAt === null ? 1 : stats.nextRankAt - stats.rankFrom;
  const rankRatio = stats.nextRankAt === null ? 1 : (stats.population - stats.rankFrom) / rankSpan;

  const tools = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of town.districts) {
      for (const b of d.buildings) {
        for (const f of b.floors) {
          if (!f.cleared) continue;
          for (const c of missionById(f.id)?.intro.commands ?? []) if (!seen.has(c.command)) seen.set(c.command, c.means);
        }
      }
    }
    return [...seen.entries()];
  }, [town]);

  return (
    <div className="flex flex-col gap-4" data-testid="town-page" data-track={track}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="sign px-5 py-2 text-3xl font-extrabold">🏘 {name}</h1>
        <nav aria-label={t('town.others')} className="flex flex-wrap gap-1">
          {TRACKS.map((other) => (
            <Link
              key={other}
              to={`/town/${other}`}
              aria-current={other === track ? 'page' : undefined}
              className={`border-2 px-2 py-1 text-sm font-bold ${other === track ? 'border-[var(--gold-dark)] bg-gold' : 'border-wood-dark bg-cream'}`}
            >
              {t(`town.base.${other}`)}
            </Link>
          ))}
        </nav>
        <Link to="/map" className="ml-auto font-mono text-sm text-[var(--gold-dark)] underline underline-offset-4">
          {t('town.back')}
        </Link>
      </div>

      {/* 町の数字 */}
      <div className="bevel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" data-testid="town-stats">
        <span className="text-lg font-extrabold">👪 {t('town.population', { n: stats.population })}</span>
        <span className="font-bold">🏠 {t('town.buildings', { a: stats.completeBuildings, b: stats.buildings })}</span>
        <span className="font-bold">📜 {t('town.floors', { a: stats.clearedFloors, b: stats.floors })}</span>
        <span className="font-bold">🏰 {t('town.landmarks', { n: stats.landmarks })}</span>
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
          <div className="h-3 flex-1 border-2 border-wood-dark bg-white">
            <div className="h-full bg-gold" style={{ width: `${String(Math.round(Math.min(1, Math.max(0, rankRatio)) * 100))}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold">
            {stats.nextRankAt === null ? t('town.maxRank') : t('town.nextRank', { n: stats.nextRankAt - stats.population })}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="bevel h-[70vh] min-h-[420px] overflow-hidden p-0">
          <TownMap
            town={town}
            selectedId={selected?.building.id ?? null}
            onSelect={setPicked}
          />
        </div>

        <aside className="flex flex-col gap-4">
          {/* 依頼主のおすすめ */}
          <section className="bevel flex gap-3 p-3" data-testid="advisor">
            <div className="shrink-0">
              <QuestGiverPortrait track={track} size={4} talking animate={animate} />
              <p className="text-center text-xs font-bold">{t('brief.giver', giver)}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="border-2 border-wood-dark bg-white px-3 py-2 text-sm leading-snug">
                {next ? t('town.advisor', { title: next.title, no: nextDistrict?.no ?? 1 }) : t('town.allDone')}
              </p>
              {next ? (
                <Link to={`/?mission=${encodeURIComponent(next.id)}`} className="sign w-fit px-4 py-2 text-sm font-extrabold">
                  {t('town.accept')}
                </Link>
              ) : null}
            </div>
          </section>

          {/* 選んだ建物の階（依頼） */}
          {selected ? (
            <section className="bevel p-3" data-testid="building-detail">
              <h2 className="text-base font-extrabold">
                {buildingName(t, track, selected.district, selected.building.index, selected.building.landmark)}
              </h2>
              <p className="text-xs text-ink-soft">
                {selected.district.title} · {selected.building.built} / {selected.building.floors.length}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{t('town.pick')}</p>
              <ol className="mt-2 flex flex-col-reverse gap-1">
                {selected.building.floors.map((floor, i) => (
                  <li key={floor.id}>
                    <Link
                      to={`/?mission=${encodeURIComponent(floor.id)}`}
                      data-floor={floor.id}
                      className={`flex items-center gap-2 border-2 px-2 py-1.5 text-sm hover:bg-white ${
                        floor.cleared ? 'border-[var(--ok)] bg-[#dff0cf]' : floor.id === town.nextMissionId ? 'border-[var(--gold-dark)] bg-gold/40' : 'border-wood-dark bg-cream'
                      }`}
                    >
                      <span className="sign shrink-0 px-1.5 text-xs font-extrabold">{t('brief.floor', { n: i + 1 })}</span>
                      <span className="min-w-0 flex-1 truncate font-bold">
                        {floor.kind === 'boss' ? '★ ' : ''}
                        {floor.title}
                      </span>
                      <span className="shrink-0 text-xs">
                        {floor.cleared ? t('town.floorCleared') : floor.started ? t('town.floorStarted') : t('town.floorOpen')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* 道具袋 */}
          <section className="bevel p-3" data-testid="tool-bag">
            <h2 className="text-base font-extrabold">🎒 {t('town.bag')}</h2>
            {tools.length === 0 ? (
              <p className="mt-1 text-sm text-ink-soft">{t('town.bagEmpty')}</p>
            ) : (
              <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
                {tools.slice(0, BAG_LIMIT).map(([command, means]) => (
                  <li key={command} className="flex flex-col text-xs">
                    <code className="w-fit bg-[var(--wood-dark)] px-1.5 py-0.5 font-mono text-cream">{command}</code>
                    <span className="text-ink-soft">{means}</span>
                  </li>
                ))}
                {tools.length > BAG_LIMIT ? <li className="text-xs text-ink-soft">{t('town.bagMore', { n: tools.length - BAG_LIMIT })}</li> : null}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

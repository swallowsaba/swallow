import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CityState } from '@/content/city';
import {
  advise, analyze, applyTool, COST, createCity, facilityRadius, idx, isValidCity, terrainOf, tick,
  type Advice, type Point, type Tool, type ToolResult,
} from '@/engines/city/sim';
import { moveFacility, unrestOf, voicesOf } from '@/engines/city/civic';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { CityMapView, type CityEvent } from './CityMapView';
import { citySaveOf, civicFacilities, facilityInfos, withPartial } from './cityStore';
import type { MapInput } from './isoWorld';

const TOOLS: readonly Tool[] = ['inspect', 'road', 'res', 'com', 'ind', 'park', 'facility', 'bulldoze'];
/** 1 日の長さ（ミリ秒）。0 は一時停止 */
const SPEED_MS = [0, 2000, 900, 350] as const;

interface Props {
  track: MissionTrack;
  city: CityState;
  /** 建設を決めたばかりの施設。地図をそこへ寄せる */
  placeRequest: string | null;
  /** いま取り組んでいる任務の手順の進み。その施設の工事が進んで見える */
  partial?: { facilityId: string; fraction: number } | null;
  /** 地図に出す出来事 */
  events?: readonly CityEvent[];
  /** 施設の説明と要望へ移る（左側） */
  onStudy: (facilityId: string) => void;
  /** 始めの速さ。テストでは 0（止めておく） */
  initialSpeed?: number;
}

/**
 * 右側：市長が自分で作る街。
 * 3D の地図の上で道路を引き、区画を塗り、学んで建設を決めた施設を置く。日がたつと、つながった区画が需要と地価に応じて育つ。
 * 予算は税収と、左側での理解度（正解）・コマンドでの対応で入る。
 */
export function CityPane({ track, city: learned, placeRequest, partial = null, events = [], onStudy, initialSpeed = 1 }: Props) {
  const t = useT();
  const stored = useStore((s) => s.cities[track]);
  const setCity = useStore((s) => s.setCity);
  // 保存が無い・壊れていれば新しい街
  const save = useMemo(() => (stored !== undefined && isValidCity(stored) ? stored : createCity()), [stored]);
  const terrain = useMemo(() => terrainOf(track), [track]);
  const city = useMemo(() => withPartial(learned, partial), [learned, partial]);
  const infos = useMemo(() => facilityInfos(city), [city]);
  const population = useMemo(() => analyze(save, terrain, infos).population, [save, terrain, infos]);
  const voices = useMemo(() => voicesOf(civicFacilities(city), population, save.day), [city, population, save.day]);
  const unrest = unrestOf(voices);
  const analysis = useMemo(() => analyze(save, terrain, infos, unrest), [save, terrain, infos, unrest]);
  const order = useMemo(() => city.facilities.map((f) => f.facility.id), [city]);
  // 施設の困りごとは、苦情が届いてから伝える
  const advice = useMemo(
    () => advise(save, analysis, infos, order).filter((a) => a.kind !== 'trouble' || voices.some((v) => v.kind === 'complaint' && v.facilityId === a.facilityId)),
    [save, analysis, infos, order, voices],
  );

  const [tool, setTool] = useState<Tool>('inspect');
  const [placing, setPlacing] = useState<string | null>(null);
  const [speed, setSpeed] = useState(initialSpeed);
  const [inspected, setInspected] = useState<Point | null>(null);
  const [panel, setPanel] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 建設を決めたばかりの施設（仮置き済み）へ地図を寄せ、詳しく見せる
  useEffect(() => {
    if (placeRequest === null) return;
    const placed = citySaveOf(track).facilities.find((f) => f.id === placeRequest);
    if (placed) {
      setFocusId(placeRequest);
      setInspected({ x: placed.x, y: placed.y });
    }
    // 決めた瞬間だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeRequest]);

  // 時間を進める
  useEffect(() => {
    const ms = SPEED_MS[speed as 0] ?? 0;
    if (ms === 0) return;
    const timer = setInterval(() => {
      const current = citySaveOf(track);
      setCity(track, tick(current, terrain, infos, unrest));
    }, ms);
    return () => {
      clearInterval(timer);
    };
  }, [speed, track, terrain, infos, unrest, setCity]);

  const describe = useCallback(
    (result: ToolResult, used: Tool): string => {
      if (result.error !== undefined && result.error !== 'nothing') return t(`city.err.${result.error}`);
      if (used === 'inspect' || used === 'bulldoze') return '';
      if (result.cost === 0) return used === 'res' || used === 'com' || used === 'ind' ? t('city.free') : '';
      return t('city.cost', { n: result.cost.toLocaleString() });
    },
    [t],
  );

  const use = useCallback(
    (from: Point, to: Point) => {
      const current = citySaveOf(track);
      // もう置いてある施設なら移設（費用なし）
      if (tool === 'facility' && placing !== null && current.facilities.some((f) => f.id === placing)) {
        const moved = moveFacility(current, terrain, infos, placing, to);
        if (moved.error !== undefined) {
          setNotice(t(`city.err.${moved.error as 'blocked'}`));
          return;
        }
        setNotice(null);
        setCity(track, moved.save);
        setPlacing(null);
        setTool('inspect');
        setInspected(to);
        return;
      }
      const result = applyTool(current, terrain, tool, from, to, infos, placing ?? undefined);
      if (result.error !== undefined) {
        if (result.error !== 'nothing') setNotice(t(`city.err.${result.error}`));
        return;
      }
      setNotice(null);
      setCity(track, result.save);
      if (tool === 'facility' && placing !== null) {
        setPlacing(null);
        setTool('inspect');
        setInspected(to);
      }
    },
    [track, terrain, tool, infos, placing, setCity, t],
  );

  const pickTool = (next: Tool): void => {
    setTool(next);
    setNotice(null);
    if (next === 'facility') {
      setPanel(true);
      const waiting = infos.find((f) => f.learned && !save.facilities.some((p) => p.id === f.id));
      setPlacing(waiting?.id ?? null);
    } else {
      setPlacing(null);
    }
  };

  const nameOf = (id: string): string => city.facilities.find((f) => f.facility.id === id)?.facility.name ?? id;

  const input = useMemo<MapInput>(
    () => ({
      track,
      terrain,
      save,
      analysis,
      infos,
      facilities: city.facilities.map((f) => ({
        id: f.facility.id,
        name: f.facility.name,
        kind: f.facility.building,
        ratio: infos.find((i) => i.id === f.facility.id)?.ratio ?? 0,
        // 最初の任務を終えると建物ができあがる。手順を進めるたびに背が伸びる
        build: Math.min(1, f.missionsCleared),
      })),
    }),
    [track, terrain, save, analysis, infos, city],
  );

  const selectedFacility =
    inspected === null ? null : save.facilities.find((f) => inspected.x >= f.x && inspected.x <= f.x + 1 && inspected.y >= f.y && inspected.y <= f.y + 1) ?? null;
  const balance = analysis.income - analysis.upkeep;

  return (
    <section data-testid="city-pane" data-tool={tool} className="relative h-full min-h-0 w-full overflow-hidden bg-[#7c9a5a]">
      <div className="absolute inset-0">
        <CityMapView
          input={input}
          tool={tool}
          placing={placing}
          selected={selectedFacility?.id ?? null}
          focusId={focusId}
          events={events}
          onApply={use}
          onInspect={setInspected}
          describe={describe}
          label={t('city.label', { name: city.plan.name })}
          fallback={t('city.noCanvas')}
          zoomLabels={{ in: t('city.zoomIn'), out: t('city.zoomOut'), fit: t('city.zoomFit') }}
        />
      </div>

      {/* 上：街の数字。その下の左に住民の声、右に施設の一覧か調べたマス。重ならないように縦に積む */}
      <div className="pointer-events-none absolute inset-x-2 bottom-24 top-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-[rgba(22,30,38,0.86)] px-3 py-1.5 font-mono text-sm text-white shadow-lg">
          <span data-testid="city-money" data-value={save.money} title={t('city.money')}>💰 ¥{save.money.toLocaleString()}</span>
          <span className={`text-xs ${balance >= 0 ? 'text-[#8fe08a]' : 'text-[#ff9a8a]'}`}>
            {t('city.balance', { n: `${balance >= 0 ? '+' : '−'}¥${Math.abs(balance).toLocaleString()}` })}
          </span>
          <span data-testid="city-population" data-value={analysis.population} title={t('city.population')}>👪 {analysis.population.toLocaleString()}</span>
          <span title={t('city.jobs')}>💼 {analysis.jobs.toLocaleString()}</span>
          <span data-testid="city-happiness" title={t('city.happiness')}>😊 {analysis.happiness}%</span>
          <span data-testid="city-day">📅 {t('city.day', { n: save.day })}</span>
        </div>
        <div role="group" aria-label={t('city.speed')} className="pointer-events-auto flex overflow-hidden rounded-md bg-[rgba(22,30,38,0.86)] text-sm text-white shadow-lg">
          {SPEED_MS.map((_, s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              data-speed={s}
              title={t(`city.speed.${String(s) as '0'}`)}
              onClick={() => {
                setSpeed(s);
              }}
              className={`px-2.5 py-1.5 font-bold ${speed === s ? 'bg-[#f2c14e] text-[#1d252c]' : 'hover:bg-white/10'}`}
            >
              {s === 0 ? '⏸' : '▶'.repeat(s)}
            </button>
          ))}
        </div>
        <div data-testid="city-demand" className="pointer-events-auto flex items-end gap-1 rounded-md bg-[rgba(22,30,38,0.86)] px-2 py-1 text-[10px] font-bold text-white shadow-lg" title={t('city.demand')}>
          {(
            [
              ['r', analysis.demand.r, '#5fd35a'],
              ['c', analysis.demand.c, '#4aa3f0'],
              ['i', analysis.demand.i, '#f0c53a'],
            ] as const
          ).map(([key, value, colour]) => (
            <div key={key} className="flex flex-col items-center" title={`${t(`city.demand.${key}`)} ${String(value)}`}>
              <div className="flex h-7 w-3 items-end bg-white/15">
                <div style={{ height: `${String(value)}%`, background: colour }} className="w-full" />
              </div>
              <span>{t(`city.demand.${key}`).slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start gap-2">
      {/* 左：住民の声 */}
      <Voices advice={advice} events={events} nameOf={nameOf} city={city} onPlace={(id) => { pickTool('facility'); setPlacing(id); }} onStudy={onStudy} />

      {/* 右：施設の一覧 / 調べたマス */}
      {panel ? (
        <FacilityList
          city={city}
          placedIds={save.facilities.map((f) => f.id)}
          placing={placing}
          money={save.money}
          onPlace={(id) => {
            setTool('facility');
            setPlacing(id);
          }}
          onMove={(id) => {
            setTool('facility');
            setPlacing(id);
            setNotice(t('city.fac.moving', { name: nameOf(id) }));
          }}
          onLook={(id) => {
            setFocusId(null);
            setTimeout(() => {
              setFocusId(id);
            }, 0);
            const placed = save.facilities.find((f) => f.id === id);
            if (placed) setInspected({ x: placed.x, y: placed.y });
          }}
          onStudy={onStudy}
          onClose={() => {
            setPanel(false);
            if (tool === 'facility') pickTool('inspect');
          }}
        />
      ) : inspected !== null ? (
        <Inspector
          point={inspected}
          tile={save.tiles[idx(inspected.x, inspected.y)] ?? '.'}
          terrain={terrain[idx(inspected.x, inspected.y)] ?? 'g'}
          level={Number(save.levels[idx(inspected.x, inspected.y)] ?? '0')}
          max={analysis.maxLevel[idx(inspected.x, inspected.y)] ?? 0}
          value={analysis.landValue[idx(inspected.x, inspected.y)] ?? 0}
          connected={analysis.access[idx(inspected.x, inspected.y)] === 1}
          covered={analysis.covered[idx(inspected.x, inspected.y)] === 1}
          facility={selectedFacility === null ? null : city.facilities.find((f) => f.facility.id === selectedFacility.id) ?? null}
          onStudy={onStudy}
          onClose={() => {
            setInspected(null);
          }}
        />
      ) : null}
      </div>
      </div>

      {/* 下：道具 */}
      <div className="absolute inset-x-2 bottom-2 flex flex-col items-center gap-1">
        <p data-testid="city-tool-hint" className="max-w-full rounded bg-[rgba(22,30,38,0.8)] px-3 py-1 text-center text-xs font-semibold text-white">
          {notice ?? (tool === 'facility' && placing !== null ? t('city.fac.placing', { name: nameOf(placing) }) : t(`city.hint.${tool}`))}
        </p>
        <div role="toolbar" aria-label={t('city.tools')} className="flex max-w-full flex-wrap justify-center gap-1 rounded-lg bg-[rgba(22,30,38,0.9)] p-1.5 shadow-xl">
          {TOOLS.map((item) => (
            <button
              key={item}
              type="button"
              data-tool={item}
              aria-pressed={tool === item}
              onClick={() => {
                pickTool(item);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-extrabold ${tool === item ? 'bg-[#f2c14e] text-[#1d252c]' : 'text-white hover:bg-white/15'}`}
            >
              {t(`city.tool.${item}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Voices({
  advice, events, nameOf, city, onPlace, onStudy,
}: {
  advice: readonly Advice[];
  events: readonly CityEvent[];
  nameOf: (id: string) => string;
  city: CityState;
  onPlace: (id: string) => void;
  onStudy: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  return (
    <div data-testid="city-voices" className="pointer-events-auto flex max-h-full w-[min(19rem,50%)] flex-col rounded-md bg-[rgba(255,255,255,0.93)] text-[#1d252c] shadow-lg">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-extrabold"
      >
        {t('city.voices')} <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2 pb-2">
          {events.slice(-3).reverse().map((e) => (
            <li key={`event:${String(e.id)}`} data-city-event className="rounded px-2 py-1 text-xs font-bold text-white" style={{ background: e.color }}>
              {e.text}
            </li>
          ))}
          {advice.slice(0, 4).map((a) => (
            <li key={`${a.kind}:${'facilityId' in a ? a.facilityId : ''}`} data-advice={a.kind} className="rounded bg-[#eef3f6] px-2 py-1 text-xs leading-snug">
              {a.kind === 'trouble' ? (
                <>
                  <span>
                    {t('city.advice.trouble', {
                      who: city.facilities.find((f) => f.facility.id === a.facilityId)?.facility.trouble.who ?? '',
                      text: city.facilities.find((f) => f.facility.id === a.facilityId)?.facility.trouble.text ?? '',
                    })}
                  </span>{' '}
                  <button type="button" onClick={() => { onStudy(a.facilityId); }} className="font-extrabold text-[#2f6fb0] underline">
                    {t('board.handle')}
                  </button>
                </>
              ) : a.kind === 'place' ? (
                <>
                  <span>{t('city.advice.place', { name: nameOf(a.facilityId) })}</span>{' '}
                  <button type="button" onClick={() => { onPlace(a.facilityId); }} className="font-extrabold text-[#2f6fb0] underline">
                    {t('city.fac.placeShort')}
                  </button>
                </>
              ) : a.kind === 'idle' ? (
                <>
                  <span>{t('city.advice.idle', { name: nameOf(a.facilityId) })}</span>{' '}
                  <button type="button" onClick={() => { onStudy(a.facilityId); }} className="font-extrabold text-[#2f6fb0] underline">
                    {t('city.fac.work')}
                  </button>
                </>
              ) : a.kind === 'unconnected' || a.kind === 'unserved' ? (
                t(`city.advice.${a.kind}`, { n: a.count })
              ) : (
                t(`city.advice.${a.kind}`)
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FacilityList({
  city, placedIds, placing, money, onPlace, onMove, onLook, onStudy, onClose,
}: {
  onMove: (id: string) => void;
  city: CityState;
  placedIds: readonly string[];
  placing: string | null;
  money: number;
  onPlace: (id: string) => void;
  onLook: (id: string) => void;
  onStudy: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div data-testid="city-facilities" className="pointer-events-auto ml-auto flex max-h-full w-[min(18rem,50%)] flex-col rounded-md bg-[rgba(255,255,255,0.95)] text-[#1d252c] shadow-lg">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-extrabold">
        🏛 {t('city.facilities')}
        <button type="button" onClick={onClose} className="px-1 text-sm" aria-label={t('city.close')}>
          ×
        </button>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto px-2 pb-2">
        {city.facilities.map((f) => {
          const id = f.facility.id;
          const placed = placedIds.includes(id);
          const learned = f.state !== 'locked' && f.state !== 'available';
          const needs = f.facility.needs.map((n) => city.facilities.find((x) => x.facility.id === n)?.facility.name ?? n).join('・');
          return (
            <li key={id} data-city-facility={id} data-placed={placed ? 'true' : 'false'} className={`rounded border-2 px-2 py-1.5 text-xs ${placing === id ? 'border-[#f2c14e] bg-[#fff6dc]' : 'border-transparent bg-[#eef3f6]'}`}>
              <p className="font-extrabold">{f.facility.name}</p>
              <p className="text-[11px] opacity-75">{f.facility.concept}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {f.state === 'locked' ? (
                  <span className="opacity-70">{t('city.fac.locked', { name: needs })}</span>
                ) : !learned ? (
                  <button type="button" onClick={() => { onStudy(id); }} className="rounded bg-[#2f6fb0] px-2 py-0.5 font-bold text-white">
                    {t('city.fac.study')}
                  </button>
                ) : !placed ? (
                  <button
                    type="button"
                    data-place={id}
                    disabled={money < COST.facility}
                    onClick={() => { onPlace(id); }}
                    className="rounded bg-[#3e8c5a] px-2 py-0.5 font-bold text-white disabled:opacity-50"
                  >
                    {t('city.fac.place', { n: COST.facility.toLocaleString() })}
                  </button>
                ) : (
                  <>
                    <span className="font-mono">{f.ratio === 0 ? t('city.fac.idle') : t('city.fac.ratio', { n: Math.round(f.ratio * 100) })}</span>
                    <button type="button" onClick={() => { onLook(id); }} className="rounded bg-white px-2 py-0.5 font-bold">
                      {t('city.fac.look')}
                    </button>
                    <button type="button" data-move={id} onClick={() => { onMove(id); }} className="rounded bg-white px-2 py-0.5 font-bold">
                      {t('city.fac.move')}
                    </button>
                    {f.ratio < 1 ? (
                      <button type="button" onClick={() => { onStudy(id); }} className="rounded bg-[#2f6fb0] px-2 py-0.5 font-bold text-white">
                        {t('city.fac.work')}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Inspector({
  point, tile, terrain, level, max, value, connected, covered, facility, onStudy, onClose,
}: {
  point: Point;
  tile: string;
  terrain: string;
  level: number;
  max: number;
  value: number;
  connected: boolean;
  covered: boolean;
  facility: CityState['facilities'][number] | null;
  onStudy: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const zone = tile === 'R' || tile === 'C' || tile === 'I';
  const kind = facility ? 'F' : tile === '.' ? (terrain === 'w' ? 'water' : terrain === 't' ? 'tree' : 'empty') : tile;
  return (
    <div data-testid="city-inspector" className="pointer-events-auto ml-auto max-h-full w-[min(17rem,50%)] overflow-y-auto rounded-md bg-[rgba(255,255,255,0.95)] px-3 py-2 text-xs text-[#1d252c] shadow-lg">
      <div className="flex items-center justify-between font-extrabold">
        <span>{facility ? facility.facility.name : t(`city.tile.${kind as 'empty'}`)}</span>
        <button type="button" onClick={onClose} className="px-1 text-sm" aria-label={t('city.close')}>
          ×
        </button>
      </div>
      <p className="font-mono opacity-60">({point.x}, {point.y})</p>
      {facility ? (
        <div className="mt-1 flex flex-col gap-1">
          <p>{facility.facility.concept}</p>
          <p className="font-mono">
            {facility.ratio === 0 ? t('city.fac.idle') : t('city.fac.ratio', { n: Math.round(facility.ratio * 100) })} ・{' '}
            {t('city.inspect.radius', { n: facilityRadius(facility.ratio) })}
          </p>
          <p className="opacity-80">{t('city.inspect.facilityLead')}</p>
          {facility.ratio < 1 ? (
            <button type="button" onClick={() => { onStudy(facility.facility.id); }} className="w-fit rounded bg-[#2f6fb0] px-2 py-0.5 font-bold text-white">
              {t('city.fac.work')}
            </button>
          ) : null}
        </div>
      ) : zone ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>{t('city.inspect.level', { n: level, max })}</li>
          <li>{t('city.inspect.value', { n: value.toFixed(1) })}</li>
          <li>{connected ? t('city.inspect.connected') : t('city.inspect.disconnected')}</li>
          <li>{covered ? t('city.inspect.covered') : t('city.inspect.uncovered')}</li>
        </ul>
      ) : null}
    </div>
  );
}

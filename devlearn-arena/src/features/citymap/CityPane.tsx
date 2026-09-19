import { useMemo, useState } from 'react';
import type { CityState } from '@/content/city';
import { sceneOf, type LegendEntry, type SceneItem } from '@/engines/cityscape';
import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Icon } from '@/ui/Icon';
import { MoodFace } from '@/visual/game/MoodFace';
import { CityMapView, type CityEvent } from './CityMapView';
import { civicViews, growthOf, withPartial } from './cityStore';
import { itemById, type CivicView, type SceneMapInput } from './isoScene';

interface Props {
  track: MissionTrack;
  /** 学びの進み（施設の建設・任務の完了） */
  city: CityState;
  /** いまの任務のシェルの状態。これがカテゴリごとの見立てで「現場」の街になる */
  state: ShellState;
  previous?: ShellState | undefined;
  /** いま対応している施設 */
  currentFacilityId: string | null;
  /** いま取り組んでいる任務の手順の進み。その施設の工事が進んで見える */
  partial?: { facilityId: string; fraction: number } | null;
  events?: readonly CityEvent[];
  /** 施設の対応へ（左側） */
  onStudy: (facilityId: string) => void;
}

/**
 * 右側：カテゴリごとの街。
 * 上の通りに学んで建てた市民施設（工事の進み・苦情・評価）、その下にいまの任務の状態を見立てた「現場」の街。
 * 街はコマンドでしか変わらない。建物を押すと、それが何か・次に何をすればよいかが出る。
 */
export function CityPane({ track, city: learned, state, previous, currentFacilityId, partial = null, events = [], onStudy }: Props) {
  const t = useT();
  const city = useMemo(() => withPartial(learned, partial), [learned, partial]);
  const scene = useMemo(() => sceneOf(track, state, previous, t), [track, state, previous, t]);
  const civic = useMemo(() => civicViews(city, learned, currentFacilityId), [city, learned, currentFacilityId]);
  const stored = useStore((s) => s.growth);
  const growth = useMemo(() => growthOf(stored, track), [stored, track]);
  const nextTownLabel = t('city.nextTown');
  const input = useMemo<SceneMapInput>(() => ({ track, scene, civic, growth, nextTownLabel }), [track, scene, civic, growth, nextTownLabel]);
  const [selected, setSelected] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  const selectedCivic = selected?.startsWith('civic:') === true ? civic.find((c) => `civic:${c.id}` === selected) : undefined;
  const selectedItem = selectedCivic ? undefined : itemById(scene, selected);

  return (
    <section data-testid="city-pane" className="relative h-full min-h-0 w-full overflow-hidden bg-[#6fab49]">
      <div className="absolute inset-0">
        <CityMapView
          input={input}
          selected={selected}
          events={events}
          onSelect={setSelected}
          label={t('city.label', { name: city.plan.name })}
          fallback={t('city.noCanvas')}
          zoomLabels={{ in: t('city.zoomIn'), out: t('city.zoomOut'), fit: t('city.zoomFit') }}
        />
      </div>

      {/* 上：街の数字（学びの進みと、現場の見立て） */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col gap-2">
        <div data-testid="city-stats" className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-md bg-[rgba(22,30,38,0.86)] px-3 py-1.5 text-sm text-white shadow-lg">
          <span data-testid="city-houses" data-value={growth.houses} title={t('city.houses')} className="inline-flex items-center gap-1"><Icon name="city" size={14} />{growth.houses}</span>
          <span data-testid="city-floors" data-value={growth.floors} title={t('city.floors')} className="inline-flex items-center gap-1"><Icon name="build" size={14} />{growth.floors}</span>
          <span title={t('city.comfort')} className="inline-flex items-center gap-1">
            <MoodFace mood={city.comfort >= 70 ? 'happy' : city.comfort >= 40 ? 'waiting' : 'angry'} size={18} />
            {city.comfort}%
          </span>
          <span title={t('city.facilities')} className="inline-flex items-center gap-1"><Icon name="board" size={14} />{city.built}/{city.facilities.length}</span>
          <span className="h-4 w-px bg-white/30" aria-hidden />
          {scene.stats.map((s) => (
            <span key={s.label} data-stat={s.label} className="whitespace-nowrap">
              {s.icon} <span className="text-xs opacity-80">{s.label}</span> <b className="font-mono">{s.value}</b>
            </span>
          ))}
        </div>
        {events.length > 0 ? (
          <ul className="pointer-events-auto flex max-w-[20rem] flex-col gap-1 self-start">
            {events.slice(-3).reverse().map((e) => (
              <li key={e.id} data-city-event className="rounded px-2 py-1 text-xs font-bold text-white shadow" style={{ background: e.color }}>
                {e.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 右：押したものの説明 */}
      {selectedCivic ? (
        <CivicInfo facility={selectedCivic} city={city} onStudy={onStudy} onClose={() => { setSelected(null); }} />
      ) : selectedItem ? (
        <ItemInfo item={selectedItem} onClose={() => { setSelected(null); }} />
      ) : null}

      {/* 真ん中：何も無いときの案内 */}
      {scene.empty ? (
        <div data-testid="city-empty" className="pointer-events-none absolute inset-x-6 top-1/3 mx-auto max-w-md rounded-lg border-4 border-wood-dark bg-[rgba(251,243,223,0.95)] px-4 py-3 text-center shadow-xl">
          <p className="text-lg font-extrabold">{scene.empty.title}</p>
          <p className="mt-1 text-sm leading-relaxed">{scene.empty.text}</p>
        </div>
      ) : null}

      {/* 下：この街のしくみ（見立て ⇄ 概念 ⇄ コマンド） */}
      <div className="absolute inset-x-2 bottom-2">
        <div data-testid="city-legend" className="rounded-lg bg-[rgba(22,30,38,0.9)] text-white shadow-xl">
          <button
            type="button"
            aria-expanded={legendOpen}
            onClick={() => {
              setLegendOpen((v) => !v);
            }}
            className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-extrabold"
          >
            <span className="inline-flex items-center gap-1"><Icon name="map" size={13} />{t('city.legend', { name: city.plan.name })}</span>
            <span aria-hidden>{legendOpen ? '▾' : '▴'}</span>
          </button>
          {legendOpen ? (
            <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-2 pb-2">
              {scene.legend.map((entry) => (
                <LegendChip key={entry.name} entry={entry} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const SAMPLE_CLASS: Record<LegendEntry['sample'], string> = {
  solid: 'bg-[#9cc3dc] border-[#2b2118]',
  frame: 'bg-transparent border-[#c98a1a] border-dashed',
  blueprint: 'bg-[#468ce6] border-white border-dashed',
  scaffold: 'bg-[#e0a526] border-[#8a5a10]',
  ghost: 'bg-white/30 border-white/50',
  ruin: 'bg-[#9a958c] border-[#5a554c]',
  dark: 'bg-[#2c3440] border-[#111]',
  tent: 'bg-[#e98b5a] border-[#2b2118]',
  road: 'bg-[#6f757c] border-[#d9d3c4]',
  plan: 'bg-[#7b7f85] border-[#e0483a] border-dashed',
  marker: 'bg-transparent border-transparent',
  link: 'bg-[#4caf50] border-transparent',
  room: 'bg-[#e98b5a] border-[#2b2118]',
};

function LegendChip({ entry }: { entry: LegendEntry }) {
  return (
    <li data-legend={entry.sample} className="flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 text-[11px] leading-tight">
      <span aria-hidden className={`grid h-4 w-4 shrink-0 place-items-center border-2 text-xs ${SAMPLE_CLASS[entry.sample]}`}>
        {entry.icon ?? ''}
      </span>
      <span>
        <b>{entry.name}</b> = {entry.meaning}
        {entry.command !== undefined ? <code className="ml-1 rounded bg-black/40 px-1 font-mono text-[10px] text-[#9fd67a]">{entry.command}</code> : null}
      </span>
    </li>
  );
}

function Panel({ testId, title, onClose, children }: { testId: string; title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div data-testid={testId} className="absolute right-2 top-14 max-h-[calc(100%-12rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-md border-2 border-wood-dark bg-[rgba(251,243,223,0.97)] px-3 py-2 text-sm text-[#1d252c] shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <p className="font-extrabold leading-snug">{title}</p>
        <button type="button" onClick={onClose} className="px-1 text-base" aria-label={t('city.close')}>
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

function ItemInfo({ item, onClose }: { item: SceneItem; onClose: () => void }) {
  const t = useT();
  const info = item.type === 'plot' ? undefined : item.info;
  if (!info) return null;
  return (
    <Panel testId="city-inspector" title={info.title} onClose={onClose}>
      <p className="mt-1 rounded bg-[#2b2118] px-2 py-1 text-xs font-bold text-[#f2c14e]">{info.kind}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {info.lines.filter((l) => l !== '').map((line) => (
          <li key={line} className="text-xs leading-relaxed">
            {line}
          </li>
        ))}
      </ul>
      {info.next !== undefined ? (
        <p data-testid="city-next" className="mt-2 border-l-4 border-[var(--gold-dark)] bg-[var(--gold)]/25 px-2 py-1 text-xs font-bold leading-relaxed">
          ▶ {t('city.next')}: {info.next}
        </p>
      ) : null}
    </Panel>
  );
}

function CivicInfo({ facility, city, onStudy, onClose }: { facility: CivicView; city: CityState; onStudy: (id: string) => void; onClose: () => void }) {
  const t = useT();
  const status = city.facilities.find((f) => f.facility.id === facility.id);
  if (!status) return null;
  const locked = status.state === 'locked';
  return (
    <Panel testId="city-civic" title={facility.name} onClose={onClose}>
      <p className="mt-1 text-xs">{t('city.civicConcept', { concept: status.facility.concept })}</p>
      <p className="mt-1 text-xs font-bold">
        {locked
          ? t('city.civicLocked')
          : !facility.learned
            ? t('city.civicPlanned')
            : facility.build < 1
              ? t('city.civicBuilding', { a: Math.floor(status.missionsCleared), b: status.missionsTotal })
              : t('city.civicRatio', { n: Math.round(facility.ratio * 100) })}
      </p>
      {facility.voice === 'complaint' ? (
        <p className="mt-1 flex items-start gap-1 text-xs">
          <MoodFace mood="angry" size={20} />
          <span>「{status.facility.trouble.text}」</span>
        </p>
      ) : null}
      {!locked && facility.ratio < 1 ? (
        <button
          type="button"
          data-civic-handle={facility.id}
          onClick={() => {
            onStudy(facility.id);
          }}
          className="sign mt-2 px-3 py-1 text-xs font-extrabold"
        >
          {facility.learned ? t('board.continue') : t('board.handle')}
        </button>
      ) : null}
    </Panel>
  );
}

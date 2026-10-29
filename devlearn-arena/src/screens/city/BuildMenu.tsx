import { useMemo, useState } from 'react';
import { STAGE_NAMES } from '@/game/stage';
import { FACILITY_DEFS, FACILITY_ORDER, landmarkOf, SHELF_NAMES, type FacilityShelf } from '@/city/facilities';
import { svgView } from '@/city/generate/svg';
import { facilitySvg, monumentAsset } from '@/city/render/sprites';
import { ROAD_RULES, ZONE_RULES, type BuildRoadKind } from '@/city/rules';
import type { FacilityType, ZoneKind } from '@/city/types';
import type { DemandTerms } from '@/sim/demand';
import { Icon, type IconName } from '@/ui/icons/Icon';
import type { CityGameState, MenuGroup, Tool } from './cityStore';
import { DemandBars } from './DemandBars';
import './BuildMenu.css';

/**
 * 建設メニュー（docs/ui-design.md 3 章: 下中央、高さ 72。選ぶと上に種類の引き出し）。
 * 道路・区画・施設・公園・取り壊し。
 * ミッションで受け取った記念碑は、公園の引き出しに「受け取った報酬」として並び、費用なしで置ける（docs/city-design.md 4 章）。
 * 公共の引き出し（docs/ui-design.md 11.5）: 公共サービスと発電所と、節目に届いた褒賞の建物。財布は財政（費用の印は金庫）。区画の引き出しに需要の棒（11.4）
 */

const GROUPS: { id: MenuGroup; label: string; icon: IconName }[] = [
  { id: 'road', label: '道路', icon: 'road' },
  { id: 'zone', label: '区画', icon: 'zone' },
  { id: 'facility', label: '施設', icon: 'facility' },
  { id: 'park', label: '公園', icon: 'park' },
  { id: 'civic', label: '公共', icon: 'civic' },
  { id: 'demolish', label: '取り壊し', icon: 'demolish' },
];

/** 公共の引き出しの棚（1 度に 5 つまで並べる。docs/visual-design.md V7）。褒賞の棚は、節目に届いた建物がある時だけ出す（docs/ui-design.md 11.5） */
type CivicShelf = 'service' | 'power' | 'award';
const CIVIC_SHELVES: { id: CivicShelf; label: string; types: FacilityType[] }[] = [
  { id: 'service', label: '公共サービス', types: ['police', 'fire', 'school', 'clinic'] },
  { id: 'power', label: '電気', types: ['power-thermal', 'power-solar'] },
  { id: 'award', label: '褒賞', types: [] },
];

/** 褒賞の建物の、建設メニューでの様子（届いていない物は出さない） */
export interface AwardItem {
  type: FacilityType;
  status: 'open' | 'pending' | 'built';
}

const ROAD_KINDS: BuildRoadKind[] = ['lane', 'street', 'avenue', 'roundabout'];
const ZONE_KINDS: ZoneKind[] = ['residential', 'commercial', 'office', 'industrial'];

const format = (n: number): string => n.toLocaleString('ja-JP');

/** 施設の SVG の正面の姿を、画像の URL にする（引き出しの見本） */
function thumbnail(type: FacilityType): string | null {
  return imageOf(facilitySvg(type, 1));
}

function imageOf(svg: string | null | undefined): string | null {
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgView(svg, 'front').svg)}` : null;
}

interface ItemProps {
  label: string;
  cost: string;
  selected: boolean;
  locked: string | null;
  onPick: () => void;
  image?: string | null;
  swatch?: ZoneKind | BuildRoadKind;
  testId: string;
  /** 費用の財布（公共サービスと発電所は財政） */
  wallet?: 'funds' | 'treasury';
}

function Item({ label, cost, selected, locked, onPick, image, swatch, testId, wallet = 'funds' }: ItemProps) {
  return (
    <button
      type="button"
      className={`build-item${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-disabled={locked !== null}
      title={locked ?? label}
      data-testid={testId}
      onClick={() => {
        if (locked === null) onPick();
      }}
    >
      <span className="build-item-art">
        {image ? <img src={image} alt="" draggable={false} /> : <span className={`build-swatch is-${swatch ?? 'lane'}`} />}
      </span>
      <span className="build-item-name">{label}</span>
      <span className="build-item-cost">
        {locked ? <span className="build-item-locked">{locked}</span> : <><Icon name={wallet === 'treasury' ? 'treasury' : 'funds'} size={13} /><span className="num">{cost}</span></>}
      </span>
    </button>
  );
}

function lockOf(stage: number, minStage: 1 | 2 | 3 | 4 | 5): string | null {
  return stage < minStage ? `「${STAGE_NAMES[minStage]}」になると作れる` : null;
}

export function BuildMenu({ state, landmarks = [], treasury = 0, demand, awards = [] }: {
  state: Pick<CityGameState, 'menu' | 'tool' | 'openMenu' | 'setTool'> & { stage: number };
  /** 受け取ったが、まだ置いていない記念碑（ミッションの報酬） */
  landmarks?: readonly string[];
  /** 財政の今の残り（公共サービスと発電所の財布。赤字の間は申請を出せない。docs/game-design.md 22.2） */
  treasury?: number;
  /** 前の週の需要の項（区画の引き出しの棒。docs/ui-design.md 11.4） */
  demand?: DemandTerms | undefined;
  /** 節目に届いた褒賞の建物（docs/game-design.md 25 章） */
  awards?: readonly AwardItem[];
}) {
  const { stage, menu, tool, openMenu, setTool } = state;
  const thumbs = useMemo(() => new Map(FACILITY_ORDER.map((t) => [t, thumbnail(t)])), []);
  const [shelf, setShelf] = useState<FacilityShelf>('base');
  const [shelfPicked, setCivicShelf] = useState<CivicShelf>('service');
  // 褒賞の一覧の「建てる」で褒賞の建物を選んだ時は、褒賞の棚を開く（docs/ui-design.md 10.11）
  const pickedAward = tool.kind === 'facility' && FACILITY_DEFS[tool.type].group === 'award';
  const [awardOpened, setAwardOpened] = useState(false);
  if (pickedAward && !awardOpened) {
    setAwardOpened(true);
    setCivicShelf('award');
  } else if (!pickedAward && awardOpened) {
    setAwardOpened(false);
  }
  const civicShelf: CivicShelf = shelfPicked === 'award' && awards.length === 0 ? 'service' : shelfPicked;
  const isTool = (t: Tool): boolean => JSON.stringify(t) === JSON.stringify(tool);
  const roadShape = tool.kind === 'road' ? tool.shape : 'straight';

  let drawer: JSX.Element | null = null;
  if (menu === 'road') {
    drawer = (
      <>
        <div className="build-shape" role="group" aria-label="道路の形">
          {(['straight', 'curve'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              className={`build-shape-button${roadShape === shape ? ' is-selected' : ''}`}
              aria-pressed={roadShape === shape}
              data-testid={`road-shape-${shape}`}
              onClick={() => setTool({ kind: 'road', road: tool.kind === 'road' ? tool.road : 'street', shape })}
            >
              <Icon name={shape} size={18} />
              <span>{shape === 'straight' ? '直線' : '曲線'}</span>
            </button>
          ))}
        </div>
        {ROAD_KINDS.map((road) => (
          <Item
            key={road}
            testId={`build-road-${road}`}
            label={ROAD_RULES[road].name}
            cost={`${format(ROAD_RULES[road].costPerCell)} / マス`}
            selected={tool.kind === 'road' && tool.road === road}
            locked={lockOf(stage, ROAD_RULES[road].minStage)}
            swatch={road}
            onPick={() => setTool({ kind: 'road', road, shape: road === 'roundabout' ? 'straight' : roadShape })}
          />
        ))}
        <p className="build-note">川を渡る所には橋が架かる（「町」から）</p>
      </>
    );
  } else if (menu === 'zone') {
    drawer = (
      <>
        {ZONE_KINDS.map((zone) => (
          <Item
            key={zone}
            testId={`build-zone-${zone}`}
            label={ZONE_RULES[zone].name}
            cost={`${format(ZONE_RULES[zone].costPerCell)} / マス`}
            selected={isTool({ kind: 'zone', zone })}
            locked={lockOf(stage, ZONE_RULES[zone].minStage)}
            swatch={zone}
            onPick={() => setTool({ kind: 'zone', zone })}
          />
        ))}
        <DemandBars demand={demand} />
        <p className="build-note">ドラッグで塗る。道路に面したマスに、需要があれば建物が建つ</p>
      </>
    );
  } else if (menu === 'civic') {
    const types = civicShelf === 'award' ? awards.map((a) => a.type) : CIVIC_SHELVES.find((s) => s.id === civicShelf)?.types ?? [];
    const awardLock = (type: FacilityType): string | null => {
      const a = awards.find((x) => x.type === type);
      return a?.status === 'built' ? '建っている（1 つずつまで）' : a?.status === 'pending' ? '申請中' : null;
    };
    drawer = (
      <>
        <div className="build-shape" role="tablist" aria-label="公共の棚">
          {CIVIC_SHELVES.filter((s) => s.id !== 'award' || awards.length > 0).map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={`build-shape-button${civicShelf === s.id ? ' is-selected' : ''}`}
              aria-selected={civicShelf === s.id}
              data-testid={`civic-shelf-${s.id}`}
              onClick={() => setCivicShelf(s.id)}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {types.map((type) => (
          <Item
            key={type}
            testId={`build-facility-${type}`}
            label={FACILITY_DEFS[type].name}
            cost={format(FACILITY_DEFS[type].cost)}
            wallet="treasury"
            selected={isTool({ kind: 'facility', type })}
            locked={treasury < 0 ? '財政が赤字の間は申請を出せない' : awardLock(type) ?? lockOf(stage, FACILITY_DEFS[type].minStage)}
            image={thumbs.get(type) ?? null}
            onPick={() => setTool({ kind: 'facility', type })}
          />
        ))}
        <p className="build-note">{civicShelf === 'service' ? '財政で建て、毎週 30 の維持費。道路で届く範囲の住民の暮らしを支える（学習の入口ではない）'
          : civicShelf === 'power' ? '財政で建て、維持費がかかる。道路に面して置くと、つながった道路網に電気が届く'
          : '人口と支持率の節目で建てられるようになった建物。財政で建て、申請が要る。1 つずつまで（維持費は無い）'}</p>
      </>
    );
  } else if (menu === 'facility' || menu === 'park') {
    // 分野の施設は 3 つの棚に分けて、1 度に 5 つまで並べる（docs/visual-design.md V7）
    const shown = FACILITY_ORDER.filter((t) => (menu === 'park' ? FACILITY_DEFS[t].group === 'park' : FACILITY_DEFS[t].shelf === shelf));
    drawer = (
      <>
        {menu === 'facility' ? (
          <div className="build-shape" role="tablist" aria-label="施設の棚">
            {(Object.keys(SHELF_NAMES) as FacilityShelf[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`build-shape-button${shelf === id ? ' is-selected' : ''}`}
                aria-selected={shelf === id}
                data-testid={`facility-shelf-${id}`}
                onClick={() => setShelf(id)}
              >
                <span>{SHELF_NAMES[id]}</span>
              </button>
            ))}
          </div>
        ) : null}
        {shown.map((type) => (
          <Item
            key={type}
            testId={`build-facility-${type}`}
            label={FACILITY_DEFS[type].name}
            cost={format(FACILITY_DEFS[type].cost)}
            selected={isTool({ kind: 'facility', type })}
            locked={lockOf(stage, FACILITY_DEFS[type].minStage)}
            image={thumbs.get(type) ?? null}
            onPick={() => setTool({ kind: 'facility', type })}
          />
        ))}
        {menu === 'park' ? landmarks.map((id) => (
          <Item
            key={id}
            testId={`build-monument-${id}`}
            label={landmarkOf(id)?.name ?? '記念碑'}
            cost="報酬"
            selected={isTool({ kind: 'facility', type: 'monument', landmark: id })}
            locked={null}
            image={imageOf(monumentAsset(id)?.svg)}
            onPick={() => setTool({ kind: 'facility', type: 'monument', landmark: id })}
          />
        )) : null}
        {menu === 'park' && landmarks.length > 0 ? <p className="build-note">ミッションの報酬の記念碑は、費用なしで置ける</p> : null}
      </>
    );
  }

  return (
    <div className="build" data-testid="build-menu">
      {drawer ? (
        <div className={`build-drawer is-${menu ?? ''}`} data-testid="build-drawer">
          {drawer}
        </div>
      ) : null}
      {menu === 'demolish' ? <div className="build-drawer is-demolish"><p className="build-note">取り壊す物をクリック。確かめてから壊す（施設を壊しても学習の記録は消えない）</p></div> : null}
      <nav className="build-bar" aria-label="建設メニュー（B）">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`build-group${menu === g.id ? ' is-selected' : ''}${g.id === 'demolish' ? ' is-demolish' : ''}`}
            aria-pressed={menu === g.id}
            data-testid={`build-group-${g.id}`}
            onClick={() => openMenu(menu === g.id ? null : g.id)}
          >
            <Icon name={g.icon} size={24} />
            <span>{g.label}</span>
            {g.id === 'park' && landmarks.length > 0 ? <span className="build-badge num" data-testid="build-badge-park" title="置ける記念碑がある">{landmarks.length}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { STAGE_NAMES } from '@/game/stage';
import { FACILITY_DEFS, FACILITY_ORDER, landmarkOf, SHELF_NAMES, type FacilityShelf } from '@/city/facilities';
import { svgView } from '@/city/generate/svg';
import { facilitySvg, monumentAsset } from '@/city/render/sprites';
import { ROAD_RULES, ZONE_RULES, type BuildRoadKind } from '@/city/rules';
import type { FacilityType, ZoneKind } from '@/city/types';
import { Icon, type IconName } from '@/ui/icons/Icon';
import type { CityGameState, MenuGroup, Tool } from './cityStore';
import './BuildMenu.css';

/**
 * 建設メニュー（docs/ui-design.md 3 章: 下中央、高さ 72。選ぶと上に種類の引き出し）。
 * 道路・区画・施設・公園・取り壊し。
 * ミッションで受け取った記念碑は、公園の引き出しに「受け取った報酬」として並び、費用なしで置ける（docs/city-design.md 4 章）。
 */

const GROUPS: { id: MenuGroup; label: string; icon: IconName }[] = [
  { id: 'road', label: '道路', icon: 'road' },
  { id: 'zone', label: '区画', icon: 'zone' },
  { id: 'facility', label: '施設', icon: 'facility' },
  { id: 'park', label: '公園', icon: 'park' },
  { id: 'demolish', label: '取り壊し', icon: 'demolish' },
];

const ROAD_KINDS: BuildRoadKind[] = ['lane', 'street', 'avenue', 'roundabout'];
const ZONE_KINDS: ZoneKind[] = ['residential', 'commercial', 'office'];

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
}

function Item({ label, cost, selected, locked, onPick, image, swatch, testId }: ItemProps) {
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
        {locked ? <span className="build-item-locked">{locked}</span> : <><Icon name="funds" size={13} /><span className="num">{cost}</span></>}
      </span>
    </button>
  );
}

function lockOf(stage: number, minStage: 1 | 2 | 3 | 4 | 5): string | null {
  return stage < minStage ? `「${STAGE_NAMES[minStage]}」になると作れる` : null;
}

export function BuildMenu({ state, landmarks = [] }: {
  state: Pick<CityGameState, 'menu' | 'tool' | 'openMenu' | 'setTool'> & { stage: number };
  /** 受け取ったが、まだ置いていない記念碑（ミッションの報酬） */
  landmarks?: readonly string[];
}) {
  const { stage, menu, tool, openMenu, setTool } = state;
  const thumbs = useMemo(() => new Map(FACILITY_ORDER.map((t) => [t, thumbnail(t)])), []);
  const [shelf, setShelf] = useState<FacilityShelf>('base');
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
        <p className="build-note">ドラッグで塗る。道路に面したマスに建物が建つ</p>
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

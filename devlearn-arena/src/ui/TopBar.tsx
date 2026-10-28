import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons/Icon';
import './TopBar.css';

/**
 * 上の帯（docs/ui-design.md 3 章・3.1）。高さ 48。
 * 都市名・日付と速さ・開発資金・支持率・政治資本・任期の残り・XP・都市規模・発展段階と、画面への入口（学ぶ・ミッション・用語・設定。XP を押すと成長画面）。
 * 1600 未満の幅では、数字の見出しを記号にし、名前は指した時の小窓（title）で出す。数字は削らない
 */
export interface TopBarProps {
  cityName: string;
  /** 都市の日付（「2 年目 14 週」）と速さ。無ければ出さない */
  clock?: TopBarClock;
  /** 支持率（0〜100。住む人がいなければ null） */
  approval?: number | null;
  /** 4 週前からの支持率の増減（記録が足りなければ null） */
  approvalDelta?: number | null;
  /** 支持率を押すと、表示切替の窓の説明を開く（docs/ui-design.md 3.1） */
  onApproval?: () => void;
  /** 政治資本（docs/game-design.md 21.5）。無ければ出さない */
  capital?: number;
  /** 政治資本を押すと、予算の窓の政治資本のつまみ（docs/ui-design.md 3.1） */
  onCapital?: () => void;
  /** 財政（docs/game-design.md 22.2）。押すと予算の窓。無ければ出さない */
  treasury?: { value: number; onOpen: () => void };
  /** 任期の残り（「選挙まで 38 週」）。押すと選挙の見込み（docs/ui-design.md 3.1・10.6）。無ければ出さない */
  term?: TopBarTerm;
  funds: number;
  xp: number;
  /** エンジニア段階の名前（docs/game-design.md 9 章） */
  rankName: string;
  population: number;
  stageName: string;
  /** 入口のうち、まだ画面が無い物 */
  disabled?: readonly EntryId[];
  onEntry?: (id: EntryId) => void;
  /** 今開いている画面（docs/ui-design.md 2.1: 今どの画面かを上の帯に常に表示する） */
  current?: EntryId | undefined;
  /** 市政の入口と、その引き出し（docs/ui-design.md 3.1）。無ければ出さない */
  civic?: TopBarCivic;
}

/** 市政の引き出しの項目（許認可・受信箱・予算・新聞・褒賞） */
export type CivicId = 'permits' | 'inbox' | 'budget' | 'news' | 'rewards';

export interface TopBarCivic {
  /** 入口の数の印（公聴会を待つ申請＋届いた請願） */
  badge: number;
  /** 項目ごとの数の印。開けない項目は disabled */
  items: { id: CivicId; badge: number; disabled?: boolean }[];
  onItem: (id: CivicId) => void;
}

const CIVIC: Record<CivicId, { label: string; icon: IconName; key: string }> = {
  permits: { label: '許認可', icon: 'permit', key: 'P' },
  inbox: { label: '受信箱', icon: 'inbox', key: 'I' },
  budget: { label: '予算', icon: 'treasury', key: 'F' },
  news: { label: '市内新聞', icon: 'news', key: 'N' },
  rewards: { label: '褒賞', icon: 'stage', key: '' },
};

/** 市政の入口（数の印付き）と、押すと下に開く引き出し */
function Civic({ civic }: { civic: TopBarCivic }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="topbar-civic" ref={root}>
      <button
        type="button"
        className={`topbar-entry${open ? ' is-current' : ''}`}
        data-testid="topbar-civic"
        aria-expanded={open}
        aria-haspopup="menu"
        title={civic.badge > 0 ? `市政（市長の手を待つ物 ${String(civic.badge)} 件）` : '市政'}
        onClick={() => setOpen(!open)}
      >
        <Icon name="civic" size={18} />
        <span>市政</span>
        {civic.badge > 0 ? <span className="topbar-badge num" data-testid="topbar-civic-badge">{civic.badge}</span> : null}
      </button>
      {open ? (
        <div className="topbar-drawer" role="menu" data-testid="civic-drawer" data-label-block>
          {civic.items.map((item) => {
            const c = CIVIC[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="topbar-drawer-item"
                data-testid={`civic-${item.id}`}
                aria-disabled={item.disabled === true}
                title={item.disabled ? `${c.label}（この窓は後の段階で作る）` : c.key ? `${c.label}（${c.key}）` : c.label}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  civic.onItem(item.id);
                }}
              >
                <Icon name={c.icon} size={16} />
                <span>{c.label}</span>
                {item.badge > 0 ? <span className="topbar-badge num">{item.badge}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type EntryId = 'learn' | 'graph' | 'mission' | 'glossary' | 'settings' | 'growth';

export interface TopBarTerm {
  /** 選挙までの週 */
  weeksLeft: number;
  /** 落選して、次の道を選ぶ前 */
  defeated: boolean;
  onOpen: () => void;
}

export interface TopBarClock {
  year: number;
  week: number;
  speed: 1 | 2 | 3;
  /** 利用者が止めた */
  paused: boolean;
  /** 都市画面が前に出ていない・窓が隠れているなどで止まっている（利用者が止めたのではない） */
  held: boolean;
  /** 0 は止める・再開（Space と同じ）、1〜3 は速さ */
  onSpeed: (speed: 0 | 1 | 2 | 3) => void;
}

const SPEEDS: { speed: 1 | 2 | 3; icon: IconName; label: string; key: string }[] = [
  { speed: 1, icon: 'speed1', label: '1 倍', key: '1' },
  { speed: 2, icon: 'speed2', label: '2 倍', key: '2' },
  { speed: 3, icon: 'speed3', label: '3 倍', key: '3' },
];

/** 日付と速さ（止める・1 倍・2 倍・3 倍の小さなボタン。今の速さが金） */
function Clock({ clock }: { clock: TopBarClock }) {
  return (
    <div className="topbar-stat topbar-clock" data-testid="topbar-clock" title="都市の日付（1 倍で 1 日 2 秒）">
      <span className="topbar-stat-icon"><Icon name="calendar" size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">{clock.held ? '日付・止まっている' : '日付'}</span>
        <span className="topbar-stat-value num" data-testid="topbar-date">
          {clock.year}<span className="topbar-stat-unit">年目</span> {clock.week}<span className="topbar-stat-unit">週</span>
        </span>
      </span>
      <span className="topbar-speeds" role="group" aria-label="時間の速さ">
        <button
          type="button"
          className={`topbar-speed${clock.paused ? ' is-on' : ''}`}
          data-testid="topbar-pause"
          aria-pressed={clock.paused}
          title={clock.paused ? '再開する（Space）' : '止める（Space）'}
          onClick={() => clock.onSpeed(0)}
        >
          <Icon name="pause" size={14} />
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            type="button"
            className={`topbar-speed${!clock.paused && clock.speed === s.speed ? ' is-on' : ''}`}
            data-testid={`topbar-speed-${String(s.speed)}`}
            aria-pressed={!clock.paused && clock.speed === s.speed}
            title={`${s.label}（${s.key}）`}
            onClick={() => clock.onSpeed(s.speed)}
          >
            <Icon name={s.icon} size={14} />
          </button>
        ))}
      </span>
    </div>
  );
}

const ENTRIES: { id: Exclude<EntryId, 'growth' | 'graph'>; label: string; icon: IconName; key?: string }[] = [
  { id: 'learn', label: '学ぶ', icon: 'learn', key: 'L' },
  { id: 'mission', label: 'ミッション', icon: 'mission' },
  { id: 'glossary', label: '用語', icon: 'glossary' },
  { id: 'settings', label: '設定', icon: 'settings' },
];

const format = (n: number): string => n.toLocaleString('ja-JP');

function Stat({ icon, label, value, unit, testId }: { icon: IconName; label: string; value: string; unit?: string; testId?: string }) {
  return (
    <div className="topbar-stat" title={label} data-testid={testId}>
      <span className="topbar-stat-icon"><Icon name={icon} size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">{label}</span>
        <span className="topbar-stat-value num">
          {value}
          {unit ? <span className="topbar-stat-unit">{unit}</span> : null}
        </span>
      </span>
    </div>
  );
}

/** 支持率と、4 週前からの増減の矢印（1 未満は矢印を出さない）。押すと説明（docs/ui-design.md 3.1） */
function Approval({ value, delta, onOpen }: { value: number | null; delta: number | null; onOpen?: () => void }) {
  const d = delta === null ? 0 : Math.round(delta);
  const dir = d >= 1 ? 'up' : d <= -1 ? 'down' : null;
  return (
    <button
      type="button"
      className="topbar-stat is-entry"
      data-testid="topbar-approval"
      title={`支持率${dir ? `（4 週前から ${d > 0 ? '+' : ''}${String(d)}）` : ''}。押すと、動いた理由を出す（V）`}
      onClick={() => onOpen?.()}
    >
      <span className="topbar-stat-icon"><Icon name="approval" size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">支持率</span>
        <span className="topbar-stat-value num">
          {value === null ? '—' : String(Math.round(value))}
          {value === null ? null : <span className="topbar-stat-unit">%</span>}
          {dir ? (
            <span className={`topbar-trend is-${dir}`} data-testid="topbar-approval-trend" aria-label={`4 週前から ${String(Math.abs(d))} ${dir === 'up' ? '上がった' : '下がった'}`}>
              <Icon name={dir} size={12} />
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** 財政。赤字の間は state.bad の色と「赤字」。押すと予算の窓（docs/ui-design.md 3.1） */
function Treasury({ value, onOpen }: { value: number; onOpen: () => void }) {
  const deficit = value < 0;
  return (
    <button
      type="button"
      className={`topbar-stat is-entry${deficit ? ' is-deficit' : ''}`}
      data-testid="topbar-treasury"
      title={deficit ? '財政が赤字。押すと予算（F）' : '財政（市の会計。税収から公共の維持を払う）。押すと予算（F）'}
      onClick={onOpen}
    >
      <span className="topbar-stat-icon"><Icon name="treasury" size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">財政</span>
        <span className="topbar-stat-value num">
          {format(Math.round(value))}
          <span className="topbar-stat-unit">{deficit ? '赤字' : '財政'}</span>
        </span>
      </span>
    </button>
  );
}

/** 政治資本。押すと予算の窓の政治資本（この任期の得と使い） */
function Capital({ value, onOpen }: { value: number; onOpen: () => void }) {
  return (
    <button type="button" className="topbar-stat is-entry" data-testid="topbar-capital" title="政治資本。押すと、この任期の得と使い（予算の窓）" onClick={onOpen}>
      <span className="topbar-stat-icon"><Icon name="capital" size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">政治資本</span>
        <span className="topbar-stat-value num">{value}</span>
      </span>
    </button>
  );
}

/** 任期の残り。押すと選挙の見込み（落選の後は結果と 2 つの道） */
function Term({ term }: { term: TopBarTerm }) {
  return (
    <button
      type="button"
      className="topbar-stat is-entry"
      data-testid="topbar-term"
      title={term.defeated ? '落選した。押すと、選挙の結果と次の道（学習の記録は消えない）' : `選挙まで ${String(term.weeksLeft)} 週。押すと、今の見込み（層ごとの支持と投票率・公約）`}
      onClick={term.onOpen}
    >
      <span className="topbar-stat-icon"><Icon name="term" size={18} /></span>
      <span className="topbar-stat-text">
        <span className="topbar-stat-label">{term.defeated ? '任期' : '選挙まで'}</span>
        <span className="topbar-stat-value num">
          {term.defeated ? '落選' : String(term.weeksLeft)}
          {term.defeated ? null : <span className="topbar-stat-unit">週</span>}
        </span>
      </span>
    </button>
  );
}

export function TopBar(props: TopBarProps) {
  const disabled = new Set(props.disabled ?? []);
  return (
    <header className="topbar" data-testid="topbar">
      <a className="topbar-city" href="#/city" title="都市画面へ戻る（Esc）">
        <span className="topbar-emblem"><Icon name="emblem" size={22} /></span>
        <span className="topbar-city-name">{props.cityName}</span>
      </a>
      <div className="topbar-stats">
        {props.clock ? <Clock clock={props.clock} /> : null}
        <Stat icon="funds" label="開発資金" value={format(props.funds)} unit="資金" />
        {props.treasury ? <Treasury value={props.treasury.value} onOpen={props.treasury.onOpen} /> : null}
        {props.approval !== undefined ? <Approval value={props.approval} delta={props.approvalDelta ?? null} {...(props.onApproval ? { onOpen: props.onApproval } : {})} /> : null}
        {props.capital !== undefined ? (props.onCapital ? <Capital value={props.capital} onOpen={props.onCapital} /> : <Stat icon="capital" label="政治資本" value={String(props.capital)} testId="topbar-capital" />) : null}
        {props.term ? <Term term={props.term} /> : null}
        <button
          type="button"
          className={`topbar-stat is-entry${props.current === 'growth' ? ' is-current' : ''}`}
          data-testid="topbar-xp"
          title="成長画面を開く（XP・スキル・学習履歴）"
          onClick={() => props.onEntry?.('growth')}
        >
          <span className="topbar-stat-icon"><Icon name="xp" size={18} /></span>
          <span className="topbar-stat-text">
            <span className="topbar-stat-label">XP・{props.rankName}</span>
            <span className="topbar-stat-value num">
              {format(props.xp)}
              <span className="topbar-stat-unit">XP</span>
            </span>
          </span>
        </button>
        <Stat icon="people" label="都市規模" value={format(props.population)} unit="人" />
        <Stat icon="stage" label="発展段階" value={props.stageName} />
      </div>
      <nav className="topbar-entries" aria-label="画面への入口">
        {props.civic ? <Civic civic={props.civic} /> : null}
        {ENTRIES.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`topbar-entry${e.id === 'learn' ? ' is-primary' : ''}${props.current === e.id || (e.id === 'learn' && props.current === 'graph') ? ' is-current' : ''}`}
            aria-current={props.current === e.id || (e.id === 'learn' && props.current === 'graph') ? 'page' : undefined}
            aria-disabled={disabled.has(e.id)}
            title={disabled.has(e.id) ? `${e.label}（この画面は後の段階で作る）` : e.key ? `${e.label}（${e.key}）` : e.label}
            onClick={() => {
              if (!disabled.has(e.id)) props.onEntry?.(e.id);
            }}
          >
            <Icon name={e.icon} size={18} />
            <span>{e.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

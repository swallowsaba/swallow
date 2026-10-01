import { Icon, type IconName } from './icons/Icon';
import './TopBar.css';

/**
 * 上の帯（docs/ui-design.md 3 章）。高さ 48。
 * 都市名・開発資金・XP・都市規模・発展段階と、画面への入口（学ぶ・ミッション・用語・設定）。
 */
export interface TopBarProps {
  cityName: string;
  funds: number;
  xp: number;
  population: number;
  stageName: string;
  /** 入口のうち、まだ画面が無い物 */
  disabled?: readonly EntryId[];
  onEntry?: (id: EntryId) => void;
}

export type EntryId = 'learn' | 'mission' | 'glossary' | 'settings';

const ENTRIES: { id: EntryId; label: string; icon: IconName; key?: string }[] = [
  { id: 'learn', label: '学ぶ', icon: 'learn', key: 'L' },
  { id: 'mission', label: 'ミッション', icon: 'mission' },
  { id: 'glossary', label: '用語', icon: 'glossary' },
  { id: 'settings', label: '設定', icon: 'settings' },
];

const format = (n: number): string => n.toLocaleString('ja-JP');

function Stat({ icon, label, value, unit }: { icon: IconName; label: string; value: string; unit?: string }) {
  return (
    <div className="topbar-stat">
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

export function TopBar(props: TopBarProps) {
  const disabled = new Set(props.disabled ?? []);
  return (
    <header className="topbar" data-testid="topbar">
      <a className="topbar-city" href="#/city" title="都市画面へ戻る（Esc）">
        <span className="topbar-emblem"><Icon name="emblem" size={22} /></span>
        <span className="topbar-city-name">{props.cityName}</span>
      </a>
      <div className="topbar-stats">
        <Stat icon="funds" label="開発資金" value={format(props.funds)} unit="資金" />
        <Stat icon="xp" label="XP" value={format(props.xp)} unit="XP" />
        <Stat icon="people" label="都市規模" value={format(props.population)} unit="人" />
        <Stat icon="stage" label="発展段階" value={props.stageName} />
      </div>
      <nav className="topbar-entries" aria-label="画面への入口">
        {ENTRIES.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`topbar-entry${e.id === 'learn' ? ' is-primary' : ''}`}
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

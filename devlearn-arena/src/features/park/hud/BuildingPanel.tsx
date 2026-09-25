import { useState } from 'react';
import type { BuildingKind } from '@/city/model';
import type { TKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import type { BuildingInfo, InfoLog, InfoUsage } from './buildingInfo';
import { HUD, SIZE } from './theme';

interface Props {
  info: BuildingInfo;
  /** 押したコマンドを端末へ送る */
  onCommand: (line: string) => void;
  onClose: () => void;
}

type Tab = 'overview' | 'residents' | 'log';

const TABS: readonly { id: Tab; key: TKey }[] = [
  { id: 'overview', key: 'hud.tab.overview' },
  { id: 'residents', key: 'hud.tab.residents' },
  { id: 'log', key: 'hud.tab.log' },
];

const KIND_KEY: Readonly<Record<BuildingKind, TKey>> = {
  tower: 'hud.kind.tower',
  office: 'hud.kind.office',
  stop: 'hud.kind.stop',
  monument: 'hud.kind.monument',
  flag: 'hud.kind.flag',
  depot: 'hud.kind.depot',
  hut: 'hud.kind.hut',
  house: 'hud.kind.house',
  relay: 'hud.kind.relay',
  gate: 'hud.kind.gate',
  window: 'hud.kind.window',
  line: 'hud.kind.line',
  desk: 'hud.kind.desk',
  ledger: 'hud.kind.ledger',
  watch: 'hud.kind.watch',
  dispatch: 'hud.kind.dispatch',
};

const USAGE_KEY: Readonly<Record<InfoUsage['key'], TKey>> = {
  cpu: 'hud.cpu',
  memory: 'hud.memory',
  residents: 'hud.residentCount',
};

const LOG_KEY: Readonly<Record<InfoLog['event'], TKey>> = {
  arrived: 'hud.log.arrived',
  running: 'hud.log.running',
  moving: 'hud.log.moving',
  ailing: 'hud.log.ailing',
};

/** 住人の丸。落ち着いている人は緑、引っ越し中は青、不調は赤 */
function dotColor(state: 'moving' | 'settled' | 'sick' | 'gone'): string {
  if (state === 'settled') return HUD.ok;
  if (state === 'sick') return HUD.bad;
  return HUD.accent;
}

/**
 * 建物の情報パネル。街の建物を押すと右に開く（幅 340px）。
 *
 * 数はどれも `buildingInfo` が街の状態から導いたもの。ここでは数えない。
 * 操作ボタンには実行されるコマンドを併記し、押すと端末に入力されて実行される。
 */
export function BuildingPanel({ info, onCommand, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <section
      data-testid="building-panel"
      aria-label={info.label}
      className="flex shrink-0 flex-col overflow-hidden rounded-lg"
      style={{
        width: SIZE.info,
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2.5 p-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md"
          style={{ background: 'linear-gradient(180deg, #2c4a6a, #1c2f45)', color: '#8fd4ff' }}
        >
          <Icon name="city" size={22} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-bold" data-testid="building-name">
            {info.label}
          </div>
          <div className="truncate text-[12px]" style={{ color: HUD.muted }}>
            {`${t(KIND_KEY[info.kind])} ・ ${t('hud.level', { n: info.level })}`}
          </div>
        </div>
        <button
          type="button"
          aria-label={t('hud.close')}
          data-testid="building-close"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded"
          style={{ background: HUD.fill, color: HUD.soft }}
        >
          <Icon name="close" size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="flex" style={{ borderTop: `1px solid ${HUD.line}`, borderBottom: `1px solid ${HUD.line}` }}>
        {TABS.map((item) => {
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              aria-pressed={on}
              onClick={() => {
                setTab(item.id);
              }}
              className="h-9 flex-1 text-[13px]"
              style={{
                background: on ? HUD.accentFill : 'transparent',
                color: on ? HUD.text : HUD.muted,
                borderBottom: `2px solid ${on ? HUD.accent : 'transparent'}`,
              }}
            >
              {t(item.key)}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <div className="flex flex-col gap-2.5 p-3" data-testid="building-overview">
          {info.usage.map((use) => (
            <div key={use.key} data-usage={use.key}>
              <div className="flex justify-between text-[12px]" style={{ color: HUD.muted }}>
                <span>{t(USAGE_KEY[use.key])}</span>
                <span style={{ color: HUD.text }}>{use.text}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: HUD.fill }}>
                <div
                  data-testid={`usage-${use.key}`}
                  className="h-full"
                  style={{ width: `${String(Math.round(use.ratio * 100))}%`, background: HUD.ok }}
                />
              </div>
            </div>
          ))}
          {info.residents.length === 0 ? null : (
            <div className="flex flex-wrap gap-1.5">
              {info.residents.map((one) => (
                <span
                  key={one.id}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px]"
                  style={{ background: 'rgba(55,179,122,0.14)' }}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: dotColor(one.state) }} />
                  {one.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'residents' ? (
        <div className="flex flex-col gap-1.5 p-3 text-[13px]" data-testid="building-residents">
          {info.residents.length === 0 ? (
            <p style={{ color: HUD.muted }}>{t('hud.noResidents')}</p>
          ) : (
            info.residents.map((one) => (
              <div key={one.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(one.state) }} />
                <span className="min-w-0 flex-1 truncate">{one.label}</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'log' ? (
        <div className="flex flex-col gap-1.5 p-3 text-[12px]" data-testid="building-log" style={{ color: HUD.soft }}>
          {info.log.length === 0 ? (
            <p style={{ color: HUD.muted }}>{t('hud.noLog')}</p>
          ) : (
            info.log.map((line) => (
              <div key={line.id} className="flex gap-2">
                <span className="shrink-0 font-mono" style={{ color: HUD.dim }}>
                  {line.at}
                </span>
                <span className="min-w-0 flex-1">{t(LOG_KEY[line.event], { name: line.label })}</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {info.actions.length === 0 ? null : (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {info.actions.map((action) => (
            <button
              key={action.command}
              type="button"
              data-command={action.command}
              onClick={() => {
                onCommand(action.command);
              }}
              className="flex min-h-10 items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px]"
              style={
                action.primary
                  ? { border: `1px solid ${HUD.accentEdge}`, background: 'rgba(47,143,216,0.14)' }
                  : { border: `1px solid ${HUD.lineStrong}`, background: HUD.fillSoft }
              }
            >
              <span className={action.primary ? 'min-w-0 flex-1 font-bold' : 'min-w-0 flex-1'}>{action.label}</span>
              <span
                className="shrink-0 font-mono text-[12px]"
                style={{ color: action.primary ? HUD.accentText : HUD.muted }}
              >
                {action.command}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

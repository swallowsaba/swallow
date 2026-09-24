import { useT } from '@/i18n/useT';
import { Icon, type IconName } from '@/ui/Icon';
import type { CityMetrics, Milestone, Speed } from './metrics';
import { HUD, SIZE } from './theme';

interface Props {
  /** 市の名前 */
  name: string;
  /** 日と tick。コマンドを打つたびに進む */
  clock: { day: number; tick: string };
  metrics: CityMetrics;
  milestone: Milestone;
  speed: Speed;
  onSpeed: (speed: Speed) => void;
  /** 帯の右端に置く、任務の選択とやり直し */
  children?: React.ReactNode;
}

/**
 * 上の帯。高さ 56px。`docs/design/hud-mockup.html` の並びに合わせる。
 *
 * 左に市の名前と日付、中央に指標を 4 つ、右にマイルストーンの進みと速度の操作。
 * どれも状態から導いた数で、書き込んだ値は無い。
 */
export function TopBar({ name, clock, metrics, milestone, speed, onSpeed, children }: Props) {
  const t = useT();
  const stats: { key: string; icon: IconName; color: string; label: string; value: string }[] = [
    { key: 'residents', icon: 'people', color: HUD.okText, label: t('hud.residents'), value: metrics.residents.toLocaleString('en-US') },
    { key: 'xp', icon: 'coin', color: HUD.warn, label: t('hud.xp'), value: metrics.xp.toLocaleString('en-US') },
    { key: 'health', icon: 'heart', color: HUD.bad, label: t('hud.health'), value: `${String(metrics.health)}%` },
    { key: 'rights', icon: 'bars', color: HUD.accent, label: t('hud.rights'), value: String(metrics.rights) },
  ];
  const speeds: { id: Speed; icon: IconName; label: string }[] = [
    { id: 'pause', icon: 'pause', label: t('hud.pause') },
    { id: 'normal', icon: 'play', label: t('hud.normal') },
    { id: 'fast', icon: 'fast', label: t('hud.fast') },
  ];

  return (
    <header
      data-testid="arena-bar"
      className="absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-4"
      style={{ height: SIZE.topBar, background: HUD.bar, borderBottom: `1px solid ${HUD.line}`, backdropFilter: 'blur(8px)' }}
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <Icon name="city" size={26} className="text-[#5cc1ff]" />
        <div className="leading-tight">
          <div className="text-[16px] font-extrabold tracking-tight" data-testid="world-title">
            {name}
          </div>
          <div className="text-[12px]" data-testid="city-clock" style={{ color: HUD.muted }}>
            {t('hud.day', { d: clock.day, tick: clock.tick })}
          </div>
        </div>
      </div>

      <div className="ml-3 flex min-w-0 gap-2 overflow-hidden" data-testid="city-metrics">
        {stats.map((stat) => (
          <div
            key={stat.key}
            data-metric={stat.key}
            className="flex shrink-0 items-center gap-2 rounded px-3 py-1.5"
            style={{ background: HUD.fill }}
          >
            <span style={{ color: stat.color }}>
              <Icon name={stat.icon} size={16} strokeWidth={1.6} />
            </span>
            <div className="leading-tight">
              <div className="text-[12px]" style={{ color: HUD.muted }}>
                {stat.label}
              </div>
              <div className="text-[15px] font-bold">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        <div className="w-[260px]" data-testid="milestone">
          <div className="flex justify-between text-[12px]">
            <span style={{ color: HUD.muted }}>{t('hud.milestone', { n: milestone.n })}</span>
            <span className="ml-2 min-w-0 truncate font-bold">{milestone.name}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: HUD.lineStrong }}>
            <div
              data-testid="milestone-bar"
              className="h-full"
              style={{
                width: `${String(Math.round(milestone.ratio * 100))}%`,
                background: `linear-gradient(90deg, ${HUD.accentDeep}, ${HUD.accent})`,
              }}
            />
          </div>
        </div>
        <div className="flex gap-1" data-testid="speed">
          {speeds.map((item) => {
            const on = speed === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-pressed={on}
                data-speed={item.id}
                onClick={() => {
                  onSpeed(item.id);
                }}
                className="grid h-[34px] w-[34px] place-items-center rounded"
                style={{ background: on ? HUD.accentDeep : HUD.fill, color: HUD.text }}
              >
                <Icon name={item.icon} size={14} strokeWidth={2} />
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </header>
  );
}

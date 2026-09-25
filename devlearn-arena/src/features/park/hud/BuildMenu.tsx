import type { DesignKind } from '@/city/model';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { BUILD_TOOLS, isLocked, variantsOf, type BuildVariant } from './buildTools';
import { HUD, SIZE } from './theme';

interface Props {
  /** いま取り組んでいる段。ここに届かない道具は暗いまま */
  milestone: number;
  /** 使える建築権。0 のときは置けないことを伝える */
  rights: number;
  /** 選んでいる道具。もう一度押すと外れる */
  tool: DesignKind | null;
  /** 選んでいる種類 */
  variant: BuildVariant | null;
  onTool: (kind: DesignKind | null) => void;
  onVariant: (variant: BuildVariant) => void;
}

/**
 * 下の建設メニュー。道路・区画・住宅・オフィス・記念碑・倉庫・市役所・中継塔。
 *
 * 未解放のものは暗くして、解放される段を添える。
 * 道具を選ぶと、その上に種類の引き出しが開く。
 */
export function BuildMenu({ milestone, rights, tool, variant, onTool, onVariant }: Props) {
  const t = useT();
  const drawer = tool === null ? [] : variantsOf(tool);

  return (
    <div
      data-testid="build-menu"
      aria-label={t('hud.buildMenu')}
      // 横に広い入れ物だが、板の無い所は街に触れる。下辺一帯が押せなくならないようにする
      className="pointer-events-none absolute bottom-3.5 z-20 flex flex-col items-center gap-2"
      style={{ left: SIZE.dock + 16, right: 232 }}
    >
      {drawer.length === 0 ? null : (
        <div
          data-testid="build-drawer"
          className="pointer-events-auto flex gap-2 rounded-lg p-2.5"
          style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, backdropFilter: 'blur(8px)' }}
        >
          {drawer.map((item) => {
            const locked = isLocked(item.needs, milestone);
            const on = variant?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-variant={item.id}
                data-locked={locked ? 'true' : undefined}
                aria-pressed={on}
                disabled={locked}
                onClick={() => {
                  if (!locked) onVariant(item);
                }}
                className="w-[124px] overflow-hidden rounded-md text-left"
                style={{
                  border: `1px solid ${on ? HUD.accent : HUD.line}`,
                  background: on ? HUD.accentFill : HUD.fillSoft,
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.5 : 1,
                }}
              >
                <span
                  className="grid h-[58px] place-items-center"
                  style={{ background: 'linear-gradient(180deg, #3a5a7a, #23384f)', color: 'rgba(255,255,255,0.85)' }}
                >
                  <Icon name="city" size={26} />
                </span>
                <span className="block px-2 py-1.5">
                  <span className="block text-[12px] font-bold">{t(item.name)}</span>
                  <span className="block text-[12px]" style={{ color: HUD.muted }}>
                    {locked ? t('hud.lockedAt', { n: item.needs }) : t(item.note)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p data-testid="build-lead" className="pointer-events-auto text-[12px]" style={{ color: HUD.muted }}>
        {rights === 0 ? t('hud.noRights') : t('hud.place', { n: rights })}
      </p>

      <div
        className="pointer-events-auto flex gap-1 rounded-[10px] p-1.5"
        style={{ background: HUD.dock, border: `1px solid ${HUD.lineStrong}`, boxShadow: HUD.shadowStrong, backdropFilter: 'blur(8px)' }}
      >
        {BUILD_TOOLS.map((item) => {
          const locked = isLocked(item.needs, milestone);
          const on = tool === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              data-tool={item.kind}
              data-locked={locked ? 'true' : undefined}
              aria-pressed={on}
              disabled={locked}
              onClick={() => {
                if (!locked) onTool(on ? null : item.kind);
              }}
              className="flex h-16 w-[78px] flex-col items-center justify-center gap-0.5 rounded-[7px]"
              style={{
                border: `1px solid ${on ? HUD.accent : 'transparent'}`,
                background: on ? 'rgba(47,143,216,0.22)' : 'transparent',
                color: locked ? HUD.locked : HUD.text,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ color: locked ? HUD.lockedIcon : on ? '#8fd4ff' : HUD.soft }}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className="text-[12px]">{t(item.label)}</span>
              <span className="text-[12px]" style={{ color: HUD.dim }}>
                {locked ? t('hud.lockedAt', { n: item.needs }) : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

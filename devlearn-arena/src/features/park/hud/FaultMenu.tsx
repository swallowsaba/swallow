import { useState } from 'react';
import type { Fault } from '@/features/park/faults';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD } from './theme';

interface Props {
  faults: readonly Fault[];
  /** いま起きている障害 */
  troubles: readonly Fault[];
  /** 直った直後か。少しの間だけ「直った」と出す */
  healed: boolean;
  /** コマンドを端末へ送る */
  onCommand: (line: string) => void;
}

/** 情報表示の柱の上に置く。右下の隅は情報表示が使っている */
const BOX = { position: 'absolute', right: 16, bottom: 196, width: 232, zIndex: 21 } as const;

/**
 * 壊して直す（REWORK 4）。
 *
 * 障害は、学習者が打つのと同じコマンドで起こす。何をしたから壊れたのかが端末に残る。
 * 起きている間は赤い札を出し、街のどこが止まっているかを言葉でも伝える。
 * 直し方はすぐには見せない。自分で考える余地を残し、求められたときだけ出す。
 */
export function FaultMenu({ faults, troubles, healed, onCommand }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [told, setTold] = useState(false);

  return (
    <div data-testid="fault-menu" style={BOX} className="flex flex-col gap-2">
      {healed && troubles.length === 0 ? (
        <p
          data-testid="fault-healed"
          className="rounded-lg px-3 py-2 text-[12px] leading-relaxed"
          style={{ background: HUD.panel, border: `1px solid ${HUD.ok}`, color: HUD.okText }}
        >
          {t('fault.healed')}
        </p>
      ) : null}

      {troubles.map((fault) => (
        <div
          key={fault.id}
          data-trouble={fault.id}
          className="rounded-lg p-2.5"
          style={{ background: HUD.panel, border: `1px solid ${HUD.bad}`, boxShadow: HUD.shadow }}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: HUD.bad }}>
            <Icon name="alert" size={15} />
            {fault.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: HUD.soft }}>
            {fault.lead}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: HUD.muted }}>
            {t('fault.where')}
          </p>
          {told ? (
            <button
              type="button"
              data-testid={`fault-fix-${fault.id}`}
              onClick={() => {
                onCommand(fault.fix);
              }}
              className="mt-1.5 w-full rounded px-2 py-1.5 text-left font-mono text-[12px]"
              style={{ border: `1px solid ${HUD.accentEdge}`, background: HUD.accentFill, color: HUD.accentText }}
            >
              {fault.fix}
            </button>
          ) : null}
        </div>
      ))}

      {troubles.length > 0 && !told ? (
        <button
          type="button"
          data-testid="fault-tell"
          onClick={() => {
            setTold(true);
          }}
          className="h-8 rounded-lg px-2.5 text-[12px]"
          style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          {t('fault.tell')}
        </button>
      ) : null}

      {open ? (
        <div
          data-testid="fault-list"
          className="flex flex-col gap-1 rounded-lg p-1.5"
          style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, boxShadow: HUD.shadow }}
        >
          {faults.map((fault) => {
            const able = fault.blocked === null && !fault.broken;
            return (
              <button
                key={fault.id}
                type="button"
                data-fault={fault.id}
                disabled={!able}
                onClick={() => {
                  setTold(false);
                  setOpen(false);
                  onCommand(fault.command);
                }}
                className="rounded px-2 py-1.5 text-left"
                style={{
                  border: `1px solid ${able ? HUD.lineStrong : 'transparent'}`,
                  background: able ? HUD.fillSoft : 'transparent',
                  color: able ? HUD.text : HUD.locked,
                  cursor: able ? 'pointer' : 'not-allowed',
                }}
              >
                <span className="block text-[13px]">{fault.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: able ? HUD.muted : HUD.locked }}>
                  {fault.broken ? t('fault.already') : (fault.blocked ?? fault.lead)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        data-testid="fault-open"
        aria-pressed={open}
        onClick={() => {
          setOpen((was) => !was);
        }}
        className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px]"
        style={{
          background: HUD.panel,
          border: `1px solid ${open ? HUD.bad : HUD.lineStrong}`,
          color: open ? HUD.bad : HUD.soft,
        }}
      >
        <Icon name="alert" size={16} />
        {t('fault.open')}
      </button>
    </div>
  );
}

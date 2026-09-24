import { INFO_VIEWS, type InfoView } from '@/city3d/overlay';
import type { TKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { HUD } from './theme';

interface Props {
  /** いま重ねている見方。もう一度押すと外れ、街がそのまま見える */
  view: InfoView | null;
  onView: (view: InfoView | null) => void;
}

const LABEL: Readonly<Record<InfoView, TKey>> = {
  residents: 'hud.view.residents',
  bus: 'hud.view.bus',
  traffic: 'hud.view.traffic',
  lineage: 'hud.view.lineage',
};

/**
 * 右下の情報表示の切り替え。住人の状態／バス路線／交通／系譜。
 * 選ぶと街の上に色が重なる。何も選ばなければ街はそのまま見える。
 */
export function InfoViews({ view, onView }: Props) {
  const t = useT();
  return (
    <div
      data-testid="info-views"
      className="absolute bottom-3.5 right-4 z-20 flex flex-col gap-1 rounded-lg p-1.5"
      style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}` }}
    >
      <span className="px-1.5 pb-1 pt-0.5 text-[12px]" style={{ color: HUD.muted }}>
        {t('hud.infoViews')}
      </span>
      {INFO_VIEWS.map((id) => {
        const on = view === id;
        return (
          <button
            key={id}
            type="button"
            data-view={id}
            aria-pressed={on}
            onClick={() => {
              onView(on ? null : id);
            }}
            className="h-8 rounded px-2.5 text-left text-[12px]"
            style={{
              border: `1px solid ${on ? HUD.accent : 'transparent'}`,
              background: on ? 'rgba(47,143,216,0.2)' : 'transparent',
              color: on ? HUD.text : '#a9b6c4',
            }}
          >
            {t(LABEL[id])}
          </button>
        );
      })}
    </div>
  );
}

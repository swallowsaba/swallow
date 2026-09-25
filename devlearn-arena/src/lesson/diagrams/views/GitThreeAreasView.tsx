import { motion } from 'framer-motion';
import { HUD } from '@/features/park/hud/theme';
import type { Area, GitThreeAreasView as View } from '../gitThreeAreas';
import { MiniButton, Shake } from './parts';
import { dragSource, dropTarget, type ViewProps } from './helpers';

const COLUMNS: readonly { area: Area; title: string; plain: string }[] = [
  { area: 'worktree', title: '作業ツリー', plain: '手を入れている最中' },
  { area: 'index', title: 'インデックス', plain: '写真に入れる物を並べる台' },
  { area: 'commit', title: 'コミット', plain: '撮った写真' },
];

const CHANGE: Readonly<Record<string, string>> = {
  new: '新しい',
  modified: '書き換えた',
  added: '新しい',
  deleted: '消した',
};

/**
 * 3 つの台。ファイルの札を作業ツリーからインデックスへドラッグすると git add、
 * インデックスからコミットへ落とすか「写真を撮る」を押すと git commit が走る。
 * コミットの台にある札を押すと、そのファイルに手を入れる（作業ツリーへ戻る）。
 */
export function GitThreeAreasView({ view, act, busy, refused }: ViewProps<View>) {
  const shakeOf = (area: Area): number | null => {
    if (refused === null) return null;
    if (area === 'index' && refused.moveId.startsWith('add:')) return refused.key;
    if (area === 'commit' && refused.moveId === 'commit') return refused.key;
    return null;
  };
  const dropOn = (area: Area) =>
    dropTarget((path) => {
      if (busy) return;
      if (area === 'index') act(`add:${path}`);
      if (area === 'commit') act('commit');
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {COLUMNS.map((column, i) => {
          const shake = shakeOf(column.area);
          return (
            <Shake key={column.area} shake={shake}>
              <div
                data-area={column.area}
                {...dropOn(column.area)}
                className="flex h-[150px] flex-col gap-1 rounded-md p-1.5"
                style={{
                  background: 'rgba(30,42,58,0.6)',
                  border: `1px solid ${shake !== null ? HUD.bad : HUD.lineStrong}`,
                  boxShadow: shake !== null ? `0 0 12px ${HUD.bad}` : undefined,
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold" style={{ color: HUD.text }}>{column.title}</span>
                  {i < COLUMNS.length - 1 ? <span className="text-[11px]" style={{ color: HUD.dim }}>→</span> : null}
                </div>
                <span className="text-[10px]" style={{ color: HUD.dim }}>{column.plain}</span>
                {column.area === 'commit' ? (
                  <span data-testid="commit-count" className="text-[10px]" style={{ color: HUD.muted }}>
                    写真 {view.commits} 枚{view.last === null ? '' : ` · 最後:「${view.last}」`}
                  </span>
                ) : null}
                <div className="mt-auto flex flex-col gap-1">
                  {view.cards
                    .filter((card) => card.area === column.area)
                    .map((card) => (
                      <motion.div key={card.path} layoutId={`card-${card.path}`} transition={{ duration: 0.45 }}>
                        <div
                          data-card={card.path}
                          {...(card.area === 'commit' ? {} : dragSource(card.path))}
                          onClick={() => {
                            if (busy) return;
                            if (card.area === 'worktree') act(`add:${card.path}`);
                            if (card.area === 'commit') act(`edit:${card.path}`);
                          }}
                          className="rounded px-1.5 py-1 text-[11px]"
                          style={{
                            background: card.area === 'commit' ? 'rgba(55,179,122,0.12)' : 'rgba(240,195,90,0.1)',
                            border: `1px solid ${card.area === 'commit' ? 'rgba(55,179,122,0.45)' : 'rgba(240,195,90,0.45)'}`,
                            color: HUD.text,
                            cursor: card.area === 'commit' ? 'pointer' : 'grab',
                          }}
                          title={card.area === 'commit' ? '押すと、このファイルに手を入れる' : 'ドラッグして右の台へ'}
                        >
                          <span className="font-mono">{card.path}</span>
                          {card.change === null ? null : (
                            <span className="ml-1 text-[10px]" style={{ color: HUD.warn }}>{CHANGE[card.change]}</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            </Shake>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <MiniButton testId="take-photo" onClick={() => { act('commit'); }} disabled={busy}>
          写真を撮る（コミット）
        </MiniButton>
        <span className="text-[11px]" style={{ color: HUD.muted }}>札をドラッグして右の台へ運ぶ</span>
      </div>
    </div>
  );
}

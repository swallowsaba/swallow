import { AnimatePresence, motion } from 'framer-motion';
import { HUD } from '@/features/park/hud/theme';
import type { FileTreeView as View } from '../fileTree';
import { MiniButton, Shake } from './parts';
import { dragSource, dropTarget, type ViewProps } from './helpers';

/**
 * 家のディレクトリと、logs の箱。ファイルの札を箱へドラッグすると mv が走る。
 * 箱の中の札を押すと、外へ出す。
 */
export function FileTreeView({ view, act, busy, refused }: ViewProps<View>) {
  const shake = refused !== null && refused.moveId.startsWith('mv:') ? refused.key : null;
  const card = (name: string, where: 'top' | 'dir') => (
    <motion.div key={name} layoutId={`file-${name}`} transition={{ duration: 0.4 }}>
      <div
        data-file={name}
        {...(where === 'top' ? dragSource(name) : {})}
        onClick={() => {
          if (busy) return;
          act(where === 'top' ? `mv:${name}` : `out:${name}`);
        }}
        className="rounded px-1.5 py-1 font-mono text-[11px]"
        style={{
          background: name.endsWith('.log') ? 'rgba(240,195,90,0.1)' : HUD.fill,
          border: `1px solid ${name.endsWith('.log') ? 'rgba(240,195,90,0.45)' : HUD.lineStrong}`,
          color: HUD.text,
          cursor: where === 'top' ? 'grab' : 'pointer',
        }}
      >
        {name}
      </div>
    </motion.div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-h-[130px] flex-col gap-1 rounded-md p-1.5" style={{ background: 'rgba(30,42,58,0.6)', border: `1px solid ${HUD.lineStrong}` }}>
          <span className="font-mono text-[11px] font-bold" style={{ color: HUD.text }}>/home/learner</span>
          <AnimatePresence>{view.top.map((name) => card(name, 'top'))}</AnimatePresence>
        </div>
        <Shake shake={shake}>
          <div
            data-dir="logs"
            {...dropTarget((name) => {
              if (!busy) act(`mv:${name}`);
            })}
            className="flex min-h-[130px] flex-col gap-1 rounded-md p-1.5"
            style={{
              background: view.dir === null ? 'transparent' : 'rgba(47,143,216,0.08)',
              border: `1.5px ${view.dir === null ? 'dashed' : 'solid'} ${shake !== null ? HUD.bad : view.dir === null ? HUD.lineStrong : HUD.accentEdge}`,
              boxShadow: shake !== null ? `0 0 12px ${HUD.bad}` : undefined,
            }}
          >
            <span className="font-mono text-[11px] font-bold" style={{ color: view.dir === null ? HUD.dim : HUD.accentText }}>
              logs/ {view.dir === null ? '（まだ無い）' : ''}
            </span>
            <AnimatePresence>{(view.dir ?? []).map((name) => card(name, 'dir'))}</AnimatePresence>
          </div>
        </Shake>
      </div>
      <div className="flex items-center gap-2">
        <MiniButton testId="mkdir" onClick={() => { act('mkdir'); }} disabled={busy || view.dir !== null}>
          logs の箱を作る
        </MiniButton>
        <span className="text-[11px]" style={{ color: HUD.muted }}>札をドラッグして箱へ入れる</span>
      </div>
    </div>
  );
}

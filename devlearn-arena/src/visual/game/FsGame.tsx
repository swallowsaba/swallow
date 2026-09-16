import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { fsCommands, type RunCommand } from '../commands';
import { clip, type Box, type Point } from '../sceneKit';
import { diffVfs } from '../treeLayout';
import { GameStage } from './GameStage';
import { Sprite } from './pixel';
import { CRATE, cratePalette, HERO, heroPalette, INK } from './sprites';
import { Clickable, House, Road, Sign, Sparkle } from './scenery';
import { cellNoise } from './terrain';
import { FILE_ROW, HOUSE_H, HOUSE_W, layoutTown, nearestHouse, pathToHere, polyline, walkRoute } from './fsTown';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
  onCommand?: RunCommand;
}

/** 1区間を歩くのにかける時間（秒） */
const STEP_S = 0.16;
const HERO_SCALE = 3;
const HERO_W = 12 * HERO_SCALE;
const HERO_H = 16 * HERO_SCALE;

/** 屋根の色を家ごとに少し変え、町に見えるようにする */
const ROOFS = ['#8f4b3f', '#3f6f8f', '#6f8f3f', '#8f6f3f', '#6f3f8f'];

function roofFor(path: string): string {
  let n = 0;
  for (const ch of path) n = (Math.imul(n, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return ROOFS[Math.floor(cellNoise(n, path.length) * ROOFS.length)] ?? '#8f4b3f';
}

/**
 * ファイルシステムの町。
 * ディレクトリは家、ファイルは家の前の木箱。主人公はいまいる家（cwd）の前に立ち、cd すると道を歩いて移る。
 * 家を押すと cd、木箱を押すと cat が端末で打たれる。増えた木箱は空から降ってきて、書き換わった木箱は光る。
 */
export function FsGame({ vfs, previous, cwd, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const town = useMemo(() => layoutTown(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);
  const lit = pathToHere(town, cwd);
  const here = nearestHouse(town, cwd);

  // cd したら、前の家からの道順を歩く。描き直しで同じ cwd なら歩き直さない
  const [walk, setWalk] = useState<{ cwd: string; route: Point[] }>(() => ({
    cwd,
    route: here ? [here.door] : [],
  }));
  if (walk.cwd !== cwd) setWalk({ cwd, route: walkRoute(town, walk.cwd, cwd) });
  const target = here?.door;
  const route = useMemo(() => {
    const last = walk.route[walk.route.length - 1];
    // 家の並びが変わって終点がずれたら、いまの扉の前へまっすぐ移る
    if (!target) return [];
    return last !== undefined && last.x === target.x && last.y === target.y ? walk.route : [target];
  }, [walk, target]);

  const occupied: Box[] = [
    ...town.houses.map((h) => ({
      x: h.box.x - 40,
      y: h.box.y - 40,
      w: HOUSE_W + 80,
      h: HOUSE_H + 64 + h.files.length * FILE_ROW + (h.hidden > 0 ? FILE_ROW : 0),
    })),
    ...town.roads
      .filter((r) => r.kind === 'link')
      .map((r) => {
        const xs = r.points.map((p) => p.x);
        const ys = r.points.map((p) => p.y);
        return { x: Math.min(...xs) - 16, y: Math.min(...ys) - 16, w: Math.max(...xs) - Math.min(...xs) + 32, h: Math.max(...ys) - Math.min(...ys) + 32 };
      }),
  ];

  const xs = route.map((p) => p.x - HERO_W / 2);
  const ys = route.map((p) => p.y - HERO_H + 8);

  return (
    <GameStage
      title={t('game.fs.title')}
      testId="game-fs"
      width={town.width}
      height={town.height}
      occupied={occupied}
      interactive={onCommand !== undefined}
      hud={
        <span className="knob px-2 py-0.5 font-mono text-xs" data-testid="game-cwd">
          📍 {cwd}
        </span>
      }
    >
      {town.roads.map((road) => (
        <Road key={`${road.kind}-${road.id}`} d={polyline(road.points)} lit={lit.has(road.id)} />
      ))}

      {town.houses.map((house) => {
        const isHere = house.path === here?.path;
        return (
          <g key={house.path} data-house={house.path} data-here={isHere ? 'true' : 'false'}>
            <Clickable command={fsCommands.cd(house.path)} onCommand={onCommand} label={house.path}>
              <House {...house.box} lit={isHere} roof={roofFor(house.path)} />
              <Sign
                cx={house.box.x + HOUSE_W / 2}
                y={house.box.y - 30}
                text={`${house.name === '/' ? '/' : `${house.name}/`}`}
                tone={isHere ? '#f2c14e' : '#f6e8cd'}
                strong={isHere}
                maxWidth={HOUSE_W + 30}
              />
            </Clickable>

            <AnimatePresence initial={false}>
              {house.files.map((file) => {
                const fresh = added.has(file.path);
                const touched = changed.has(file.path);
                return (
                  <motion.g
                    key={file.path}
                    data-file={file.path}
                    data-glow={fresh || touched ? 'true' : 'false'}
                    initial={animate && fresh ? { y: -80, opacity: 0 } : false}
                    animate={{ y: 0, opacity: 1 }}
                    exit={animate ? { opacity: 0, scale: 1.5, transition: { duration: 0.4 } } : undefined}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  >
                    <Clickable command={fsCommands.cat(file.path)} onCommand={onCommand} label={file.path}>
                      <rect x={file.x - 2} y={file.y - 2} width={HOUSE_W + 4} height={FILE_ROW - 2} fill="transparent" />
                      <Sprite map={CRATE} palette={cratePalette(fresh ? '#79c46a' : touched ? '#e8823c' : undefined)} x={file.x} y={file.y} scale={2} />
                      <text x={file.x + 30} y={file.y + 13} fontSize={12} fontWeight={700} fontFamily="var(--f-mono)" dominantBaseline="middle" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
                        {clip(file.name, HOUSE_W - 24, 12)}
                      </text>
                      {fresh || touched ? <Sparkle x={file.x + 22} y={file.y} animate={animate} /> : null}
                    </Clickable>
                  </motion.g>
                );
              })}
            </AnimatePresence>
            {house.hidden > 0 ? (
              <text x={house.box.x + 34} y={(house.files[house.files.length - 1]?.y ?? house.roadY) + FILE_ROW + 12} fontSize={12} fontWeight={800} fill={INK} fontFamily="var(--f-mono)">
                {t('game.fs.more', { n: house.hidden })}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* 主人公。いまいる家の扉の前に立ち、cd すると道を歩く */}
      {route.length > 0 ? (
        <motion.g
          data-testid="hero"
          data-at={here?.path}
          initial={false}
          animate={{ x: xs.length > 1 ? xs : xs[0], y: ys.length > 1 ? ys : ys[0] }}
          transition={
            animate
              ? { duration: Math.max(0.3, (route.length - 1) * STEP_S), ease: 'linear' }
              : { duration: 0 }
          }
        >
          <ellipse cx={HERO_W / 2} cy={HERO_H - 1} rx={16} ry={5} fill="rgba(0,0,0,0.25)" />
          <Sprite map={HERO} palette={heroPalette('#c0604a')} scale={HERO_SCALE} />
          <polygon points={`${String(HERO_W / 2 - 7)},-16 ${String(HERO_W / 2 + 7)},-16 ${String(HERO_W / 2)},-6`} fill="#c0392b" stroke={INK} strokeWidth={2} />
        </motion.g>
      ) : null}
    </GameStage>
  );
}

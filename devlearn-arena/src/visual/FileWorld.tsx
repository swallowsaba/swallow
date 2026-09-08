import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { diffVfs } from './treeLayout';
import {
  buildWorld, leftDoor, rightDoor, roomCenter, TILE, walkPath, type Cell, type WorldGrid,
} from './worldGrid';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

const STEP_MS = 110;

function px(cell: Cell): { left: number; top: number } {
  return { left: cell.x * TILE, top: cell.y * TILE };
}

/** 部屋の床と壁。扉の位置だけ壁を空ける */
function RoomTiles({ world, path, lit }: { world: WorldGrid; path: string; lit: boolean }) {
  const room = world.byPath.get(path);
  if (!room) return null;
  const doors = new Set<string>();
  if (room.parent !== null) {
    const d = leftDoor(room);
    doors.add(`${String(d.x + 1)},${String(d.y)}`);
  }
  const hasChild = [...world.byPath.values()].some((r) => r.parent === room.path);
  if (hasChild) {
    const d = rightDoor(room);
    doors.add(`${String(d.x - 1)},${String(d.y)}`);
  }

  const tiles: ReactElement[] = [];
  for (let y = room.y - 1; y <= room.y + room.h; y += 1) {
    for (let x = room.x - 1; x <= room.x + room.w; x += 1) {
      const isEdge = x < room.x || x >= room.x + room.w || y < room.y || y >= room.y + room.h;
      const isDoor = doors.has(`${String(x)},${String(y)}`);
      const floor = (x + y) % 2 === 0 ? '#cbb894' : '#c0ac86';
      tiles.push(
        <div
          key={`${String(x)},${String(y)}`}
          className="absolute"
          style={{
            left: x * TILE,
            top: y * TILE,
            width: TILE,
            height: TILE,
            backgroundColor: isEdge && !isDoor ? '#6f4a2a' : floor,
            boxShadow: isEdge && !isDoor ? 'inset 0 0 0 2px rgba(0,0,0,0.25)' : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
            filter: lit ? undefined : 'brightness(0.62) saturate(0.5)',
          }}
        />,
      );
    }
  }
  return <>{tiles}</>;
}

/**
 * ファイルシステムを歩ける世界として描く。
 * ディレクトリは壁と扉のある部屋、ファイルは床に置かれた物、
 * cd は瞬間移動ではなく、扉を通って通路を歩く動きになる。
 */
export function FileWorld({ vfs, previous, cwd }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const world = useMemo(() => buildWorld(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([cwd]));
  const [at, setAt] = useState<Cell>(() => {
    const room = world.byPath.get(cwd);
    return room ? roomCenter(room) : { x: 2, y: 2 };
  });
  const prevCwd = useRef(cwd);

  // cwd が変わったら、経路のマスを1つずつ辿って歩く
  useEffect(() => {
    if (prevCwd.current === cwd) return;
    const cells = walkPath(world, prevCwd.current, cwd);
    prevCwd.current = cwd;
    setVisited((prev) => new Set([...prev, cwd]));
    if (cells.length === 0) return;
    if (!animate) {
      setAt(cells[cells.length - 1] ?? at);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      const next = cells[i];
      if (!next) {
        clearInterval(timer);
        return;
      }
      setAt(next);
    }, STEP_MS);
    return () => {
      clearInterval(timer);
    };
    // world は状態から作られるので、cwd の変化だけを追えばよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, world]);

  // 部屋が消えた/作り直された場合の座標補正
  useEffect(() => {
    if (world.byPath.has(cwd)) return;
    const room = world.byPath.get('/');
    if (room) setAt(roomCenter(room));
  }, [world, cwd]);

  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    el.scrollTo({
      left: at.x * TILE - el.clientWidth / 2,
      top: at.y * TILE - el.clientHeight / 2,
      behavior: animate ? 'smooth' : 'auto',
    });
  }, [at, animate]);

  return (
    <div ref={viewport} className="h-full w-full overflow-auto" style={{ backgroundColor: '#3f6b34' }}>
      <div
        className="relative"
        style={{ width: world.width * TILE, height: world.height * TILE }}
        role="img"
        aria-label={t('viz.fileTree')}
      >
        {/* 通路 */}
        {[...world.halls.entries()].map(([childPath, cells]) => {
          const lit = visited.has(childPath) || visited.has(world.byPath.get(childPath)?.parent ?? '');
          return cells.map((cell) => (
            <div
              key={`hall-${childPath}-${String(cell.x)}-${String(cell.y)}`}
              className="absolute"
              style={{
                ...px(cell),
                width: TILE,
                height: TILE,
                backgroundColor: '#b79a6d',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                filter: lit ? undefined : 'brightness(0.6)',
              }}
            />
          ));
        })}

        {/* 部屋 */}
        {world.rooms.map((room) => (
          <RoomTiles key={`room-${room.path}`} world={world} path={room.path} lit={visited.has(room.path)} />
        ))}

        {/* 部屋の名札 */}
        {world.rooms.map((room) => (
          <div
            key={`sign-${room.path}`}
            className="sign absolute z-10 truncate px-2 text-sm font-extrabold"
            style={{
              left: room.x * TILE,
              top: (room.y - 1) * TILE - 12,
              maxWidth: room.w * TILE,
            }}
          >
            {room.name}
            {room.hiddenCount > 0 ? ` +${String(room.hiddenCount)}` : ''}
          </div>
        ))}

        {/* 床に置かれた物 */}
        {world.rooms.flatMap((room) =>
          room.items.map((item) => {
            const isAdded = added.has(item.path);
            const isChanged = changed.has(item.path);
            return (
              <motion.div
                key={`item-${item.path}`}
                initial={animate ? { scale: 0, y: -TILE } : false}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="absolute z-10 grid place-items-center"
                style={{ ...px(item), width: TILE, height: TILE }}
                title={item.path}
              >
                <span aria-hidden className="text-2xl leading-none">
                  {isAdded ? '✨' : isChanged ? '📜' : '📦'}
                </span>
                <span className="absolute -bottom-1 max-w-[74px] truncate bg-[rgb(0_0_0/45%)] px-1 font-mono text-[10px] text-white">
                  {item.name}
                </span>
              </motion.div>
            );
          }),
        )}

        {/* 主人公 */}
        <motion.div
          className="absolute z-20 grid place-items-center"
          animate={{ left: at.x * TILE, top: at.y * TILE }}
          transition={{ duration: animate ? STEP_MS / 1000 : 0, ease: 'linear' }}
          style={{ width: TILE, height: TILE }}
          aria-label={t('viz.here')}
          role="img"
        >
          <span className="absolute bottom-0 h-2 w-6 rounded-full bg-[rgb(0_0_0/35%)]" aria-hidden />
          <motion.span
            aria-hidden
            className="text-3xl leading-none"
            animate={animate ? { y: [0, -4, 0] } : {}}
            transition={{ repeat: Infinity, duration: 0.9 }}
          >
            🧑‍🌾
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}

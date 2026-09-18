import type { ShellState } from '@/engines/kernel/registry';
import { HOME } from '@/engines/kernel/path';
import { metaOf, type VfsState } from '@/engines/kernel/vfs';
import { diffVfs } from '@/visual/treeLayout';
import { planTown, type PlanDistrict } from './plan';
import type { Scene, SceneItem, Translate } from './types';

/**
 * シェルの街（ファイルシステムの住宅地）。
 *
 * ディレクトリ = 街区、ファイル = 通りに面して建つ家、実行できるファイル = 工房、
 * 隠しファイル = 塀の中の家、書き込めない = 鍵、いまいる場所（cwd）= 市長の旗、プロセス = working区の車庫。
 *
 * 街区は碁盤の目に並び、家は街区の外周（通りに面した側）から埋まる。
 * 親子のディレクトリは、街区の看板と連絡線でつなぐ。
 */

const MAX_FILES = 12;
const MAX_DEPTH = 4;
const MAX_DIRS = 16;

function childrenOf(vfs: VfsState, dir: string): { dirs: string[]; files: string[] } {
  const prefix = dir === '/' ? '/' : `${dir}/`;
  const dirs: string[] = [];
  const files: string[] = [];
  for (const [path, node] of vfs.nodes) {
    if (path === dir || !path.startsWith(prefix)) continue;
    if (path.slice(prefix.length).includes('/')) continue;
    (node.kind === 'dir' ? dirs : files).push(path);
  }
  return { dirs: dirs.sort(), files: files.sort() };
}

const nameOf = (path: string): string => (path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1));

/** 街として見せる根。cwd が家の中なら家から、外ならその 1 つ上から */
export function sceneRoot(state: ShellState): string {
  if (state.cwd === HOME || state.cwd.startsWith(`${HOME}/`)) return state.vfs.nodes.has(HOME) ? HOME : '/';
  if (state.cwd === '/') return '/';
  const parent = state.cwd.slice(0, state.cwd.lastIndexOf('/')) || '/';
  return parent;
}

interface Ward {
  dir: string;
  depth: number;
  files: string[];
  dirs: string[];
}

/** 街区にするディレクトリを、根から幅優先で集める */
function wards(vfs: VfsState, root: string): Ward[] {
  const out: Ward[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (queue.length > 0 && out.length < MAX_DIRS) {
    const item = queue.shift();
    if (!item) break;
    const { dirs, files } = childrenOf(vfs, item.dir);
    out.push({ dir: item.dir, depth: item.depth, files: files.slice(0, MAX_FILES), dirs });
    if (item.depth >= MAX_DEPTH) continue;
    for (const child of dirs) queue.push({ dir: child, depth: item.depth + 1 });
  }
  return out;
}

export function shellScene(state: ShellState, previous: ShellState | undefined, t: Translate): Scene {
  const { vfs } = state;
  const items: SceneItem[] = [];
  const diff = diffVfs(previous?.vfs, vfs);
  const touched = new Set([...diff.added, ...diff.changed]);
  const root = sceneRoot(state);
  const blocks = vfs.nodes.has(root) ? wards(vfs, root) : [];

  // 地区（街区）を組み立てて、碁盤の目に割り付ける
  const districts: PlanDistrict[] = blocks.map((w) => ({
    id: `street:${w.dir}`,
    label: nameOf(w.dir),
    tone: state.cwd === w.dir ? 'accent' : 'info',
    members: w.files.map((path) => `file:${path}`),
    min: 4,
    // 空でも、いま立っている街区と街の入口の街区は開いている
    developed: w.files.length > 0 || w.dir === state.cwd || w.dir === root,
  }));
  const procs = [...state.procs.processes.values()].slice(0, 8);
  if (procs.length > 0) {
    districts.push({
      id: 'yard:procs',
      label: t('scape.shell.factory'),
      tone: 'accent',
      members: procs.map((p) => `proc:${String(p.pid)}`),
      min: 2,
    });
  }
  const plan = planTown(districts);

  let fileCount = 0;
  let locked = 0;
  let workshops = 0;

  for (const w of blocks) {
    const block = plan.blocks.find((b) => b.id === `street:${w.dir}`);
    if (!block) continue;
    const here = state.cwd === w.dir;
    // 街区の角に看板（ここがどのディレクトリか）
    items.push({
      type: 'marker',
      id: `sign:${w.dir}`,
      x: block.x + 0.6,
      y: block.y + block.d - 0.4,
      icon: here ? '🚩' : '🪧',
      tone: here ? 'accent' : 'info',
      info: {
        title: w.dir,
        kind: t('scape.shell.dirKind'),
        lines: [t('scape.shell.dirLine', { files: w.files.length, dirs: w.dirs.length }), ...(here ? [t('scape.shell.here')] : [])],
        next: here ? t('scape.shell.hereNext') : t('scape.shell.cdNext', { path: w.dir }),
      },
    });

    for (const path of w.files) {
      const lot = plan.lots.get(`file:${path}`);
      if (!lot) continue;
      fileCount += 1;
      const node = vfs.nodes.get(path);
      const content = node?.kind === 'file' ? node.content : '';
      const mode = metaOf(vfs, path).mode;
      const exec = (mode & 0o111) !== 0;
      const readOnly = (mode & 0o200) === 0;
      const hidden = nameOf(path).startsWith('.');
      if (readOnly) locked += 1;
      if (exec) workshops += 1;
      const badges = [
        ...(exec ? [{ icon: '⚙', tone: 'accent' as const }] : []),
        ...(readOnly ? [{ icon: '🔒', tone: 'warn' as const }] : []),
      ];
      items.push({
        type: 'building',
        id: `file:${path}`,
        x: lot.x + 0.15,
        y: lot.y + 0.15,
        w: lot.w - 0.3,
        d: lot.d - 0.3,
        facing: lot.facing,
        floors: Math.max(1, Math.min(5, 1 + Math.floor(content.length / 160))),
        style: hidden ? 'ghost' : 'solid',
        color: exec ? '#c9b18a' : /\.(log)$/.test(path) ? '#b9bec4' : /\.(conf|cfg|ya?ml|json|ini)$/.test(path) ? '#f0c27b' : '#f2e4cf',
        roof: exec ? 'flat' : 'gable',
        label: nameOf(path),
        badges: badges.length > 0 ? badges : undefined,
        changed: touched.has(path),
        info: {
          title: path,
          kind: exec ? t('scape.shell.execKind') : hidden ? t('scape.shell.hiddenKind') : t('scape.shell.fileKind'),
          lines: [
            t('scape.shell.fileSize', { n: content.length }),
            t('scape.shell.fileMode', { mode: `0${(mode & 0o777).toString(8)}` }),
            ...(readOnly ? [t('scape.shell.readOnly')] : []),
          ],
          next: readOnly ? t('scape.shell.chmodNext', { path }) : t('scape.shell.catNext', { path }),
        },
      });
    }

    const { files } = childrenOf(vfs, w.dir);
    if (files.length > w.files.length) {
      items.push({
        type: 'marker',
        id: `more:${w.dir}`,
        x: block.x + block.w - 1.2,
        y: block.y + block.d - 0.6,
        icon: '🏘',
        label: t('scape.shell.more', { n: files.length - w.files.length }),
        tone: 'muted',
      });
    }

    // 親の街区とつなぐ連絡線（どの街区がどの街区の中にあるか）
    const parentBlock = plan.blocks.find((b) => b.id === `street:${w.dir.slice(0, w.dir.lastIndexOf('/')) || '/'}`);
    if (parentBlock && parentBlock.id !== block.id) {
      items.push({
        type: 'link',
        id: `belongs:${w.dir}`,
        from: { x: parentBlock.x + parentBlock.w / 2, y: parentBlock.y + parentBlock.d / 2 },
        to: { x: block.x + block.w / 2, y: block.y + block.d / 2 },
        style: 'dashed',
        tone: 'muted',
      });
    }
  }

  // 車庫（プロセス）
  procs.forEach((p) => {
    const lot = plan.lots.get(`proc:${String(p.pid)}`);
    if (!lot) return;
    items.push({
      type: 'marker',
      id: `proc:${String(p.pid)}`,
      x: lot.x + 0.4,
      y: lot.y + 0.5,
      icon: p.state === 'Z' ? '💀' : p.state === 'T' ? '⏸' : '🚚',
      label: `${String(p.pid)} ${p.command.split(' ')[0] ?? ''}`,
      tone: p.state === 'Z' ? 'bad' : p.state === 'T' ? 'warn' : 'ok',
      info: {
        title: `PID ${String(p.pid)}`,
        kind: t('scape.shell.procKind'),
        lines: [p.command, t('scape.shell.procUsage', { cpu: p.cpu, mem: p.memory, state: p.state })],
        next: t('scape.shell.killNext', { pid: p.pid }),
      },
    });
  });

  const hereBlock = plan.blocks.find((b) => b.id === `street:${state.cwd}`) ?? plan.blocks[0];

  return {
    width: plan.width,
    height: plan.height,
    plan,
    items,
    legend: [
      { sample: 'road', name: t('scape.shell.legend.street'), meaning: t('scape.shell.legend.streetMeaning'), command: 'mkdir <名前>' },
      { sample: 'solid', name: t('scape.shell.legend.house'), meaning: t('scape.shell.legend.houseMeaning'), command: 'touch <名前>' },
      { sample: 'marker', icon: '🚩', name: t('scape.shell.legend.flag'), meaning: t('scape.shell.legend.flagMeaning'), command: 'cd <場所>' },
      { sample: 'marker', icon: '⚙', name: t('scape.shell.legend.workshop'), meaning: t('scape.shell.legend.workshopMeaning'), command: 'chmod +x <名前>' },
      { sample: 'marker', icon: '🔒', name: t('scape.shell.legend.lock'), meaning: t('scape.shell.legend.lockMeaning'), command: 'chmod u+w <名前>' },
      { sample: 'ghost', name: t('scape.shell.legend.hidden'), meaning: t('scape.shell.legend.hiddenMeaning'), command: 'ls -a' },
      { sample: 'marker', icon: '🚚', name: t('scape.shell.legend.proc'), meaning: t('scape.shell.legend.procMeaning'), command: 'ps / kill <PID>' },
    ],
    stats: [
      { icon: '🛣', label: t('scape.shell.stat.blocks'), value: blocks.length },
      { icon: '🏠', label: t('scape.shell.stat.houses'), value: fileCount },
      { icon: '⚙', label: t('scape.shell.stat.workshops'), value: workshops },
      { icon: '🔒', label: t('scape.shell.stat.locked'), value: locked },
      { icon: '🚚', label: t('scape.shell.stat.procs'), value: state.procs.processes.size },
      { icon: '🚩', label: t('scape.shell.stat.here'), value: state.cwd },
    ],
    focus: hereBlock ? { x: hereBlock.x + hereBlock.w / 2, y: hereBlock.y + hereBlock.d / 2 } : { x: 4, y: 4 },
  };
}

import type { ShellState } from '@/engines/kernel/registry';
import { HOME } from '@/engines/kernel/path';
import { metaOf, type VfsState } from '@/engines/kernel/vfs';
import { diffVfs } from '@/visual/treeLayout';
import type { Scene, SceneItem, Translate } from './types';

/**
 * シェルの街（ファイルシステムの住宅地）。
 * ディレクトリ = 街区（通り）、ファイル = 家、実行できるファイル = 工房、隠しファイル = 霧の中の家、
 * 書き込めない = 鍵、いまいる場所（cwd）= 市長の旗、プロセス = 工場で働く車。
 */

const MAX_FILES = 8;
const MAX_DEPTH = 4;
const MAX_DIRS = 24;

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

export function shellScene(state: ShellState, previous: ShellState | undefined, t: Translate): Scene {
  const { vfs } = state;
  const items: SceneItem[] = [];
  const diff = diffVfs(previous?.vfs, vfs);
  const touched = new Set([...diff.added, ...diff.changed]);
  const root = sceneRoot(state);
  let dirCount = 0;
  let fileCount = 0;
  let locked = 0;
  let workshops = 0;
  let width = 8;
  let cwdAt: { x: number; y: number } | null = null;

  const place = (dir: string, depth: number, top: number): number => {
    dirCount += 1;
    const { dirs, files } = childrenOf(vfs, dir);
    const x0 = depth * 3;
    const shown = files.slice(0, MAX_FILES);
    const streetLen = Math.max(5, shown.length * 3 + 3);
    width = Math.max(width, x0 + streetLen + 2);
    const roadY = top + 2;
    const here = state.cwd === dir;
    if (here) cwdAt = { x: x0, y: roadY };
    items.push({
      type: 'road',
      id: `street:${dir}`,
      cells: Array.from({ length: streetLen }, (_, i) => ({ x: x0 + i, y: roadY })),
      kind: depth === 0 ? 'main' : 'street',
      label: nameOf(dir),
    });
    items.push({
      type: 'marker',
      id: `sign:${dir}`,
      x: x0 + 0.2,
      y: roadY + 0.5,
      icon: here ? '🚩' : '🪧',
      label: nameOf(dir),
      tone: here ? 'accent' : 'info',
      info: {
        title: dir,
        kind: t('scape.shell.dirKind'),
        lines: [t('scape.shell.dirLine', { files: files.length, dirs: dirs.length }), ...(here ? [t('scape.shell.here')] : [])],
        next: here ? t('scape.shell.hereNext') : t('scape.shell.cdNext', { path: dir }),
      },
    });
    shown.forEach((path, i) => {
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
        x: x0 + 1 + i * 3,
        y: top,
        w: 2,
        d: 2,
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
    });
    if (files.length > MAX_FILES) {
      items.push({ type: 'marker', id: `more:${dir}`, x: x0 + 1 + MAX_FILES * 3, y: top + 1, icon: '🏘', label: t('scape.shell.more', { n: files.length - MAX_FILES }), tone: 'muted' });
    }
    let y = top + 4;
    if (depth >= MAX_DEPTH) {
      if (dirs.length > 0) items.push({ type: 'marker', id: `deep:${dir}`, x: x0 + 3, y, icon: '⋯', label: t('scape.shell.more', { n: dirs.length }), tone: 'muted' });
      return y + (dirs.length > 0 ? 2 : 0);
    }
    for (const child of dirs) {
      if (dirCount >= MAX_DIRS) break;
      const childRoad = y + 2;
      // 親の通りから子の通りへ下りる道
      items.push({
        type: 'road',
        id: `link:${child}`,
        cells: Array.from({ length: childRoad - roadY - 1 }, (_, i) => ({ x: x0 + 2, y: roadY + 1 + i })),
        kind: 'street',
      });
      y = place(child, depth + 1, y);
    }
    return y;
  };

  const height = vfs.nodes.has(root) ? place(root, 0, 0) : 6;

  // 工場（プロセス）
  const procs = [...state.procs.processes.values()].slice(0, 8);
  const factoryX = width + 1;
  if (procs.length > 0) {
    items.push({ type: 'plot', id: 'factory', x: factoryX, y: 0, w: 5, d: Math.max(4, procs.length * 1.5 + 1), tone: 'accent', label: t('scape.shell.factory') });
    procs.forEach((p, i) => {
      items.push({
        type: 'marker',
        id: `proc:${String(p.pid)}`,
        x: factoryX + 1,
        y: 1 + i * 1.5,
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
  }

  const at = cwdAt as { x: number; y: number } | null;
  return {
    width: procs.length > 0 ? factoryX + 6 : width,
    height: Math.max(height, 6),
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
      { icon: '🛣', label: t('scape.shell.stat.blocks'), value: dirCount },
      { icon: '🏠', label: t('scape.shell.stat.houses'), value: fileCount },
      { icon: '⚙', label: t('scape.shell.stat.workshops'), value: workshops },
      { icon: '🔒', label: t('scape.shell.stat.locked'), value: locked },
      { icon: '🚚', label: t('scape.shell.stat.procs'), value: state.procs.processes.size },
      { icon: '🚩', label: t('scape.shell.stat.here'), value: state.cwd },
    ],
    focus: at ?? { x: 4, y: 2 },
  };
}

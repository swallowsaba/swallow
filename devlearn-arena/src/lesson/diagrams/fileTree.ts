import { exists, isDir, list } from '@/engines/kernel/vfs';
import { applyCommand, boot, unknownMove, type Playground, type Sim } from './sim';

/**
 * `file-tree`: ファイルとディレクトリ（Linux の練習で使う）。
 *
 * 札をディレクトリの箱へ落とすと本物の `mv` が、箱を作るボタンは本物の `mkdir` が走る。
 * 図は、そのあとのファイルの並び（`ls` と同じ中身）を描くだけ。
 */

const HOME = '/home/learner';
const DIR = 'logs';
export const FILES = ['app.log', 'db.log', 'report.txt'] as const;
/** 片付けの対象。名前が .log で終わるもの */
const LOGS = FILES.filter((f) => f.endsWith('.log'));

export interface FileTreeView {
  /** 家（/home/learner）の直下にあるファイル */
  top: string[];
  /** logs ディレクトリ。まだ無ければ null */
  dir: string[] | null;
}

function start(): Sim {
  return boot({
    files: { [HOME]: null, ...Object.fromEntries(FILES.map((f) => [`${HOME}/${f}`, `${f} の中身\n`])) },
    cwd: HOME,
  });
}

function view(sim: Sim): FileTreeView {
  const vfs = sim.session.state.vfs;
  const path = `${HOME}/${DIR}`;
  return {
    top: list(vfs, HOME).filter((name) => !isDir(vfs, `${HOME}/${name}`)).sort(),
    dir: exists(vfs, path) && isDir(vfs, path) ? list(vfs, path).sort() : null,
  };
}

function moves(sim: Sim) {
  const current = view(sim);
  return [
    ...(current.dir === null ? [{ id: 'mkdir', label: `${DIR} ディレクトリを作る`, command: `mkdir ${DIR}` }] : []),
    ...current.top.map((f) => ({ id: `mv:${f}`, label: `${f} を ${DIR} へ入れる`, command: `mv ${f} ${DIR}/` })),
    ...(current.dir ?? []).map((f) => ({ id: `out:${f}`, label: `${f} を外へ出す`, command: `mv ${DIR}/${f} .` })),
  ];
}

function apply(sim: Sim, moveId: string) {
  const found = moves(sim).find((m) => m.id === moveId);
  if (found === undefined) return unknownMove(sim, moveId);
  if (found.id.startsWith('mv:') && view(sim).dir === null) {
    return {
      sim,
      command: found.command,
      ok: false,
      reason: `${DIR} というディレクトリがまだ無い。先に mkdir で箱を作る`,
    };
  }
  return applyCommand(sim, found.command);
}

export const fileTree: Playground<FileTreeView> = {
  id: 'file-tree',
  goal: `.log で終わるファイルだけを ${DIR} ディレクトリに片付けよ`,
  notes: [
    'ディレクトリはファイルを入れる箱。箱の中に箱を入れることもできる。',
    '札を箱へ落とすと mv（移動）が走る。箱が無ければ、先に mkdir で作る。',
    'どこに何があるかは ls で見られる。図はその中身をそのまま描いている。',
  ],
  start,
  moves,
  apply,
  view,
  reached: (sim) => {
    const current = view(sim);
    return (
      current.dir !== null &&
      LOGS.every((f) => current.dir?.includes(f) === true) &&
      current.top.every((f) => !f.endsWith('.log')) &&
      current.top.includes('report.txt')
    );
  },
  solution: ['mkdir', 'mv:app.log', 'mv:db.log'],
};

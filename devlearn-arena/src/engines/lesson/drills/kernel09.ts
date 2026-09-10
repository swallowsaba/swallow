import { fileEquals, fileExists, pathExists } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/09';

function processGone(needle: string) {
  return (ctx: AssertContext): boolean =>
    ![...ctx.shell.procs.processes.values()].some((p) => p.command.includes(needle));
}

/* ------------------------------------------------------------------ *
 * 1. df と du の見ているものの違い
 * ------------------------------------------------------------------ */

const SIZES: { slug: string; value: { dirs: { path: string; kb: number }[] } }[] = [
  { slug: 'logs', value: { dirs: [{ path: '/var/log', kb: 40 }, { path: '/srv/app', kb: 12 }] } },
  { slug: 'data', value: { dirs: [{ path: '/data/raw', kb: 60 }, { path: '/data/clean', kb: 8 }] } },
  { slug: 'backup', value: { dirs: [{ path: '/backup/db', kb: 90 }, { path: '/backup/files', kb: 20 }] } },
  { slug: 'cache', value: { dirs: [{ path: '/var/cache', kb: 35 }, { path: '/var/tmp', kb: 5 }] } },
  { slug: 'build', value: { dirs: [{ path: '/build/out', kb: 70 }, { path: '/build/cache', kb: 25 }] } },
  { slug: 'media', value: { dirs: [{ path: '/srv/media', kb: 120 }, { path: '/srv/thumbs', kb: 10 }] } },
  { slug: 'db', value: { dirs: [{ path: '/var/lib/db', kb: 150 }, { path: '/var/lib/wal', kb: 30 }] } },
  { slug: 'home', value: { dirs: [{ path: '/home/learner/work', kb: 45 }, { path: '/home/learner/tmp', kb: 15 }] } },
];

const biggestDrills = family<{ dirs: { path: string; kb: number }[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'find-big',
  docs: [man('du'), man('df')],
  variants: SIZES,
  make: (v) => {
    const files: Record<string, string | null> = { [HOME]: null };
    for (const d of v.dirs) {
      files[d.path] = null;
      files[`${d.path}/blob.dat`] = 'x'.repeat(d.kb * 1024);
    }
    const biggest = [...v.dirs].sort((a, b) => b.kb - a.kb)[0]?.path ?? '';
    return {
      title: 'いちばん容量を食っている場所を突き止める',
      objectives: ['大きさを測れる', '大きい順に並べられる'],
      initial: { files, cwd: HOME },
      solution: [`echo "${biggest}" > biggest.txt`],
      steps: [
        {
          prompt: `${v.dirs.map((d) => d.path).join(' と ')} のうち、容量を食っているほうのパスを biggest.txt に書け。`,
          check: `biggest.txt の中身が ${biggest} であること`,
          assert: fileEquals('biggest.txt', biggest),
          hints: [
            'du -h <パス> で大きさが見える',
            'du -sh <パス> なら合計だけ',
            `echo "${biggest}" > biggest.txt`,
          ],
          explain:
            'du は「そのパスの下を実際に足し合わせた大きさ」。df は「ファイルシステム全体の使用量」。数が合わないときは、消したのに掴まれているファイルを疑う。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 2. 中身だけ空にする
 * ------------------------------------------------------------------ */

const TRUNCATES: { slug: string; value: string }[] = [
  { slug: 'app', value: '/var/log/app.log' },
  { slug: 'access', value: '/var/log/access.log' },
  { slug: 'error', value: '/var/log/error.log' },
  { slug: 'debug', value: '/var/log/debug.log' },
  { slug: 'query', value: '/var/log/query.log' },
  { slug: 'audit', value: '/var/log/audit.log' },
  { slug: 'gc', value: '/var/log/gc.log' },
  { slug: 'batch', value: '/var/log/batch.log' },
];

const truncateDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'truncate',
  docs: [man('truncate')],
  variants: TRUNCATES,
  make: (path) => ({
    title: `${path} を残したまま空にする`,
    objectives: ['ファイルを消さずに空にできる', '消してはいけない理由が言える'],
    initial: {
      files: { [HOME]: null, '/var/log': null, [path]: 'x'.repeat(50_000) },
      cwd: HOME,
      processes: [{ command: 'app-server', cpu: 3, memory: 128, openFiles: [path] }],
    },
    solution: [`> ${path}`],
    steps: [
      {
        prompt: `${path} の中身を空にせよ。ファイル自体は消さないこと。`,
        conditions: [
          {
            label: `${path} がまだ存在すること`,
            test: fileExists(path),
            howTo: 'rm で消すと、書き込み中のプロセスが掴んだままになり容量が戻りません',
          },
          {
            label: '中身が空であること',
            test: fileEquals(path, ''),
            howTo: 'ls -l か wc -c で大きさを確かめてください',
          },
        ],
        hints: [
          'コマンドを書かずに > だけでもリダイレクトはできる',
          `> ${path}`,
        ],
        explain:
          'プロセスが開いているファイルを rm しても、閉じるまで実体は残る。中身だけ空にすれば、書き込みを続けたまま容量が戻る。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. 消したのに空きが戻らない
 * ------------------------------------------------------------------ */

const PRESSURES: { slug: string; value: { log: string; holder: string } }[] = [
  { slug: 'app', value: { log: '/var/log/app.log', holder: 'app-server' } },
  { slug: 'worker', value: { log: '/var/log/worker.log', holder: 'queue-worker' } },
  { slug: 'proxy', value: { log: '/var/log/proxy.log', holder: 'proxy-daemon' } },
  { slug: 'db', value: { log: '/var/log/db.log', holder: 'db-writer' } },
  { slug: 'sync', value: { log: '/var/log/sync.log', holder: 'sync-agent' } },
  { slug: 'index', value: { log: '/var/log/index.log', holder: 'indexer' } },
];

const pressureDrills = family<{ log: string; holder: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'disk-pressure',
  docs: [man('lsof', 8), man('df')],
  variants: PRESSURES,
  make: (v) => ({
    title: `${v.log} を消したのに空きが戻らない`,
    objectives: ['症状を再現できる', '掴んでいる相手を見つけられる', '正しい直し方が言える'],
    initial: {
      files: { [HOME]: null, '/var/log': null, [v.log]: 'x'.repeat(120_000) },
      cwd: HOME,
      processes: [{ command: v.holder, cpu: 4, memory: 200, openFiles: [v.log] }],
    },
    solution: [
      `rm ${v.log}`,
      `lsof ${v.log} > held.txt`,
      `pkill ${v.holder}`,
      'echo "ログは rm ではなく中身を空にするか rotate する" > lesson.txt',
    ],
    steps: [
      {
        prompt: `まず ${v.log} を消して、症状を再現せよ。`,
        check: `${v.log} が見えなくなっていること`,
        assert: (ctx) => !ctx.shell.vfs.nodes.has(v.log),
        hints: [`rm ${v.log}`],
        explain: '名前は消えたが、開いているプロセスがいる限り実体は残っている。',
      },
      {
        prompt: '掴んでいるプロセスを調べ、held.txt に残せ。',
        check: `held.txt に ${v.holder} と (deleted) が含まれること`,
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/held.txt`);
          return (
            node?.kind === 'file' && node.content.includes(v.holder) && node.content.includes('deleted')
          );
        },
        hints: [`lsof ${v.log} > held.txt`],
        explain: 'lsof の (deleted) が、まさに「消えたのに残っている」状態を指している。',
      },
      {
        prompt: '掴んでいるプロセスを止め、容量を取り戻せ。',
        check: `${v.holder} が居なくなっていること`,
        assert: processGone(v.holder),
        hints: [`pkill ${v.holder}`],
        explain: 'プロセスが閉じた瞬間に実体が解放される。ここで初めて df の数字が動く。',
      },
      {
        prompt: '再発しないように、正しい直し方を lesson.txt に書き残せ（rotate という語を含めること）。',
        check: 'lesson.txt に rotate が含まれること',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/lesson.txt`);
          return node?.kind === 'file' && node.content.includes('rotate');
        },
        hints: ['echo "..." > lesson.txt'],
        explain:
          '止めずに済ませるのが本番の正解。ログは rm せず、中身を空にするか rotate して開き直させる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 4. 使用量の見方
 * ------------------------------------------------------------------ */

const REPORTS: { slug: string; value: { path: string; kb: number } }[] = [
  { slug: 'log', value: { path: '/var/log', kb: 30 } },
  { slug: 'srv', value: { path: '/srv', kb: 50 } },
  { slug: 'data', value: { path: '/data', kb: 80 } },
  { slug: 'opt', value: { path: '/opt', kb: 20 } },
  { slug: 'cache', value: { path: '/var/cache', kb: 65 } },
  { slug: 'backup', value: { path: '/backup', kb: 110 } },
];

const reportDrills = family<{ path: string; kb: number }>({
  track: 'kernel',
  chapterId: CH,
  family: 'df-du',
  docs: [man('df'), man('du')],
  variants: REPORTS,
  make: (v) => ({
    title: `${v.path} の大きさを記録する`,
    objectives: ['du の合計を取れる', '結果を残せる'],
    initial: {
      files: { [HOME]: null, [v.path]: null, [`${v.path}/blob.dat`]: 'x'.repeat(v.kb * 1024) },
      cwd: HOME,
    },
    solution: [`du -sh ${v.path} > size.txt`, `df -h > disk.txt`],
    steps: [
      {
        prompt: `${v.path} の合計サイズを size.txt に書き出せ。`,
        conditions: [
          {
            label: 'size.txt があること',
            test: pathExists('size.txt'),
            howTo: 'ls で確かめられます',
          },
          {
            label: `size.txt に ${v.path} が含まれること`,
            test: (ctx) => {
              const node = ctx.shell.vfs.nodes.get(`${HOME}/size.txt`);
              return node?.kind === 'file' && node.content.includes(v.path);
            },
            howTo: 'du はパスも一緒に出します',
          },
        ],
        hints: ['-s で合計だけ、-h で読みやすい単位', `du -sh ${v.path} > size.txt`],
        explain: 'du は下を全部歩いて足す。大きな木では時間がかかるので、まず -s で当たりを付ける。',
      },
      {
        prompt: 'ファイルシステム全体の使用量も disk.txt に残せ。',
        check: 'disk.txt に Mounted on が含まれること',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/disk.txt`);
          return node?.kind === 'file' && node.content.includes('Mounted on');
        },
        hints: ['df -h > disk.txt'],
        explain:
          'du と df は別のものを数えている。両方を並べて初めて「消したのに戻らない」に気付ける。',
      },
    ],
  }),
});

export function kernel09(): MissionSource[] {
  return [...biggestDrills, ...truncateDrills, ...pressureDrills, ...reportDrills];
}

import { fileEquals } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/07';

/** その名前のプロセスがもう居ないか */
function processGone(needle: string) {
  return (ctx: AssertContext): boolean =>
    ![...ctx.shell.procs.processes.values()].some((p) => p.command.includes(needle));
}

function processAlive(needle: string) {
  return (ctx: AssertContext): boolean =>
    [...ctx.shell.procs.processes.values()].some((p) => p.command.includes(needle));
}

interface Culprit {
  slug: string;
  command: string;
  cpu: number;
  memory: number;
  bystander: string;
}

const CULPRITS: Culprit[] = [
  { slug: 'batch', command: 'java -jar report-batch.jar', cpu: 96.2, memory: 3072, bystander: 'nginx: worker process' },
  { slug: 'ffmpeg', command: 'ffmpeg -i in.mp4 out.mp4', cpu: 88.4, memory: 1200, bystander: 'sshd: listener' },
  { slug: 'rsync', command: 'rsync -a /data /backup', cpu: 74.9, memory: 400, bystander: 'cron' },
  { slug: 'mysqldump', command: 'mysqldump --all-databases', cpu: 81.1, memory: 900, bystander: 'nginx: worker process' },
  { slug: 'webpack', command: 'node webpack --watch', cpu: 92.0, memory: 2400, bystander: 'redis-server' },
  { slug: 'grepall', command: 'grep -R secret /', cpu: 99.1, memory: 120, bystander: 'sshd: listener' },
  { slug: 'python', command: 'python train.py', cpu: 97.5, memory: 5120, bystander: 'postgres: writer' },
  { slug: 'gzip', command: 'gzip -9 huge.tar', cpu: 85.0, memory: 300, bystander: 'cron' },
  { slug: 'find', command: 'find / -name core', cpu: 70.2, memory: 90, bystander: 'redis-server' },
  { slug: 'tar', command: 'tar czf backup.tar.gz /srv', cpu: 79.3, memory: 260, bystander: 'postgres: writer' },
];

/* ------------------------------------------------------------------ *
 * 1. 犯人を見つける
 * ------------------------------------------------------------------ */

const findDrills = family<Culprit>({
  track: 'kernel',
  chapterId: CH,
  family: 'find-hog',
  docs: [man('ps'), man('top')],
  variants: CULPRITS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `CPU を食っているのは誰か（${v.slug}）`,
    objectives: ['一覧を出せる', '多い順に並べられる', 'pid を取り出せる'],
    initial: {
      files: { [HOME]: null },
      cwd: HOME,
      processes: [
        { command: v.bystander, cpu: 1.2, memory: 64 },
        { command: v.command, cpu: v.cpu, memory: v.memory },
      ],
    },
    solution: [`pgrep ${v.command.split(' ')[0] ?? ''} > pid.txt`],
    steps: [
      {
        prompt: `いちばん CPU を食っているプロセスの pid を pid.txt に書き出せ。`,
        check: 'pid.txt に該当プロセスの pid が入っていること',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/pid.txt`);
          if (node?.kind !== 'file') return false;
          const target = [...ctx.shell.procs.processes.values()].find((p) => p.command === v.command);
          return target !== undefined && node.content.trim() === String(target.pid);
        },
        hints: [
          'ps aux で一覧、top で多い順に並ぶ',
          'pgrep <名前の一部> で pid だけを取れる',
          `pgrep ${v.command.split(' ')[0] ?? ''} > pid.txt`,
        ],
        explain:
          '名前が分かっているなら pgrep が速い。分からないときは top で並べて、上から読む。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. 止める（TERM と KILL の違い）
 * ------------------------------------------------------------------ */

const STUBBORN: { slug: string; value: { command: string; stubborn: boolean } }[] = [
  { slug: 'batch', value: { command: 'java -jar report-batch.jar', stubborn: false } },
  { slug: 'daemon', value: { command: 'stuck-daemon --no-exit', stubborn: true } },
  { slug: 'worker', value: { command: 'worker --queue=default', stubborn: false } },
  { slug: 'agent', value: { command: 'monitor-agent', stubborn: true } },
  { slug: 'sync', value: { command: 'sync-loop.sh', stubborn: false } },
  { slug: 'collector', value: { command: 'metrics-collector', stubborn: true } },
  { slug: 'indexer', value: { command: 'search-indexer', stubborn: false } },
  { slug: 'tailer', value: { command: 'log-tailer --follow', stubborn: true } },
];

const killDrills = family<{ command: string; stubborn: boolean }>({
  track: 'kernel',
  chapterId: CH,
  family: 'kill',
  docs: [man('kill'), man('signal', 7)],
  variants: STUBBORN,
  make: (v) => {
    const needle = v.command.split(' ')[0] ?? '';
    return {
      title: `${needle} を止める`,
      objectives: ['合図を送れる', 'TERM と KILL の違いが分かる', '止まったことを確かめられる'],
      initial: {
        files: { [HOME]: null },
        cwd: HOME,
        processes: [
          // 巻き添えを確かめるための無関係なプロセス。名前が的と重ならないものを選ぶ
          { command: 'sshd: listener', cpu: 1.0, memory: 64 },
          { command: v.command, cpu: 30, memory: 256, ignoresTerm: v.stubborn },
        ],
      },
      solution: v.stubborn
        ? [`pkill ${needle}`, `pkill -9 ${needle}`]
        : [`pkill ${needle}`],
      steps: v.stubborn
        ? [
            {
              prompt: `${needle} に穏やかに終わるよう伝えよ（SIGTERM）。`,
              check: 'SIGTERM を送った記録があること',
              assert: (ctx) => ctx.history.some((l) => /p?kill(?!\s+-9)/.test(l)),
              hints: ['pkill <名前> は既定で SIGTERM', `pkill ${needle}`],
              explain:
                'SIGTERM は「片付けて終わって」という依頼。受け取った側が無視することもできる。',
            },
            {
              prompt: '終わらないので、強制的に止めよ。',
              conditions: [
                {
                  label: `${needle} が居なくなっていること`,
                  test: processGone(needle),
                  howTo: 'ps aux で残っていないか確かめてください',
                },
                {
                  label: 'sshd は動いたままであること',
                  test: processAlive('sshd'),
                  howTo: '名前の一部が他とぶつかっていないか確かめてください',
                },
              ],
              hints: [
                'SIGKILL は無視できない',
                '-9 は SIGKILL の番号',
                `pkill -9 ${needle}`,
              ],
              explain:
                'SIGKILL はプロセスに届かない。カーネルが直接止めるので、片付けの処理は走らない。だから最後の手段。',
            },
          ]
        : [
            {
              prompt: `${needle} を止めよ。sshd は止めないこと。`,
              conditions: [
                {
                  label: `${needle} が居なくなっていること`,
                  test: processGone(needle),
                  howTo: 'ps aux で残っていないか確かめてください',
                },
                {
                  label: 'sshd は動いたままであること',
                  test: processAlive('sshd'),
                  howTo: '名前の一部が他とぶつかっていないか確かめてください',
                },
              ],
              hints: ['pgrep で pid を確かめる', 'pkill <名前> でまとめて送れる', `pkill ${needle}`],
              explain:
                'まずは SIGTERM。片付けの処理を走らせてから終わってもらうのが行儀のよい止め方。',
            },
          ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 3. 掴まれたファイルと容量
 * ------------------------------------------------------------------ */

const HELD: { slug: string; value: { log: string; holder: string } }[] = [
  { slug: 'app', value: { log: '/var/log/app.log', holder: 'app-server' } },
  { slug: 'access', value: { log: '/var/log/access.log', holder: 'nginx: worker process' } },
  { slug: 'query', value: { log: '/var/log/query.log', holder: 'postgres: logger' } },
  { slug: 'batch', value: { log: '/var/log/batch.log', holder: 'batch-runner' } },
  { slug: 'audit', value: { log: '/var/log/audit.log', holder: 'auditd' } },
  { slug: 'gc', value: { log: '/var/log/gc.log', holder: 'java -jar app.jar' } },
  { slug: 'sync', value: { log: '/var/log/sync.log', holder: 'sync-agent' } },
  { slug: 'debug', value: { log: '/var/log/debug.log', holder: 'debug-collector' } },
];

const heldDrills = family<{ log: string; holder: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'open-files',
  docs: [man('lsof', 8)],
  variants: HELD,
  make: (v) => {
    const needle = v.holder.split(' ')[0] ?? '';
    return {
      title: `${v.log} を消しても容量が戻らない`,
      objectives: ['掴んでいる相手を特定できる', '掴んだままだと戻らないと分かる', '正しい直し方が言える'],
      initial: {
        files: { [HOME]: null, '/var/log': null, [v.log]: 'x'.repeat(80_000) },
        cwd: HOME,
        processes: [{ command: v.holder, cpu: 5, memory: 128, openFiles: [v.log] }],
      },
      solution: [`lsof ${v.log} > holder.txt`, `pkill ${needle}`],
      steps: [
        {
          prompt: `${v.log} を掴んでいるのは誰か調べ、結果を holder.txt に残せ。`,
          check: `holder.txt に ${needle} が含まれること`,
          assert: (ctx) => {
            const node = ctx.shell.vfs.nodes.get(`${HOME}/holder.txt`);
            return node?.kind === 'file' && node.content.includes(needle);
          },
          hints: ['lsof <パス> で掴んでいるプロセスが出る', `lsof ${v.log} > holder.txt`],
          explain:
            'ファイルを消しても、開いているプロセスが居る限り実体は残る。ディレクトリから名前が消えるだけ。',
        },
        {
          prompt: '掴んでいるプロセスを止め、容量が戻るようにせよ。',
          check: `${needle} が居なくなっていること`,
          assert: processGone(needle),
          hints: [`pkill ${needle}`],
          explain:
            '本番では止めずに済ませたい。だからログは rm ではなく「中身を空にする」か、rotate して掴み直させるのが定石。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. 合図の名前と番号
 * ------------------------------------------------------------------ */

const SIGNALS: { slug: string; value: { name: string; number: string; what: string } }[] = [
  { slug: 'term', value: { name: 'SIGTERM', number: '15', what: '片付けて終わってほしい' } },
  { slug: 'kill', value: { name: 'SIGKILL', number: '9', what: '問答無用で止める' } },
  { slug: 'int', value: { name: 'SIGINT', number: '2', what: 'Ctrl-C と同じ' } },
  { slug: 'hup', value: { name: 'SIGHUP', number: '1', what: '設定を読み直させる' } },
  { slug: 'quit', value: { name: 'SIGQUIT', number: '3', what: 'コアを吐いて終わる' } },
];

const signalDrills = family<{ name: string; number: string; what: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'signals',
  docs: [man('signal', 7)],
  variants: SIGNALS,
  make: (v) => ({
    title: `${v.name} は何番か`,
    objectives: ['名前と番号が対応付けられる', 'それぞれの意味が言える'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`echo "${v.number}" > number.txt`, `echo "${v.what}" > meaning.txt`],
    steps: [
      {
        prompt: `${v.name} の番号を number.txt に書け。`,
        check: `number.txt の中身が ${v.number} であること`,
        assert: fileEquals('number.txt', v.number),
        hints: ['kill -<番号> の形で使う番号', `echo "${v.number}" > number.txt`],
        explain: '番号は移植性のために決まっている。名前で書くほうが読みやすいが、番号も現場では飛び交う。',
      },
      {
        prompt: `その合図が何を伝えるものかを meaning.txt に書け（「${v.what}」）。`,
        check: `meaning.txt の中身が ${v.what} であること`,
        assert: fileEquals('meaning.txt', v.what),
        hints: [`echo "${v.what}" > meaning.txt`],
        explain:
          '合図は「お願い」であって命令ではない。唯一の例外が SIGKILL と SIGSTOP で、これは受け取り側が拒めない。',
      },
    ],
  }),
});

export function kernel07(): MissionSource[] {
  return [...findDrills, ...killDrills, ...heldDrills, ...signalDrills];
}

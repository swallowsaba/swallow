import { concepts } from '../glossary';
import { commandsOf } from '../authoring/ran';
import { fileEquals } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';
import { FILE_STEMS, slugify } from './values';

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

const HEAVY = [
  'java -jar report-batch.jar', 'ffmpeg -i in.mp4 out.mp4', 'rsync -a /data /backup',
  'mysqldump --all-databases', 'node webpack --watch', 'grep -R secret /',
  'python train.py', 'gzip -9 huge.tar', 'find / -name core', 'tar czf backup.tar.gz /srv',
  'pg_dump -Fc app', 'clamscan -r /', 'go build ./...', 'cargo build --release',
  'convert big.tiff big.png', 'jq -s . huge.json', 'sort -S1G huge.csv', 'openssl speed',
];

const BYSTANDERS = ['sshd: listener', 'cron', 'redis-server', 'postgres: writer', 'chronyd'];

const CULPRITS: Culprit[] = HEAVY.map((command, i) => ({
  slug: slugify(command.split(' ')[0] ?? `p${String(i)}`) + `-${String(i)}`,
  command,
  cpu: 60 + ((i * 7) % 40),
  memory: 100 + ((i * 311) % 4000),
  bystander: BYSTANDERS[i % BYSTANDERS.length] ?? 'cron',
}));

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
    intro: {
      summary: 'ps や top で、CPU を一番使っているプロセスを見つける。',
      why:
        '「サーバが重い」と言われたら、まず誰が力を使っているかを見る。当て推量で再起動する前に、犯人を名指しできるようにする。',
      concepts: concepts('プロセス', 'PID'),
      commands: [
        { command: 'top', means: '動いているプロセスを、使っている量の順に見る' },
        { command: 'ps aux', means: 'すべてのプロセスを一覧で見る' },
        { command: 'pgrep <名前>', means: 'その名前のプロセスの PID を出す' },
      ],
    },
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

const TARGETS = [
  'report-batch', 'stuck-daemon', 'queue-worker', 'monitor-agent', 'sync-loop',
  'metrics-collector', 'search-indexer', 'log-tailer', 'mail-relay', 'thumb-maker',
  'cache-warmer', 'audit-shipper', 'trace-agent', 'backup-runner', 'feed-poller',
  'session-reaper',
];

const STUBBORN: { slug: string; value: { command: string; stubborn: boolean } }[] = TARGETS.map(
  (name, i) => ({
    slug: slugify(name),
    value: { command: `${name} --run`, stubborn: i % 2 === 1 },
  }),
);

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
      intro: {
        summary: 'シグナルを送ってプロセスを止める。まず穏やかに、だめなら強く。',
        why:
          'いきなり強制終了すると、書きかけのデータが壊れることがある。先に「片付けて終わって」と頼むのが作法。',
        concepts: concepts('プロセス', 'シグナル', 'SIGTERM', 'SIGKILL', 'PID'),
        commands: [
          { command: 'pkill <名前>', means: 'その名前のプロセスに SIGTERM を送る' },
          { command: 'pkill -9 <名前>', means: 'SIGKILL で今すぐ止める（最後の手段）' },
          { command: 'ps aux', means: '止まったか確かめる' },
        ],
      },
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
              assert: (ctx) =>
                ctx.history.some((l) =>
                  commandsOf(l).some(
                    (argv) =>
                      ['kill', 'pkill'].includes(argv[0] ?? '') &&
                      !argv.some((a) => ['-9', '-kill', '-sigkill', '-s9'].includes(a)),
                  ),
                ),
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

const HELD: { slug: string; value: { log: string; holder: string } }[] = FILE_STEMS.map(
  (stem, i) => ({
    slug: stem,
    value: { log: `/var/log/${stem}.log`, holder: `${stem}-writer-${String(i)}` },
  }),
);

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
      intro: {
        summary: '消したはずのファイルを、まだ誰が掴んでいるかを lsof で調べる。',
        why:
          'ログを rm したのにディスクが空かない、という事故はよく起きる。書き込んでいるプロセスがファイルを掴んだままだと、容量は戻らない。',
        concepts: concepts('ファイルを掴む', 'プロセス', 'ディスク'),
        commands: [
          { command: 'lsof <ファイル>', means: 'そのファイルを開いているプロセスを出す' },
          { command: 'df', means: 'ディスクの空きを見る' },
        ],
      },
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
    intro: {
      summary: 'シグナルの名前と番号の対応を調べる。',
      why:
        'kill -9 や kill -15 のように、シグナルは番号で指すことが多い。番号の意味を知らずに打つと、思わぬ止め方をしてしまう。',
      concepts: concepts('シグナル', 'SIGTERM', 'SIGKILL'),
      commands: [
        { command: 'kill -l', means: 'シグナルの名前と番号の一覧を出す' },
      ],
    },
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

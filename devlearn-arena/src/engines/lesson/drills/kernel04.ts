import { concepts } from '../glossary';
import { fileEquals, fileAbsent } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, bash, family, man } from './shared';
import { FILE_STEMS, slugify } from './values';

const CH = 'kernel/04';

/* ------------------------------------------------------------------ *
 * 1. > と >> の違い
 * ------------------------------------------------------------------ */

const APPEND_ROWS: [string, string, string][] = [
  ['run.log', 'started', 'finished'],
  ['todo.txt', 'first', 'second'],
  ['hosts.txt', 'web1', 'web2'],
  ['notes.md', 'day one', 'day two'],
  ['ids.txt', '1001', '1002'],
  ['steps.txt', 'build', 'deploy'],
  ['errors.txt', 'E01', 'E02'],
  ['members.txt', 'alice', 'bob'],
  ['urls.txt', 'https://a.example', 'https://b.example'],
  ['tags.txt', 'v1.0.0', 'v1.1.0'],
  ['zones.txt', 'zone-a', 'zone-b'],
  ['queue.txt', 'job-1', 'job-2'],
  ['nodes.txt', 'node-1', 'node-2'],
  ['stages.txt', 'canary', 'stable'],
  ['owners.txt', 'platform', 'payments'],
  ['flags.txt', 'off', 'on'],
];

const APPENDS: { slug: string; value: { file: string; first: string; second: string } }[] =
  APPEND_ROWS.map(([file = '', first = '', second = '']) => ({
    slug: slugify(file),
    value: { file, first, second },
  }));

const appendDrills = family<{ file: string; first: string; second: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'append',
  docs: [bash('Redirections', 'Redirections')],
  variants: APPENDS,
  make: (spec) => ({
    title: `${spec.file} に足していく`,
    intro: {
      summary: '>> で、ファイルの後ろに書き足していく。',
      why:
        '> は毎回ファイルを空にしてから書く。記録を積み上げたいのに > を使うと、前の記録が消える。2つの違いは事故の元なので、手で確かめておく。',
      concepts: concepts('リダイレクト'),
      commands: [
        { command: 'echo "文字" >> <ファイル>', means: '今の中身の後ろに1行足す' },
        { command: 'cat <ファイル>', means: '足されたか確かめる' },
      ],
    },
    objectives: ['> は書き直す', '>> は足す', '違いを結果で確かめられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `echo "${spec.first}" > ${spec.file}`,
      `echo "${spec.second}" >> ${spec.file}`,
    ],
    steps: [
      {
        prompt: `${spec.file} を作り、中身を「${spec.first}」だけにせよ。`,
        check: `${spec.file} の中身が ${spec.first} であること`,
        assert: fileEquals(spec.file, spec.first),
        hints: ['> は作り直す', `echo "${spec.first}" > ${spec.file}`],
        explain: '> は既にあれば中身を捨ててから書く。消えては困るファイルに向けると事故になる。',
      },
      {
        prompt: `続けて「${spec.second}」を書き足せ。先の行を消さないこと。`,
        check: `${spec.file} が ${spec.first} と ${spec.second} の 2 行であること`,
        assert: fileEquals(spec.file, `${spec.first}\n${spec.second}`),
        hints: ['>> は末尾に足す', `echo "${spec.second}" >> ${spec.file}`],
        explain: '> と >> はキー1つの違いで結果が正反対になる。ログを扱うときは特に気をつける。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. 標準出力と標準エラーを分ける
 * ------------------------------------------------------------------ */

const STREAMS: { slug: string; value: { missing: string } }[] = FILE_STEMS.map((stem) => ({
  slug: stem,
  value: { missing: `${stem}-missing.txt` },
}));

const streamDrills = family<{ missing: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'stderr',
  docs: [bash('Redirections', 'Redirections')],
  variants: STREAMS,
  make: (spec) => ({
    title: '誤りだけを別のファイルに分ける',
    intro: {
      summary: '2> で、エラーの知らせだけを別のファイルに分ける。',
      why:
        'コマンドの結果とエラーは、別々の口から出ている。分けて保存しておけば、大量の結果の中からエラーだけを探す手間がなくなる。',
      concepts: concepts('標準出力', '標準エラー', 'リダイレクト'),
      commands: [
        { command: '<コマンド> > out.txt 2> err.txt', means: '結果は out.txt へ、エラーは err.txt へ' },
        { command: '<コマンド> &> all.txt', means: '両方まとめて all.txt へ' },
      ],
    },
    objectives: ['1 と 2 の区別が付く', '誤りだけを取り置ける'],
    initial: {
      files: { [HOME]: null, [`${HOME}/there.txt`]: 'ここにある\n' },
      cwd: HOME,
    },
    solution: [
      `cat there.txt ${spec.missing} > out.txt 2> err.txt`,
    ],
    steps: [
      {
        prompt: `there.txt と ${spec.missing}（存在しない）をまとめて cat し、正しい出力は out.txt に、誤りは err.txt に分けて入れよ。`,
        conditions: [
          {
            label: 'out.txt に there.txt の中身が入っていること',
            test: fileEquals('out.txt', 'ここにある'),
            howTo: '> は標準出力（1番）を移します',
          },
          {
            label: 'err.txt に誤りの行が入っていること',
            test: (ctx) => {
              const node = ctx.shell.vfs.nodes.get(`${HOME}/err.txt`);
              return node?.kind === 'file' && node.content.includes(spec.missing);
            },
            howTo: '2> は標準エラー（2番）を移します',
          },
        ],
        hints: [
          '標準出力は 1 番、標準エラーは 2 番',
          '2> でエラーだけを別の行き先にできる',
          `cat there.txt ${spec.missing} > out.txt 2> err.txt`,
        ],
        explain:
          '正しい結果と誤りを別々の口から出すのは、次の処理に正しい結果だけを渡せるようにするため。画面では混ざって見えるだけ。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. パイプで繋ぐ
 * ------------------------------------------------------------------ */

interface PipeSpec {
  slug: string;
  rows: string[];
  needle: string;
}

const PIPE_NEEDLES = [
  'ERROR', 'WARN', 'web1', 'GET', 'fail', 'db', 'timeout', 'deny', 'v2', 'prod',
  'retry', 'stale', 'locked', 'reset', 'slow', 'drop',
];

const PIPES: PipeSpec[] = PIPE_NEEDLES.map((needle, i) => {
  const hits = 1 + (i % 4);
  const rows: string[] = [];
  for (let k = 0; k < 6 + (i % 5); k += 1) {
    rows.push(k % 2 === 0 && rows.filter((r) => r.includes(needle)).length < hits
      ? `${needle} line ${String(k)}`
      : `ok line ${String(k)}`);
  }
  while (rows.filter((r) => r.includes(needle)).length < hits) {
    rows.push(`${needle} extra ${String(rows.length)}`);
  }
  return { slug: slugify(needle), rows, needle };
});

const pipeDrills = family<PipeSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'pipe',
  docs: [bash('Pipelines', 'Pipelines')],
  variants: PIPES.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const body = `${spec.rows.join('\n')}\n`;
    const hits = spec.rows.filter((r) => r.includes(spec.needle));
    return {
      title: `${spec.needle} の件数を一本のパイプで数える`,
      intro: {
        summary: '| で小さなコマンドをつなげ、1本の流れで答えを出す。',
        why:
          '「探す」「数える」「並べる」を別々のファイルに書き出しながらやると、途中のファイルが散らかる。パイプでつなげば、一行で答えまでたどり着ける。',
        concepts: concepts('パイプ', '標準入力', '標準出力'),
        commands: [
          { command: 'grep <文字> <ファイル> | wc -l', means: '当たった行を、そのまま数える' },
        ],
      },
      objectives: ['パイプで繋げる', '中間ファイルを作らずに済ませられる'],
      initial: { files: { [HOME]: null, [`${HOME}/in.txt`]: body }, cwd: HOME },
      solution: [`cat in.txt | grep ${spec.needle} | wc -l > n.txt`],
      steps: [
        {
          prompt: `in.txt から ${spec.needle} を含む行の件数を数え、n.txt に書け。途中のファイルは作らないこと。`,
          conditions: [
            {
              label: `n.txt の中身が ${String(hits.length)} であること`,
              test: fileEquals('n.txt', String(hits.length)),
              howTo: 'wc -l に標準入力から渡すと、数だけが出ます',
            },
            {
              label: '途中のファイル（tmp.txt）を作っていないこと',
              test: fileAbsent('tmp.txt'),
              howTo: '一度ファイルに落とさず、| で次の道具へ直接渡します',
            },
          ],
          hints: [
            '| は左の出力を右の入力に繋ぐ',
            'grep で絞ってから wc -l で数える',
            `cat in.txt | grep ${spec.needle} | wc -l > n.txt`,
          ],
          explain:
            '小さな道具を繋いで大きな仕事にする。これが Unix の考え方で、途中の状態をファイルに落とさないぶん速く、壊れにくい。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. ヒアドキュメント
 * ------------------------------------------------------------------ */

const HEREDOC_ROWS: [string, string[]][] = [
  ['app.conf', ['host = 127.0.0.1', 'port = 8080']],
  ['hosts', ['10.0.0.1 web1', '10.0.0.2 web2']],
  ['README.md', ['# app', 'usage comes later']],
  ['.env', ['ENV=dev', 'DEBUG=1']],
  ['values.yaml', ['replicas: 2', 'image: nginx']],
  ['seed.sql', ['insert into t values (1);', 'insert into t values (2);']],
  ['RUNBOOK.md', ['1. look at the state', '2. write it down']],
  ['.gitignore', ['node_modules/', 'dist/']],
  ['nginx.conf', ['server {', '  listen 80;', '}']],
  ['Makefile', ['all:', '	go build ./...']],
  ['docker-compose.yml', ['services:', '  web:', '    image: nginx']],
  ['crontab', ['0 3 * * * /usr/local/bin/backup.sh']],
  ['sshd_config', ['PermitRootLogin no', 'PasswordAuthentication no']],
  ['resolv.conf', ['nameserver 10.0.0.53', 'search internal']],
  ['fstab', ['/dev/vda1 / ext4 defaults 0 1']],
  ['motd', ['welcome', 'be careful']],
];

const HEREDOCS: { slug: string; value: { file: string; lines: string[] } }[] = HEREDOC_ROWS.map(
  ([file = '', lines = []]) => ({ slug: slugify(file), value: { file, lines: [...lines] } }),
);

const heredocDrills = family<{ file: string; lines: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'heredoc',
  docs: [bash('Redirections', 'Here Documents')],
  variants: HEREDOCS,
  make: (spec) => ({
    title: `${spec.file} を複数行まとめて書く`,
    intro: {
      summary: 'ヒアドキュメントで、複数行のファイルを一度に書く。',
      why:
        '設定ファイルは何行にもなる。echo を何回も打つより、書きたい形そのままを流し込むほうが速くて間違いにくい。',
      concepts: concepts('ヒアドキュメント', 'リダイレクト'),
      commands: [
        { command: 'cat > <ファイル> <<EOF', means: 'ここから EOF の行までを、ファイルに書き込む' },
        { command: 'EOF', means: '書き込みの終わり。行の頭に単独で置く' },
      ],
    },
    objectives: ['ヒアドキュメントで複数行を渡せる', '終端の書き方が分かる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`cat > ${spec.file} <<EOF\n${spec.lines.join('\n')}\nEOF`],
    steps: [
      {
        prompt: `${spec.file} を作り、次の ${String(spec.lines.length)} 行を入れよ。\n${spec.lines.map((l) => `  ${l}`).join('\n')}`,
        check: `${spec.file} がその ${String(spec.lines.length)} 行であること`,
        assert: fileEquals(spec.file, spec.lines.join('\n')),
        hints: [
          '<<EOF で、EOF と書いた行までを流し込める',
          '終端の EOF は行頭に単独で置く',
          `cat > ${spec.file} <<EOF ... EOF`,
        ],
        explain:
          'echo を何度も打つより読みやすく、書いた形がそのまま入る。設定ファイルを手早く用意するときの定番。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 5. xargs で引数に変える
 * ------------------------------------------------------------------ */

const XARGS: { slug: string; value: { names: string[] } }[] = FILE_STEMS.map((stem, i) => ({
  slug: stem,
  value: {
    names: Array.from({ length: 2 + (i % 3) }, (_, k) => `${stem}${String(k + 1)}.tmp`),
  },
}));

const xargsDrills = family<{ names: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'xargs',
  docs: [man('xargs')],
  variants: XARGS,
  make: (spec) => {
    const files: Record<string, string | null> = { [HOME]: null, [`${HOME}/keep.txt`]: 'keep\n' };
    for (const name of spec.names) files[`${HOME}/${name}`] = 'x\n';
    return {
      title: '一覧を受け取って、まとめて消す',
      intro: {
        summary: 'xargs で、流れてきた一覧をまとめて別のコマンドに渡す。',
        why:
          'find で見つけた何十個ものファイルを、1つずつ rm するのは現実的でない。一覧をそのまま渡せれば一度で片付く。',
        concepts: concepts('パイプ', '引数'),
        commands: [
          { command: 'find . -name "*.tmp" | xargs rm', means: '見つかったファイルを全部 rm に渡して消す' },
        ],
      },
      objectives: ['標準入力を引数に変えられる', '消す対象を取り違えない'],
      initial: { files, cwd: HOME },
      solution: [
        `printf '${spec.names.join('\\n')}\\n' > list.txt`,
        'cat list.txt | xargs rm',
      ],
      steps: [
        {
          prompt: `list.txt には消すべきファイル名が並んでいる（作られていなければ自分で作れ）。その一覧に載っているものだけを消せ。keep.txt は残すこと。`,
          conditions: [
            ...spec.names.map((n) => ({
              label: `${n} が消えていること`,
              test: fileAbsent(n),
              howTo: 'xargs は受け取った行を引数として並べます',
            })),
            {
              label: 'keep.txt が残っていること',
              test: fileEquals('keep.txt', 'keep'),
              howTo: '一覧に無いものまで消していないか確かめてください',
            },
          ],
          hints: [
            'まず一覧を作る（printf や echo で書ける）',
            'xargs は標準入力を引数に変える',
            `printf '${spec.names.join('\\n')}\\n' > list.txt`,
            'cat list.txt | xargs rm',
          ],
          answer: `printf '${spec.names.join('\\n')}\\n' > list.txt && cat list.txt | xargs rm`,
          explain:
            'rm は標準入力を読まない。だから間に xargs を挟んで「引数」に変える。find と組にすると強力。',
        },
      ],
    };
  },
});

export function kernel04(): MissionSource[] {
  return [...appendDrills, ...streamDrills, ...pipeDrills, ...heredocDrills, ...xargsDrills];
}

import { fileEquals, fileAbsent } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, bash, family, man } from './shared';

const CH = 'kernel/04';

/* ------------------------------------------------------------------ *
 * 1. > と >> の違い
 * ------------------------------------------------------------------ */

const APPENDS: { slug: string; value: { file: string; first: string; second: string } }[] = [
  { slug: 'log', value: { file: 'run.log', first: 'started', second: 'finished' } },
  { slug: 'todo', value: { file: 'todo.txt', first: 'ログを見る', second: '記録を残す' } },
  { slug: 'hosts', value: { file: 'hosts.txt', first: 'web1', second: 'web2' } },
  { slug: 'notes', value: { file: 'notes.md', first: '# 一日目', second: '# 二日目' } },
  { slug: 'ids', value: { file: 'ids.txt', first: '1001', second: '1002' } },
  { slug: 'steps', value: { file: 'steps.txt', first: 'build', second: 'deploy' } },
  { slug: 'errors', value: { file: 'errors.txt', first: 'E01', second: 'E02' } },
  { slug: 'members', value: { file: 'members.txt', first: 'alice', second: 'bob' } },
  { slug: 'urls', value: { file: 'urls.txt', first: 'https://a.example', second: 'https://b.example' } },
  { slug: 'tags', value: { file: 'tags.txt', first: 'v1.0.0', second: 'v1.1.0' } },
];

const appendDrills = family<{ file: string; first: string; second: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'append',
  docs: [bash('Redirections', 'Redirections')],
  variants: APPENDS,
  make: (spec) => ({
    title: `${spec.file} に足していく`,
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

const STREAMS: { slug: string; value: { missing: string } }[] = [
  { slug: 'nope', value: { missing: 'nope.txt' } },
  { slug: 'absent', value: { missing: 'absent.conf' } },
  { slug: 'gone', value: { missing: 'gone.log' } },
  { slug: 'missing', value: { missing: 'missing.yaml' } },
  { slug: 'lost', value: { missing: 'lost.csv' } },
  { slug: 'unknown', value: { missing: 'unknown.json' } },
  { slug: 'typo', value: { missing: 'reamde.md' } },
  { slug: 'stale', value: { missing: 'stale.sql' } },
];

const streamDrills = family<{ missing: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'stderr',
  docs: [bash('Redirections', 'Redirections')],
  variants: STREAMS,
  make: (spec) => ({
    title: '誤りだけを別のファイルに分ける',
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

const PIPES: PipeSpec[] = [
  { slug: 'error', rows: ['INFO a', 'ERROR b', 'INFO c', 'ERROR d'], needle: 'ERROR' },
  { slug: 'warn', rows: ['WARN x', 'INFO y', 'WARN z'], needle: 'WARN' },
  { slug: 'web1', rows: ['web1 up', 'web2 up', 'web1 down'], needle: 'web1' },
  { slug: 'get', rows: ['GET /', 'POST /a', 'GET /b'], needle: 'GET' },
  { slug: 'fail', rows: ['ok 1', 'fail 2', 'fail 3'], needle: 'fail' },
  { slug: 'db', rows: ['db1 slow', 'web1 fast', 'db2 slow'], needle: 'db' },
  { slug: 'timeout', rows: ['timeout a', 'ok b', 'timeout c'], needle: 'timeout' },
  { slug: 'deny', rows: ['allow a', 'deny b', 'deny c'], needle: 'deny' },
  { slug: 'v2', rows: ['v1 old', 'v2 new', 'v2 newer'], needle: 'v2' },
  { slug: 'prod', rows: ['dev a', 'prod b', 'prod c'], needle: 'prod' },
];

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

const HEREDOCS: { slug: string; value: { file: string; lines: string[] } }[] = [
  { slug: 'conf', value: { file: 'app.conf', lines: ['host = 127.0.0.1', 'port = 8080'] } },
  { slug: 'hosts', value: { file: 'hosts', lines: ['10.0.0.1 web1', '10.0.0.2 web2'] } },
  { slug: 'readme', value: { file: 'README.md', lines: ['# app', '使い方はあとで書く'] } },
  { slug: 'env', value: { file: '.env', lines: ['ENV=dev', 'DEBUG=1'] } },
  { slug: 'yaml', value: { file: 'values.yaml', lines: ['replicas: 2', 'image: nginx'] } },
  { slug: 'sql', value: { file: 'seed.sql', lines: ['insert into t values (1);', 'insert into t values (2);'] } },
  { slug: 'runbook', value: { file: 'RUNBOOK.md', lines: ['1. 状態を見る', '2. 記録を残す'] } },
  { slug: 'ignore', value: { file: '.gitignore', lines: ['node_modules/', 'dist/'] } },
];

const heredocDrills = family<{ file: string; lines: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'heredoc',
  docs: [bash('Redirections', 'Here Documents')],
  variants: HEREDOCS,
  make: (spec) => ({
    title: `${spec.file} を複数行まとめて書く`,
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

const XARGS: { slug: string; value: { names: string[] } }[] = [
  { slug: 'three', value: { names: ['a.txt', 'b.txt', 'c.txt'] } },
  { slug: 'logs', value: { names: ['app.log', 'db.log'] } },
  { slug: 'confs', value: { names: ['a.conf', 'b.conf', 'c.conf'] } },
  { slug: 'tmp', value: { names: ['1.tmp', '2.tmp', '3.tmp'] } },
  { slug: 'bak', value: { names: ['x.bak', 'y.bak'] } },
  { slug: 'old', value: { names: ['old1.txt', 'old2.txt', 'old3.txt'] } },
  { slug: 'cache', value: { names: ['c1.cache', 'c2.cache'] } },
  { slug: 'dump', value: { names: ['a.dump', 'b.dump'] } },
];

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

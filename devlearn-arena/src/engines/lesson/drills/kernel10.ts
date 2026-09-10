import { fileContains, fileEquals } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/10';

/* ------------------------------------------------------------------ *
 * 1. まず再現させる
 * ------------------------------------------------------------------ */

interface SymptomSpec {
  slug: string;
  symptom: string;
  command: string;
  code: string;
  cause: string;
}

const SYMPTOMS: SymptomSpec[] = [
  {
    slug: 'no-file', symptom: 'ファイルが読めないと言われる',
    command: 'cat missing.txt', code: '1', cause: 'ファイルがない',
  },
  {
    slug: 'not-dir', symptom: 'ディレクトリに入れない',
    command: 'cd note.txt', code: '1', cause: 'ディレクトリではない',
  },
  {
    slug: 'no-command', symptom: 'コマンドが動かない',
    command: 'depoly', code: '127', cause: 'コマンドがない',
  },
  {
    slug: 'bad-mode', symptom: '権限が変えられない',
    command: 'chmod zzz note.txt', code: '1', cause: '指定の書き方が違う',
  },
  {
    slug: 'ls-missing', symptom: '一覧が出せない',
    command: 'ls nowhere', code: '2', cause: 'パスがない',
  },
  {
    slug: 'rm-missing', symptom: '消せないと言われる',
    command: 'rm nothing.txt', code: '1', cause: 'ファイルがない',
  },
];

const reproduceDrills = family<SymptomSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'reproduce',
  docs: [man('bash')],
  variants: SYMPTOMS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `「${v.symptom}」を再現して切り分ける`,
    objectives: ['症状を手元で再現できる', '終了コードで種類を見分けられる', '原因を言葉にできる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/note.txt`]: 'hello\n' },
      cwd: HOME,
    },
    solution: [
      `${v.command} 2> symptom.txt`,
      'echo $? > code.txt',
      `echo "${v.cause}" > cause.txt`,
    ],
    steps: [
      {
        prompt: `${v.command} を実行し、出た文句を symptom.txt に取り置け。`,
        check: 'symptom.txt が空でないこと',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/symptom.txt`);
          return node?.kind === 'file' && node.content.trim() !== '';
        },
        hints: ['誤りは標準エラーに出る', '2> で取り置ける', `${v.command} 2> symptom.txt`],
        explain:
          'まず再現させ、出た文言をそのまま保存する。記憶で語ると、直したかどうかが分からなくなる。',
      },
      {
        prompt: 'そのときの終了コードを code.txt に書け。',
        check: `code.txt の中身が ${v.code} であること`,
        assert: fileEquals('code.txt', v.code),
        hints: ['直前の終了コードは $?', 'echo $? > code.txt'],
        explain:
          '終了コードは種類を大づかみに教えてくれる。127 ならコマンドが無い、2 なら使い方が違う、といった当たりが付く。',
      },
      {
        prompt: `原因をひとことで cause.txt に書け（「${v.cause}」）。`,
        check: `cause.txt の中身が ${v.cause} であること`,
        assert: fileEquals('cause.txt', v.cause),
        hints: [`echo "${v.cause}" > cause.txt`],
        explain: '原因を一文で言えないうちは、まだ分かっていない。言葉にすることが切り分けの終わり。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. 半分に割って絞る
 * ------------------------------------------------------------------ */

const BISECTS: { slug: string; value: { total: number; broken: number } }[] = [
  { slug: 'l8-3', value: { total: 8, broken: 3 } },
  { slug: 'l8-6', value: { total: 8, broken: 6 } },
  { slug: 'l16-11', value: { total: 16, broken: 11 } },
  { slug: 'l16-2', value: { total: 16, broken: 2 } },
  { slug: 'l32-25', value: { total: 32, broken: 25 } },
  { slug: 'l32-7', value: { total: 32, broken: 7 } },
  { slug: 'l12-9', value: { total: 12, broken: 9 } },
  { slug: 'l20-14', value: { total: 20, broken: 14 } },
];

const bisectDrills = family<{ total: number; broken: number }>({
  track: 'kernel',
  chapterId: CH,
  family: 'narrow-down',
  docs: [man('grep')],
  variants: BISECTS,
  make: (v) => {
    const lines = Array.from({ length: v.total }, (_, i) =>
      i + 1 === v.broken ? `line-${String(i + 1)} BROKEN` : `line-${String(i + 1)} ok`,
    );
    return {
      title: `${String(v.total)} 行のどこが壊れているか`,
      objectives: ['一気に読まずに絞れる', '行番号で位置を言える'],
      initial: {
        files: { [HOME]: null, [`${HOME}/pipeline.log`]: `${lines.join('\n')}\n` },
        cwd: HOME,
      },
      solution: [`grep -n BROKEN pipeline.log | cut -d ':' -f 1 > line.txt`],
      steps: [
        {
          prompt: 'pipeline.log の中で壊れている行の番号を line.txt に書け。',
          check: `line.txt の中身が ${String(v.broken)} であること`,
          assert: fileEquals('line.txt', String(v.broken)),
          hints: [
            'grep -n を使うと行番号が付く',
            "cut -d ':' -f 1 で番号だけ取れる",
            `grep -n BROKEN pipeline.log | cut -d ':' -f 1 > line.txt`,
          ],
          explain:
            '長いものを頭から読まない。目印で絞る、範囲を半分にする、位置を数で言う。この三つが切り分けの型。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 3. エラーを最後まで読む
 * ------------------------------------------------------------------ */

interface StackSpec {
  slug: string;
  lines: string[];
  answer: string;
}

const STACKS: StackSpec[] = [
  {
    slug: 'nullptr',
    lines: [
      'Traceback (most recent call last):',
      '  File "app.py", line 10, in <module>',
      '  File "db.py", line 42, in connect',
      'ConnectionRefusedError: [Errno 111] Connection refused',
    ],
    answer: 'ConnectionRefusedError: [Errno 111] Connection refused',
  },
  {
    slug: 'timeout',
    lines: [
      'Error: request failed',
      '  at fetchUser (user.js:20)',
      '  at main (index.js:3)',
      'TimeoutError: exceeded 30s',
    ],
    answer: 'TimeoutError: exceeded 30s',
  },
  {
    slug: 'denied',
    lines: [
      'copying files...',
      'skipping /etc/shadow',
      'tar: /etc/shadow: Cannot open: Permission denied',
    ],
    answer: 'tar: /etc/shadow: Cannot open: Permission denied',
  },
  {
    slug: 'nospace',
    lines: ['writing chunk 1', 'writing chunk 2', 'dd: writing to out.img: No space left on device'],
    answer: 'dd: writing to out.img: No space left on device',
  },
  {
    slug: 'dns',
    lines: ['resolving api.internal', 'curl: (6) Could not resolve host: api.internal'],
    answer: 'curl: (6) Could not resolve host: api.internal',
  },
  {
    slug: 'oom',
    lines: ['starting worker', 'allocating buffers', 'Killed (out of memory)'],
    answer: 'Killed (out of memory)',
  },
];

const readErrorDrills = family<StackSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'read-the-error',
  docs: [man('grep')],
  variants: STACKS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: '本当の原因が書いてある行を取り出す',
    objectives: ['最後の行にこそ答えがあると分かる', '取り出して次に渡せる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/error.log`]: `${v.lines.join('\n')}\n` },
      cwd: HOME,
    },
    solution: ['tail -n 1 error.log > cause.txt'],
    steps: [
      {
        prompt: 'error.log のうち、原因が書いてある行だけを cause.txt に取り出せ。',
        check: `cause.txt が「${v.answer}」であること`,
        assert: fileEquals('cause.txt', v.answer),
        hints: [
          '積み上がった呼び出しの上のほうは経路にすぎない',
          '知りたいのはいちばん下の行',
          'tail -n 1 error.log > cause.txt',
        ],
        explain:
          'スタックトレースは「どこを通ったか」で、原因は末尾に一行で書いてあることが多い。上から読むと迷う。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 4. 対応記録を残す
 * ------------------------------------------------------------------ */

const RECORDS: { slug: string; value: { title: string; cause: string; fix: string } }[] = [
  { slug: 'disk', value: { title: 'ディスク逼迫', cause: 'ログが rotate されていなかった', fix: 'logrotate を日次で回す' } },
  { slug: 'oom', value: { title: 'メモリ不足', cause: 'バッチが一度に全件読んでいた', fix: '分割して読む' } },
  { slug: 'perm', value: { title: '権限不足', cause: 'デプロイで所有者が変わった', fix: 'デプロイ後に chown を入れる' } },
  { slug: 'dns', value: { title: '名前が引けない', cause: '解決先の設定が古かった', fix: '設定を配布し直す' } },
  { slug: 'cert', value: { title: '証明書切れ', cause: '自動更新が止まっていた', fix: '更新の監視を足す' } },
  { slug: 'runaway', value: { title: '暴走プロセス', cause: '終了条件の書き漏れ', fix: '上限時間を設ける' } },
];

const recordDrills = family<{ title: string; cause: string; fix: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'write-it-down',
  docs: [man('date')],
  variants: RECORDS,
  make: (v) => ({
    title: `${v.title} の対応記録を書く`,
    objectives: ['何が起きたかを書ける', '原因と再発防止を分けて書ける'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `printf '# ${v.title}\\n## 原因\\n${v.cause}\\n## 再発防止\\n${v.fix}\\n' > POSTMORTEM.md`,
    ],
    steps: [
      {
        prompt: `POSTMORTEM.md に、表題・原因・再発防止の3つを書け。原因は「${v.cause}」、再発防止は「${v.fix}」。`,
        conditions: [
          {
            label: `表題に ${v.title} が入っていること`,
            test: fileContains('POSTMORTEM.md', v.title),
            howTo: 'cat POSTMORTEM.md で確かめてください',
          },
          {
            label: '原因が書かれていること',
            test: fileContains('POSTMORTEM.md', v.cause),
            howTo: '「なぜ起きたか」を一文で書きます',
          },
          {
            label: '再発防止が書かれていること',
            test: fileContains('POSTMORTEM.md', v.fix),
            howTo: '「次に同じことが起きないために何を変えるか」を書きます',
          },
        ],
        hints: [
          'printf でまとめて書ける',
          'ヒアドキュメント（<<EOF）でもよい',
          `printf '# ${v.title}\\n## 原因\\n${v.cause}\\n## 再発防止\\n${v.fix}\\n' > POSTMORTEM.md`,
        ],
        explain:
          '記録は誰かを責めるためではなく、仕組みを変えるために書く。原因と再発防止を分けて書くと、次の手が具体的になる。',
      },
    ],
  }),
});

export function kernel10(): MissionSource[] {
  return [...reproduceDrills, ...bisectDrills, ...readErrorDrills, ...recordDrills];
}

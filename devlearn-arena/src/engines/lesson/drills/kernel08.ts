import { fileContains, fileEquals, fileExists, pathExists } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import { metaOf } from '@/engines/kernel/vfs';
import { resolve } from '@/engines/kernel/path';
import { HOME, bash, family, man } from './shared';

const CH = 'kernel/08';

function executable(path: string) {
  return (ctx: AssertContext): boolean =>
    (metaOf(ctx.shell.vfs, resolve(ctx.shell.cwd, path)).mode & 0o100) !== 0;
}

/* ------------------------------------------------------------------ *
 * 1. 実行できるスクリプトにする
 * ------------------------------------------------------------------ */

const SCRIPTS: { slug: string; value: { name: string; body: string } }[] = [
  { slug: 'hello', value: { name: 'hello.sh', body: 'echo hello' } },
  { slug: 'backup', value: { name: 'backup.sh', body: 'echo backing up' } },
  { slug: 'deploy', value: { name: 'deploy.sh', body: 'echo deploying' } },
  { slug: 'check', value: { name: 'check.sh', body: 'echo checking' } },
  { slug: 'rotate', value: { name: 'rotate.sh', body: 'echo rotating' } },
  { slug: 'clean', value: { name: 'clean.sh', body: 'echo cleaning' } },
  { slug: 'notify', value: { name: 'notify.sh', body: 'echo notifying' } },
  { slug: 'report', value: { name: 'report.sh', body: 'echo reporting' } },
  { slug: 'restore', value: { name: 'restore.sh', body: 'echo restoring' } },
  { slug: 'warmup', value: { name: 'warmup.sh', body: 'echo warming up' } },
];

const scriptDrills = family<{ name: string; body: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'first-script',
  docs: [bash('Shell-Scripts', 'Shell Scripts'), man('chmod')],
  variants: SCRIPTS,
  make: (v) => ({
    title: `${v.name} を実行できる形にする`,
    objectives: ['shebang を書ける', '実行権を付けられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `printf '#!/bin/sh\\n${v.body}\\n' > ${v.name}`,
      `chmod +x ${v.name}`,
    ],
    steps: [
      {
        prompt: `${v.name} を作り、1 行目に #!/bin/sh、2 行目に ${v.body} を書け。`,
        conditions: [
          {
            label: `${v.name} があること`,
            test: fileExists(v.name),
            howTo: 'ls で確かめられます',
          },
          {
            label: '1 行目が #!/bin/sh であること',
            test: (ctx) => {
              const node = ctx.shell.vfs.nodes.get(`${HOME}/${v.name}`);
              return node?.kind === 'file' && node.content.split('\n')[0] === '#!/bin/sh';
            },
            howTo: 'head -n 1 で先頭行を確かめてください',
          },
          {
            label: `${v.body} が入っていること`,
            test: fileContains(v.name, v.body),
            howTo: 'cat で中身を確かめてください',
          },
        ],
        hints: [
          'printf なら改行入りをまとめて書ける',
          'ヒアドキュメント（<<EOF）でもよい',
          `printf '#!/bin/sh\\n${v.body}\\n' > ${v.name}`,
        ],
        explain:
          '#! はカーネルが読む印。この行があると、どの実行系で走らせるかがファイル自身に書いてあることになる。',
      },
      {
        prompt: `${v.name} に実行権を付けよ。`,
        check: `${v.name} に実行権が付いていること`,
        assert: executable(v.name),
        hints: ['chmod +x <ファイル>', `chmod +x ${v.name}`],
        explain:
          '中身が正しくても x が無いと Permission denied になる。「書いたのに動かない」の最頻出の原因。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. 終了コード
 * ------------------------------------------------------------------ */

const EXITS: { slug: string; value: { command: string; code: string } }[] = [
  { slug: 'true', value: { command: 'true', code: '0' } },
  { slug: 'false', value: { command: 'false', code: '1' } },
  { slug: 'missing-file', value: { command: 'cat nope.txt', code: '1' } },
  { slug: 'unknown-command', value: { command: 'nosuchcmd', code: '127' } },
  { slug: 'grep-hit', value: { command: 'grep a there.txt', code: '0' } },
  { slug: 'grep-miss', value: { command: 'grep zzz there.txt', code: '1' } },
  { slug: 'ls-ok', value: { command: 'ls there.txt', code: '0' } },
  { slug: 'ls-missing', value: { command: 'ls nope.txt', code: '2' } },
];

const exitDrills = family<{ command: string; code: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'exit-code',
  docs: [bash('Exit-Status', 'Exit Status')],
  variants: EXITS,
  make: (v) => ({
    title: `${v.command} の終了コードは何か`,
    objectives: ['$? で直前の結果を読める', '0 が成功だと分かる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/there.txt`]: 'a\n' },
      cwd: HOME,
    },
    solution: [v.command, 'echo $? > code.txt'],
    steps: [
      {
        prompt: `${v.command} を実行せよ。`,
        check: `${v.command} を実行した記録があること`,
        assert: (ctx) => ctx.history.some((l) => l.trim() === v.command),
        hints: [v.command],
        explain: '結果そのものより、終わり方（成功か失敗か）を見るのがここでの狙い。',
      },
      {
        prompt: 'その終了コードを code.txt に書き出せ。',
        check: `code.txt の中身が ${v.code} であること`,
        assert: fileEquals('code.txt', v.code),
        hints: ['$? に直前の終了コードが入る', 'echo $? > code.txt'],
        explain:
          '0 が成功、それ以外が失敗。127 は「コマンドが見つからない」、126 は「実行できない」と決まっている。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. && と || で繋ぐ
 * ------------------------------------------------------------------ */

const CHAINS: { slug: string; value: { ok: boolean; marker: string } }[] = [
  { slug: 'ok-and', value: { ok: true, marker: 'went' } },
  { slug: 'ng-and', value: { ok: false, marker: 'skipped' } },
  { slug: 'ok-build', value: { ok: true, marker: 'built' } },
  { slug: 'ng-build', value: { ok: false, marker: 'not-built' } },
  { slug: 'ok-deploy', value: { ok: true, marker: 'deployed' } },
  { slug: 'ng-deploy', value: { ok: false, marker: 'rolled-back' } },
  { slug: 'ok-test', value: { ok: true, marker: 'tested' } },
  { slug: 'ng-test', value: { ok: false, marker: 'failed' } },
];

const chainDrills = family<{ ok: boolean; marker: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'and-or',
  docs: [bash('Lists', 'Lists of Commands')],
  variants: CHAINS,
  make: (v) => ({
    title: v.ok ? '成功したときだけ次へ進む' : '失敗したときだけ後始末する',
    objectives: ['&& と || の分かれ方が分かる', '結果で確かめられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: v.ok
      ? [`true && echo "${v.marker}" > result.txt`]
      : [`false || echo "${v.marker}" > result.txt`],
    steps: [
      {
        prompt: v.ok
          ? `true が成功したときだけ result.txt に「${v.marker}」と書け。&& を使うこと。`
          : `false が失敗したときだけ result.txt に「${v.marker}」と書け。|| を使うこと。`,
        conditions: [
          {
            label: `result.txt の中身が ${v.marker} であること`,
            test: fileEquals('result.txt', v.marker),
            howTo: 'cat result.txt で確かめてください',
          },
          {
            label: v.ok ? '&& を使っていること' : '|| を使っていること',
            test: (ctx) => ctx.history.some((l) => l.includes(v.ok ? '&&' : '||')),
            howTo: v.ok
              ? '&& は左が成功したときだけ右を走らせます'
              : '|| は左が失敗したときだけ右を走らせます',
          },
        ],
        hints: [
          v.ok ? 'A && B は A が成功したときだけ B' : 'A || B は A が失敗したときだけ B',
          v.ok
            ? `true && echo "${v.marker}" > result.txt`
            : `false || echo "${v.marker}" > result.txt`,
        ],
        explain:
          '&& と || は終了コードだけを見ている。だから「失敗したら止める」処理が1行で書ける。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 4. 引数を受け取る
 * ------------------------------------------------------------------ */

const ARGS: { slug: string; value: { name: string; arg: string } }[] = [
  { slug: 'greet', value: { name: 'greet.sh', arg: 'alice' } },
  { slug: 'ping', value: { name: 'ping.sh', arg: 'web1' } },
  { slug: 'tag', value: { name: 'tag.sh', arg: 'v1.2.3' } },
  { slug: 'env', value: { name: 'env.sh', arg: 'staging' } },
  { slug: 'zone', value: { name: 'zone.sh', arg: 'ap-northeast-1a' } },
  { slug: 'team', value: { name: 'team.sh', arg: 'payments' } },
  { slug: 'branch', value: { name: 'branch.sh', arg: 'main' } },
  { slug: 'ns', value: { name: 'ns.sh', arg: 'kube-system' } },
];

const argDrills = family<{ name: string; arg: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'arguments',
  docs: [bash('Shell-Parameters', 'Positional Parameters')],
  variants: ARGS,
  make: (v) => ({
    title: `${v.name} に引数を渡して動かす`,
    objectives: ['$1 で引数を受け取れる', '実行して結果を確かめられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `printf '#!/bin/sh\\necho "$1"\\n' > ${v.name}`,
      `chmod +x ${v.name}`,
      `./${v.name} ${v.arg} > out.txt`,
    ],
    steps: [
      {
        prompt: `${v.name} を作れ。中身は受け取った 1 つ目の引数をそのまま出すだけでよい。`,
        check: `${v.name} に $1 を出す行があること`,
        assert: fileContains(v.name, '$1'),
        hints: ['$1 が 1 つ目の引数', `printf '#!/bin/sh\\necho "$1"\\n' > ${v.name}`],
        explain: '$0 はスクリプト自身の名前、$1 から先が引数、$# は個数、$@ は全部。',
      },
      {
        prompt: '実行権を付けよ。',
        check: `${v.name} に実行権が付いていること`,
        assert: executable(v.name),
        hints: [`chmod +x ${v.name}`],
        explain: 'ここを忘れると Permission denied になる。',
      },
      {
        prompt: `${v.arg} を渡して実行し、出力を out.txt に入れよ。`,
        check: `out.txt の中身が ${v.arg} であること`,
        assert: fileEquals('out.txt', v.arg),
        hints: [
          'いまの場所のスクリプトは ./ を付けて呼ぶ',
          `./${v.name} ${v.arg} > out.txt`,
        ],
        explain:
          './ を付けるのは、PATH にいまの場所が入っていないから。入れないのは、紛らわしい名前の実行ファイルを踏まないため。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 5. 手順書をスクリプトに落とす
 * ------------------------------------------------------------------ */

const RUNBOOKS: { slug: string; value: { name: string; steps: string[] } }[] = [
  { slug: 'rotate', value: { name: 'rotate.sh', steps: ['mkdir -p archive', 'mv app.log archive/'] } },
  { slug: 'setup', value: { name: 'setup.sh', steps: ['mkdir -p config', 'echo ready > config/state'] } },
  { slug: 'collect', value: { name: 'collect.sh', steps: ['mkdir -p out', 'cp app.log out/'] } },
  { slug: 'seal', value: { name: 'seal.sh', steps: ['mkdir -p sealed', 'mv app.log sealed/'] } },
  { slug: 'stage', value: { name: 'stage.sh', steps: ['mkdir -p stage', 'cp app.log stage/'] } },
  { slug: 'snapshot', value: { name: 'snapshot.sh', steps: ['mkdir -p snap', 'cp app.log snap/'] } },
];

const runbookDrills = family<{ name: string; steps: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'runbook',
  docs: [bash('Shell-Scripts', 'Shell Scripts')],
  variants: RUNBOOKS,
  make: (v) => {
    const target = v.steps[1]?.split(' ').pop() ?? '';
    const dir = target.replace(/\/$/, '');
    return {
      title: `手順を ${v.name} にまとめる`,
      objectives: ['手順を1本にまとめられる', '何度流しても同じ結果になる'],
      initial: {
        files: { [HOME]: null, [`${HOME}/app.log`]: 'log\n' },
        cwd: HOME,
      },
      solution: [
        `printf '#!/bin/sh\\n${v.steps.join('\\n')}\\n' > ${v.name}`,
        `chmod +x ${v.name}`,
        `./${v.name}`,
      ],
      steps: [
        {
          prompt: `${v.name} に次の手順を順番に書け。\n${v.steps.map((s) => `  ${s}`).join('\n')}`,
          conditions: v.steps.map((line) => ({
            label: `${line} が入っていること`,
            test: fileContains(v.name, line),
            howTo: `cat ${v.name} で中身を確かめてください`,
          })),
          hints: [
            'printf でまとめて書ける',
            `printf '#!/bin/sh\\n${v.steps.join('\\n')}\\n' > ${v.name}`,
          ],
          explain:
            '手順を書き留めた瞬間に、それは再現できる作業になる。人が読む手順書と、機械が読む手順書は、できるだけ同じものにする。',
        },
        {
          prompt: '実行権を付けよ。',
          check: `${v.name} に実行権が付いていること`,
          assert: executable(v.name),
          hints: [`chmod +x ${v.name}`],
          explain: '書いただけでは動かない。',
        },
        {
          prompt: '実行して、結果を確かめよ。',
          check: `${dir} ができていること`,
          assert: pathExists(dir),
          hints: [`./${v.name}`],
          explain:
            'mkdir -p を使っているので、二度流しても壊れない。何度流しても同じ結果になることを冪等という。',
        },
      ],
    };
  },
});

export function kernel08(): MissionSource[] {
  return [...scriptDrills, ...exitDrills, ...chainDrills, ...argDrills, ...runbookDrills];
}

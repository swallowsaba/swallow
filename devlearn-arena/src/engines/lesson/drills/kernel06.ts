import { fileEquals, ranMatching } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import { formatOctal } from '@/engines/kernel/perm';
import { metaOf } from '@/engines/kernel/vfs';
import { resolve } from '@/engines/kernel/path';
import type { MissionSpec } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/06';

/** そのパスの権限が期待どおりか */
function modeIs(path: string, octal: string) {
  return (ctx: AssertContext): boolean =>
    formatOctal(metaOf(ctx.shell.vfs, resolve(ctx.shell.cwd, path)).mode) === octal;
}

function ownerIs(path: string, owner: string) {
  return (ctx: AssertContext): boolean =>
    metaOf(ctx.shell.vfs, resolve(ctx.shell.cwd, path)).owner === owner;
}

/* ------------------------------------------------------------------ *
 * 1. rwx の並びを読む
 * ------------------------------------------------------------------ */

const READINGS: { slug: string; value: { octal: string; answer: string } }[] = [
  { slug: '644', value: { octal: '644', answer: 'rw-r--r--' } },
  { slug: '755', value: { octal: '755', answer: 'rwxr-xr-x' } },
  { slug: '600', value: { octal: '600', answer: 'rw-------' } },
  { slug: '640', value: { octal: '640', answer: 'rw-r-----' } },
  { slug: '700', value: { octal: '700', answer: 'rwx------' } },
  { slug: '444', value: { octal: '444', answer: 'r--r--r--' } },
  { slug: '775', value: { octal: '775', answer: 'rwxrwxr-x' } },
  { slug: '666', value: { octal: '666', answer: 'rw-rw-rw-' } },
  { slug: '711', value: { octal: '711', answer: 'rwx--x--x' } },
  { slug: '750', value: { octal: '750', answer: 'rwxr-x---' } },
];

const readingDrills = family<{ octal: string; answer: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'read-mode',
  docs: [man('chmod'), man('stat')],
  variants: READINGS,
  make: (spec) => ({
    title: `${spec.octal} は rwx でどう書くか`,
    objectives: ['8 進数と記号を行き来できる', '実際の表示で確かめられる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/target.txt`]: 'x\n' },
      cwd: HOME,
    },
    solution: [
      `chmod ${spec.octal} target.txt`,
      `echo "${spec.answer}" > answer.txt`,
    ],
    steps: [
      {
        prompt: `target.txt の権限を ${spec.octal} にせよ。`,
        check: `target.txt の権限が ${spec.octal} であること`,
        assert: modeIs('target.txt', spec.octal),
        hints: ['chmod <8進数> <ファイル>', `chmod ${spec.octal} target.txt`],
        explain: '3 桁はそれぞれ所有者・グループ・その他。r=4, w=2, x=1 を足した数。',
      },
      {
        prompt: `その権限は rwx の並びでどう表示されるか。答えを answer.txt に書け。`,
        check: `answer.txt の中身が ${spec.answer} であること`,
        assert: fileEquals('answer.txt', spec.answer),
        hints: [
          'ls -l か stat で実際の表示が見える',
          '先頭の d/- は種別なので、9 文字だけを書く',
          `echo "${spec.answer}" > answer.txt`,
        ],
        explain:
          '暗記するより、ls -l で見て確かめる癖をつけるほうが速い。読めることが目的で、書けることはその結果。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. 記号で足し引きする
 * ------------------------------------------------------------------ */

const SYMBOLIC: { slug: string; value: { from: string; spec: string; to: string } }[] = [
  { slug: 'u-plus-x', value: { from: '644', spec: 'u+x', to: '744' } },
  { slug: 'go-minus-r', value: { from: '644', spec: 'go-r', to: '600' } },
  { slug: 'a-equals-r', value: { from: '755', spec: 'a=r', to: '444' } },
  { slug: 'plus-x', value: { from: '644', spec: '+x', to: '755' } },
  { slug: 'g-plus-w', value: { from: '644', spec: 'g+w', to: '664' } },
  { slug: 'o-minus-all', value: { from: '777', spec: 'o-rwx', to: '770' } },
  { slug: 'u-equals-rw', value: { from: '755', spec: 'u=rw', to: '655' } },
  { slug: 'g-equals-none', value: { from: '640', spec: 'g=', to: '600' } },
  { slug: 'ug-plus-x', value: { from: '600', spec: 'ug+x', to: '710' } },
  { slug: 'a-minus-w', value: { from: '666', spec: 'a-w', to: '444' } },
];

const symbolicDrills = family<{ from: string; spec: string; to: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'chmod-symbolic',
  docs: [man('chmod')],
  variants: SYMBOLIC,
  make: (v) => ({
    title: `${v.from} に ${v.spec} を当てると何になるか`,
    objectives: ['記号での指定が読める', '結果を予想して確かめられる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/target.txt`]: 'x\n' },
      cwd: HOME,
    },
    solution: [`chmod ${v.from} target.txt`, `chmod ${v.spec} target.txt`],
    steps: [
      {
        prompt: `まず target.txt を ${v.from} にせよ。`,
        check: `target.txt の権限が ${v.from} であること`,
        assert: modeIs('target.txt', v.from),
        hints: ['8 進数で指定する', `chmod ${v.from} target.txt`],
        explain: '出発点を揃えてから記号で動かすと、何が変わったのかが分かる。',
      },
      {
        prompt: `そこに ${v.spec} を当てよ。`,
        check: `target.txt の権限が ${v.to} になること`,
        assert: modeIs('target.txt', v.to),
        hints: [
          'u=所有者 g=グループ o=その他 a=全部',
          '+ は足す、- は引く、= は置き換える',
          `chmod ${v.spec} target.txt`,
        ],
        explain:
          '記号での指定は「いまの権限からの差分」。だから同じ指定でも出発点が違えば結果が変わる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. 読めない・入れないを直す
 * ------------------------------------------------------------------ */

const BROKEN: { slug: string; value: { kind: 'file' | 'dir'; name: string } }[] = [
  { slug: 'secret-file', value: { kind: 'file', name: 'secret.txt' } },
  { slug: 'config-file', value: { kind: 'file', name: 'app.conf' } },
  { slug: 'key-file', value: { kind: 'file', name: 'id_key' } },
  { slug: 'data-file', value: { kind: 'file', name: 'data.csv' } },
  { slug: 'vault-dir', value: { kind: 'dir', name: 'vault' } },
  { slug: 'logs-dir', value: { kind: 'dir', name: 'logs' } },
  { slug: 'certs-dir', value: { kind: 'dir', name: 'certs' } },
  { slug: 'backup-dir', value: { kind: 'dir', name: 'backup' } },
];

const fixDrills = family<{ kind: 'file' | 'dir'; name: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'permission-denied',
  docs: [man('chmod')],
  variants: BROKEN,
  make: (v): Omit<MissionSpec, 'id' | 'track' | 'chapterId' | 'docs'> => {
    if (v.kind === 'file') {
      return {
        title: `${v.name} が読めない`,
        objectives: ['断られた理由を権限から説明できる', '最小限だけ開ける'],
        initial: {
          files: { [HOME]: null, [`${HOME}/${v.name}`]: 'the answer is 42\n' },
          cwd: HOME,
          vars: { PREPARE: '1' },
        },
        solution: [`chmod 000 ${v.name}`, `chmod 600 ${v.name}`, `cat ${v.name} > read.txt`],
        steps: [
          {
            prompt: `まず ${v.name} を誰も読めない状態（000）にして、症状を再現せよ。`,
            check: `${v.name} の権限が 000 であること`,
            assert: modeIs(v.name, '000'),
            hints: ['chmod 000 で全ての権限を落とせる', `chmod 000 ${v.name}`],
            explain: '直す前に、まず再現させる。再現しないものは直したかどうか分からない。',
          },
          {
            prompt: `所有者だけが読み書きできる状態（600）に戻せ。`,
            check: `${v.name} の権限が 600 であること`,
            assert: modeIs(v.name, '600'),
            hints: ['600 は所有者の rw だけ', `chmod 600 ${v.name}`],
            explain:
              '困ったからと 777 にしない。必要な人に必要なぶんだけ、が事故を減らす唯一の方法。',
          },
          {
            prompt: `読めるようになったことを確かめ、中身を read.txt に写せ。`,
            check: 'read.txt の中身が the answer is 42 であること',
            assert: fileEquals('read.txt', 'the answer is 42'),
            hints: [`cat ${v.name} > read.txt`],
            explain: '直したと思ったら、実際に困っていた操作でもう一度確かめる。',
          },
        ],
      };
    }
    return {
      title: `${v.name}/ に入れない`,
      objectives: ['ディレクトリの x が何を許すか分かる', '読みと実行の違いが説明できる'],
      initial: {
        files: {
          [HOME]: null,
          [`${HOME}/${v.name}`]: null,
          [`${HOME}/${v.name}/inside.txt`]: 'inside\n',
        },
        cwd: HOME,
      },
      solution: [`chmod 600 ${v.name}`, `chmod 700 ${v.name}`, `cd ${v.name}`],
      steps: [
        {
          prompt: `${v.name} を 600 にして、入れない状態を作れ。`,
          check: `${v.name} の権限が 600 であること`,
          assert: modeIs(v.name, '600'),
          hints: ['読めるが入れない、という状態を作る', `chmod 600 ${v.name}`],
          explain:
            'ディレクトリの r は「名前を一覧できる」、x は「中を辿れる」。別々の権限で、片方だけでは足りない。',
        },
        {
          prompt: `入れるように 700 へ直せ。`,
          check: `${v.name} の権限が 700 であること`,
          assert: modeIs(v.name, '700'),
          hints: ['x を足す', `chmod 700 ${v.name}`],
          explain: 'ディレクトリに x が無いと、中のファイル名が見えても開けない。',
        },
        {
          prompt: `実際に ${v.name}/ へ入れることを確かめよ。`,
          check: `${v.name} へ cd した記録があること`,
          assert: ranMatching(new RegExp(`cd\\s+${v.name}`)),
          hints: [`cd ${v.name}`],
          explain: '権限の話は、実際にその操作をして初めて確かめたことになる。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. 所有者と sudo
 * ------------------------------------------------------------------ */

const OWNERS: { slug: string; value: string }[] = [
  { slug: 'app-conf', value: 'app.conf' },
  { slug: 'service-unit', value: 'app.service' },
  { slug: 'nginx-conf', value: 'nginx.conf' },
  { slug: 'cron', value: 'crontab' },
  { slug: 'sudoers', value: 'sudoers' },
  { slug: 'hosts', value: 'hosts' },
  { slug: 'resolv', value: 'resolv.conf' },
  { slug: 'motd', value: 'motd' },
];

const ownerDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'owner-sudo',
  docs: [man('chown'), man('sudo', 8)],
  variants: OWNERS,
  make: (name) => ({
    title: `${name} を root のものにする`,
    objectives: ['所有者を変えられるのは root だけ', 'sudo が何をしているか分かる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/${name}`]: 'setting\n' },
      cwd: HOME,
    },
    solution: [`sudo chown root:root ${name}`, `stat ${name} > owner.txt`],
    steps: [
      {
        prompt: `${name} の所有者を root にせよ。`,
        check: `${name} の所有者が root であること`,
        assert: ownerIs(name, 'root'),
        hints: [
          'そのまま chown すると Operation not permitted になる',
          'sudo を頭に付けると root として実行できる',
          `sudo chown root:root ${name}`,
        ],
        explain:
          '所有者を他人に渡せるのは root だけ。誰でも渡せると、容量制限や責任の所在が壊れるため。',
      },
      {
        prompt: `結果を stat で確かめ、owner.txt に残せ。`,
        check: 'owner.txt に root が含まれること',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/owner.txt`);
          return node?.kind === 'file' && node.content.includes('root');
        },
        hints: [`stat ${name} > owner.txt`],
        explain: '変えたら確かめる。特に権限まわりは、思い込みで進めると後で高く付く。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 5. umask
 * ------------------------------------------------------------------ */

const UMASKS: { slug: string; value: { mask: string; file: string; dir: string } }[] = [
  { slug: '022', value: { mask: '022', file: '644', dir: '755' } },
  { slug: '077', value: { mask: '077', file: '600', dir: '700' } },
  { slug: '002', value: { mask: '002', file: '664', dir: '775' } },
  { slug: '027', value: { mask: '027', file: '640', dir: '750' } },
  { slug: '007', value: { mask: '007', file: '660', dir: '770' } },
  { slug: '066', value: { mask: '066', file: '600', dir: '711' } },
  { slug: '044', value: { mask: '044', file: '622', dir: '733' } },
  { slug: '037', value: { mask: '037', file: '640', dir: '740' } },
];

const umaskDrills = family<{ mask: string; file: string; dir: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'umask',
  docs: [man('umask', 2)],
  variants: UMASKS,
  make: (v) => ({
    title: `umask ${v.mask} の下で作るとどうなるか`,
    objectives: ['umask が新しいものに効くと分かる', '既にあるものには効かないと分かる'],
    initial: {
      files: { [HOME]: null, [`${HOME}/before.txt`]: 'old\n' },
      cwd: HOME,
    },
    solution: [`umask ${v.mask}`, 'touch after.txt', 'mkdir afterdir'],
    steps: [
      {
        prompt: `umask を ${v.mask} にせよ。`,
        check: `umask が ${v.mask} であること`,
        assert: (ctx) => (ctx.shell.vars.get('UMASK') ?? '022') === v.mask,
        hints: ['umask <8進数>', `umask ${v.mask}`],
        explain: 'umask は「落とす権限」。作るときの既定値から、この分を引く。',
      },
      {
        prompt: 'その状態で after.txt を作れ。',
        conditions: [
          {
            label: `after.txt の権限が ${v.file} であること`,
            test: modeIs('after.txt', v.file),
            howTo: 'stat after.txt で確かめられます',
          },
          {
            label: 'before.txt は 644 のままであること',
            test: modeIs('before.txt', '644'),
            howTo: 'umask は既にあるものには効きません',
          },
        ],
        hints: ['touch after.txt'],
        explain:
          'ファイルの既定は 666、ディレクトリは 777。そこから umask を引いた値になる。ファイルに x が付かないのはこのため。',
      },
      {
        prompt: '同じ状態で afterdir/ も作れ。',
        check: `afterdir の権限が ${v.dir} であること`,
        assert: modeIs('afterdir', v.dir),
        hints: ['mkdir afterdir'],
        explain:
          'ディレクトリは 777 から引くので x が残る。ファイルと結果が違うのは出発点が違うから。',
      },
    ],
  }),
});

export function kernel06(): MissionSource[] {
  return [
    ...readingDrills,
    ...symbolicDrills,
    ...fixDrills,
    ...ownerDrills,
    ...umaskDrills,
  ];
}

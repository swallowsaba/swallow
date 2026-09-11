import type { LessonIntro } from '../types';
import { concepts } from '../glossary';
import { fileEquals, ranMatching } from '../authoring/assert';
import type { AssertContext } from '../types';
import type { MissionSource } from '../authoring/mission';
import {
  applyModeSpec, BASE_DIR_MODE, BASE_FILE_MODE, formatMode, formatOctal,
} from '@/engines/kernel/perm';
import { metaOf } from '@/engines/kernel/vfs';
import { resolve } from '@/engines/kernel/path';
import type { MissionSpec } from '../authoring/mission';
import { HOME, family, man } from './shared';
import { FILE_STEMS, MODES, slugify } from './values';

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

/** 意味のある権限の組み合わせを、8 進数から記号へ直す練習 */
const READINGS: { slug: string; value: { octal: string; answer: string } }[] = MODES.map((octal) => ({
  slug: octal,
  value: { octal, answer: formatMode(Number.parseInt(octal, 8), false).slice(1) },
}));

const readingDrills = family<{ octal: string; answer: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'read-mode',
  docs: [man('chmod'), man('stat')],
  variants: READINGS,
  make: (spec) => ({
    title: `${spec.octal} は rwx でどう書くか`,
    intro: {
      summary: '755 のような数字の権限を、rwx の並びに読み替える。',
      why:
        'ls -l には rwxr-xr-x のような並びが出る。数字と並びを行き来できれば、「誰が何をできるか」が一目で分かる。',
      concepts: concepts('権限', '所有者'),
      commands: [
        { command: 'ls -l', means: '権限・持ち主・大きさを一覧で見る' },
        { command: 'stat <ファイル>', means: '権限を数字でも見る' },
      ],
    },
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

const SPECS = ['u+x', 'go-r', 'a=r', '+x', 'g+w', 'o-rwx', 'u=rw', 'g=', 'ug+x', 'a-w', 'o+r', 'u-w'];

/** 出発点と指定の組み合わせを全て作り、結果は実装から求める */
const SYMBOLIC: { slug: string; value: { from: string; spec: string; to: string } }[] = MODES
  .slice(0, 10)
  .flatMap((from) =>
    SPECS.map((spec) => {
      const applied = applyModeSpec(Number.parseInt(from, 8), spec, false);
      return {
        slug: `${from}-${slugify(spec)}`,
        value: { from, spec, to: formatOctal(applied ?? Number.parseInt(from, 8)) },
      };
    }),
  );

const symbolicDrills = family<{ from: string; spec: string; to: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'chmod-symbolic',
  docs: [man('chmod')],
  variants: SYMBOLIC,
  make: (v) => ({
    title: `${v.from} に ${v.spec} を当てると何になるか`,
    intro: {
      summary: 'chmod u+x のような書き方で、権限の一部だけを足したり外したりする。',
      why:
        '権限を全部数字で書き直すと、関係ないところまで変えてしまうことがある。「持ち主に実行を足す」のように差分だけ書けば安全。',
      concepts: concepts('権限', '所有者'),
      commands: [
        { command: 'chmod u+x <ファイル>', means: '持ち主（u）に実行（x）を足す' },
        { command: 'chmod go-w <ファイル>', means: 'グループ（g）とその他（o）から書き込み（w）を外す' },
      ],
    },
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

type BrokenSpec = { kind: 'file' | 'dir'; name: string };

const BROKEN: { slug: string; value: BrokenSpec }[] = FILE_STEMS.map((stem, i) =>
  i % 2 === 0
    ? { slug: `${stem}-file`, value: { kind: 'file', name: `${stem}.txt` } satisfies BrokenSpec }
    : { slug: `${stem}-dir`, value: { kind: 'dir', name: stem } satisfies BrokenSpec },
);

const DENIED_INTRO: LessonIntro = {
  summary: '「Permission denied（許可がありません）」の理由を読み、必要な権限だけを足す。',
  why:
    '権限の失敗は毎日のように出会う。何でも 777 にして通すと、誰でも書き換えられる穴になる。足りない1つだけを足すのが正しい直し方。',
  concepts: concepts('権限', '所有者', 'ディレクトリ'),
  commands: [
    { command: 'ls -l', means: '今の権限を確かめる' },
    { command: 'chmod u+r <ファイル>', means: '持ち主に読む権限を足す' },
    { command: 'chmod u+x <ディレクトリ>', means: 'ディレクトリに入る権限を足す' },
  ],
};

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
        intro: DENIED_INTRO,
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
      intro: DENIED_INTRO,
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
  'app.conf', 'app.service', 'nginx.conf', 'crontab', 'sudoers', 'hosts', 'resolv.conf',
  'motd', 'fstab', 'sshd_config', 'limits.conf', 'logrotate.conf', 'timezone', 'shells',
].map((value) => ({ slug: slugify(value), value }));

const ownerDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'owner-sudo',
  docs: [man('chown'), man('sudo', 8)],
  variants: OWNERS,
  make: (name) => ({
    title: `${name} を root のものにする`,
    intro: {
      summary: 'sudo と chown で、ファイルの持ち主を root に変える。',
      why:
        'システムの設定ファイルは、管理者だけが書き換えられるようにしておく。持ち主を変えるのは管理者にしかできないので、sudo が要る。',
      concepts: concepts('所有者', 'root', 'sudo'),
      commands: [
        { command: 'sudo chown root:root <ファイル>', means: '持ち主とグループを root にする' },
        { command: 'stat <ファイル>', means: '持ち主が変わったか確かめる' },
      ],
    },
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

const MASKS = ['022', '077', '002', '027', '007', '066', '044', '037', '000', '017', '070', '007'];

const UMASKS: { slug: string; value: { mask: string; file: string; dir: string } }[] = [
  ...new Set(MASKS),
].map((mask) => {
  const bits = Number.parseInt(mask, 8);
  return {
    slug: mask,
    value: {
      mask,
      file: formatOctal(BASE_FILE_MODE & ~bits),
      dir: formatOctal(BASE_DIR_MODE & ~bits),
    },
  };
});

const umaskDrills = family<{ mask: string; file: string; dir: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'umask',
  docs: [man('umask', 2)],
  variants: UMASKS,
  make: (v) => ({
    title: `umask ${v.mask} の下で作るとどうなるか`,
    intro: {
      summary: 'umask の値から、新しく作るファイルの権限を予想して確かめる。',
      why:
        '作ったファイルが他の人から読めてしまう、逆に仲間が読めない。どちらも umask の決まりで起きる。仕組みが分かれば予想できる。',
      concepts: concepts('umask', '権限'),
      commands: [
        { command: 'umask', means: '今の決まりを表示する' },
        { command: 'umask 027', means: '決まりを変える' },
        { command: 'touch <ファイル>', means: '空のファイルを作る' },
        { command: 'ls -l', means: 'できたファイルの権限を見る' },
      ],
    },
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

import { cwdIs, dirExists, fileEquals, ranMatching } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/00';

/* ------------------------------------------------------------------ *
 * 1. いまどこに居るのかを言えるようにする
 * ------------------------------------------------------------------ */

const PLACES: { slug: string; value: string }[] = [
  { slug: 'srv-app', value: '/srv/app' },
  { slug: 'var-log', value: '/var/log' },
  { slug: 'etc', value: '/etc' },
  { slug: 'tmp', value: '/tmp' },
  { slug: 'opt-tools', value: '/opt/tools' },
  { slug: 'usr-local-bin', value: '/usr/local/bin' },
  { slug: 'home', value: HOME },
  { slug: 'data', value: '/data' },
  { slug: 'mnt-share', value: '/mnt/share' },
  { slug: 'run', value: '/run' },
  { slug: 'srv-web', value: '/srv/web' },
  { slug: 'var-lib', value: '/var/lib' },
];

const whereDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'where-am-i',
  docs: [man('pwd')],
  variants: PLACES,
  make: (place) => ({
    title: `${place} に立って、そこだと言い切る`,
    objectives: ['移動できる', 'いまの場所を確かめられる', '確かめた結果を残せる'],
    initial: { files: { [HOME]: null, [place]: null }, cwd: HOME },
    solution: [`cd ${place}`, `pwd > ${HOME}/here.txt`],
    steps: [
      {
        prompt: `${place} へ移動せよ。`,
        check: `いまのディレクトリが ${place} であること`,
        assert: cwdIs(place),
        hints: ['cd に行き先を渡す', `cd ${place}`],
        explain: 'cd は「いま自分が立っている場所」を変える。ファイルには何も起きない。',
      },
      {
        prompt: `いまの場所を ${HOME}/here.txt に書き出せ。`,
        check: `here.txt の中身が ${place} であること`,
        assert: fileEquals(`${HOME}/here.txt`, place),
        hints: ['pwd がいまの場所を出す', `pwd > ${HOME}/here.txt`],
        explain:
          'pwd は print working directory。迷ったらまずこれを打つ。作業の記録にも使える。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. ファイルの中身を読む
 * ------------------------------------------------------------------ */

const READS: { slug: string; value: { path: string; body: string; answer: string } }[] = [
  { slug: 'motd', value: { path: '/etc/motd', body: 'ようこそ\n本日の担当: platform\n', answer: 'platform' } },
  { slug: 'hosts', value: { path: '/etc/hosts', body: '127.0.0.1 localhost\n10.0.0.10 api.internal\n', answer: '10.0.0.10' } },
  { slug: 'release', value: { path: '/etc/os-release', body: 'NAME="DevLearn Linux"\nVERSION="1.0"\n', answer: '1.0' } },
  { slug: 'owner', value: { path: '/srv/app/OWNER', body: 'team: payments\ncontact: oncall@example.com\n', answer: 'payments' } },
  { slug: 'version', value: { path: '/srv/app/VERSION', body: '2.7.1\n', answer: '2.7.1' } },
  { slug: 'port', value: { path: '/etc/app/port.conf', body: 'listen = 8443\n', answer: '8443' } },
  { slug: 'timezone', value: { path: '/etc/timezone', body: 'Asia/Tokyo\n', answer: 'Asia/Tokyo' } },
  { slug: 'shell', value: { path: '/etc/shells', body: '/bin/sh\n/bin/devsh\n', answer: '/bin/devsh' } },
  { slug: 'limit', value: { path: '/etc/app/limits.conf', body: 'max_connections = 512\n', answer: '512' } },
  { slug: 'endpoint', value: { path: '/etc/app/endpoint', body: 'https://api.example.com/v2\n', answer: 'https://api.example.com/v2' } },
];

const readDrills = family<{ path: string; body: string; answer: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'read-a-file',
  docs: [man('cat')],
  variants: READS,
  make: (spec) => ({
    title: `${spec.path} を読んで、答えを書き写す`,
    objectives: ['ファイルの中身を出せる', '読んだ内容を使える'],
    initial: {
      files: { [HOME]: null, [spec.path]: spec.body },
      cwd: HOME,
    },
    solution: [`cat ${spec.path}`, `echo "${spec.answer}" > answer.txt`],
    steps: [
      {
        prompt: `${spec.path} の中身を画面に出せ。`,
        check: `${spec.path} を cat した記録があること`,
        assert: ranMatching(new RegExp(`(cat|less|more|head|tail)\\s+.*${spec.path.replace(/[/.]/g, '\\$&')}`)),
        hints: ['cat <ファイル>', `cat ${spec.path}`],
        explain: 'cat は concatenate（連結）の略。1つ渡せばそのまま出す。',
      },
      {
        prompt: `読み取った値だけを answer.txt に書け。`,
        check: `answer.txt の中身が ${spec.answer} であること`,
        assert: fileEquals('answer.txt', spec.answer),
        hints: ['echo で書ける', `echo "${spec.answer}" > answer.txt`],
        explain: '読むだけで終わらせず、次の手に渡せる形にしておくと調査が積み上がる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. 分からないコマンドの調べ方
 * ------------------------------------------------------------------ */

const LOOKUPS: { slug: string; value: string }[] = [
  { slug: 'grep', value: 'grep' },
  { slug: 'sort', value: 'sort' },
  { slug: 'wc', value: 'wc' },
  { slug: 'find', value: 'find' },
  { slug: 'chmod', value: 'chmod' },
  { slug: 'ps', value: 'ps' },
  { slug: 'df', value: 'df' },
  { slug: 'du', value: 'du' },
  { slug: 'kill', value: 'kill' },
  { slug: 'tee', value: 'tee' },
  { slug: 'xargs', value: 'xargs' },
  { slug: 'stat', value: 'stat' },
];

const helpDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'help-yourself',
  docs: [man('man')],
  variants: LOOKUPS,
  make: (command) => ({
    title: `${command} が何をするコマンドか調べる`,
    objectives: ['使えるコマンドを一覧できる', '説明を読んで書き留められる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`help | grep ${command} > found.txt`, `which ${command} > path.txt`],
    steps: [
      {
        prompt: `help の一覧から ${command} の行だけを取り出し、found.txt に入れよ。`,
        check: `found.txt に ${command} を含む行が入っていること`,
        assert: (ctx) => {
          const text = ctx.shell.vfs.nodes.get(`${HOME}/found.txt`);
          return text?.kind === 'file' && text.content.includes(command);
        },
        hints: [
          'help で使えるコマンドの一覧が出る',
          'その出力をパイプで grep に渡す',
          `help | grep ${command} > found.txt`,
        ],
        explain:
          '知らない道具に出会ったら、まず一覧と説明を見る。ここでは help、実機では man と --help。',
      },
      {
        prompt: `${command} の在り処を path.txt に書き出せ。`,
        check: 'path.txt が空でないこと',
        assert: (ctx) => {
          const node = ctx.shell.vfs.nodes.get(`${HOME}/path.txt`);
          return node?.kind === 'file' && node.content.trim() !== '';
        },
        hints: ['which <コマンド>', `which ${command} > path.txt`],
        explain:
          'which は PATH を順に見て、最初に見つかった実体を返す。同じ名前が複数あるときの切り分けに効く。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 4. 最初の一往復（作る・確かめる）
 * ------------------------------------------------------------------ */

const FIRSTS: { slug: string; value: { dir: string; file: string; text: string } }[] = [
  { slug: 'hello', value: { dir: 'work', file: 'hello.txt', text: 'hello' } },
  { slug: 'memo', value: { dir: 'memo', file: 'day1.txt', text: 'first day' } },
  { slug: 'draft', value: { dir: 'draft', file: 'idea.txt', text: 'an idea' } },
  { slug: 'sandbox', value: { dir: 'sandbox', file: 'try.txt', text: 'try me' } },
  { slug: 'inbox', value: { dir: 'inbox', file: 'note.txt', text: 'inbox note' } },
  { slug: 'log', value: { dir: 'log', file: 'today.log', text: 'started' } },
  { slug: 'tmpwork', value: { dir: 'tmpwork', file: 'scratch.txt', text: 'scratch' } },
  { slug: 'plan', value: { dir: 'plan', file: 'week.txt', text: 'week plan' } },
];

const firstDrills = family<{ dir: string; file: string; text: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'first-round',
  docs: [man('mkdir'), man('cat')],
  variants: FIRSTS,
  make: (spec) => ({
    title: `${spec.dir}/${spec.file} を作って読み返す`,
    objectives: ['作る', '書く', '読み返して確かめる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `mkdir ${spec.dir}`,
      `echo "${spec.text}" > ${spec.dir}/${spec.file}`,
      `cat ${spec.dir}/${spec.file}`,
    ],
    steps: [
      {
        prompt: `${spec.dir}/ を作れ。`,
        check: `${spec.dir} がディレクトリとして存在すること`,
        assert: dirExists(spec.dir),
        hints: ['mkdir <名前>', `mkdir ${spec.dir}`],
        explain: '入れ物を作る。ここが全ての始まり。',
      },
      {
        prompt: `その中に ${spec.file} を作り、中身を「${spec.text}」にせよ。`,
        check: `${spec.dir}/${spec.file} の中身が ${spec.text} であること`,
        assert: fileEquals(`${spec.dir}/${spec.file}`, spec.text),
        hints: ['echo の出力を > で流し込む', `echo "${spec.text}" > ${spec.dir}/${spec.file}`],
        explain: '> はファイルを作り直す。無ければ作り、あれば中身を捨てて書き直す。',
      },
      {
        prompt: '書けたことを、読み返して確かめよ。',
        check: `${spec.dir}/${spec.file} を読んだ記録があること`,
        assert: ranMatching(new RegExp(`cat\\s+.*${spec.file.replace('.', '\\.')}`)),
        hints: ['cat で読み返す', `cat ${spec.dir}/${spec.file}`],
        explain:
          '書いたつもりで書けていない、はよくある。書いたら読む。この一往復が癖になると事故が減る。',
      },
    ],
  }),
});

export function kernel00(): MissionSource[] {
  return [...whereDrills, ...readDrills, ...helpDrills, ...firstDrills];
}

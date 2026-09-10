import { dirExists, dirHas, fileAbsent, fileEquals, fileExists, varIs } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, bash, family } from './shared';

const CH = 'kernel/05';

/* ------------------------------------------------------------------ *
 * 1. 変数と export
 * ------------------------------------------------------------------ */

const VARS: { slug: string; value: { name: string; text: string } }[] = [
  { slug: 'env', value: { name: 'APP_ENV', text: 'production' } },
  { slug: 'region', value: { name: 'REGION', text: 'ap-northeast-1' } },
  { slug: 'port', value: { name: 'PORT', text: '8443' } },
  { slug: 'level', value: { name: 'LOG_LEVEL', text: 'warn' } },
  { slug: 'user', value: { name: 'DEPLOY_USER', text: 'runner' } },
  { slug: 'bucket', value: { name: 'BUCKET', text: 'artifacts-prod' } },
  { slug: 'tag', value: { name: 'IMAGE_TAG', text: 'v2.7.1' } },
  { slug: 'timeout', value: { name: 'TIMEOUT', text: '30' } },
  { slug: 'namespace', value: { name: 'NAMESPACE', text: 'payments' } },
  { slug: 'endpoint', value: { name: 'ENDPOINT', text: 'https://api.example.com' } },
];

const varDrills = family<{ name: string; text: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'variables',
  docs: [bash('Shell-Parameters', 'Shell Parameters')],
  variants: VARS,
  make: (spec) => ({
    title: `${spec.name} を置いて使う`,
    objectives: ['変数に入れられる', '展開して使える'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`export ${spec.name}=${spec.text}`, `echo "$${spec.name}" > value.txt`],
    steps: [
      {
        prompt: `${spec.name} という変数に ${spec.text} を入れよ。`,
        check: `${spec.name} の値が ${spec.text} であること`,
        assert: varIs(spec.name, spec.text),
        hints: ['名前=値 の形。= の前後に空白を入れない', `export ${spec.name}=${spec.text}`],
        explain:
          '= の前後に空白を入れると、シェルは「そういう名前のコマンド」だと思って探しに行く。よくある詰まりどころ。',
      },
      {
        prompt: 'その値を value.txt に書き出せ。値を直接打たず、変数を展開して書くこと。',
        check: `value.txt の中身が ${spec.text} であること`,
        assert: fileEquals('value.txt', spec.text),
        hints: ['$名前 で中身に置き換わる', `echo "$${spec.name}" > value.txt`],
        explain:
          '展開するのはシェル。echo は展開後の文字列を受け取っているだけで、変数のことは知らない。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. クォートの違い
 * ------------------------------------------------------------------ */

const QUOTES: { slug: string; value: { name: string; text: string } }[] = [
  { slug: 'home', value: { name: 'PLACE', text: '/srv/app' } },
  { slug: 'name', value: { name: 'WHO', text: 'alice' } },
  { slug: 'ver', value: { name: 'VER', text: '1.2.3' } },
  { slug: 'host', value: { name: 'HOST', text: 'web1' } },
  { slug: 'team', value: { name: 'TEAM', text: 'payments' } },
  { slug: 'stage', value: { name: 'STAGE', text: 'canary' } },
  { slug: 'zone', value: { name: 'ZONE', text: 'ap-northeast-1a' } },
  { slug: 'branch', value: { name: 'BRANCH', text: 'main' } },
];

const quoteDrills = family<{ name: string; text: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'quoting',
  docs: [bash('Quoting', 'Quoting')],
  variants: QUOTES,
  make: (spec) => ({
    title: 'シングルとダブルの違いを結果で確かめる',
    objectives: ['" は展開する', "' は展開しない", '使い分けられる'],
    initial: { files: { [HOME]: null }, cwd: HOME, vars: { [spec.name]: spec.text } },
    solution: [
      `echo "$${spec.name}" > expanded.txt`,
      `echo '$${spec.name}' > literal.txt`,
    ],
    steps: [
      {
        prompt: `${spec.name} は既に ${spec.text} が入っている。展開した結果を expanded.txt に書け。`,
        check: `expanded.txt の中身が ${spec.text} であること`,
        assert: fileEquals('expanded.txt', spec.text),
        hints: ['ダブルクォートの中では $ が展開される', `echo "$${spec.name}" > expanded.txt`],
        explain: 'ダブルクォートは「単語をまとめる」だけで、展開は止めない。',
      },
      {
        prompt: `次に、展開せずに $${spec.name} という文字そのものを literal.txt に書け。`,
        check: `literal.txt の中身が $${spec.name} であること`,
        assert: fileEquals('literal.txt', `$${spec.name}`),
        hints: ["シングルクォートの中は何も展開されない", `echo '$${spec.name}' > literal.txt`],
        explain:
          "'...' は中身を一切いじらない。パスワードや正規表現など、記号をそのまま渡したいときはこちら。",
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. グロブ（* ? []）
 * ------------------------------------------------------------------ */

interface GlobSpec {
  slug: string;
  files: string[];
  pattern: string;
  matches: string[];
}

const GLOBS: GlobSpec[] = [
  { slug: 'star-log', files: ['a.log', 'b.log', 'c.txt'], pattern: '*.log', matches: ['a.log', 'b.log'] },
  { slug: 'star-conf', files: ['app.conf', 'db.conf', 'note.md'], pattern: '*.conf', matches: ['app.conf', 'db.conf'] },
  { slug: 'question', files: ['a1.txt', 'a2.txt', 'a10.txt'], pattern: 'a?.txt', matches: ['a1.txt', 'a2.txt'] },
  { slug: 'bracket', files: ['f1.dat', 'f2.dat', 'f3.dat'], pattern: 'f[12].dat', matches: ['f1.dat', 'f2.dat'] },
  { slug: 'prefix', files: ['web1.yaml', 'web2.yaml', 'db1.yaml'], pattern: 'web*.yaml', matches: ['web1.yaml', 'web2.yaml'] },
  { slug: 'suffix', files: ['x.bak', 'y.bak', 'z.txt'], pattern: '*.bak', matches: ['x.bak', 'y.bak'] },
  { slug: 'year', files: ['2024.csv', '2025.csv', '2026.csv'], pattern: '202[56].csv', matches: ['2025.csv', '2026.csv'] },
  { slug: 'digit', files: ['s01.sql', 's02.sql', 'sxx.sql'], pattern: 's0?.sql', matches: ['s01.sql', 's02.sql'] },
];

const globDrills = family<GlobSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'glob',
  docs: [bash('Filename-Expansion', 'Filename Expansion')],
  variants: GLOBS.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const files: Record<string, string | null> = { [HOME]: null, [`${HOME}/picked`]: null };
    for (const name of spec.files) files[`${HOME}/${name}`] = 'x\n';
    const others = spec.files.filter((f) => !spec.matches.includes(f));
    return {
      title: `${spec.pattern} に当たるものだけを移す`,
      objectives: ['グロブが何に当たるか言える', '当たらないものを巻き込まない'],
      initial: { files, cwd: HOME },
      solution: [`mv ${spec.pattern} picked/`],
      steps: [
        {
          prompt: `${spec.pattern} に当たるファイルだけを picked/ へ移せ。`,
          conditions: [
            {
              label: `picked/ に ${spec.matches.join(', ')} が揃っていること`,
              test: dirHas('picked', ...spec.matches),
              howTo: `ls picked で中身を見てください`,
            },
            ...others.map((name) => ({
              label: `${name} は元の場所に残っていること`,
              test: fileExists(name),
              howTo: `${spec.pattern} は ${name} には当たりません`,
            })),
            ...spec.matches.map((name) => ({
              label: `${name} が元の場所から消えていること`,
              test: fileAbsent(name),
              howTo: 'cp ではなく mv を使います',
            })),
          ],
          hints: [
            '* は 0 文字以上、? はちょうど 1 文字、[..] は括弧の中のどれか 1 文字',
            'まず ls でパターンに何が当たるか確かめるとよい',
            `mv ${spec.pattern} picked/`,
          ],
          explain:
            'グロブを展開するのはシェル。mv は展開済みのファイル名を受け取るだけ。だから何にも当たらないと、パターンの文字列がそのまま渡って失敗する。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. ブレース展開
 * ------------------------------------------------------------------ */

const BRACES: { slug: string; value: { prefix: string; items: string[] } }[] = [
  { slug: 'env', value: { prefix: 'config', items: ['dev', 'stg', 'prod'] } },
  { slug: 'quarter', value: { prefix: '2026', items: ['q1', 'q2', 'q3', 'q4'] } },
  { slug: 'stage', value: { prefix: 'ci', items: ['build', 'test', 'deploy'] } },
  { slug: 'zone', value: { prefix: 'zone', items: ['a', 'b', 'c'] } },
  { slug: 'svc', value: { prefix: 'svc', items: ['web', 'api', 'worker'] } },
  { slug: 'month', value: { prefix: 'log', items: ['jan', 'feb', 'mar'] } },
  { slug: 'shard', value: { prefix: 'shard', items: ['0', '1', '2', '3'] } },
  { slug: 'tier', value: { prefix: 'tier', items: ['front', 'back'] } },
];

const braceDrills = family<{ prefix: string; items: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'brace',
  docs: [bash('Brace-Expansion', 'Brace Expansion')],
  variants: BRACES,
  make: (spec) => ({
    title: `${spec.prefix}/{${spec.items.join(',')}} をまとめて作る`,
    objectives: ['ブレース展開で繰り返しを畳める'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`mkdir -p ${spec.prefix}/{${spec.items.join(',')}}`],
    steps: [
      {
        prompt: `${spec.prefix}/ の下に ${spec.items.join(', ')} を一度のコマンドで作れ。`,
        conditions: spec.items.map((item) => ({
          label: `${spec.prefix}/${item} があること`,
          test: dirExists(`${spec.prefix}/${item}`),
          howTo: 'ls -R で確かめられます',
        })),
        hints: [
          '{a,b,c} は a b c に展開される',
          'mkdir -p と組にすると一度で掘れる',
          `mkdir -p ${spec.prefix}/{${spec.items.join(',')}}`,
        ],
        explain:
          'ブレース展開はファイルの有無と関係なく、ただ文字列を並べる。だから「これから作るもの」にも使える。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 5. コマンド置換
 * ------------------------------------------------------------------ */

const SUBS: { slug: string; value: { rows: string[] } }[] = [
  { slug: 'three', value: { rows: ['a', 'b', 'c'] } },
  { slug: 'five', value: { rows: ['1', '2', '3', '4', '5'] } },
  { slug: 'hosts', value: { rows: ['web1', 'web2'] } },
  { slug: 'errors', value: { rows: ['E1', 'E2', 'E3', 'E4'] } },
  { slug: 'users', value: { rows: ['alice', 'bob', 'carol'] } },
  { slug: 'files', value: { rows: ['x.txt', 'y.txt'] } },
  { slug: 'zones', value: { rows: ['a', 'b', 'c', 'd', 'e', 'f'] } },
  { slug: 'jobs', value: { rows: ['build', 'test'] } },
];

const subDrills = family<{ rows: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'command-substitution',
  docs: [bash('Command-Substitution', 'Command Substitution')],
  variants: SUBS,
  make: (spec) => {
    const body = `${spec.rows.join('\n')}\n`;
    return {
      title: 'コマンドの結果を文の中に埋め込む',
      objectives: ['$(...) が使える', '結果を文章に混ぜられる'],
      initial: { files: { [HOME]: null, [`${HOME}/list.txt`]: body }, cwd: HOME },
      solution: [`echo "count=$(wc -l < list.txt)" > report.txt`],
      steps: [
        {
          prompt: `report.txt に「count=<list.txt の行数>」と書け。行数は自分で数えず、コマンドの結果を埋め込むこと。`,
          check: `report.txt の中身が count=${String(spec.rows.length)} であること`,
          assert: fileEquals('report.txt', `count=${String(spec.rows.length)}`),
          hints: [
            '$(コマンド) はその出力に置き換わる',
            'wc -l < file なら数だけが出る',
            `echo "count=$(wc -l < list.txt)" > report.txt`,
          ],
          explain:
            '$(...) は入れ子にできる。バッククォートでも同じことができるが、入れ子と読みやすさで $(...) を使う。',
        },
      ],
    };
  },
});

export function kernel05(): MissionSource[] {
  return [...varDrills, ...quoteDrills, ...globDrills, ...braceDrills, ...subDrills];
}

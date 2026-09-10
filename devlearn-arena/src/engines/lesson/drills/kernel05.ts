import { dirExists, dirHas, fileAbsent, fileEquals, fileExists, varIs } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, bash, family } from './shared';
import { FILE_STEMS, slugify } from './values';

const CH = 'kernel/05';

/* ------------------------------------------------------------------ *
 * 1. 変数と export
 * ------------------------------------------------------------------ */

const VAR_ROWS: [string, string][] = [
  ['APP_ENV', 'production'], ['REGION', 'ap-northeast-1'], ['PORT', '8443'],
  ['LOG_LEVEL', 'warn'], ['DEPLOY_USER', 'runner'], ['BUCKET', 'artifacts-prod'],
  ['IMAGE_TAG', 'v2.7.1'], ['TIMEOUT', '30'], ['NAMESPACE', 'payments'],
  ['ENDPOINT', 'https://api.example.com'], ['CLUSTER', 'prod-a'], ['SHARD', '3'],
  ['RETRIES', '5'], ['CHANNEL', 'stable'], ['TIER', 'gold'], ['LOCALE', 'ja_JP'],
  ['TZ', 'Asia/Tokyo'], ['WORKERS', '8'], ['MODE', 'readonly'], ['OWNER', 'platform'],
];

const VARS: { slug: string; value: { name: string; text: string } }[] = VAR_ROWS.map(
  ([name = '', text = '']) => ({ slug: slugify(name), value: { name, text } }),
);

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

const QUOTES: { slug: string; value: { name: string; text: string } }[] = VAR_ROWS.map(
  ([name = '', text = '']) => ({ slug: slugify(name), value: { name, text } }),
);

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

const BRACE_ROWS: [string, string[]][] = [
  ['config', ['dev', 'stg', 'prod']],
  ['2026', ['q1', 'q2', 'q3', 'q4']],
  ['ci', ['build', 'test', 'deploy']],
  ['zone', ['a', 'b', 'c']],
  ['svc', ['web', 'api', 'worker']],
  ['log', ['jan', 'feb', 'mar']],
  ['shard', ['0', '1', '2', '3']],
  ['tier', ['front', 'back']],
  ['region', ['tokyo', 'osaka', 'nagoya']],
  ['stage', ['canary', 'stable']],
  ['team', ['pay', 'ops', 'data']],
  ['week', ['mon', 'tue', 'wed', 'thu', 'fri']],
  ['env', ['local', 'ci', 'prod']],
  ['role', ['reader', 'writer', 'admin']],
  ['batch', ['b1', 'b2', 'b3']],
  ['plan', ['free', 'pro', 'enterprise']],
];

const BRACES: { slug: string; value: { prefix: string; items: string[] } }[] = BRACE_ROWS.map(
  ([prefix = '', items = []]) => ({ slug: slugify(prefix), value: { prefix, items: [...items] } }),
);

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

const SUBS: { slug: string; value: { rows: string[] } }[] = FILE_STEMS.map((stem, i) => ({
  slug: stem,
  value: { rows: Array.from({ length: 2 + (i % 7) }, (_, k) => `${stem}-${String(k + 1)}`) },
}));

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

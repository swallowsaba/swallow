import type { ExperienceKind, ExperienceTwist } from '@/engines/lesson/types';
import type { ChoreSeed, PlayState, Scenario } from './sim';
import { thingOf } from './towns';

/**
 * 体験のひねりごとの遊び方。町（`towns.ts`）は分野ごとに 1 つで、ここでは頼みごとの出し方だけを変える。
 * 乱数は使わない。n 番目の頼みごとは n だけから決まる（同じ遊びは何度やっても同じ流れになる）。
 */

/** n から決まる、並びの中の 1 つ */
function nth<T>(list: readonly T[], n: number, step = 5, offset = 2): T {
  const item = list[(n * step + offset) % list.length];
  if (item === undefined) throw new Error('空の並びから選ぼうとした');
  return item;
}

const label = (kind: ExperienceKind, id: string): string => thingOf(kind, id)?.label ?? id;

/** だんだん詰まってくる間隔。start 秒から始めて、least 秒まで縮む */
const quicken = (start: number, least: number, by: number) => (n: number) => Math.max(least, start - n * by);

const BASE = { seconds: 60, minSeconds: 30, backlog: 5 } as const;

/* ---------------- シェル（delivery） ---------------- */

const HOUSES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'] as const;
/** 家ごとに待っている品。荷札には品しか書いていない */
const WANTS: Readonly<Record<string, string>> = {
  h1: '港の地図', h2: 'ねじ回し', h3: '米袋', h4: '手紙', h5: '花の種', h6: '電池', h7: '本', h8: '傘', h9: '鍋',
};
/** 家ごとにしまってある紙の言葉 */
const WORDS: Readonly<Record<string, string>> = {
  h1: '期限', h2: '合言葉', h3: 'ERROR', h4: '在庫', h5: '更新', h6: '停止', h7: '見積', h8: '予約', h9: '手順',
};

const deliverySearch = (text: (target: string) => string, miss: (id: string) => string, gap = quicken(5.5, 2.2, 0.25)): Scenario => ({
  kind: 'delivery',
  ...BASE,
  gap,
  chore: (n) => {
    const target = nth(HOUSES, n, 4, 2);
    return { text: text(target), mode: 'search', targets: [target] };
  },
  miss: (_chore, id) => miss(id),
});

const RELAY_PAIRS: readonly (readonly [string, string])[] = [
  ['h1', 'h6'], ['h4', 'h9'], ['h7', 'h2'], ['h3', 'h5'], ['h8', 'h1'], ['h5', 'h7'],
];

/* ---------------- Git（blueprints） ---------------- */

const SHELF = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
const filled = (state: PlayState): string[] => SHELF.filter((id) => (state.fill[id] ?? 0) > 0);

/* ---------------- Kubernetes（dispatch） ---------------- */

const TOWERS = ['t1', 't2', 't3', 't4'] as const;
const PEOPLE = ['web', 'api', 'db', 'cache', 'mail', 'shop', 'auth', 'log', 'jobs', 'feed'] as const;
const lived = (state: PlayState): string[] => TOWERS.filter((id) => (state.fill[id] ?? 0) > 0 && !state.dark.includes(id));

/* ---------------- ネットワーク（carts） ---------------- */

const TOWNS_FAR = ['n1', 'n2', 'n3', 'n4'] as const;
/** その町へ続く分かれ道 */
const WAYS: Readonly<Record<string, readonly string[]>> = {
  n1: ['j1'], n2: ['j1', 'j2'], n3: ['j2', 'j3'], n4: ['j3'],
};
const SHOPS: Readonly<Record<string, string>> = { n1: 'パン屋', n2: '本屋', n3: '薬屋', n4: '花屋' };

/* ---------------- GitHub（overwrite） ---------------- */

const DESKS = ['d1', 'd2', 'd3'] as const;
const NAMES: Readonly<Record<string, string>> = { d1: '青木', d2: '石田', d3: '上野' };
const TASKS = ['ログイン画面', '料金表', '検索窓', '通知', '見出しの色', '問い合わせ欄'] as const;

const overwriteCarry = (via: readonly string[], expires: number, verb: string): Scenario => ({
  kind: 'overwrite',
  ...BASE,
  gap: quicken(4.8, 1.8, 0.2),
  chore: (n) => {
    const desk = nth(DESKS, n, 2, 1);
    const task = nth(TASKS, n, 5, 0);
    return {
      text: `${NAMES[desk] ?? ''}さんの「${task}」の書き足しを${verb}設計図へ写せ`,
      mode: 'carry',
      targets: [desk, ...via, 'board'],
      expires,
    };
  },
  miss: () => '',
});

export const SCENARIOS: Readonly<Record<ExperienceTwist, Scenario>> = {
  /* シェル */
  lost: deliverySearch(
    (target) => `『${WANTS[target] ?? ''}』を待っている家へ届けよ`,
    (id) => `${label('delivery', id)}だった。待っていたのは『${WANTS[id] ?? ''}』`,
  ),
  needle: deliverySearch(
    (target) => `『${WORDS[target] ?? ''}』と書いた紙がしまってある家を探せ`,
    (id) => `${label('delivery', id)}の紙を何枚も読んだが、見つからなかった`,
  ),
  relay: {
    kind: 'delivery',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n): ChoreSeed => {
      const [from, to] = nth(RELAY_PAIRS, n, 1, 0);
      return {
        text: `${label('delivery', from)}の紙を写して、${label('delivery', to)}へ運べ`,
        mode: 'carry',
        targets: [from, to],
      };
    },
    miss: () => '',
  },
  tamper: deliverySearch(
    () => 'いたずらで中身を書き換えられた家を探して、元に戻せ',
    (id) => `${label('delivery', id)}の中身はそのままだった`,
  ),
  hog: deliverySearch(
    () => '道をふさぐほど暴れている働き手がいる家を探して、止めよ',
    (id) => `${label('delivery', id)}の働き手は静かに働いていた`,
  ),
  mystery: deliverySearch(
    () => '「荷物が届かない」と言われた。荷物が止まっている家を探せ',
    (id) => `${label('delivery', id)}では止まっていなかった`,
  ),

  /* Git */
  copies: {
    kind: 'blueprints',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n, state): ChoreSeed => {
      const have = filled(state);
      if (n % 2 === 1 && have.length > 0) {
        const target = nth(have, n, 3, 1);
        return { text: `『${String(2 + (n % 4))} 回前の版』を棚から出せ（写しに日付は書いていない）`, mode: 'search', targets: [target] };
      }
      return { text: 'いまの設計図を写して、空いている棚にしまえ', mode: 'place', targets: SHELF };
    },
    miss: () => 'この写しは別の日の版だった',
  },
  split: {
    kind: 'blueprints',
    ...BASE,
    gap: quicken(4.6, 1.9, 0.2),
    chore: (n): ChoreSeed => {
      if (n % 4 === 3) return { text: '2 つの案を突き合わせて、置き台に 1 枚にまとめよ', mode: 'carry', targets: ['desk', 'desk2', 'stage'] };
      return n % 2 === 0
        ? { text: '案 A の書き足しを、製図台へ運べ', mode: 'carry', targets: ['tray', 'desk'] }
        : { text: '案 B の書き足しを、もう 1 つの製図台へ運べ', mode: 'carry', targets: ['tray', 'desk2'] };
    },
    miss: () => '',
  },
  undo: {
    kind: 'blueprints',
    ...BASE,
    gap: quicken(5.5, 2.4, 0.22),
    chore: (n, state): ChoreSeed => {
      const have = filled(state);
      const target = have.length > 0 ? nth(have, n, 2, 0) : 'bin';
      return { text: `『${String(1 + (n % 3))} つ前の版』に戻したい。その写しを探せ`, mode: 'search', targets: [target] };
    },
    miss: (_chore, id) => (id === 'bin' ? 'くず箱の写しはもう読めない' : 'この写しは別の版だった'),
  },

  /* Kubernetes */
  arrivals: {
    kind: 'dispatch',
    ...BASE,
    backlog: 6,
    gap: quicken(4, 1.4, 0.18),
    chore: (n): ChoreSeed => ({
      text: `住人「${nth(PEOPLE, n, 3, 0)}」が来た。空きのあるビルへ案内せよ`,
      mode: 'place',
      targets: TOWERS,
    }),
    miss: () => '',
    events: [{ at: 22, kind: 'dark', target: 't2', text: '停電したビルの住人を、別のビルへ移せ' }],
  },
  find: {
    kind: 'dispatch',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n, state): ChoreSeed => {
      const have = lived(state);
      const target = have.length > 0 ? nth(have, n, 3, 1) : 't1';
      const name = nth(PEOPLE, n, 7, 1);
      return { text: `お客が「${name}」に会いに来た。${name}がいるビルへ案内せよ`, mode: 'search', targets: [target] };
    },
    miss: (_chore, id) => `${label('dispatch', id)}にはいなかった`,
  },
  sick: {
    kind: 'dispatch',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n, state): ChoreSeed => {
      const have = lived(state);
      const target = have.length > 0 ? nth(have, n, 2, 1) : 't1';
      return { text: 'どこかのビルで住人が倒れた。どのビルか探して起こせ', mode: 'search', targets: [target] };
    },
    miss: (_chore, id) => `${label('dispatch', id)}の住人は元気だった`,
  },
  handout: {
    kind: 'dispatch',
    ...BASE,
    gap: quicken(4.6, 1.9, 0.2),
    chore: (n): ChoreSeed => {
      const tower = nth(TOWERS, n, 3, 1);
      return { text: `事務所で紙を受け取り、${label('dispatch', tower)}の住人へ届けよ`, mode: 'carry', targets: ['office', tower] };
    },
    miss: () => '',
  },

  /* ネットワーク */
  nosign: {
    kind: 'carts',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n): ChoreSeed => {
      const town = nth(TOWNS_FAR, n, 3, 1);
      return { text: `荷車を${label('carts', town)}へ送れ。どの分かれ道が続くかは書いていない`, mode: 'search', targets: WAYS[town] ?? [] };
    },
    miss: (_chore, id) => {
      const leads = TOWNS_FAR.filter((town) => (WAYS[town] ?? []).includes(id)).map((town) => label('carts', town));
      return leads.length === 0 ? 'この道はどこにも続いていなかった' : `${label('carts', id)}は${leads.join('と')}へ続いていた`;
    },
  },
  names: {
    kind: 'carts',
    ...BASE,
    gap: quicken(5, 2, 0.22),
    chore: (n): ChoreSeed => {
      const town = nth(TOWNS_FAR, n, 3, 2);
      return { text: `『${SHOPS[town] ?? ''}』へ荷を送れ。表札は番号だけ`, mode: 'search', targets: [town] };
    },
    miss: (_chore, id) => `${label('carts', id)}は${SHOPS[id] ?? '空き家'}だった`,
  },
  resend: {
    kind: 'carts',
    ...BASE,
    gap: quicken(4.8, 1.9, 0.2),
    chore: (n): ChoreSeed => {
      const town = nth(TOWNS_FAR, n, 3, 0);
      const way = (WAYS[town] ?? ['j1'])[0] ?? 'j1';
      return {
        text: `荷車を${label('carts', town)}へ送れ（自分の町 → ${label('carts', way)} → ${label('carts', town)}）`,
        mode: 'carry',
        targets: ['home', way, town],
        ...(n % 3 === 1 ? { lost: true } : {}),
      };
    },
    miss: () => '',
  },
  plates: {
    kind: 'carts',
    ...BASE,
    gap: quicken(5, 2.2, 0.2),
    chore: (): ChoreSeed => ({ text: '新しい家が建った。空いている番号札を付けよ（同じ番号を 2 軒に付けない）', mode: 'place', targets: ['p1', 'p2', 'p3'] }),
    miss: () => '',
  },

  /* GitHub */
  overwrite: overwriteCarry([], 9, ''),
  review: overwriteCarry(['reviewer'], 14, '見る人に見せてから'),
  checks: overwriteCarry(['bench'], 14, '試し台で試してから'),
  notes: {
    kind: 'overwrite',
    ...BASE,
    gap: quicken(4.4, 1.8, 0.2),
    chore: (n): ChoreSeed => {
      const desk = nth(DESKS, n, 2, 0);
      return {
        text: `頼まれごと「${nth(TASKS, n, 5, 1)}」の紙を、${NAMES[desk] ?? ''}さんの机へ届けよ`,
        mode: 'carry',
        targets: ['tray', desk],
        expires: 11,
      };
    },
    miss: () => '',
  },
};


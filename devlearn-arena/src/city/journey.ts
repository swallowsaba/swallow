import type { Building, BuildingKind, City } from './model';

/**
 * コマンドが街を旅する道のり。純粋関数だけで組む。
 *
 * 打ったコマンドは、街の中を荷車が走ることで見える形になる。
 * 荷車は停留所（家・倉庫・記念碑・事務所・高層ビル…）を順に巡り、
 * 停留所を出るたびに積荷が姿を変える。
 * 例えば `git add` なら、家から出たファイルが、倉庫で荷札の付いた塊になる。
 *
 * ここは React にも three にも触れない。同じコマンドと同じ街からは必ず同じ道のりになる。
 */

/** 積荷の姿。停留所を過ぎるたびにこれが変わる */
export type CargoShape = 'sheet' | 'crate' | 'stone' | 'seal' | 'bundle';

export const CARGO_SHAPES: readonly CargoShape[] = ['sheet', 'crate', 'stone', 'seal', 'bundle'];

export interface JourneyStop {
  /** 停留所になる建物の id */
  building: string;
  /** そこで何が起きるのか。一行で書く */
  label: string;
  /** そこを出るときの積荷の姿 */
  cargo: CargoShape;
  /** 積荷の呼び名 */
  cargoLabel: string;
}

export interface Journey {
  /** 何回目の旅か。同じコマンドを続けて打っても、別の旅として数える */
  id: string;
  /** 旅の元になったコマンド */
  command: string;
  stops: readonly JourneyStop[];
}

/** 停留所の指定。街にその種類の建物があれば、そこが停留所になる */
interface Leg {
  /** 停留所にできる建物の種類。前に書いたものから先に選ぶ */
  kinds: readonly BuildingKind[];
  label: string;
  cargo: CargoShape;
  cargoLabel: string;
}

interface Route {
  /** コマンドの頭。`git add` のように 2 語で書いてもよい */
  key: string;
  legs: readonly Leg[];
}

/** 家（ファイル）と区画に建つもの */
const FILE_KINDS: readonly BuildingKind[] = ['hut'];
/** 事務所（Deployment）。無ければ倉庫で代える */
const DESK_KINDS: readonly BuildingKind[] = ['office', 'depot', 'window'];
/** 高層ビル（ノード） */
const TOWER_KINDS: readonly BuildingKind[] = ['tower'];
/** 機器（ネットワーク） */
const DEVICE_KINDS: readonly BuildingKind[] = ['relay', 'gate', 'house'];
/** 審査の場（GitHub） */
const REVIEW_KINDS: readonly BuildingKind[] = ['window', 'line', 'gate', 'office'];

/**
 * コマンドごとの道のり。
 * どれも「どこから出て、どこを経て、どこへ着くか」と「途中で荷が何に変わるか」だけを書く。
 */
const ROUTES: readonly Route[] = [
  {
    key: 'git add',
    legs: [
      { kinds: FILE_KINDS, label: '家から荷を出す', cargo: 'sheet', cargoLabel: 'ファイル' },
      { kinds: ['depot'], label: '倉庫に預ける', cargo: 'crate', cargoLabel: '荷札の付いた塊' },
    ],
  },
  {
    key: 'git commit',
    legs: [
      { kinds: ['depot'], label: '倉庫から積み出す', cargo: 'crate', cargoLabel: '荷札の付いた塊' },
      { kinds: ['monument'], label: '記念碑に刻む', cargo: 'stone', cargoLabel: '刻まれた石' },
      { kinds: ['flag'], label: '旗が新しい碑へ進む', cargo: 'seal', cargoLabel: '通りの印' },
    ],
  },
  {
    key: 'git push',
    legs: [
      { kinds: ['monument'], label: '碑の写しを積む', cargo: 'stone', cargoLabel: '刻まれた石' },
      { kinds: REVIEW_KINDS, label: '遠くの街へ送る', cargo: 'seal', cargoLabel: '封をした便り' },
    ],
  },
  {
    key: 'git merge',
    legs: [
      { kinds: ['flag'], label: '分かれた通りから出る', cargo: 'seal', cargoLabel: '通りの印' },
      { kinds: ['monument'], label: '本通りで合流する', cargo: 'stone', cargoLabel: '刻まれた石' },
    ],
  },
  {
    key: 'git switch',
    legs: [
      { kinds: ['flag'], label: '旗を持ち替える', cargo: 'seal', cargoLabel: '通りの印' },
      { kinds: ['monument'], label: 'その通りの先頭へ立つ', cargo: 'stone', cargoLabel: '刻まれた石' },
    ],
  },
  {
    key: 'kubectl apply',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で設計図を受け取る', cargo: 'sheet', cargoLabel: '設計図' },
      { kinds: TOWER_KINDS, label: 'ビルに住人が入る', cargo: 'bundle', cargoLabel: '住人の荷物' },
    ],
  },
  {
    key: 'kubectl create',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で届け出る', cargo: 'sheet', cargoLabel: '設計図' },
      { kinds: TOWER_KINDS, label: 'ビルに住人が入る', cargo: 'bundle', cargoLabel: '住人の荷物' },
    ],
  },
  {
    key: 'kubectl run',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で届け出る', cargo: 'sheet', cargoLabel: '設計図' },
      { kinds: TOWER_KINDS, label: 'ビルに住人が入る', cargo: 'bundle', cargoLabel: '住人の荷物' },
    ],
  },
  {
    key: 'kubectl scale',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で戸数を書き換える', cargo: 'sheet', cargoLabel: '戸数の控え' },
      { kinds: TOWER_KINDS, label: 'ビルの部屋が増える', cargo: 'bundle', cargoLabel: '住人の荷物' },
    ],
  },
  {
    key: 'kubectl delete',
    legs: [
      { kinds: TOWER_KINDS, label: '住人が荷をまとめる', cargo: 'bundle', cargoLabel: '引っ越しの荷' },
      { kinds: DESK_KINDS, label: '事務所に鍵を返す', cargo: 'sheet', cargoLabel: '取り下げの控え' },
    ],
  },
  {
    key: 'kubectl drain',
    legs: [
      { kinds: TOWER_KINDS, label: '改修するビルを空ける', cargo: 'bundle', cargoLabel: '引っ越しの荷' },
      { kinds: TOWER_KINDS, label: '空いているビルへ移る', cargo: 'bundle', cargoLabel: '住人の荷物' },
    ],
  },
  {
    key: 'kubectl cordon',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で受付を止める', cargo: 'sheet', cargoLabel: '停止の札' },
      { kinds: TOWER_KINDS, label: 'ビルの入口に札を出す', cargo: 'seal', cargoLabel: '掲げた札' },
    ],
  },
  {
    key: 'kubectl expose',
    legs: [
      { kinds: DESK_KINDS, label: '事務所で路線を決める', cargo: 'sheet', cargoLabel: '路線図' },
      { kinds: ['stop', ...TOWER_KINDS], label: 'バス停が立つ', cargo: 'seal', cargoLabel: '時刻表' },
    ],
  },
  {
    key: 'gh pr',
    legs: [
      { kinds: ['monument', 'depot'], label: '碑の写しを束ねる', cargo: 'stone', cargoLabel: '刻まれた石' },
      { kinds: ['window', 'office'], label: '審査の窓口へ出す', cargo: 'seal', cargoLabel: '封をした便り' },
      { kinds: ['line', 'gate'], label: '検査ラインを通す', cargo: 'crate', cargoLabel: '検印の付いた荷' },
    ],
  },
  {
    key: 'ping',
    legs: [
      { kinds: DEVICE_KINDS, label: '手元の機器から出す', cargo: 'seal', cargoLabel: '小包' },
      { kinds: DEVICE_KINDS, label: '相手の機器へ届く', cargo: 'crate', cargoLabel: '返ってきた小包' },
    ],
  },
  {
    key: 'curl',
    legs: [
      { kinds: DEVICE_KINDS, label: '手元の機器から出す', cargo: 'seal', cargoLabel: '頼み事' },
      { kinds: [...DEVICE_KINDS, ...TOWER_KINDS], label: '相手が答えを積む', cargo: 'crate', cargoLabel: '返ってきた荷' },
    ],
  },
  {
    key: 'cp',
    legs: [
      { kinds: FILE_KINDS, label: '元の家から荷を出す', cargo: 'sheet', cargoLabel: 'ファイル' },
      { kinds: FILE_KINDS, label: '写しが別の家に建つ', cargo: 'crate', cargoLabel: '写しの束' },
    ],
  },
  {
    key: 'mv',
    legs: [
      { kinds: FILE_KINDS, label: '元の家を畳む', cargo: 'crate', cargoLabel: '荷造りした中身' },
      { kinds: FILE_KINDS, label: '新しい住所に建て直す', cargo: 'sheet', cargoLabel: '移したファイル' },
    ],
  },
];

/** どの表にも当たらないコマンドの道のり。街のどこかへ必ず一度は荷が走る */
const DEFAULT_LEGS: readonly Leg[] = [
  {
    kinds: ['office', 'depot', 'window', 'stop', 'hut', 'house', 'relay', 'gate', 'tower', 'monument', 'flag', 'line'],
    label: '端末から受け取る',
    cargo: 'sheet',
    cargoLabel: '打った命令',
  },
  {
    kinds: ['tower', 'office', 'hut', 'house', 'monument', 'depot', 'relay', 'gate', 'stop', 'window', 'line', 'flag'],
    label: '現場へ届く',
    cargo: 'crate',
    cargoLabel: '届いた知らせ',
  },
];

/** コマンドを語に割る。1 行目だけを見る（ヒアドキュメントの本文は旅に出さない） */
export function wordsOf(command: string): string[] {
  return (command.split('\n')[0] ?? '').trim().split(/\s+/).filter((word) => word !== '');
}

/** その語列に合う道のり。2 語の指定を先に見て、無ければ 1 語で探す */
function routeFor(words: readonly string[]): readonly Leg[] {
  const two = words.slice(0, 2).join(' ');
  const one = words[0] ?? '';
  return (ROUTES.find((route) => route.key === two) ?? ROUTES.find((route) => route.key === one))?.legs ?? DEFAULT_LEGS;
}

/** パスの末尾だけを取る。`src/main.ts` は `main.ts` の家に当たる */
function basename(text: string): string {
  return text.split('/').filter((part) => part !== '').pop() ?? text;
}

/** その建物が、打ったコマンドの引数で名指しされているか */
function named(building: Building, args: readonly string[]): boolean {
  return args.some((arg) => {
    const tail = basename(arg);
    return building.label === arg || building.label === tail || building.id === arg || building.id.endsWith(`:${arg}`);
  });
}

/**
 * 停留所を 1 つ選ぶ。
 * 名指しされた建物を先に、次に種類の並び順、最後は id の順で決める。
 * 乱数を使わないので、同じ街と同じコマンドからは必ず同じ停留所になる。
 */
function pickStop(
  buildings: readonly Building[],
  leg: Leg,
  args: readonly string[],
  used: ReadonlySet<string>,
): Building | undefined {
  const able = buildings.filter(
    (building) => !used.has(building.id) && building.phase === 'done' && leg.kinds.includes(building.kind),
  );
  const rank = (building: Building): number => leg.kinds.indexOf(building.kind);
  const sorted = [...able].sort((a, b) => {
    const byName = Number(named(b, args)) - Number(named(a, args));
    if (byName !== 0) return byName;
    const byKind = rank(a) - rank(b);
    if (byKind !== 0) return byKind;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0];
}

/**
 * コマンドと街から、荷車の旅を導く。
 *
 * 停留所になる建物がまだ街に無ければ、その停留所は飛ばす。
 * 停留所が 2 つに満たないときは旅を出さない（同じ場所でぐるぐる回らせない）。
 */
export function journeyOf(
  command: string,
  city: Pick<City, 'buildings'>,
  serial = 0,
): Journey | null {
  const words = wordsOf(command);
  if (words.length === 0) return null;
  const args = words.slice(1).filter((word) => !word.startsWith('-'));
  const used = new Set<string>();
  const stops: JourneyStop[] = [];
  for (const leg of routeFor(words)) {
    const found = pickStop(city.buildings, leg, args, used);
    if (found === undefined) continue;
    used.add(found.id);
    stops.push({ building: found.id, label: leg.label, cargo: leg.cargo, cargoLabel: leg.cargoLabel });
  }
  if (stops.length < 2) return null;
  return { id: `${String(serial)}:${words.join(' ')}`, command: words.join(' '), stops };
}

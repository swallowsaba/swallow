import type { Building, BuildingKind, City } from './model';
import type { DistrictId } from './growth';

/**
 * 案内ツアー。カメラが街の施設を順に巡る道のり。
 *
 * 学習者は用語を 1 つも知らない前提で書く。
 * 各停留所は「これは何か」と「何のためにあるか」だけを平易な言葉で述べる。
 * 街に無い施設には寄らない（まだ建っていない物を説明しない）。
 *
 * ここは React にも three にも触れない純粋な計算。同じ街からは必ず同じ道のりになる。
 */

export interface TourStop {
  /** 停まる建物の id */
  building: string;
  /** その施設の呼び名。括弧の中に本当の用語を添える */
  title: string;
  /** これは何か・何のためにあるか。2〜3 行 */
  body: string;
}

/** 案内する所の指定。街にその種類の建物があれば、そこに停まる */
interface Spot {
  /** 停まれる建物の種類。前に書いたものから先に選ぶ */
  kinds: readonly BuildingKind[];
  title: string;
  body: string;
  /** 住人がいる建物だけを選ぶ。住人そのものを説明する停留所に使う */
  needsOccupants?: boolean;
}

/**
 * 区域ごとの巡る順。
 *
 * Kubernetes の街は、頼みごとが流れる順に巡る。
 * 窓口で受け、台帳に書き、監督が見比べ、配置係が置き場所を決め、ビルに住人が入り、
 * その住人にバス停がつなぐ。順番そのものが仕組みの説明になっている。
 */
const TOURS: Readonly<Record<DistrictId, readonly Spot[]>> = {
  k8s: [
    {
      kinds: ['desk'],
      title: '窓口（API サーバ）',
      body:
        '街への頼みごとは、すべてこの窓口を通る。あなたが打つ kubectl という道具も、' +
        'ここに申し込みを届けているだけ。窓口は中身を確かめ、通れば台帳に書き取る。',
    },
    {
      kinds: ['ledger'],
      title: '台帳（etcd）',
      body:
        '街が「こうなっているはず」という姿を、ひとつ残らず書き留めた帳面。' +
        '建物も住人も、まずここに記録されてから実物になる。' +
        'いま街に見えている物は、すべてこの帳面の写しだと思ってよい。',
    },
    {
      kinds: ['watch'],
      title: '監督（コントローラ）',
      body:
        '台帳の「こうなっているはず」と、街のいまの姿を見比べ続ける係。' +
        '足りなければ作り、余っていれば減らす。住人を 1 人消してもすぐ戻ってくるのは、' +
        'この係が休まず見比べているから。',
    },
    {
      kinds: ['dispatch'],
      title: '配置係（スケジューラ）',
      body:
        '新しい住人を、どのビルに入れるかを決める係。ビルの空き具合を見て、入れる所を選ぶ。' +
        '行き先が決まるまで、住人は待合室で待つ（この待ちの状態を Pending と呼ぶ）。',
    },
    {
      kinds: ['tower'],
      title: 'ビル（ノード）',
      body:
        'アプリを実際に動かすコンピュータ 1 台が、1 棟のビル。' +
        'ビルには入れる人数の上限があり、計算力（CPU）と記憶（memory）がその広さにあたる。' +
        '上限を超える住人は入れない。',
    },
    {
      kinds: ['tower'],
      needsOccupants: true,
      title: '住人（Pod）',
      body:
        'アプリを入れて動かす小さな箱を Pod と呼ぶ。街ではビルの一室に住む住人にあたる。' +
        '窓が灯っていれば動いている（Running）。暗い部屋は、まだ起きていないか止まっている。',
    },
    {
      kinds: ['office'],
      title: '事務所（Deployment）',
      body:
        '「この住人を何人そろえる」という注文を預かる事務所。' +
        '人が減れば補い、増やせと言われれば増やす。住人を直に作るより、ここへ頼むほうが崩れにくい。',
    },
    {
      kinds: ['stop'],
      title: 'バス停（Service）',
      body:
        '住人は入れ替わるので、部屋番号を直に呼ぶと当てが外れる。' +
        'バス停はいつも同じ場所にあり、いま動いている住人まで運んでくれる。' +
        '外から訪ねるときは、まずここに来る。',
    },
  ],
  git: [
    {
      kinds: ['depot'],
      title: '倉庫（インデックス）',
      body:
        '次の記録に載せると決めた紙を、いったん預けておく倉庫。' +
        'git add で小屋から運び込む。倉庫に入れた分だけが、次の石碑に刻まれる。',
    },
    {
      kinds: ['monument'],
      title: '記念碑（コミット）',
      body:
        '倉庫の中身を石に刻んで建てたもの。刻んだ後は書き換えない。' +
        '碑は一列に並び、前の碑を指しているので、どこから来たのかを辿れる。',
    },
    {
      kinds: ['flag'],
      title: '旗（ブランチ）',
      body:
        'いちばん新しい碑に立てておく目印。碑が増えると、旗はひとりでに新しい碑へ移る。' +
        '旗を増やせば、同じ通りから別の道へ分かれて進める。',
    },
  ],
  net: [
    {
      kinds: ['house'],
      title: '家（機器）',
      body:
        'ネットワークにつながっている機械 1 台が 1 軒の家。家には住所（IP アドレス）が付いていて、' +
        'その住所あてに荷物（パケット）が届く。',
    },
    {
      kinds: ['gate'],
      title: '関所（スイッチ）',
      body:
        '同じ町内の家どうしをつなぐ結び目。荷物を受け取り、宛先の家へ回す。' +
        'ここが閉じると、町内の行き来が止まる。',
    },
    {
      kinds: ['relay'],
      title: '中継塔（ルータ）',
      body:
        '町と町の間を荷物が渡るときに通る塔。どの道へ回すかの道案内（ルーティング）をここが決める。' +
        '荷物は塔を 1 つ越えるたびに、残りの寿命（TTL）を 1 減らす。',
    },
  ],
  github: [
    {
      kinds: ['window'],
      title: '審査窓口（Pull Request）',
      body:
        '自分の書いた変更を「本通りに入れてよいか」と申し込む窓口。' +
        '入れる前に人が読んで意見を返す場所で、いきなり本通りを書き換えないための仕組み。',
    },
    {
      kinds: ['line'],
      title: '検査ライン（CI）',
      body:
        '申し込みが届くたび、機械が自動で組み立てと試験をする流れ作業の場。' +
        '通れば緑、落ちれば赤。人が読む前に、機械で分かる壊れを見つける。',
    },
  ],
  kernel: [
    {
      kinds: ['hut'],
      title: '小屋（ファイル）',
      body:
        '中身を書き留めておく入れ物 1 つが 1 棟の小屋。名前を付けて置き、名前で呼び出す。',
    },
    {
      kinds: ['depot', 'office', 'tower'],
      title: '倉庫（ディレクトリ）',
      body: '小屋をまとめて入れておく場所。入れ子にできるので、街全体が木の形に整う。',
    },
  ],
  center: [],
};

/** その種類の建物のうち、街に建っているもの。同じ街からは必ず同じものを選ぶ */
function pick(buildings: readonly Building[], spot: Spot, taken: ReadonlySet<string>): Building | undefined {
  for (const kind of spot.kinds) {
    const found = buildings.filter(
      (b) =>
        b.kind === kind &&
        b.phase === 'done' &&
        (spot.needsOccupants !== true || b.occupants.some((o) => o.state !== 'gone')),
    );
    // まだ寄っていない建物を先に選ぶ。同じ建物を 2 度説明するのは、種類が違うときだけ
    const fresh = found.find((b) => !taken.has(b.id));
    const chosen = fresh ?? found[0];
    if (chosen !== undefined) return chosen;
  }
  return undefined;
}

/**
 * その区域を巡るツアーを組む。
 *
 * 街に無い施設は飛ばすので、学習が進むほど停留所が増える。
 * 停留所が 1 つも無ければ空の配列を返す（ツアーは始められない）。
 */
export function tourOf(city: City, district: DistrictId): TourStop[] {
  const here = city.buildings.filter((b) => b.district === district);
  const taken = new Set<string>();
  const stops: TourStop[] = [];
  for (const spot of TOURS[district]) {
    const building = pick(here, spot, taken);
    if (building === undefined) continue;
    taken.add(building.id);
    stops.push({ building: building.id, title: spot.title, body: spot.body });
  }
  return stops;
}

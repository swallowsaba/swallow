import type { DiagramId } from '@/engines/lesson/diagramIds';
import { lookup, segment, type Concept } from '@/engines/lesson/glossary';

/**
 * 用語辞書（REWORK 5-1）。
 *
 * 学習者は用語を 1 つも知らない前提で作る。だからこの街で出てくる言葉には、
 * 次の 3 つを必ず添える。
 *
 * - `plain` … 専門用語を使わない言い換え
 * - `analogy` … 街に置き換えるとどれに当たるか
 * - `diagram` … 手を出して動かせる図解の識別子（REWORK 6-3）
 *
 * `plain` は `src/engines/lesson/glossary.ts` から引く。言い換えを 2 か所に書くと、
 * 直したときに片方だけ古くなる。言い換えの持ち主はあちらで、ここは
 * 「街での例え」と「どの図解で遊べるか」を足す所。
 */

export type { DiagramId };

export interface Term {
  /** 画面に出る語 */
  term: string;
  /** 知らない人でも読める言い換え */
  plain: string;
  /** 街に置き換えると何に当たるか */
  analogy: string;
  /** 手を出して動かせる図解 */
  diagram: DiagramId;
  /** 同じものを指す別の書き方 */
  aliases: readonly string[];
}

/** 辞書に載せる語と、街での例え、そして遊べる図解 */
const SOURCE: readonly { term: string; analogy: string; diagram: DiagramId }[] = [
  /* ---------------- Kubernetes ---------------- */
  { term: 'Kubernetes', analogy: '街全体の管理人。「この街には住人が何人いてほしい」を覚えていて、足りなければ自分で呼び戻す', diagram: 'desired-vs-actual' },
  { term: 'クラスタ', analogy: '1 つの街。その中に建っているビルが、まとめて面倒を見られている', diagram: 'pod-in-node' },
  { term: 'ノード', analogy: '街に建っている高層ビル 1 棟。住人はこの中で暮らす', diagram: 'pod-in-node' },
  { term: 'Pod', analogy: 'ビルの一室に住む住人 1 人。ビルが決まるまで、外の道で待っている', diagram: 'pod-in-node' },
  { term: 'コンテナ', analogy: '住人が背負ってきた荷物。中に道具一式が入っていて、どの部屋でも同じように暮らせる', diagram: 'pod-lifecycle' },
  { term: 'イメージ', analogy: '荷物の中身の目録。これを見て同じ荷物を何個でも用意できる', diagram: 'pod-lifecycle' },
  { term: 'Pending', analogy: 'まだ部屋が決まらず、道で待っている住人', diagram: 'pod-lifecycle' },
  { term: 'Running', analogy: '部屋に入って暮らし始めた住人。その階の窓が灯る', diagram: 'pod-lifecycle' },
  { term: 'Ready', analogy: '「もう訪ねてきてよい」と札を出した住人。灯っていても札が無ければバスは寄らない', diagram: 'service-endpoints' },
  { term: 'Deployment', analogy: '「この住人を何人そろえる」という注文を預かる事務所', diagram: 'desired-vs-actual' },
  { term: 'ReplicaSet', analogy: '事務所の下で、実際に人数を数えて足りない分を呼ぶ係', diagram: 'desired-vs-actual' },
  { term: 'レプリカ', analogy: 'そろえる人数。注文書に書いてある数', diagram: 'desired-vs-actual' },
  { term: 'Service', analogy: 'バス停。住人が入れ替わっても、行き先の名前は変わらない', diagram: 'service-endpoints' },
  { term: 'Endpoints', analogy: 'そのバス停がいま停まる部屋の一覧。ここに載らない部屋にはバスが行かない', diagram: 'service-endpoints' },
  { term: 'セレクタ', analogy: 'バス停が探している札の柄。同じ柄を付けた住人の所へだけ路線が伸びる', diagram: 'service-endpoints' },
  { term: 'ラベル', analogy: '住人が付けている名札。柄で仲間分けする', diagram: 'service-endpoints' },
  { term: '名前空間', analogy: '街の区画。区画が違えば、同じ名前の住人がいても別人', diagram: 'pod-in-node' },
  { term: 'kubectl', analogy: '街の窓口へ出す申込用紙。あなたの指示はまずここを通る', diagram: 'pod-lifecycle' },
  { term: 'scheduler', analogy: '配置係。空き部屋を見て、新しい住人をどのビルに入れるか決める', diagram: 'pod-in-node' },
  { term: 'controller', analogy: '監督。注文の人数と今の人数を見比べ、足りなければ呼ぶ', diagram: 'desired-vs-actual' },
  { term: 'kubelet', analogy: 'ビルの管理人。その建物の部屋を実際に開けて回る。居なくなると窓が消える', diagram: 'pod-in-node' },
  { term: 'etcd', analogy: '街の台帳。何がどうなっているはずかを、ひとつ残らず書き留めてある', diagram: 'desired-vs-actual' },
  { term: 'apiserver', analogy: '街の窓口。ここを通さずに街をいじることはできない', diagram: 'pod-lifecycle' },
  { term: 'CrashLoopBackOff', analogy: '入居しては転げ出るのを繰り返し、次に試すまでの待ち時間が伸びていく住人', diagram: 'pod-lifecycle' },
  { term: 'requests', analogy: '「この広さの部屋をください」という申告。配置係はこの数字で入るビルを決める', diagram: 'pod-in-node' },

  /* ---------------- Git ---------------- */
  { term: 'Git', analogy: '街の記録係。いつ誰が何を変えたかを、石碑のように残していく', diagram: 'git-three-areas' },
  { term: 'リポジトリ', analogy: '記録がしまってある倉庫。ここに歴史が全部入っている', diagram: 'git-three-areas' },
  { term: 'コミット', analogy: 'その時点の街を写した写真 1 枚。撮った理由を書いて残す', diagram: 'git-three-areas' },
  { term: 'インデックス', analogy: '写真に入れるものを並べておく台。載せた物だけが写る', diagram: 'git-three-areas' },
  { term: '作業ツリー', analogy: 'いま手を入れている最中の街そのもの。まだ写真には写っていない', diagram: 'git-three-areas' },
  { term: 'ブランチ', analogy: '歴史の分かれ道に立てる道しるべ。本道を壊さずに脇道を試せる', diagram: 'git-three-areas' },
  { term: 'マージ', analogy: '脇道で進めた工事を、本道に合流させること', diagram: 'git-three-areas' },
  { term: 'Pull Request', analogy: '「この脇道の工事を本道に入れてよいか」の申請書。皆で見てから通す', diagram: 'git-three-areas' },
  { term: 'CI', analogy: '工事のたびに自動で走る検査。通らない工事は本道に入れない', diagram: 'git-three-areas' },

  /* ---------------- ネットワーク ---------------- */
  { term: 'IP アドレス', analogy: '建物の住所。ここ宛てと書けば荷物が届く', diagram: 'packet-hops' },
  { term: 'ポート', analogy: '建物の中の窓口番号。同じ住所でも、用事ごとに窓口が違う', diagram: 'packet-hops' },
  { term: 'パケット', analogy: '荷札の付いた荷物 1 つ。宛先と差出人が書いてある', diagram: 'packet-hops' },
  { term: 'ルーティング', analogy: '中継所が荷札を見て、次にどの道へ渡すかを決めること', diagram: 'packet-hops' },
  { term: 'ルータ', analogy: '街と街をつなぐ中継所。荷物を受け取って次へ渡す', diagram: 'packet-hops' },
  { term: 'TTL', analogy: '荷物が通ってよい中継所の残り回数。0 になると捨てられる', diagram: 'packet-hops' },
  { term: 'DNS', analogy: '街の電話帳。名前から住所を引く', diagram: 'packet-hops' },
];

/** 語から引ける形に組み立てる。載っていない語を書いたら、その場で気付けるように例外にする */
const TERMS: readonly Term[] = SOURCE.map(({ term, analogy, diagram }) => {
  const found: Concept | undefined = lookup(term);
  if (found === undefined) throw new Error(`用語集に載っていない語です: ${term}`);
  return { term: found.term, plain: found.plain, analogy, diagram, aliases: found.aliases ?? [] };
});

const INDEX = new Map<string, Term>();
for (const entry of TERMS) {
  INDEX.set(entry.term.toLowerCase(), entry);
  for (const alias of entry.aliases) INDEX.set(alias.toLowerCase(), entry);
}

/** 辞書に載っている語すべて（載せた順） */
export function terms(): readonly Term[] {
  return TERMS;
}

/** 語（別名でもよい）から引く。無ければ undefined */
export function term(name: string): Term | undefined {
  return INDEX.get(name.toLowerCase());
}

/** 文章を、辞書に載っている語とそれ以外に切り分けたもの */
export interface TermSegment {
  text: string;
  /** 辞書に載っている語なら、その中身。画面ではここに下線を引く */
  term?: Term;
}

/**
 * 文章を、辞書の語で区切る。札の中で、その語だけに下線と説明を付けるために使う。
 * 同じ語は最初の 1 回だけ区切る（何度も下線が付くと読みにくい）。
 */
export function segmentTerms(text: string): TermSegment[] {
  const out: TermSegment[] = [];
  for (const piece of segment(text)) {
    const found = piece.concept === undefined ? undefined : term(piece.concept.term);
    if (found === undefined) {
      const last = out[out.length - 1];
      if (last !== undefined && last.term === undefined) last.text += piece.text;
      else out.push({ text: piece.text });
      continue;
    }
    out.push({ text: piece.text, term: found });
  }
  return out;
}

/**
 * その文章たちに出てくる、辞書の語。出てきた順で、同じ語は 1 度だけ。
 * 「この任務で出てくる言葉」を組み立てるのに使う。
 */
export function termsIn(texts: readonly string[]): Term[] {
  const out: Term[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const piece of segmentTerms(text)) {
      if (piece.term === undefined || seen.has(piece.term.term)) continue;
      seen.add(piece.term.term);
      out.push(piece.term);
    }
  }
  return out;
}

/** 札に語を並べるために読む、任務の文章 */
export interface MissionText {
  title: string;
  intro: { summary: string };
  steps: readonly { prompt: string; check: string }[];
}

/**
 * その任務の札に並べる「この任務で出てくる言葉」。
 * 札とテストが同じ関数を使う。札が拾い損ねた語があれば、テストが落ちる。
 *
 * `upTo` を渡すと、その手順（0 始まり）までに出てきた語だけを返す。
 * まだ見せていない先の手順の語を、先回りして並べないため（REWORK 5-5）。
 * 並びは、いまの手順で初めて出てきた語が先。前の手順で説明した語はその後ろ。
 */
export function missionTerms(mission: MissionText, upTo?: number): Term[] {
  const last = upTo ?? mission.steps.length - 1;
  const texts = (step: { prompt: string; check: string } | undefined) =>
    step === undefined ? [] : [step.prompt, step.check];
  const before = termsIn([
    mission.title,
    mission.intro.summary,
    ...mission.steps.slice(0, Math.max(0, last)).flatMap(texts),
  ]);
  const known = new Set(before.map((t) => t.term));
  const fresh = termsIn(texts(mission.steps[last])).filter((t) => !known.has(t.term));
  return [...fresh, ...before];
}

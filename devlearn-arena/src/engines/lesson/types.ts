import type { ShellState } from '@/engines/kernel/registry';
import type { SessionOptions } from '@/engines/kernel/session';
import type { DiagramId } from './diagramIds';

/** 判定に使える文脈。文字列一致ではなく「状態」を見る。 */
export interface AssertContext {
  shell: ShellState;
  /** 実行された行（末尾が直近） */
  history: readonly string[];
  /** 各コマンド実行直後の状態列。可用性など「全時点で成立」の検証に使う */
  timeline: readonly ShellState[];
}

/**
 * 通過条件のうちのひとつ。
 * 画面はこれを一覧にして、どこまで満たせているかを見せる。
 */
export interface StepPart {
  label: string;
  test: (ctx: AssertContext) => boolean;
  howTo?: string;
}

/**
 * 書き手が書く手順。学びの流れの「操作」の段で打つ 1 手。
 * 画面に出るときは、目的と、打った後に街で起きたことを足した `LessonStep` になる。
 */
export interface LessonCoreStep {
  prompt: string;
  /**
   * この操作で何を確かめるのか。ふつうは `flow/` の表に書く。
   * 同じ型の繰り返しでも手順の数が違うときだけ、ここに直に書く
   */
  purpose?: string;
  /** 打った後、いま街で何が起きたか。`purpose` と同じく、ふつうは `flow/` の表に書く */
  afterward?: string;
  /** 何を満たせば通るのかを人が読める形で示す。隠さない */
  check: string;
  /**
   * 助言。最後の1件は、そのまま打てば手順を通過する完全なコマンドにする。
   * 複数行のときは1行ずつ順に打つ。
   */
  hints: readonly string[];
  /**
   * 模範解答のコマンド列。直前の手順までを模範解答どおりに進めた状態から、
   * これを順に打てば必ずこの手順を通過する。
   * 前の手順で一緒に満たされる手順は空になる。
   */
  solution: readonly string[];
  /** 最終状態を検証する。別解を許容するため、コマンド文字列は見ない */
  assert: (ctx: AssertContext) => boolean;
  /**
   * 通らなかったときに、何が惜しいのかを返す。
   * 失敗を黙って捨てず、次の一手が分かるようにするため。
   */
  diagnose?: (ctx: AssertContext) => string | null;
  explain: string;
  /** 通過条件の内訳。空なら check の一文だけを見せる */
  parts?: readonly StepPart[];
  /** 詰まったときに最後に見せる答え */
  answer?: string;
  /**
   * 「なぜ」で開く、遊べる図解。書かなければ手順の言葉とコマンドから選ぶ
   * （`src/lesson/diagrams/pick.ts`）
   */
  diagram?: DiagramId;
}

/** 操作の段の 1 手。札には目的を先に出し、打った後に街で起きたことを返す（CLAUDE.md 学びの流れ 4） */
export interface LessonStep extends LessonCoreStep {
  /** この操作で何を確かめるのか。札の先頭に 1 行で出す */
  purpose: string;
  /** 打った後、いま街で何が起きたか。通った瞬間に 1 行で返す */
  afterward: string;
}

export type MissionKind = 'training' | 'boss';

/** 目次での見え方。`src/content/types.ts` の LessonKind と同じ語彙 */
export type LessonKindMeta = 'concept' | 'drill' | 'challenge' | 'boss';

export type MissionTrack = 'kernel' | 'git' | 'k8s' | 'net' | 'github';

/**
 * 課題に入る前に読む「学ぶ」段階。
 * 知識ゼロの人が、これだけ読めば課題に手を付けられることを目指す。
 */
export interface LessonIntro {
  /** 一行で言うと何か */
  summary: string;
  /** なぜこれを学ぶのか。現場で何に効くのか */
  why: string;
  /** 前提知識。知らなくても読めば分かる程度に噛み砕く */
  concepts: readonly { term: string; plain: string }[];
  /** この任務で使うコマンドと、その意味 */
  commands: readonly { command: string; means: string }[];
}

/* ------------------------------------------------------------------ *
 * 学びの流れ（CLAUDE.md）: 体験 → 登場 → 確かめ → 操作 → 振り返り
 * ------------------------------------------------------------------ */

/**
 * 体験の遊びの種類。分野ごとに 1 つ。実体は `src/lesson/experience/`。
 * delivery=住所の無い町で荷物を届ける（シェル） blueprints=書き直した設計図の写しを抱える（Git）
 * dispatch=来る住人を手でビルへ案内する（Kubernetes） carts=道も案内板も無い所へ荷車を送る（ネットワーク）
 * overwrite=大勢で 1 枚の設計図を直す（GitHub）
 */
export type ExperienceKind = 'delivery' | 'blueprints' | 'dispatch' | 'carts' | 'overwrite';

/**
 * 遊びのひねり。同じ遊びでも、章ごとに「何に困るか」を変える。
 * 困りごとが違えば、次の段で現れる施設（それを代わりにやる仕組み）も違う。
 */
export interface ExperienceTwists {
  /** lost=届け先が分からない needle=紙の山から探す relay=同じ運びを何度も tamper=誰でも書き換える hog=暴れる働き手を探す mystery=止まった所を探す */
  delivery: 'lost' | 'needle' | 'relay' | 'tamper' | 'hog' | 'mystery';
  /** copies=写しが溜まり、どれがいつの版か分からない split=2 つの案が混ざる undo=前の版に戻したいのに戻せない */
  blueprints: 'copies' | 'split' | 'undo';
  /** arrivals=住人が次々に来て停電も起きる find=住人の居場所を探す sick=倒れた住人を探す handout=住人に紙を配って回る */
  dispatch: 'arrivals' | 'find' | 'sick' | 'handout';
  /** nosign=分かれ道の先が分からない names=名前から番号が分からない resend=届いたか分からず送り直す plates=番号札を手で配る */
  carts: 'nosign' | 'names' | 'resend' | 'plates';
  /** overwrite=互いの書き足しを上書きする review=誰かに見せてから写す checks=写す前に毎回試す notes=頼まれごとが散らばる */
  overwrite: 'overwrite' | 'review' | 'checks' | 'notes';
}

export type ExperienceTwist = ExperienceTwists[ExperienceKind];

/** 1. 体験。仕組みが「無い」町を、コマンド無しでマウスだけで回して困る（30〜90 秒） */
export type ExperienceScene = {
  [K in ExperienceKind]: {
    kind: K;
    twist: ExperienceTwists[K];
    /** 遊びの題。用語は使わない */
    title: string;
    /** 何をすればよいか。用語は使わない */
    goal: string;
    /** 遊び終えたとき、手でやって行き詰まった所を言い当てる 1 行。用語は使わない */
    trouble: string;
  };
}[ExperienceKind];

/** 登場の段で、用語を町の中の物に矢印で結ぶ */
export interface RevealPointer {
  /** 辞書の語 */
  term: string;
  /** 平易な言い換え。いま見ている物に結び付けて書く */
  plain: string;
  /** 町の中のどれのことか。体験の町の物の id（`src/lesson/experience/towns.ts`） */
  points: string;
}

/** 2. 登場。仕組みが町の施設として建ち、カメラが寄る。用語はここで初めて出す */
export interface RevealScene {
  /** 現れる施設の呼び名。括弧で本当の用語を添える（例: 配置係（scheduler）） */
  facility: string;
  /** 「さっきあなたが手でやっていた〇〇を、代わりにやる」の 1〜2 文 */
  replaces: string;
  /** 用語。いま映っている物に矢印で結ぶ。1 つ以上 */
  terms: readonly RevealPointer[];
  /** 本物の街（3D）でカメラが寄る建物の種類（`src/city/model.ts` の BuildingKind）。街に無ければ寄らない */
  focus?: readonly string[];
}

/**
 * 3. 確かめ。町の中で答えるクイズ。
 * pick=町の物を押して答える order=札を正しい順に並べる choice=文字の選択肢（補助。これだけにはしない）
 */
export type CityQuiz =
  | {
      kind: 'pick';
      question: string;
      /** 正解の物の id。全部選べば正解。1 つなら押した瞬間に判定する */
      answer: readonly string[];
      /** 外れたときに、図と一緒に出す理由 */
      why: string;
    }
  | {
      kind: 'order';
      question: string;
      /** 正しい順に並べた札。画面では混ぜて出す */
      cards: readonly string[];
      why: string;
    }
  | {
      kind: 'choice';
      question: string;
      options: readonly string[];
      answer: number;
      why: string;
    };

/** 5. 振り返り。街の変化を前後で並べ、分かったことを 3 行でまとめる */
export interface Recap {
  /** 始める前の街は、どうだったか（1 行） */
  before: string;
  /** 終えた後の街は、どうなったか（1 行） */
  after: string;
  /** 分かったこと。3 行 */
  lines: readonly [string, string, string];
}

/**
 * 書き手が書く任務。学びの流れのうち「操作」の段の中身だけを持つ。
 * 残りの段（体験・登場・確かめ・振り返り）と手順の目的は `flow/` にあり、
 * 一覧（registry）が組み立てるときに合わせて `LessonDefinition` にする。
 */
export interface LessonCore {
  /** training=練習, boss=障害対応 */
  kind: MissionKind;
  /** どの世界の任務か。地図の島に対応する */
  track: MissionTrack;
  /** カタログの LessonMeta.id と一致させる */
  id: string;
  title: string;
  /** 課題の前に読む説明 */
  intro: LessonIntro;
  objectives: readonly string[];
  /**
   * 終えたときに出す「ここまでで分かったこと」（3行）。
   * 書かなければ、目標と手順の説明から組み立てる（takeaways.ts）。
   */
  takeaways?: readonly string[];
  initial: SessionOptions;
  steps: readonly LessonCoreStep[];
  /** 想定手数。スコア計算に使う */
  parCommands: number;
}

/**
 * 画面が遊ぶ任務。5 段を順に持つ（CLAUDE.md「学びの流れ」。テストで検査する）。
 */
export interface LessonDefinition extends LessonCore {
  /** 1. 体験（コマンド無しで遊ぶ） */
  experience: ExperienceScene;
  /** 2. 登場（仕組みが施設として現れる。用語はここで出す） */
  reveal: RevealScene;
  /** 3. 確かめ（町の中で答える。1〜2 問） */
  quiz: readonly CityQuiz[];
  /** 4. 操作（各手順に purpose と afterward を必須） */
  steps: readonly LessonStep[];
  /** 5. 振り返り（前後比較と 3 行のまとめ） */
  recap: Recap;
}

export interface LessonProgressState {
  /** 今取り組んでいる手順（0 始まり） */
  stepIndex: number;
  cleared: boolean;
  hintsUsed: number;
  commandsUsed: number;
  /** 失敗した回数。罰ではなく、振り返りの材料として数える */
  mistakes: number;
  /** 解答を見て飛ばした手順（0 始まり）。スコアの減点と復習に使う */
  skipped: readonly number[];
}

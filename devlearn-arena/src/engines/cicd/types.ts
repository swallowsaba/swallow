/**
 * GitHub Actions の実行の記録（Git のサーバの置き場 forge に残る。gh run list・gh run view で読む）。
 * 保存から戻せるように、どれも JSON にできる値だけで持つ。
 */

export type Conclusion = 'success' | 'failure' | 'skipped' | 'waiting';

export interface StepRecord {
  /** 画面に出る名前（name が無ければ「Run <uses か run の 1 行目>」） */
  name: string;
  conclusion: Conclusion;
  startedAt: number;
  seconds: number;
  /** 出力の行（##[group] などの印を含む、本物の生のログの形） */
  log: string[];
  uses?: string;
  run?: string;
}

export interface JobRecord {
  id: number;
  /** jobs の下の鍵 */
  key: string;
  name: string;
  needs: string[];
  conclusion: Conclusion;
  startedAt: number;
  seconds: number;
  steps: StepRecord[];
  /** 受け取った成果物の名前 */
  downloaded: string[];
  /** 動かなかった訳（依存が成功しなかった） */
  skippedBecause?: string;
  /** 承認を待っている環境 */
  waitingFor?: string;
}

export interface ArtifactRecord {
  name: string;
  /** 上げた job の鍵 */
  job: string;
  /** 成果物の中のファイル（成果物の中の場所 → 中身） */
  files: Record<string, string>;
  digest: string;
}

/** ワークフローの形（実行した時の YAML から読んだ物。達成条件で、job の依存と手順を見る） */
export interface JobShape {
  key: string;
  needs: string[];
  /** 手順ごとの uses か run の中身 */
  steps: string[];
}

export interface RunRecord {
  id: number;
  number: number;
  /** ワークフローの name（無ければファイルの場所） */
  workflow: string;
  file: string;
  /** 記録の 1 行目 */
  title: string;
  branch: string;
  sha: string;
  event: 'push';
  startedAt: number;
  conclusion: 'success' | 'failure' | 'waiting';
  seconds: number;
  jobs: JobRecord[];
  artifacts: ArtifactRecord[];
  shape: JobShape[];
  /** ワークフローが動くきっかけ（on の鍵） */
  triggers?: string[];
  /** ワークフローのファイルの誤り（あれば job は動かない） */
  invalid?: string[];
}

/** 配る先のサーバの今（置いた版と今の版） */
export interface SiteState {
  host: string;
  current: string;
  releases: { version: string; files: Record<string, string> }[];
}

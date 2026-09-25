import { describe, expect, it } from 'vitest';
import { lookup } from '@/engines/lesson/glossary';
import { allMissions } from '@/engines/lesson/registry';
import { missionTerms, term, terms, termsIn } from './glossary';

/**
 * 用語の見張り（REWORK 5-4）。
 *
 * 学習者は用語を 1 つも知らない前提で作る。だから見張るのは 2 つ。
 * 1. 手順に出てきた辞書の語が、その任務の札に並ぶこと（説明なしに出さない）
 * 2. 辞書にも「名前の一覧」にも無いカタカナ語・英単語を、手順に書かないこと
 *    （新しい言葉を使いたければ、先に辞書へ足す）
 */

/** REWORK 5-1 が「最低限入れる」と指定した語 */
const REQUIRED: readonly string[] = [
  'Kubernetes', 'クラスタ', 'ノード', 'Pod', 'コンテナ', 'イメージ', 'Pending', 'Running', 'Ready',
  'Deployment', 'ReplicaSet', 'Service', 'Endpoints', 'Namespace', 'kubectl', 'git', 'コミット',
  'ブランチ', 'インデックス', 'リポジトリ', 'マージ', 'IP アドレス', 'ポート', 'パケット',
  'ルーティング', 'DNS', 'Pull Request', 'CI',
];

/** カタカナが 2 文字以上続く所 */
const KATAKANA = /[ァ-ヴ][ァ-ヴー]+/g;

/** 技術用語らしい英単語。途中に大文字が入るもの（NodePort）と、大文字だけのもの（CSV） */
const TECHNICAL = /\b[A-Za-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b|\b[A-Z]{2,}\b/g;

/**
 * 用語ではなく、練習の中で使う「名前」。
 *
 * ファイル名・環境変数名・ラベルの値・ログにそのまま出る英語など、
 * 意味を知らなくても手順が読めるもの。ここに書いたものだけが、辞書に無くても通る。
 * 新しい専門用語はここではなく辞書に足す。
 */
const NAMES: ReadonlySet<string> = new Set([
  // 練習で作るファイルや文書の名前
  'README', 'LICENSE', 'CHANGELOG', 'NOTES', 'RUNBOOK', 'POSTMORTEM', 'TODO', 'MIT', 'FROM',
  // CODEOWNERS などに書く役割の名前
  'OWNER', 'MAINTAINER', 'CONTACT', 'RECOVERY', 'NG',
  // 練習で設定する環境変数の名前
  'VERSION', 'ENDPOINT', 'REGION', 'TIER', 'MODE', 'CHANNEL', 'PORT', 'BUCKET', 'TIMEOUT',
  'CLUSTER', 'SHARD', 'RETRIES', 'LOCALE', 'TZ', 'WORKERS', 'SCHEDULE', 'RETENTION', 'LIMIT',
  'GREETING', 'TOKEN', 'ENV', 'DEBUG',
  // ログにそのまま出る文字
  'INFO', 'WARN', 'ERROR', 'GET',
  // 設定ファイルの項目名と、この練習場だけの設定名
  'PermitRootLogin', 'PasswordAuthentication', 'everyTicks',
  // プログラムが出す例外の名前。そのまま読む
  'ConnectionRefusedError', 'TimeoutError',
]);

describe('用語辞書', () => {
  it('最低限の語が載っている', () => {
    const missing = REQUIRED.filter((word) => term(word) === undefined);
    expect(missing).toEqual([]);
  });

  it('どの語にも、言い換えと街での例えと図解がある', () => {
    for (const entry of terms()) {
      expect({ term: entry.term, plain: entry.plain !== '', analogy: entry.analogy !== '' }).toEqual({
        term: entry.term,
        plain: true,
        analogy: true,
      });
      expect(entry.diagram).toMatch(/^[a-z-]+$/);
    }
  });

  it('語を引くと、別名でも同じものが返る', () => {
    expect(term('k8s')?.term).toBe('Kubernetes');
    expect(term('namespace')?.term).toBe('名前空間');
  });

  it('文章を切り分けると、辞書の語だけに印が付く', () => {
    const pieces = termsIn(['Pod をノードに置く']);
    expect(pieces.map((p) => p.term)).toEqual(['Pod', 'ノード']);
  });
});

describe('任務の手順に出てくる言葉', () => {
  const missions = allMissions().map((entry) => ({ id: entry.id, lesson: entry.build() }));

  it('手順に出てきた辞書の語は、その任務の札に並ぶ', () => {
    const missing: string[] = [];
    for (const { id, lesson } of missions) {
      const shown = new Set(missionTerms(lesson).map((t) => t.term));
      for (const step of lesson.steps) {
        for (const found of termsIn([step.prompt, step.check])) {
          if (!shown.has(found.term)) missing.push(`${id}: ${found.term}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('辞書にも名前の一覧にも無いカタカナ語・英単語を書かない', () => {
    const unknown = new Map<string, string>();
    for (const { id, lesson } of missions) {
      for (const step of lesson.steps) {
        for (const text of [step.prompt, step.check]) {
          for (const pattern of [KATAKANA, TECHNICAL]) {
            for (const word of text.match(pattern) ?? []) {
              if (lookup(word) !== undefined || NAMES.has(word)) continue;
              if (!unknown.has(word)) unknown.set(word, id);
            }
          }
        }
      }
    }
    expect([...unknown].map(([word, id]) => `${word}（${id}）`)).toEqual([]);
  });
});

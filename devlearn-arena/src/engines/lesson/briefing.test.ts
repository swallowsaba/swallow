import { describe, expect, it } from 'vitest';
import { briefingQuiz, briefingScript, quizPool, stableHash, tryouts } from './briefing';
import { allMissions, missionById } from './registry';
import type { LessonIntro } from './types';

const intro: LessonIntro = {
  summary: 'リポジトリを作る。',
  why: '歴史を残すため。',
  concepts: [
    { term: 'リポジトリ', plain: '歴史を保存している場所。' },
    { term: 'コミット', plain: 'その時点を記録した写真。' },
  ],
  commands: [
    { command: 'git init', means: 'ここをリポジトリにする' },
    { command: 'git add <ファイル>', means: '次のコミットに載せる' },
    { command: 'git status', means: '差を見る' },
  ],
};

const pool = {
  concepts: [
    ...intro.concepts,
    { term: 'ブランチ', plain: '枝分かれした線。' },
    { term: 'HEAD', plain: 'いまいる場所。' },
    { term: 'タグ', plain: '付箋。' },
  ],
  commands: [...intro.commands, { command: 'git log', means: '歴史を並べる' }, { command: 'git diff', means: '差分を出す' }],
};

describe('依頼の台本', () => {
  it('依頼 → なぜ → 言葉 → 道具 → 工程 の順に話す', () => {
    const lines = briefingScript('最初のコミット', intro, [{ prompt: 'git init せよ' }, { prompt: 'コミットせよ' }]);
    expect(lines.map((l) => l.kind)).toEqual(['request', 'why', 'concept', 'concept', 'tool', 'tool', 'tool', 'plan']);
    const first = lines[0];
    expect(first?.kind === 'request' && first.text.includes('最初のコミット')).toBe(true);
    expect(lines[lines.length - 1]).toEqual({ kind: 'plan', steps: ['git init せよ', 'コミットせよ'] });
  });
});

describe('理解度チェック', () => {
  it('何度作っても同じ問題になり、正解が必ず選択肢にある', () => {
    const a = briefingQuiz('git/01/objects', intro, pool);
    expect(briefingQuiz('git/01/objects', intro, pool)).toEqual(a);
    expect(a.filter((q) => q.kind === 'concept')).toHaveLength(2);
    expect(a.filter((q) => q.kind === 'command')).toHaveLength(2);
    for (const q of a) {
      const correct =
        q.kind === 'concept'
          ? intro.concepts.find((c) => c.term === q.subject)?.plain
          : intro.commands.find((c) => c.command === q.subject)?.means;
      expect(q.choices[q.answer]).toBe(correct);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it('コマンドの問題に正解すると、そのコマンドが道具として手に入る', () => {
    const q = briefingQuiz('x', intro, pool).find((item) => item.kind === 'command');
    expect(q?.reward).toBe(q?.subject);
  });

  it('間違いの選択肢には、同じ任務のほかの説明を使わない（正解が2つにならない）', () => {
    for (const q of briefingQuiz('y', intro, pool).filter((item) => item.kind === 'concept')) {
      const wrong = q.choices.filter((_, i) => i !== q.answer);
      for (const w of wrong) expect(intro.concepts.map((c) => c.plain)).not.toContain(w);
    }
  });

  it('全任務で、2 択以上・正解 1 つの問題が作れる', () => {
    for (const m of allMissions()) {
      const questions = briefingQuiz(m.id, m.intro, quizPool(m.track));
      expect(questions.length, m.id).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.choices.length, m.id).toBeGreaterThanOrEqual(2);
        expect(q.answer, m.id).toBeGreaterThanOrEqual(0);
        expect(new Set(q.choices).size, m.id).toBe(q.choices.length);
      }
    }
  });

  it('同じ文字列からは同じ値', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
  });
});

describe('試し打ち', () => {
  it('穴埋めの無い道具だけを、練習用の状態で上から順に打つ', () => {
    const results = tryouts(intro, { files: { '/home/learner': null } });
    expect(results.map((r) => r.command)).toEqual(['git init', 'git status']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('任務の初期状態から打つので、その任務の世界で結果が見える', () => {
    const mission = missionById('k8s/01/first-kubectl')?.build();
    if (!mission) throw new Error('任務がありません');
    const results = tryouts(mission.intro, mission.initial);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.output.join('\n').includes('node'))).toBe(true);
  });
});

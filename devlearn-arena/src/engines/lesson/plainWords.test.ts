import { describe, expect, it } from 'vitest';
import { TRACKS } from '@/content/catalog';
import { ja } from '@/i18n/ja';
import { glossary } from './glossary';
import { bareHardWords } from './plainWords';
import { allMissions } from './registry';
import { takeawaysOf } from './takeaways';

/** 見つかった硬い言葉を「どこで・何を」の形にする */
function offenders(where: string, texts: readonly string[]): string[] {
  return texts.flatMap((text) => bareHardWords(text).map((word) => `${where}: ${word} — ${text.slice(0, 60)}`));
}

describe('硬い言葉には、その場で言い換えを添える', () => {
  it('言い換えがあれば通り、無ければ見つける', () => {
    expect(bareHardWords('これを宣言的という')).toEqual(['宣言的']);
    expect(bareHardWords('宣言的（完成図を渡すやり方）に作る')).toEqual([]);
    expect(bareHardWords('全部の口に流す（フラッディング）')).toEqual([]);
  });

  it('任務の文章（題・学ぶ画面・手順・説明・ヒント・まとめ）', () => {
    const found: string[] = [];
    for (const entry of allMissions()) {
      const lesson = entry.build();
      const { intro } = lesson;
      found.push(
        ...offenders(entry.id, [
          lesson.title,
          intro.summary,
          intro.why,
          // 言い換えそのものが硬い言葉だと、言い換えにならない
          ...intro.concepts.map((c) => c.plain),
          ...intro.commands.map((c) => c.means),
          ...lesson.objectives,
          ...takeawaysOf(lesson),
          ...lesson.steps.flatMap((s) => [s.prompt, s.check, s.explain, ...s.hints, ...(s.parts ?? []).map((p) => p.label)]),
        ]),
      );
    }
    expect(found).toEqual([]);
  });

  it('目次（章の名前と説明、レッスンの名前）', () => {
    const found = TRACKS.flatMap((track) =>
      track.chapters.flatMap((ch) =>
        offenders(ch.id, [track.goal, ch.title, ch.summary, ...ch.lessons.map((l) => l.title)]),
      ),
    );
    expect(found).toEqual([]);
  });

  it('画面の文言と、用語集の言い換え', () => {
    expect(offenders('画面', Object.values(ja))).toEqual([]);
    expect(offenders('用語集', glossary().map((c) => c.plain))).toEqual([]);
  });
});

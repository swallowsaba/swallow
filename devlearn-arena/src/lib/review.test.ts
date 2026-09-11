import { describe, expect, it } from 'vitest';
import { addDays, createItem, dueItems, MIN_EASE, remove, schedule, shouldReview, upsert } from './review';

const TODAY = '2026-05-01';

describe('日付', () => {
  it('日数を足せる', () => {
    expect(addDays(TODAY, 1)).toBe('2026-05-02');
    expect(addDays(TODAY, 31)).toBe('2026-06-01');
  });
  it('月をまたぐ', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });
});

describe('間隔の決め方', () => {
  it('最初は翌日', () => {
    expect(createItem('a', TODAY).due).toBe('2026-05-02');
  });

  it('1回目は 1 日、2回目は 3 日', () => {
    let item = createItem('a', TODAY);
    item = schedule(item, 'good', TODAY);
    expect(item.intervalDays).toBe(1);
    item = schedule(item, 'good', TODAY);
    expect(item.intervalDays).toBe(3);
  });

  it('3回目以降は倍率で伸びる', () => {
    let item = createItem('a', TODAY);
    for (let i = 0; i < 3; i += 1) item = schedule(item, 'good', TODAY);
    expect(item.intervalDays).toBeGreaterThan(3);
  });

  it('間違えたら翌日に戻る', () => {
    let item = createItem('a', TODAY);
    for (let i = 0; i < 4; i += 1) item = schedule(item, 'good', TODAY);
    item = schedule(item, 'again', TODAY);
    expect(item.intervalDays).toBe(1);
    expect(item.reps).toBe(0);
  });

  it('間違えると倍率が下がる', () => {
    const first = schedule(createItem('a', TODAY), 'again', TODAY);
    expect(first.ease).toBeLessThan(2.5);
  });

  it('倍率には下限がある', () => {
    let item = createItem('a', TODAY);
    for (let i = 0; i < 20; i += 1) item = schedule(item, 'again', TODAY);
    expect(item.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it('簡単なら倍率が上がる', () => {
    expect(schedule(createItem('a', TODAY), 'easy', TODAY).ease).toBeGreaterThan(2.5);
  });

  it('間隔は上限で止まる', () => {
    let item = createItem('a', TODAY);
    for (let i = 0; i < 40; i += 1) item = schedule(item, 'easy', TODAY);
    expect(item.intervalDays).toBeLessThanOrEqual(180);
  });
});

describe('今日の分', () => {
  const queue = [
    { lessonId: 'a', due: '2026-04-28', intervalDays: 1, ease: 2.5, reps: 1 },
    { lessonId: 'b', due: '2026-05-01', intervalDays: 3, ease: 2.5, reps: 2 },
    { lessonId: 'c', due: '2026-06-01', intervalDays: 9, ease: 2.5, reps: 3 },
  ];

  it('期限が来たものだけ出る', () => {
    expect(dueItems(queue, TODAY).map((i) => i.lessonId)).toEqual(['a', 'b']);
  });

  it('遅れているものが先に来る', () => {
    expect(dueItems(queue, TODAY)[0]?.lessonId).toBe('a');
  });

  it('無ければ空', () => {
    expect(dueItems([], TODAY)).toEqual([]);
  });
});

describe('積むかどうか', () => {
  it('ヒントを使ったら積む', () => {
    expect(shouldReview({ hintsUsed: 1, mistakes: 0, score: 100 })).toBe(true);
  });
  it('失敗したら積む', () => {
    expect(shouldReview({ hintsUsed: 0, mistakes: 2, score: 100 })).toBe(true);
  });
  it('点が低ければ積む', () => {
    expect(shouldReview({ hintsUsed: 0, mistakes: 0, score: 60 })).toBe(true);
  });
  it('解答を見て飛ばした手順があれば、点にかかわらず必ず積む', () => {
    expect(shouldReview({ hintsUsed: 0, mistakes: 0, score: 100, skipped: 1 })).toBe(true);
  });
  it('問題なく解けたら積まない', () => {
    expect(shouldReview({ hintsUsed: 0, mistakes: 0, score: 100 })).toBe(false);
  });
});

describe('待ち行列', () => {
  it('同じ任務は上書きする', () => {
    const queue = upsert([], createItem('a', TODAY));
    const updated = upsert(queue, { ...createItem('a', TODAY), intervalDays: 9 });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.intervalDays).toBe(9);
  });
  it('取り除ける', () => {
    expect(remove([createItem('a', TODAY)], 'a')).toEqual([]);
  });
});

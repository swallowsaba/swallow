import { describe, expect, it } from 'vitest';
import { CARGO_SHAPES, journeyOf, wordsOf, type Journey } from './journey';
import type { Building, BuildingKind, City } from './model';

/**
 * コマンドが街を旅する道のり。
 *
 * 見たいのは 3 つ。
 * 1. 荷車が停留所を 2 つ以上巡ること（同じ場所でぐるぐる回らない）
 * 2. 停留所を過ぎるたびに積荷の姿が変わること
 * 3. 同じコマンドと同じ街からは、必ず同じ道のりになること（乱数を使わない）
 */

function building(id: string, kind: BuildingKind, label = id): Building {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    level: 1,
    label,
    occupants: [],
    state: 'normal',
    phase: 'done',
    district: 'kernel',
  };
}

function city(buildings: readonly Building[]): Pick<City, 'buildings'> {
  return { buildings: [...buildings] };
}

/** 一通りの建物がそろった街 */
const FULL = city([
  building('file:/home/learner/README.md', 'hut', 'README.md'),
  building('file:/home/learner/notes.txt', 'hut', 'notes.txt'),
  building('index', 'depot', '倉庫'),
  building('commit:abc1234', 'monument', '最初の記録'),
  building('branch:main', 'flag', 'main'),
  building('deploy:default/web', 'office', 'web'),
  building('node:node-1', 'tower', 'node-1'),
  building('node:node-2', 'tower', 'node-2'),
  building('dev:r1', 'relay', 'r1'),
  building('dev:r2', 'relay', 'r2'),
  building('pr:1', 'window', 'PR #1'),
  building('job:build', 'line', 'build'),
]);

const stopsOf = (journey: Journey | null): string[] => (journey?.stops ?? []).map((stop) => stop.building);
const cargoOf = (journey: Journey | null): string[] => (journey?.stops ?? []).map((stop) => stop.cargo);

describe('コマンドを語に割る', () => {
  it('1 行目だけを見る', () => {
    expect(wordsOf('git add README.md\n次の行')).toEqual(['git', 'add', 'README.md']);
  });

  it('空の行からは何も出ない', () => {
    expect(wordsOf('   ')).toEqual([]);
  });
});

describe('荷車が街を旅する', () => {
  it('空の行では旅に出ない', () => {
    expect(journeyOf('', FULL)).toBeNull();
  });

  it('建物の無い街では旅に出ない', () => {
    expect(journeyOf('git add README.md', city([]))).toBeNull();
  });

  it('停留所が 1 つしか無いときは旅に出ない', () => {
    expect(journeyOf('git add README.md', city([building('index', 'depot')]))).toBeNull();
  });

  it('git add は家から倉庫へ運ぶ', () => {
    const journey = journeyOf('git add notes.txt', FULL);
    expect(stopsOf(journey)).toEqual(['file:/home/learner/notes.txt', 'index']);
  });

  it('git commit は倉庫から記念碑へ、そして旗まで進む', () => {
    expect(stopsOf(journeyOf('git commit -m "first"', FULL))).toEqual(['index', 'commit:abc1234', 'branch:main']);
  });

  it('kubectl apply は事務所からビルへ運ぶ', () => {
    const journey = journeyOf('kubectl apply -f web.yaml', FULL);
    expect(stopsOf(journey)).toEqual(['deploy:default/web', 'node:node-1']);
  });

  it('kubectl drain は住人を別のビルへ移す（同じビルで折り返さない）', () => {
    const stops = stopsOf(journeyOf('kubectl drain node-2', FULL));
    expect(stops).toEqual(['node:node-2', 'node:node-1']);
    expect(new Set(stops).size).toBe(stops.length);
  });

  it('引数で名指しされた建物が停留所になる', () => {
    expect(stopsOf(journeyOf('git add README.md', FULL))[0]).toBe('file:/home/learner/README.md');
    expect(stopsOf(journeyOf('git add notes.txt', FULL))[0]).toBe('file:/home/learner/notes.txt');
  });

  it('パスで書かれていても、末尾の名前で家に当たる', () => {
    expect(stopsOf(journeyOf('git add ./docs/notes.txt', FULL))[0]).toBe('file:/home/learner/notes.txt');
  });

  it('表に無いコマンドでも、街のどこかへ荷が走る', () => {
    const journey = journeyOf('uname -a', FULL);
    expect(stopsOf(journey).length).toBeGreaterThanOrEqual(2);
  });

  it('建ち上がっていない建物は停留所にしない', () => {
    const half = city([
      { ...building('file:/home/learner/a.txt', 'hut', 'a.txt'), phase: 'frame' },
      building('index', 'depot'),
    ]);
    expect(journeyOf('git add a.txt', half)).toBeNull();
  });

  it('停留所を飛ばしても、残りで旅が続く', () => {
    const noFlag = city([building('index', 'depot'), building('commit:abc1234', 'monument')]);
    expect(stopsOf(journeyOf('git commit -m x', noFlag))).toEqual(['index', 'commit:abc1234']);
  });
});

describe('積荷が姿を変える', () => {
  it('停留所ごとに積荷の姿が変わる', () => {
    const shapes = cargoOf(journeyOf('git commit -m "first"', FULL));
    expect(shapes).toEqual(['crate', 'stone', 'seal']);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('どの停留所でも、隣り合う積荷は同じ姿にならない', () => {
    const lines = [
      'git add README.md', 'git commit -m x', 'git push origin main', 'git merge feature',
      'git switch main', 'kubectl apply -f web.yaml', 'kubectl delete pod web', 'kubectl cordon node-1',
      'kubectl expose deployment web', 'gh pr create', 'ping r2', 'curl http://r2', 'cp a b', 'mv a b',
      'uname -a',
    ];
    for (const line of lines) {
      const journey = journeyOf(line, FULL);
      expect(journey, line).not.toBeNull();
      const shapes = cargoOf(journey);
      for (let i = 1; i < shapes.length; i += 1) expect(shapes[i], `${line} #${String(i)}`).not.toBe(shapes[i - 1]);
    }
  });

  it('積荷の姿は決めた 5 種類のどれか。呼び名も必ず付く', () => {
    for (const stop of journeyOf('gh pr create', FULL)?.stops ?? []) {
      expect(CARGO_SHAPES).toContain(stop.cargo);
      expect(stop.cargoLabel.length).toBeGreaterThan(0);
      expect(stop.label.length).toBeGreaterThan(0);
    }
  });
});

describe('同じ操作からは同じ道のり', () => {
  it('何度導いても結果が変わらない', () => {
    const once = journeyOf('kubectl apply -f web.yaml', FULL, 3);
    const twice = journeyOf('kubectl apply -f web.yaml', FULL, 3);
    expect(once).toEqual(twice);
  });

  it('建物の並び順が変わっても道のりは同じ', () => {
    const flipped = city([...FULL.buildings].reverse());
    expect(stopsOf(journeyOf('git commit -m x', flipped))).toEqual(stopsOf(journeyOf('git commit -m x', FULL)));
  });

  it('旅の番号が変われば別の旅として数える', () => {
    expect(journeyOf('ls', FULL, 1)?.id).not.toBe(journeyOf('ls', FULL, 2)?.id);
  });
});

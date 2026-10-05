import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';
import { runJq } from './jq';

const ITEMS = '[{"id":1,"name":"灯台の模型","stock":0},{"id":2,"name":"港の地図","stock":5},{"id":3,"name":"帆船の栞","stock":0}]';

let session: Session;
beforeEach(() => {
  session = createSession({ files: { '/home/learner': null, '/home/learner/items.json': `${ITEMS}\n`, '/home/learner/bad.json': "{'a': 1}\n" } });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') => outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('jq（JSON から値を取り出す）', () => {
  it('. は全体を 2 字下げで整えて出す', () => {
    expect(runJq('.', '{"a":[1,2],"b":{"c":"x"}}', {})).toEqual({ out: '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": "x"\n  }\n}\n', code: 0 });
  });

  it('.key・.[n]・.[] で中へたどり、| でつなぐ。-r は文字列を引用符なしで出す', () => {
    expect(run('jq ".[1].name" items.json').out).toBe('"港の地図"\n');
    expect(run('jq -r ".[] | .name" items.json').out).toBe('灯台の模型\n港の地図\n帆船の栞\n');
    expect(runJq('.a[1]', '{"a":[1,2]}', {}).out).toBe('2\n');
    expect(runJq('.[-1].id', ITEMS, {}).out).toBe('3\n');
  });

  it('select で条件に合う物だけ残す。length・keys・map・[...] で集める', () => {
    expect(run(`jq -r '.[] | select(.stock == 0) | .name' items.json`).out).toBe('灯台の模型\n帆船の栞\n');
    expect(runJq('[.[] | select(.stock > 0)] | length', ITEMS, {}).out).toBe('1\n');
    expect(runJq('.[0] | keys', ITEMS, { compact: true }).out).toBe('["id","name","stock"]\n');
    expect(runJq('map(.id)', ITEMS, { compact: true }).out).toBe('[1,2,3]\n');
    expect(runJq('.[] | select(.stock == 0 and .id > 1) | .id', ITEMS, {}).out).toBe('3\n');
  });

  it('パイプの前のコマンドの出力（標準入力）も読む', () => {
    expect(run(`cat items.json | jq '.[0].stock'`).out).toBe('0\n');
  });

  it('配列に .name と書くと、本物と同じ言い方で失敗する（配列と 1 つの値の取り違え）', () => {
    const r = run('jq ".name" items.json');
    expect(r.code).toBe(5);
    expect(r.err).toBe('jq: error (at items.json:1): Cannot index array with "name"\n');
    expect(runJq('.[]', '3', {})).toMatchObject({ code: 5, err: 'jq: error (at <stdin>:0): Cannot iterate over number (3)\n' });
  });

  it('JSON でない入力と、読めない式', () => {
    const bad = run('jq . bad.json');
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('parse error: Invalid');
    const syntax = run('jq ".[] | select(.stock = = 0)" items.json');
    expect(syntax.code).toBe(3);
    expect(syntax.err).toContain('jq: 1 compile error');
  });
});

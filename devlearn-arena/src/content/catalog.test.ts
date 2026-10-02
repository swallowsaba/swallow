import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG, DOMAIN_DEFS, DOMAIN_ORDER, ENTRIES, entryOf } from './catalog';
import { buildCatalog, parseCurriculum, parseDesign } from './curriculum';
import { DOMAIN_IDS } from './schema';

const docs = (p: string): string => readFileSync(join(__dirname, '../../docs', p), 'utf8');
const curriculum = docs('curriculum.md');
const designs = Object.fromEntries(DOMAIN_IDS.map((d) => [d, docs(`lessons/${d}.md`)]));

describe('全レッスンの目録（content/catalog.json）', () => {
  it('docs/curriculum.md の表から書き起こした物と一致する（手で直していない）', () => {
    expect(CATALOG).toEqual(buildCatalog(curriculum, [...DOMAIN_DEFS], designs));
  });

  it('211 本。分野ごとの本数が docs/curriculum.md 5 章の分量の表と一致する', () => {
    expect(ENTRIES).toHaveLength(211);
    const table = curriculum.split('## 5. 分量の目安')[1] ?? '';
    for (const line of table.split(/\r?\n/)) {
      const m = /^\| ([a-z]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(line);
      if (!m) continue;
      const d = ENTRIES.filter((e) => e.domain === m[1]);
      expect([d.filter((e) => e.level === 'beginner').length, d.filter((e) => e.level === 'intermediate').length, d.filter((e) => e.level === 'advanced').length], m[1])
        .toEqual([Number(m[2]), Number(m[3]), Number(m[4])]);
    }
  });

  it('研究（総合演習）の表は列が違っても、題名と到達目標を正しく読む', () => {
    expect(entryOf('lab.i.01')).toMatchObject({ title: 'Web サービスを公開する', goal: 'サーバを用意し、Web サーバを動かし、HTTPS で公開できる', uses: ['linux', 'net', 'web', 'sec'] });
    expect(entryOf('lab.a.03')?.prerequisiteNote).toBe('任意の中級 2 分野');
    for (const e of ENTRIES) expect(e.practice.length, e.id).toBeGreaterThan(0);
  });

  it('推奨学習順は、2 章の分野の順（初めて出た順）→ 各表の行の順', () => {
    expect(DOMAIN_ORDER).toEqual(['found', 'linux', 'net', 'web', 'sec', 'git', 'trouble', 'db', 'cicd', 'ctr', 'docker', 'k8s', 'lab', 'mon', 'cloud', 'devops']);
    const rows = parseCurriculum(curriculum).rows;
    for (const d of DOMAIN_ORDER) {
      expect(ENTRIES.filter((e) => e.domain === d).map((e) => e.id), d).toEqual(rows.filter((r) => r.domain === d).map((r) => r.id));
    }
    expect(ENTRIES[0]?.id).toBe('found.b.01');
  });

  it('推奨前提・関連・次の ID が全て目録にある', () => {
    for (const e of ENTRIES) {
      for (const id of [...e.prerequisites, ...e.related, ...e.next]) expect(entryOf(id), `${e.id} → ${id}`).toBeDefined();
    }
  });

  it('推奨前提の辺に循環が無い', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') throw new Error(`循環: ${[...path, id].join(' → ')}`);
      state.set(id, 'visiting');
      for (const p of entryOf(id)?.prerequisites ?? []) visit(p, [...path, id]);
      state.set(id, 'done');
    };
    for (const e of ENTRIES) expect(() => visit(e.id, [])).not.toThrow();
  });

  it('どのレッスンにもロックが無い（目録の形に、始めるのを止める項目を持てない）', () => {
    const allowed = ['id', 'domain', 'level', 'theme', 'title', 'goal', 'practice', 'prerequisites', 'prerequisiteNote', 'related', 'next', 'uses'];
    for (const e of ENTRIES) for (const k of Object.keys(e)) expect(allowed, `${e.id}.${k}`).toContain(k);
    expect(() => buildCatalog(curriculum, [...DOMAIN_DEFS], designs)).not.toThrow();
  });

  it('docs/lessons/ の設計の見出しと、ID・題名・難易度が一致する（全 211 本の設計がある）', () => {
    const headings = Object.values(designs).flatMap((t) => parseDesign(t));
    expect(headings.map((h) => h.id).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
    for (const h of headings) expect({ title: h.title, level: h.level }, h.id).toEqual({ title: entryOf(h.id)?.title, level: entryOf(h.id)?.level });
  });
});

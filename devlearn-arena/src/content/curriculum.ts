/**
 * docs/curriculum.md と docs/lessons/ の表と見出しを読む（純粋な関数。文字列を受け取る）。
 * 全レッスンの目録（content/catalog.json）を書き起こす道具（scripts/build-catalog.mts）と、
 * 目録が仕様書と食い違っていないかを確かめるテストが使う。
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type PracticeMode = 'terminal' | 'simulation' | 'sql' | 'editor';

export interface CurriculumRow {
  id: string;
  domain: string;
  level: Level;
  theme: string;
  title: string;
  goal: string;
  /** 実戦の形（表の記号: 端・模・S・編） */
  practice: PracticeMode[];
  prerequisites: string[];
  /** 推奨前提がレッスン ID で書けないもの（例: 任意の中級 2 分野） */
  prerequisiteNote?: string;
  related: string[];
  next: string[];
  /** 研究（総合演習）で使う分野 */
  uses?: string[];
}

export interface CurriculumDomain {
  id: string;
  /** 各分野の「テーマ:」の行 */
  themes: string[];
}

const LEVELS: Record<string, Level> = { 初級: 'beginner', 中級: 'intermediate', 上級: 'advanced' };
export const PRACTICE_MARKS: Record<string, PracticeMode> = { 端: 'terminal', 模: 'simulation', S: 'sql', 編: 'editor' };
const ID = /^[a-z0-9]+\.[bia]\.\d+$/;

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const ids = (cell: string): string[] => cell.split(/[,、]\s*/).map((s) => s.trim()).filter((s) => ID.test(s));
const marks = (cell: string): PracticeMode[] => cell.split('・').map((s) => PRACTICE_MARKS[s.trim()]).filter((m): m is PracticeMode => m !== undefined);

/** 4 章の各分野の表 */
export function parseCurriculum(text: string): { domains: CurriculumDomain[]; rows: CurriculumRow[] } {
  const domains: CurriculumDomain[] = [];
  const rows: CurriculumRow[] = [];
  let domain: CurriculumDomain | null = null;
  let header: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^### 4\.\d+ .+（([a-z0-9]+)）/.exec(line);
    if (h) {
      domain = { id: h[1] as string, themes: [] };
      domains.push(domain);
      header = null;
      continue;
    }
    if (!domain) continue;
    if (line.startsWith('テーマ:')) {
      domain.themes = line.replace(/^テーマ:\s*/, '').split(' / ').map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (!line.startsWith('|')) continue;
    const c = cells(line);
    if (c[0] === 'ID') {
      header = c;
      continue;
    }
    if (!header || !ID.test(c[0] ?? '')) continue;
    const col = (name: string): string => {
      const i = header?.indexOf(name) ?? -1;
      return i >= 0 ? (c[i] ?? '') : '';
    };
    const prereq = col('推奨前提');
    const prerequisites = ids(prereq);
    const row: CurriculumRow = {
      id: c[0] as string,
      domain: domain.id,
      level: LEVELS[col('難易度')] ?? 'beginner',
      theme: col('テーマ') || '総合',
      title: col('レッスン') || col('課題'),
      goal: col('到達目標'),
      practice: marks(col('実戦')),
      prerequisites,
      related: ids(col('関連')),
      next: ids(col('次に学ぶとよい')),
    };
    if (prerequisites.length === 0 && prereq !== '—' && prereq !== '') row.prerequisiteNote = prereq;
    if (header.includes('使う分野')) row.uses = col('使う分野').split('・').map((s) => s.trim());
    rows.push(row);
  }
  return { domains, rows };
}

/**
 * 2 章の推奨学習順に出てくる分野の順（初めて出た順）。
 * 推奨学習順は「2 章の分野の順と、各表の行の順（上から）」で決まる（docs/curriculum.md の冒頭）。
 */
export function parseDomainOrder(text: string, domainNames: Record<string, string>): string[] {
  const section = text.split(/^## 2\. 推奨学習順/m)[1]?.split(/^## 3\./m)[0] ?? '';
  const block = /```text\r?\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
  const order: string[] = [];
  // 行の中で、分野の名前（「Linux / CLI」の「Linux」、「研究（総合演習）」の「研究」のような略も）か、括弧の中の ID（「（sec 初級の一部）」）が出た位置
  for (const line of block.split(/\r?\n/)) {
    const found: { at: number; id: string }[] = [];
    for (const m of line.matchAll(/（([a-z0-9]+) [^）]*）/g)) found.push({ at: m.index, id: m[1] as string });
    for (const [id, name] of Object.entries(domainNames)) {
      const words = [name, name.split(' / ')[0] ?? name, name.split('（')[0] ?? name];
      const at = Math.min(...words.map((w) => line.indexOf(w)).filter((i) => i >= 0));
      if (Number.isFinite(at)) found.push({ at, id });
    }
    found.sort((a, b) => a.at - b.at);
    for (const f of found) if (!order.includes(f.id)) order.push(f.id);
  }
  return order;
}

/**
 * 目録（content/catalog.json）を作る。推奨学習順（2 章の分野の順 → 各表の行の順）に並べる。
 * 実戦の列が無い表（研究）は、docs/lessons/ の設計の実戦の形を使う。テーマの行が無い分野は、表の行のテーマを出た順に使う。
 */
export function buildCatalog(curriculum: string, domains: { id: string; name: string }[], designs: Record<string, string>) {
  const { domains: tables, rows } = parseCurriculum(curriculum);
  const domainOrder = parseDomainOrder(curriculum, Object.fromEntries(domains.map((d) => [d.id, d.name])));
  for (const d of domains) if (!domainOrder.includes(d.id)) domainOrder.push(d.id);
  const design = new Map(Object.values(designs).flatMap((t) => parseDesign(t)).map((h) => [h.id, h]));
  const lessons = domainOrder.flatMap((d) => rows.filter((r) => r.domain === d)).map((r) => (r.practice.length > 0 ? r : { ...r, practice: design.get(r.id)?.practice ?? [] }));
  const themes = Object.fromEntries(domainOrder.map((d) => {
    const listed = tables.find((t) => t.id === d)?.themes ?? [];
    return [d, listed.length > 0 ? listed : [...new Set(rows.filter((r) => r.domain === d).map((r) => r.theme))]];
  }));
  return {
    note: '全レッスンの目録（docs/curriculum.md 4 章の表から scripts/build-catalog.mts で書き起こす。手で直さない）。推奨学習順（2 章の分野の順 → 各表の行の順）に並べる',
    domainOrder,
    themes,
    lessons,
  };
}

export interface DesignHeading {
  id: string;
  title: string;
  theme: string;
  level: Level;
  practice: PracticeMode[];
}

/** docs/lessons/<分野>.md の各レッスンの見出しと実戦の形 */
export function parseDesign(text: string): DesignHeading[] {
  const out: DesignHeading[] = [];
  let cur: DesignHeading | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^### ([a-z0-9]+\.[bia]\.\d+) (.+)（([^（）]+)・(初級|中級|上級)）$/.exec(line);
    if (h) {
      cur = { id: h[1] as string, title: (h[2] as string).trim(), theme: h[3] as string, level: LEVELS[h[4] as string] as Level, practice: [] };
      out.push(cur);
      continue;
    }
    const p = /^- 実戦（([^）]*)）/.exec(line);
    if (cur && p) cur.practice = marks(p[1] as string);
  }
  return out;
}

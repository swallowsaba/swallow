/**
 * コンテンツの検証（docs/content-spec.md 6 章）。検証に失敗したコンテンツはビルドで落とす。
 *
 *   npm run content:check   （npm run build の最初にも走る）
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRIES } from '../src/content/catalog';
import { parseDesign } from '../src/content/curriculum';
import { ERROR_GUIDES, TERMS } from '../src/content/glossary';
import { loadAllLessons } from '../src/content/lessons';
import { MISSIONS } from '../src/content/missions';
import { DOMAIN_IDS } from '../src/content/schema';
import { validateFigure, validateGlossary, validateLesson, validateMission } from '../src/content/validate';
import { LANDMARKS } from '../src/city/facilities';
import { accent, domain, FONT_SIZES, hud, state } from '../src/ui/tokens';

const root = join(import.meta.dirname, '..');
const figureDir = join(root, 'content/figures');
const figures = new Map(readdirSync(figureDir).filter((f) => f.endsWith('.svg')).map((f) => [f.replace(/\.svg$/, ''), readFileSync(join(figureDir, f), 'utf8')]));
const catalog = new Map(ENTRIES.map((e) => [e.id, e]));
const ctx = {
  catalog,
  terms: new Map(TERMS.map((t) => [t.id, t])),
  errors: new Set(ERROR_GUIDES.map((e) => e.id)),
  guides: ERROR_GUIDES,
  figures,
  designs: new Set(DOMAIN_IDS.flatMap((d) => parseDesign(readFileSync(join(root, `docs/lessons/${d}.md`), 'utf8')).map((h) => h.id))),
};
const colors = new Set([...Object.values(hud), ...Object.values(accent), ...Object.values(state), ...Object.values(domain), '#0a1424'].filter((c) => c.startsWith('#')).map((c) => c.toLowerCase()));

const problems: string[] = [];
for (const l of await loadAllLessons()) problems.push(...validateLesson(l, ctx).map((p) => `${l.id}: ${p}`));
for (const m of MISSIONS) problems.push(...validateMission(m, { ...ctx, landmarks: new Set(LANDMARKS.map((l) => l.id)) }).map((p) => `ミッション ${m.id}: ${p}`));
problems.push(...validateGlossary(TERMS, catalog).map((p) => `用語集: ${p}`));
for (const [id, svg] of figures) problems.push(...validateFigure(svg, colors, FONT_SIZES).map((p) => `図 ${id}: ${p}`));

if (problems.length > 0) {
  console.error(`コンテンツの検証に失敗した（${String(problems.length)} 件）:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`コンテンツの検証: 目録 ${String(ENTRIES.length)} 本・レッスン・ミッション ${String(MISSIONS.length)} 本・用語 ${String(TERMS.length)}・図 ${String(figures.size)} に問題なし`);

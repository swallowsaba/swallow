import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { accent, domain, hud, state } from '@/ui/tokens';
import { FONT_SIZES } from '@/ui/tokens';
import { ENTRIES, inFirstRelease } from '@/content/catalog';
import { parseDesign } from '@/content/curriculum';
import { ERROR_GUIDES, TERMS } from '@/content/glossary';
import { AUTHORED, loadAllLessons, loadLesson } from '@/content/lessons';
import { DOMAIN_IDS, type Lesson } from '@/content/schema';
import { validateFigure, validateGlossary, validateLesson, type ValidateContext } from '@/content/validate';

/** docs/content-spec.md 6 章の検証を、書き起こした全てのコンテンツに掛ける */

const root = join(__dirname, '../..');
const figureDir = join(root, 'content/figures');
const figures = new Map(readdirSync(figureDir).filter((f) => f.endsWith('.svg')).map((f) => [f.replace(/\.svg$/, ''), readFileSync(join(figureDir, f), 'utf8')]));
const designs = new Set(DOMAIN_IDS.flatMap((d) => parseDesign(readFileSync(join(root, `docs/lessons/${d}.md`), 'utf8')).map((h) => h.id)));
const ctx: ValidateContext = {
  catalog: new Map(ENTRIES.map((e) => [e.id, e])),
  terms: new Map(TERMS.map((t) => [t.id, t])),
  errors: new Set(ERROR_GUIDES.map((e) => e.id)),
  guides: ERROR_GUIDES,
  figures,
  designs,
};
it('dump', async () => {
  const lessons = await loadAllLessons();
  for (const l of lessons.filter((x) => x.domain === (process.env.DOM ?? 'sec'))) console.log(l.id, JSON.stringify(validateLesson(l, ctx), null, 1));
});

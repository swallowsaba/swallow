import { errorFileSchema, glossaryFileSchema, type DomainId, type ErrorGuide, type Term } from './schema';

/**
 * 用語集（content/glossary/<分野>.json）とエラーの解説（content/errors/<分野>.json）を読み込み、検証する。
 * どちらも小さく、本文のどこからでも引くので、最初にまとめて読む。
 */

const glossaryFiles = import.meta.glob<unknown>('../../content/glossary/*.json', { eager: true, import: 'default' });
const errorFiles = import.meta.glob<unknown>('../../content/errors/*.json', { eager: true, import: 'default' });

export interface GlossaryTerm extends Term {
  domain: DomainId;
}

const fileName = (path: string): string => path.replace(/^.*\//, '').replace(/\.json$/, '');

function loadGlossary(): GlossaryTerm[] {
  return Object.entries(glossaryFiles).flatMap(([path, data]) => {
    const file = glossaryFileSchema.parse(data);
    if (file.domain !== fileName(path)) throw new Error(`${path}: 分野 ${file.domain} がファイル名と違う`);
    return file.terms.map((t) => ({ ...t, domain: file.domain }));
  });
}

function loadErrors(): (ErrorGuide & { domain: DomainId })[] {
  return Object.entries(errorFiles).flatMap(([path, data]) => {
    const file = errorFileSchema.parse(data);
    if (file.domain !== fileName(path)) throw new Error(`${path}: 分野 ${file.domain} がファイル名と違う`);
    return file.errors.map((e) => ({ ...e, domain: file.domain }));
  });
}

/** 全ての用語（読みの順） */
export const TERMS: readonly GlossaryTerm[] = loadGlossary().sort((a, b) => (a.reading ?? a.word).localeCompare(b.reading ?? b.word, 'ja'));
export const ERROR_GUIDES = loadErrors();

const TERM_BY_ID = new Map(TERMS.map((t) => [t.id, t]));

export function termOf(id: string): GlossaryTerm | undefined {
  return TERM_BY_ID.get(id);
}

/** 本文の中で用語の印を語に置き換える時に使う */
export const wordOf = (id: string): string => termOf(id)?.word ?? id;

export function errorGuideOf(id: string): (ErrorGuide & { domain: DomainId }) | undefined {
  return ERROR_GUIDES.find((e) => e.id === id);
}

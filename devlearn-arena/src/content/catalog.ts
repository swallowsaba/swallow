import { z } from 'zod';
import catalogData from '../../content/catalog.json';
import domainsData from '../../content/domains.json';
import { catalogSchema, domainSchema, type CatalogEntry, type Domain, type DomainId } from './schema';

/**
 * 全レッスンの目録と分野の一覧を読み込み、検証する（docs/content-spec.md 1 章）。
 * 検証に失敗すると読み込みの時点で落ちる（テストとビルドが止まる）。
 */

export const CATALOG = catalogSchema.parse(catalogData);
export const DOMAIN_DEFS: readonly Domain[] = z.object({ domains: z.array(domainSchema) }).strict().parse(domainsData).domains;

/** 推奨学習順に並べた全レッスン */
export const ENTRIES: readonly CatalogEntry[] = CATALOG.lessons;

const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
const RANK = new Map(ENTRIES.map((e, i) => [e.id, i]));

export function entryOf(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

/** 推奨学習順の何番目か（0 から）。目録に無ければ末尾 */
export function recommendedRank(id: string): number {
  return RANK.get(id) ?? ENTRIES.length;
}

/** 推奨学習順の分野の並び */
export const DOMAIN_ORDER: readonly DomainId[] = CATALOG.domainOrder;

export function domainDef(id: DomainId): Domain | undefined {
  return DOMAIN_DEFS.find((d) => d.id === id);
}

export const LEVEL_NAMES = { beginner: '初級', intermediate: '中級', advanced: '上級' } as const;
export const PRACTICE_NAMES = { terminal: '仮想端末', simulation: '模擬環境', sql: 'ブラウザ内 SQL', editor: '設定の編集' } as const;

/** 初回公開で中級まで揃える分野（docs/decisions.md Q-04。ほかの分野は初級だけ） */
const FIRST_RELEASE_INTERMEDIATE: ReadonlySet<DomainId> = new Set(['linux', 'net', 'web', 'git', 'ctr', 'docker', 'k8s']);

/** 初回公開の範囲のレッスンか（docs/decisions.md Q-04） */
export const inFirstRelease = (e: Pick<CatalogEntry, 'domain' | 'level'>): boolean =>
  e.level === 'beginner' || (e.level === 'intermediate' && FIRST_RELEASE_INTERMEDIATE.has(e.domain));

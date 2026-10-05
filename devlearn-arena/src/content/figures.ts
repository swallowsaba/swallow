/**
 * レッスンの図（content/figures/<ID>.svg。docs/visual-design.md 6 章）。小さいので最初にまとめて読む。
 * 図の一部（data-part）を押す理解の問題のため、画面には SVG の文字のまま埋め込む。
 */

const files = import.meta.glob<string>('../../content/figures/*.svg', { query: '?raw', import: 'default', eager: true });

const FIGURES = new Map(Object.entries(files).map(([path, svg]) => [path.replace(/^.*\//, '').replace(/\.svg$/, ''), svg]));

/** 図の SVG（無ければ undefined） */
export function figureOf(id: string): string | undefined {
  return FIGURES.get(id);
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** 図の題（<title>。画面の説明に使う）。SVG の文字の参照（&lt; など）は元の字に戻す */
export function figureTitle(id: string): string {
  const raw = /<title>([\s\S]*?)<\/title>/.exec(FIGURES.get(id) ?? '')?.[1]?.trim() ?? '';
  return raw.replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) => ENTITIES[name] ?? '');
}

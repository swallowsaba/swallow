/**
 * 施設の中の景色（レッスン画面とミッションの実戦の背景。docs/ui-design.md 7 章・docs/visual-design.md 6.1）。
 */
const files = import.meta.glob<string>('./backdrops/*.svg', { query: '?url', import: 'default', eager: true });
const BACKDROPS = new Map(Object.entries(files).map(([p, url]) => [p.replace(/^.*\//, '').replace(/\.svg$/, ''), url]));

/** その施設の中の景色の URL（無ければ undefined） */
export function backdropOf(facility: string | undefined): string | undefined {
  return facility ? BACKDROPS.get(facility) : undefined;
}

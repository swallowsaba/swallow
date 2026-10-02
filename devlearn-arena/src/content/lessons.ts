import { lessonSchema, type Lesson } from './schema';

/**
 * レッスンの中身（content/lessons/<分野>/<ID>.json）。必要になった時に分野ごとに読み込む（docs/architecture.md 4 章）。
 * どのレッスンに中身が書き起こされているかは、読み込む前から分かる。
 */

const files = import.meta.glob<unknown>('../../content/lessons/*/*.json', { import: 'default' });

const pathOf = new Map(Object.keys(files).map((p) => [p.replace(/^.*\//, '').replace(/\.json$/, ''), p]));

/** 中身が書き起こされているレッスンの ID */
export const AUTHORED: ReadonlySet<string> = new Set(pathOf.keys());

/** レッスンの中身を読み込み、検証する。書き起こされていなければ null */
export async function loadLesson(id: string): Promise<Lesson | null> {
  const path = pathOf.get(id);
  const load = path ? files[path] : undefined;
  if (!path || !load) return null;
  const lesson = lessonSchema.parse(await load());
  if (lesson.id !== id) throw new Error(`${path}: ID ${lesson.id} がファイル名と違う`);
  if (!path.includes(`/lessons/${lesson.domain}/`)) throw new Error(`${path}: 分野 ${lesson.domain} の置き場所と違う`);
  return lesson;
}

/** 書き起こされた全レッスン（検証とテストのため） */
export async function loadAllLessons(): Promise<Lesson[]> {
  const out: Lesson[] = [];
  for (const id of AUTHORED) {
    const l = await loadLesson(id);
    if (l) out.push(l);
  }
  return out;
}

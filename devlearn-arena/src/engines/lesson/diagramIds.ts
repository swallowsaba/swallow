/**
 * 遊べる図解の識別子（REWORK 6-3）。
 *
 * 手順（`LessonStep.diagram`）と用語辞書が、この名前で図解を指す。
 * 図解そのもの（React と模型）は `src/lesson/diagrams/` にある。
 * ここは名前だけを持つ。仕組みの層が画面の層を import しないため。
 */
export const DIAGRAM_IDS = [
  'pod-in-node',
  'desired-vs-actual',
  'pod-lifecycle',
  'service-endpoints',
  'git-three-areas',
  'packet-hops',
  'file-tree',
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];

export function isDiagramId(value: string): value is DiagramId {
  return (DIAGRAM_IDS as readonly string[]).includes(value);
}

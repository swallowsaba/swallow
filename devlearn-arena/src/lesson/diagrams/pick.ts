import { termsIn } from '@/content/glossary';
import type { DiagramId } from '@/engines/lesson/diagramIds';
import type { LessonDefinition, MissionTrack } from '@/engines/lesson/types';

/**
 * 手順ごとに、どの遊べる図解を開くか（REWORK 6-5）。
 *
 * 手順が `diagram` を書いていればそれを使う。書いていなければ、
 * 1. 模範解答のコマンドが何をするか
 * 2. 手順の文に出てくる用語が、どの図で遊べるか
 * 3. その世界のいつもの図
 * の順に選ぶ。任務は数千あるので、手で 1 つずつ書かなくても必ず 1 つに決まるようにする。
 */

/** その世界で開いてよい図。Linux の手順にバス停の図を出すような食い違いを防ぐ */
const ALLOWED: Readonly<Record<MissionTrack, readonly DiagramId[]>> = {
  kernel: ['file-tree', 'packet-hops'],
  git: ['git-three-areas'],
  github: ['git-three-areas'],
  net: ['packet-hops'],
  k8s: ['pod-lifecycle', 'desired-vs-actual', 'pod-in-node', 'service-endpoints'],
};

const DEFAULT: Readonly<Record<MissionTrack, DiagramId>> = {
  kernel: 'file-tree',
  git: 'git-three-areas',
  github: 'git-three-areas',
  net: 'packet-hops',
  k8s: 'pod-lifecycle',
};

/** コマンドの語から図を選ぶ。当てはまらなければ undefined */
function byCommand(line: string): DiagramId | undefined {
  const words = line.trim().split(/\s+/);
  const [tool = '', sub = '', what = ''] = words;
  if (tool === 'git' || tool === 'gh') return 'git-three-areas';
  if (['ping', 'traceroute', 'ip', 'curl', 'dig', 'nslookup', 'ss', 'netlab', 'arp', 'nc'].includes(tool)) {
    return 'packet-hops';
  }
  if (tool === 'kubeadm') return 'pod-in-node';
  if (tool !== 'kubectl') return undefined;
  if (['label', 'expose', 'endpoints'].includes(sub)) return 'service-endpoints';
  if (sub === 'set' && what === 'selector') return 'service-endpoints';
  if (['scale', 'rollout', 'autoscale'].includes(sub)) return 'desired-vs-actual';
  if (sub === 'create' && ['deployment', 'deploy'].includes(what)) return 'desired-vs-actual';
  if (sub === 'delete' && ['pod', 'pods', 'po'].includes(what)) return 'desired-vs-actual';
  if (['cordon', 'uncordon', 'drain', 'taint'].includes(sub)) return 'pod-in-node';
  if (sub === 'get' && ['nodes', 'node', 'no'].includes(what)) return 'pod-in-node';
  if (['get', 'describe'].includes(sub) && ['svc', 'service', 'services', 'endpoints', 'ep'].includes(what)) {
    return 'service-endpoints';
  }
  if (['run', 'wait', 'logs', 'describe', 'get', 'apply', 'exec'].includes(sub)) return 'pod-lifecycle';
  return undefined;
}

export function diagramOfStep(lesson: LessonDefinition, index: number): DiagramId {
  const step = lesson.steps[index];
  const allowed = ALLOWED[lesson.track];
  const ok = (id: DiagramId | undefined): id is DiagramId => id !== undefined && allowed.includes(id);
  if (step === undefined) return DEFAULT[lesson.track];
  if (step.diagram !== undefined) return step.diagram;
  for (const line of step.solution) {
    const found = byCommand(line);
    if (ok(found)) return found;
  }
  const fromWords = termsIn([step.prompt, step.check]).map((t) => t.diagram).find(ok);
  return fromWords ?? DEFAULT[lesson.track];
}

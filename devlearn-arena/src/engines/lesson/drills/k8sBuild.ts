import type { ClusterState } from '@/engines/k8s/types';
import { readyPods, withCluster } from '../authoring/assert';
import type { MissionSpec, StepSpec } from '../authoring/mission';

/**
 * 「まず自分で作る」手順。
 *
 * 出来上がった Deployment が最初からある状態で始めると、何がどう作られたのかが分からないまま触ることになる。
 * 練習の材料は、ノードだけの空のクラスタから自分のコマンドで作ってもらう。
 * `kubectl create deployment` で作ったものは、名前・ラベル（app=<名前>）・コンテナ名が
 * これまで初期状態として置いていたものと同じになるので、後ろの手順はそのまま使える。
 */
export interface Prepared {
  step: StepSpec;
  /** この手順の模範解答。任務全体の solution の先頭に足す */
  solution: string[];
  /** 「学ぶ」画面のコマンド一覧に足す1行 */
  command: { command: string; means: string };
}

type Made = Omit<MissionSpec, 'id' | 'track' | 'chapterId' | 'docs'>;

/**
 * 空のクラスタ（ノードだけ）から始め、先頭に「まず作る」手順を足す。
 * 任務の本題の手順・解答はそのまま後ろに続く。
 */
export function startingEmpty(prep: Prepared, empty: ClusterState, made: Omit<Made, 'initial'>): Made {
  return {
    ...made,
    initial: { cluster: empty },
    intro: { ...made.intro, commands: [prep.command, ...made.intro.commands] },
    solution: [...prep.solution, ...made.solution],
    steps: [prep.step, ...made.steps],
  };
}

export function createDeploymentFirst(name: string, replicas: number, image = 'nginx:1.27'): Prepared {
  const create = `kubectl create deployment ${name} --image=${image} --replicas=${String(replicas)}`;
  const solution = [create, `kubectl wait ${String(replicas * 4 + 8)}`];
  return {
    solution,
    command: {
      command: 'kubectl create deployment <名前> --image=<イメージ> --replicas=<数>',
      means: '練習の材料になる Deployment を自分で作る',
    },
    step: {
      prompt: `まず材料を自分で作る。${name} という Deployment を ${image} で ${String(replicas)} 個作り、時間を進めて全部 Ready にせよ。`,
      conditions: [
        {
          label: `Deployment ${name} があること`,
          test: withCluster((c) => c.deployments.has(`default/${name}`)),
          howTo: create,
        },
        {
          label: `Ready な Pod が ${String(replicas)} 個あること`,
          test: readyPods(replicas),
          howTo: '作った直後は Pending です。kubectl wait で時間を進めてください',
        },
      ],
      hints: ['kubectl create deployment <名前> --image=<イメージ> --replicas=<数> で作り、kubectl wait で時間を進める'],
      solution,
      explain: 'ここまでが下ごしらえ。コマンド1行で Deployment ができ、時間を進めると Pod がそろう。ここからが本題。',
    },
  };
}

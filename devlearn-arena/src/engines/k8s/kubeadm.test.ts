import { describe, expect, it } from 'vitest';
import { cniInstalled, isNodeReady, mintToken, nodeCondition } from './bootstrap';
import { emptyCluster, machine } from './factory';
import { kubeadmInit, kubeadmJoin, kubeadmReset, tokenCreate, upgradeApply, upgradeNode } from './kubeadm';
import type { ClusterState } from './types';

function lab(): ClusterState {
  return emptyCluster([], [
    machine('cp-1', 2000, 4096),
    machine('node-1', 4000, 8192),
    machine('node-2', 4000, 8192),
    machine('tiny', 1000, 2048),
  ]);
}

describe('kubeadm init', () => {
  it('計算機がノードになり、join のための案内が出る', () => {
    const result = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: '10.244.0.0/16', serviceCidr: null, version: null,
    });
    expect(result.error).toBeNull();
    expect(result.cluster.nodes.has('cp-1')).toBe(true);
    expect(result.cluster.controlPlane.initialized).toBe(true);
    expect(result.cluster.controlPlane.podNetworkCidr).toBe('10.244.0.0/16');
    expect(result.lines.join('\n')).toContain('kubeadm join cp-1:6443 --token');
  });

  it('CPU が 2 個に満たない機械は弾く（本物の preflight と同じ）', () => {
    const result = kubeadmInit(lab(), {
      machine: 'tiny', podNetworkCidr: null, serviceCidr: null, version: null,
    });
    expect(result.error).toContain('[ERROR NumCPU]');
    expect(result.cluster.nodes.size).toBe(0);
  });

  it('立てた直後は CNI が無いのでノードは NotReady', () => {
    const after = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: '10.244.0.0/16', serviceCidr: null, version: null,
    }).cluster;
    const node = after.nodes.get('cp-1');
    expect(node).toBeDefined();
    expect(cniInstalled(after)).toBe(false);
    expect(isNodeReady(after, node!)).toBe(false);
    expect(nodeCondition(after, node!).message).toContain('cni plugin not initialized');
  });

  it('コントロールプレーンには NoSchedule が付く', () => {
    const after = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null,
    }).cluster;
    expect(after.nodes.get('cp-1')?.spec.taints).toEqual([
      { key: 'node-role.kubernetes.io/control-plane', value: '', effect: 'NoSchedule' },
    ]);
  });

  it('二度目の init は断られる', () => {
    const once = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null,
    }).cluster;
    expect(kubeadmInit(once, {
      machine: 'node-1', podNetworkCidr: null, serviceCidr: null, version: null,
    }).error).toContain('already exists');
  });

  it('同じ操作からは同じトークンが出る（乱数を使わない）', () => {
    const a = kubeadmInit(lab(), { machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null });
    const b = kubeadmInit(lab(), { machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null });
    expect(a.cluster.controlPlane.tokens).toEqual(b.cluster.controlPlane.tokens);
    expect(a.cluster.controlPlane.tokens[0]).toMatch(/^[a-z0-9]{6}\.[a-z0-9]{16}$/);
  });
});

describe('kubeadm join', () => {
  const ready = kubeadmInit(lab(), {
    machine: 'cp-1', podNetworkCidr: '10.244.0.0/16', serviceCidr: null, version: null,
  }).cluster;
  const token = ready.controlPlane.tokens[0] ?? '';

  it('正しいトークンならノードが増える', () => {
    const result = kubeadmJoin(ready, {
      machine: 'node-1', endpoint: 'cp-1', token, caCertHash: ready.controlPlane.caCertHash,
    });
    expect(result.error).toBeNull();
    expect(result.cluster.nodes.get('node-1')?.spec.role).toBe('worker');
    expect(result.cluster.nodes.get('node-1')?.spec.taints).toEqual([]);
  });

  it('トークンが違えば断る', () => {
    const result = kubeadmJoin(ready, {
      machine: 'node-1', endpoint: 'cp-1', token: mintToken('でたらめ'), caCertHash: null,
    });
    expect(result.error).toContain('invalid token');
    expect(result.cluster.nodes.has('node-1')).toBe(false);
  });

  it('CA の指紋が違えば断る', () => {
    const result = kubeadmJoin(ready, {
      machine: 'node-1', endpoint: 'cp-1', token, caCertHash: 'sha256:00',
    });
    expect(result.error).toContain("pinned hash doesn't match");
  });

  it('コントロールプレーンが無いうちは join できない', () => {
    const result = kubeadmJoin(lab(), {
      machine: 'node-1', endpoint: 'cp-1', token, caCertHash: null,
    });
    expect(result.error).toContain('could not reach');
  });

  it('同じ機械には二度入らない', () => {
    const once = kubeadmJoin(ready, {
      machine: 'node-1', endpoint: 'cp-1', token, caCertHash: null,
    }).cluster;
    expect(kubeadmJoin(once, {
      machine: 'node-1', endpoint: 'cp-1', token, caCertHash: null,
    }).error).toContain('Port 10250 is in use');
  });

  it('token create で増やしたトークンでも入れる', () => {
    const more = tokenCreate(ready);
    const extra = more.cluster.controlPlane.tokens[1] ?? '';
    expect(extra).not.toBe(token);
    expect(kubeadmJoin(more.cluster, {
      machine: 'node-2', endpoint: 'cp-1', token: extra, caCertHash: null,
    }).error).toBeNull();
  });
});

describe('kubeadm reset', () => {
  it('ノードを外すと素の計算機に戻る', () => {
    const cp = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null,
    }).cluster;
    const joined = kubeadmJoin(cp, {
      machine: 'node-1', endpoint: 'cp-1', token: cp.controlPlane.tokens[0] ?? '', caCertHash: null,
    }).cluster;
    const after = kubeadmReset(joined, 'node-1');
    expect(after.error).toBeNull();
    expect(after.cluster.nodes.has('node-1')).toBe(false);
    expect(after.cluster.machines.has('node-1')).toBe(true);
  });

  it('コントロールプレーンを外すとクラスタが未初期化に戻る', () => {
    const cp = kubeadmInit(lab(), {
      machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null,
    }).cluster;
    const after = kubeadmReset(cp, 'cp-1').cluster;
    expect(after.controlPlane.initialized).toBe(false);
    expect(after.controlPlane.tokens).toEqual([]);
  });
});

describe('kubeadm upgrade', () => {
  const cp = kubeadmInit(lab(), {
    machine: 'cp-1', podNetworkCidr: null, serviceCidr: null, version: null,
  }).cluster;
  const joined = kubeadmJoin(cp, {
    machine: 'node-1', endpoint: 'cp-1', token: cp.controlPlane.tokens[0] ?? '', caCertHash: null,
  }).cluster;

  it('提示された版にだけ上げられる', () => {
    expect(upgradeApply(joined, 'v9.9.9').error).toContain('is not available');
    const after = upgradeApply(joined, joined.controlPlane.availableVersion);
    expect(after.error).toBeNull();
    expect(after.cluster.nodes.get('cp-1')?.status.version).toBe(joined.controlPlane.availableVersion);
    // ノード側はまだ古いまま。順序があることを状態で示す
    expect(after.cluster.nodes.get('node-1')?.status.version).toBe(cp.controlPlane.version);
  });

  it('drain していないノードは上げられない', () => {
    const upgraded = upgradeApply(joined, joined.controlPlane.availableVersion).cluster;
    expect(upgradeNode(upgraded, 'node-1').error).toContain('drain');

    const node = upgraded.nodes.get('node-1');
    expect(node).toBeDefined();
    const cordoned: ClusterState = {
      ...upgraded,
      nodes: new Map([
        ...upgraded.nodes,
        ['node-1', { ...node!, spec: { ...node!.spec, unschedulable: true } }],
      ]),
    };
    const after = upgradeNode(cordoned, 'node-1');
    expect(after.error).toBeNull();
    expect(after.cluster.nodes.get('node-1')?.status.version).toBe(upgraded.controlPlane.version);
  });
});

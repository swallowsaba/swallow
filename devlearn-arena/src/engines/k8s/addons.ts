/**
 * クラスタを組んだあとに入れる付属物のマニフェスト。
 * 本物の配布物をそのまま持ってくると長すぎるので、
 * 学ぶうえで意味のある欄（kind / name / namespace / hostNetwork / tolerations）だけを残した縮小版にしてある。
 */

export function flannelManifest(podNetworkCidr = '10.244.0.0/16'): string {
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: kube-flannel-cfg',
    '  namespace: kube-system',
    'data:',
    '  net-conf.json: |',
    '    {',
    `      "Network": "${podNetworkCidr}",`,
    '      "Backend": { "Type": "vxlan" }',
    '    }',
    '---',
    'apiVersion: apps/v1',
    'kind: DaemonSet',
    'metadata:',
    '  name: kube-flannel-ds',
    '  namespace: kube-system',
    'spec:',
    '  selector:',
    '    matchLabels:',
    '      app: flannel',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: flannel',
    '    spec:',
    '      containers:',
    '        - name: kube-flannel',
    '          image: flannel/flannel:v0.25.6',
    '          resources:',
    '            requests:',
    '              cpu: 100m',
    '              memory: 50Mi',
    '',
  ].join('\n');
}

export function calicoManifest(): string {
  return [
    'apiVersion: apps/v1',
    'kind: DaemonSet',
    'metadata:',
    '  name: calico-node',
    '  namespace: kube-system',
    'spec:',
    '  selector:',
    '    matchLabels:',
    '      k8s-app: calico-node',
    '  template:',
    '    metadata:',
    '      labels:',
    '        k8s-app: calico-node',
    '    spec:',
    '      containers:',
    '        - name: calico-node',
    '          image: calico/node:v3.28.2',
    '          resources:',
    '            requests:',
    '              cpu: 150m',
    '              memory: 64Mi',
    '',
  ].join('\n');
}

/** CNI ではない DaemonSet。入れてもノードは Ready にならない */
export function metricsServerManifest(): string {
  return [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: metrics-server',
    '  namespace: kube-system',
    'spec:',
    '  replicas: 1',
    '  selector:',
    '    matchLabels:',
    '      k8s-app: metrics-server',
    '  template:',
    '    metadata:',
    '      labels:',
    '        k8s-app: metrics-server',
    '    spec:',
    '      containers:',
    '        - name: metrics-server',
    '          image: registry.k8s.io/metrics-server:v0.7.2',
    '          resources:',
    '            requests:',
    '              cpu: 100m',
    '              memory: 200Mi',
    '',
  ].join('\n');
}

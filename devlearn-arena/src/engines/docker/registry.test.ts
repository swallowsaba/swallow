import { describe, expect, it } from 'vitest';
import { containerHolds } from '@/engines/container/check';
import { addContext, addRegistry, createContainerHost } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/** レジストリに置く（login・push）と、別の機械の Engine に頼む（docker --context）。docs/lessons/docker.md docker.i.05 */

const REG = 'registry.city.example';

function shell() {
  let host = createContainerHost(['nginx:1.27']);
  host = addRegistry(host, REG, 'learner');
  host = addContext(host, 'prod', 'ssh://deploy@prod-01', '本番の機械');
  const s = createSession({ containers: host });
  let state: ShellState = s.state;
  const sh = (line: string) => {
    const out = execute(state, line, s.registry, s.clock);
    state = out.state;
    return {
      stdout: out.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''),
      stderr: out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join(''),
      code: out.exitCode,
    };
  };
  return { sh, holds: (expr: string) => containerHolds(state.containers, expr) };
}

describe('レジストリと別の機械', () => {
  it('ログインしていないと、置けない（denied ではなく認証が要ると言う）。住所の無い名前は Docker Hub に向かって断られる', () => {
    const { sh, holds } = shell();
    sh(`docker tag nginx:1.27 ${REG}/shop/web:1.2`);
    const r = sh(`docker push ${REG}/shop/web:1.2`);
    expect(r.stdout).toMatch(new RegExp(`^The push refers to repository \\[${REG}/shop/web\\]\\n`));
    expect(r.stderr).toBe('unauthorized: authentication required\n');
    expect(r.code).toBe(1);
    sh('docker tag nginx:1.27 shop/web:1.2');
    expect(sh('docker push shop/web:1.2').stderr).toBe('denied: requested access to the resource is denied\n');
    expect(holds(`!pushed:${REG}/shop/web:1.2`)).toBe(true);
  });

  it('login → tag → push で置ける。無いタグは本物の形で断る', () => {
    const { sh, holds } = shell();
    expect(sh(`docker login ${REG}`).stdout).toBe('Username: learner\nPassword: \nLogin Succeeded\n');
    expect(holds(`login:${REG}`)).toBe(true);
    expect(sh(`docker push ${REG}/shop/web:1.2`).stderr).toBe(`An image does not exist locally with the tag: ${REG}/shop/web\n`);
    sh(`docker tag nginx:1.27 ${REG}/shop/web:1.2`);
    const r = sh(`docker push ${REG}/shop/web:1.2`);
    expect(r.stdout).toMatch(/^The push refers to repository \[registry\.city\.example\/shop\/web\]\n([0-9a-f]{12}: Pushed\n){3}1\.2: digest: sha256:[0-9a-f]{64} size: 1570\n$/);
    expect(holds(`pushed:${REG}/shop/web:1.2`)).toBe(true);
    expect(sh(`docker login ${REG} -u someone`).stderr).toBe(`Error response from daemon: Get "https://${REG}/v2/": unauthorized: incorrect username or password\n`);
    expect(sh(`docker logout ${REG}`).stdout).toBe(`Removing login credentials for ${REG}\n`);
    expect(holds(`!login:${REG}`)).toBe(true);
  });

  it('--context prod は本番の機械の Engine に頼む。手元とは別のイメージ・コンテナ。置き場とログインは手元の物を使う', () => {
    const { sh, holds } = shell();
    expect(sh('docker context ls').stdout).toBe([
      'NAME        DESCRIPTION                               DOCKER ENDPOINT',
      'default *   Current DOCKER_HOST based configuration   unix:///var/run/docker.sock',
      'prod        本番の機械                                     ssh://deploy@prod-01',
      '',
    ].join('\n'));
    sh(`docker login ${REG}`);
    sh(`docker tag nginx:1.27 ${REG}/shop/web:1.2`);
    sh(`docker push ${REG}/shop/web:1.2`);
    expect(sh('docker --context prod images').stdout).toBe('REPOSITORY   TAG       IMAGE ID   CREATED   SIZE\n');
    const run = sh(`docker --context prod run -d --name shop -p 80:80 ${REG}/shop/web:1.2`);
    expect(run.stdout).toContain(`Unable to find image '${REG}/shop/web:1.2' locally`);
    expect(holds(`@prod running:shop from:shop=${REG}/shop/web:1.2`)).toBe(true);
    // 手元にはコンテナは無い
    expect(holds('!exists:shop')).toBe(true);
    expect(sh('docker ps').stdout).toBe('CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES\n');
    // context use で切り替えると、--context 無しでも本番に頼む
    expect(sh('docker context use prod').stdout).toBe('prod\n');
    expect(sh('docker ps').stdout).toContain(' shop\n');
    sh('docker context use default');
    expect(sh('docker context show').stdout).toBe('default\n');
    expect(sh('docker --context nope ps').stderr).toBe('context "nope" does not exist\n');
  });

  it('ログアウトしていれば、本番でも取れない（取りに行く時の認証は、手元の CLI の物）', () => {
    const { sh } = shell();
    sh(`docker login ${REG}`);
    sh(`docker tag nginx:1.27 ${REG}/shop/web:1.2`);
    sh(`docker push ${REG}/shop/web:1.2`);
    sh(`docker logout ${REG}`);
    expect(sh(`docker --context prod pull ${REG}/shop/web:1.2`).stderr).toBe(`Error response from daemon: pull access denied for ${REG}/shop/web, repository does not exist or may require 'docker login': denied: requested access to the resource is denied\n`);
    sh(`docker login ${REG}`);
    expect(sh(`docker --context prod pull ${REG}/shop/web:1.3`).stderr).toBe(`Error response from daemon: manifest for ${REG}/shop/web:1.3 not found: manifest unknown: manifest unknown\n`);
    expect(sh(`docker --context prod pull ${REG}/shop/web:1.2`).stdout).toMatch(/Status: Downloaded newer image for registry\.city\.example\/shop\/web:1\.2\nregistry\.city\.example\/shop\/web:1\.2\n$/);
    expect(sh('docker pull nope.example/shop/web:1.2').stderr).toBe('Error response from daemon: Get "https://nope.example/v2/": dial tcp: lookup nope.example: no such host\n');
  });
});

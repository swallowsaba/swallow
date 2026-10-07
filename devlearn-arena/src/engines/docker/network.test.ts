import { describe, expect, it } from 'vitest';
import { containerHolds } from '@/engines/container/check';
import { createContainerHost } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/** 自分で作る網と、名前で届く仕組み。docs/lessons/docker.md docker.i.04 */

function shell() {
  const s = createSession({ containers: createContainerHost(['city-db:1.0', 'city-reserve:2.0']) });
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

const WEB = 'docker run -d --name web -e DATABASE_URL=postgres://postgres@db:5432/reserve';

describe('網と名前', () => {
  it('既定の網（bridge）では、ほかのコンテナの名前が引けず、窓口は ENOTFOUND で止まる', () => {
    const { sh, holds } = shell();
    sh('docker run -d --name db city-db:1.0');
    sh(`${WEB} city-reserve:2.0`);
    expect(holds('exited:web')).toBe(true);
    const log = sh('docker logs web').stdout;
    expect(log).toContain('reserve: connecting to the database at db:5432');
    expect(log).toContain('Error: getaddrinfo ENOTFOUND db');
    expect(holds('reach:web>db')).toBe(false);
  });

  it('自作の網に 2 つを入れると、名前で届いて窓口が動く（run --network と network connect のどちらでも）', () => {
    const { sh, holds } = shell();
    expect(sh('docker network create city-net').stdout).toMatch(/^[0-9a-f]{64}\n$/);
    sh('docker run -d --name db city-db:1.0');
    expect(sh('docker network connect city-net db').code).toBe(0);
    sh(`${WEB} --network city-net city-reserve:2.0`);
    expect(holds('network:city-net on:db=city-net on:web=city-net running:web reach:web>db')).toBe(true);
    expect(sh('docker logs web').stdout).toContain('reserve: connected to the database at db:5432');
    // --network で入れた web は、既定の網にはいない。db は両方にいる
    expect(holds('!on:web=bridge on:db=bridge')).toBe(true);
  });

  it('止まった web を網に入れてから動かし直しても届く', () => {
    const { sh, holds } = shell();
    sh('docker network create city-net');
    sh('docker run -d --network city-net --name db city-db:1.0');
    sh(`${WEB} city-reserve:2.0`);
    expect(holds('exited:web')).toBe(true);
    sh('docker network connect city-net web');
    sh('docker start web');
    expect(holds('running:web reach:web>db')).toBe(true);
  });

  it('localhost はコンテナ自身を指す（DB には届かない）', () => {
    const { sh } = shell();
    sh('docker network create city-net');
    sh('docker run -d --network city-net --name db city-db:1.0');
    sh('docker run -d --network city-net --name web -e DATABASE_URL=postgres://postgres@localhost:5432/reserve city-reserve:2.0');
    expect(sh('docker logs web').stdout).toContain('Error: connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('network ls・inspect・rm と、本物の形の誤り', () => {
    const { sh } = shell();
    sh('docker network create city-net');
    expect(sh('docker network ls').stdout).toMatch(/^NETWORK ID +NAME +DRIVER +SCOPE\n[0-9a-f]{12} +bridge +bridge +local\n[0-9a-f]{12} +city-net +bridge +local\n[0-9a-f]{12} +host +host +local\n[0-9a-f]{12} +none +null +local\n$/);
    expect(sh('docker network create city-net').stderr).toBe('Error response from daemon: network with name city-net already exists\n');
    sh('docker run -d --network city-net --name db city-db:1.0');
    const net = (JSON.parse(sh('docker network inspect city-net').stdout) as { Name: string; Containers: Record<string, { Name: string; IPv4Address: string }> }[])[0];
    expect(net?.Name).toBe('city-net');
    expect(Object.values(net?.Containers ?? {})).toEqual([{ Name: 'db', IPv4Address: '172.18.0.2/16' }]);
    expect(sh('docker network connect city-net db').stderr).toBe('Error response from daemon: endpoint with name db already exists in network city-net\n');
    expect(sh('docker run -d --network nope --name x city-db:1.0').stderr).toBe('docker: Error response from daemon: network nope not found.\nSee \'docker run --help\'.\n');
    expect(sh('docker network rm city-net').stderr).toMatch(/^Error response from daemon: error while removing network: network city-net id [0-9a-f]{64} has active endpoints\n$/);
    sh('docker rm -f db');
    expect(sh('docker network rm city-net').stdout).toBe('city-net\n');
    expect(sh('docker network rm city-net').stderr).toBe('Error response from daemon: network city-net not found\n');
  });

  it('inspect に、入っている網とアドレスが出る', () => {
    const { sh } = shell();
    sh('docker network create city-net');
    sh('docker run -d --name db city-db:1.0');
    sh('docker network connect city-net db');
    expect(sh("docker inspect -f '{{.NetworkSettings.IPAddress}}' db").stdout).toBe('172.17.0.2\n');
    const nets = (JSON.parse(sh('docker inspect db').stdout) as { NetworkSettings: { Networks: Record<string, { IPAddress: string }> } }[])[0]?.NetworkSettings.Networks;
    expect(nets).toEqual({ bridge: { IPAddress: '172.17.0.2' }, 'city-net': { IPAddress: '172.18.0.2' } });
  });
});

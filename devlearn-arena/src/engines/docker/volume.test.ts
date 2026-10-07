import { describe, expect, it } from 'vitest';
import { containerHolds } from '@/engines/container/check';
import { createContainerHost } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/** ボリューム（データを残す領域）と、DB のコンテナ（psql）。docs/lessons/docker.md docker.i.03 */

function shell() {
  const s = createSession({ containers: createContainerHost(['city-db:1.0']) });
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

const COUNT = 'docker exec db psql -U postgres -d reserve -c "SELECT count(*) FROM reservations"';
const ADD = "docker exec db psql -U postgres -d reserve -c \"INSERT INTO reservations (name) VALUES ('市民ホール')\"";

describe('ボリュームと DB のコンテナ', () => {
  it('psql で表を読み、行を足せる（本物の psql の形）', () => {
    const { sh } = shell();
    sh('docker run -d --name db city-db:1.0');
    expect(sh(COUNT).stdout).toBe(' count \n-------\n     3\n(1 row)\n\n');
    expect(sh(ADD).stdout).toBe('INSERT 0 1\n');
    expect(sh(COUNT).stdout).toContain('     4\n');
    expect(sh('docker exec db psql -U postgres -d reserve -c "SELECT * FROM reservations"').stdout).toMatch(/^ id \| +name +\n-+\+-+\n +1 \| 図書館の会議室/);
    expect(sh('docker exec db psql -U postgres -d reserve -c "SELECT count(*) FROM bookings"').stderr).toBe('ERROR:  relation "bookings" does not exist\nLINE 1: SELECT count(*) FROM bookings\n                             ^\n');
  });

  it('ボリューム無しで作り直すと、足した行は消える（コンテナの中の書き込みは、消すと一緒に消える）', () => {
    const { sh } = shell();
    sh('docker run -d --name db city-db:1.0');
    sh(ADD);
    sh('docker rm -f db');
    sh('docker run -d --name db city-db:1.0');
    expect(sh(COUNT).stdout).toContain('     3\n');
    expect(sh('docker logs db').stdout).toContain('PostgreSQL init process complete; ready for start up.');
  });

  it('名前付きボリュームを DB の書く場所に付けると、作り直しても残る。違う場所に付けると残らない', () => {
    const { sh, holds } = shell();
    expect(sh('docker volume create db-data').stdout).toBe('db-data\n');
    sh('docker run -d --name db -v db-data:/var/lib/postgresql/data city-db:1.0');
    expect(holds('running:db volume:db-data mount:db=db-data:/var/lib/postgresql/data')).toBe(true);
    sh(ADD);
    expect(holds('rows:db/reservations=4')).toBe(true);
    sh('docker rm -f db');
    sh('docker run -d --name db -v db-data:/var/lib/postgresql/data city-db:1.0');
    expect(sh(COUNT).stdout).toContain('     4\n');
    expect(sh('docker logs db').stdout).toContain('PostgreSQL Database directory appears to contain a database; Skipping initialization');
    expect(holds('made:db>=2 rows:db/reservations=4')).toBe(true);

    sh('docker rm -f db');
    sh('docker run -d --name db -v other:/data city-db:1.0');
    expect(sh(COUNT).stdout).toContain('     3\n');
  });

  it('止めて動かし直すだけなら、書き込みの層は残る（消すまで残る）', () => {
    const { sh, holds } = shell();
    sh('docker run -d --name db city-db:1.0');
    sh(ADD);
    sh('docker restart db');
    expect(sh(COUNT).stdout).toContain('     4\n');
    expect(holds('rows:db/reservations=4 made:db=1')).toBe(true);
  });

  it('inspect の Mounts に、つないだ物と中の場所が出る。psql は無い DB・利用者を本物の形で断る', () => {
    const { sh } = shell();
    sh('docker run -d --name db -v db-data:/data city-db:1.0');
    const mounts = (JSON.parse(sh('docker inspect db').stdout) as { Mounts: unknown[] }[])[0]?.Mounts;
    expect(mounts).toEqual([{ Type: 'volume', Name: 'db-data', Source: '/var/lib/docker/volumes/db-data/_data', Destination: '/data', RW: true }]);
    expect(sh('docker exec db psql -U postgres -d shop -c "SELECT 1"').stderr).toBe('psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  database "shop" does not exist\n');
    expect(sh('docker exec db psql -U root -d reserve -c "SELECT 1"').stderr).toContain('FATAL:  role "root" does not exist');
    expect(sh('docker exec db ls /var/lib/postgresql/data').stdout).toBe('PG_VERSION\nbase\npostgresql.conf\n');
  });

  it('volume ls・inspect・rm（使用中は消せない）。付ける時に無ければ作る', () => {
    const { sh } = shell();
    sh('docker run -d --name db -v db-data:/var/lib/postgresql/data city-db:1.0');
    expect(sh('docker volume ls').stdout).toBe('DRIVER    VOLUME NAME\nlocal     db-data\n');
    expect(sh('docker volume inspect db-data').stdout).toContain('"Mountpoint": "/var/lib/docker/volumes/db-data/_data"');
    expect(sh('docker volume rm db-data').stderr).toMatch(/^Error response from daemon: remove db-data: volume is in use - \[[0-9a-f]{64}\]\n$/);
    sh('docker rm -f db');
    expect(sh('docker volume rm db-data').stdout).toBe('db-data\n');
    expect(sh('docker volume rm db-data').stderr).toBe('Error response from daemon: get db-data: no such volume\n');
  });
});

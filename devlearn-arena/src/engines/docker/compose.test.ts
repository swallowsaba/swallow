import { describe, expect, it } from 'vitest';
import { containerHolds } from '@/engines/container/check';
import { createContainerHost, servedAt } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/** Compose（compose.yaml に書いた構成を一度に動かす）。docs/lessons/docker.md docker.i.06 */

const GOOD = `services:
  web:
    image: city-reserve:2.0
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://postgres@db:5432/reserve
    depends_on:
      - db
  db:
    image: city-db:1.0
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
`;

function shell(compose: string | null) {
  const files: Record<string, string | null> = { '/home/learner/reserve': null };
  if (compose !== null) files['/home/learner/reserve/compose.yaml'] = compose;
  const s = createSession({ files, cwd: '/home/learner/reserve', containers: createContainerHost(['city-db:1.0', 'city-reserve:2.0']) });
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
  return { sh, holds: (expr: string) => containerHolds(state.containers, expr), host: () => state.containers };
}

describe('docker compose', () => {
  it('up -d: 網・ボリューム・コンテナを作り、depends_on の順に動かす。web はサービス名 db で DB に届き、予約の数を答える', () => {
    const { sh, holds, host } = shell(GOOD);
    const r = sh('docker compose up -d');
    expect(r.stdout).toBe([
      '[+] Running 4/4',
      ' ✔ Network reserve_default       Created',
      ' ✔ Volume "reserve_db-data"      Created',
      ' ✔ Container reserve-db-1        Started',
      ' ✔ Container reserve-web-1       Started',
      '',
    ].join('\n'));
    expect(holds('running:reserve-web-1 running:reserve-db-1 reach:reserve-web-1>db mount:reserve-db-1=reserve_db-data:/var/lib/postgresql/data')).toBe(true);
    expect(servedAt(host(), 8080)?.body).toContain('予約 3 件');
    expect(sh('docker compose logs web').stdout).toContain('web-1  | reserve: connected to the database at db:5432\n');
    expect(sh('docker compose ps').stdout).toMatch(/^NAME +IMAGE +COMMAND +SERVICE +CREATED +STATUS +PORTS\nreserve-db-1 +city-db:1\.0 .* db +.*Up 2 seconds/);
  });

  it('localhost を指すと、web は自分自身につないで止まる（ECONNREFUSED 127.0.0.1）', () => {
    const { sh, holds } = shell(GOOD.replace('@db:', '@localhost:'));
    sh('docker compose up -d');
    expect(holds('exited:reserve-web-1 running:reserve-db-1')).toBe(true);
    expect(sh('docker compose logs web').stdout).toContain('web-1  | Error: connect ECONNREFUSED 127.0.0.1:5432\n');
  });

  it('もう一度 up -d: 変わっていない物はそのまま、変えたサービスは作り直す。down は消すが、ボリュームは残す', () => {
    const { sh, holds } = shell(GOOD.replace('@db:', '@localhost:'));
    sh('docker compose up -d');
    sh(`cat > compose.yaml <<'EOF'\n${GOOD}EOF`);
    expect(sh('docker compose up -d').stdout).toBe([
      '[+] Running 2/2',
      ' ✔ Container reserve-db-1        Running',
      ' ✔ Container reserve-web-1       Started',
      '',
    ].join('\n'));
    expect(holds('running:reserve-web-1 made:reserve-web-1=2 made:reserve-db-1=1')).toBe(true);
    expect(sh('docker compose down').stdout).toBe([
      '[+] Running 3/3',
      ' ✔ Container reserve-web-1       Removed',
      ' ✔ Container reserve-db-1        Removed',
      ' ✔ Network reserve_default       Removed',
      '',
    ].join('\n'));
    expect(holds('!exists:reserve-db-1 volume:reserve_db-data !network:reserve_default')).toBe(true);
  });

  it('誤りは本物の言い方: ファイルが無い・YAML の誤り・知らない項目・宣言していないボリューム', () => {
    expect(shell(null).sh('docker compose up -d').stderr).toBe('no configuration file provided: not found\n');
    expect(shell('services:\n  web:\n    image: city-reserve:2.0\n   ports:\n').sh('docker compose up -d').stderr).toMatch(/^yaml: line 4: /);
    expect(shell('services:\n  web:\n    imag: city-reserve:2.0\n').sh('docker compose up -d').stderr).toBe('validating /home/learner/reserve/compose.yaml: services.web additional properties \'imag\' not allowed\n');
    expect(shell(GOOD.replace('volumes:\n  db-data:\n', '')).sh('docker compose up -d').stderr).toBe('service "db" refers to undefined volume db-data: invalid compose project\n');
  });
});

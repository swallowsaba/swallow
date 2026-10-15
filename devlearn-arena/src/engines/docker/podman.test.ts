import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { containerHolds } from '@/engines/container/check';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';

/** Podman の CLI（ctr の実戦）。Docker と同じ模型の上で、本物の podman の出し方で答える */

const SERVER = "const http = require('http');\nhttp.createServer((req, res) => {\n  res.end('市の予約の窓口 本日の閉館 17:00');\n}).listen(3000);\n";
const CFILE = 'FROM docker.io/library/node:20-alpine\nWORKDIR /app\nCOPY server.js .\nCMD ["node", "server.js"]\n';

function open(setup: Record<string, unknown> = {}): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state = initialShell('linux-basic', {
    containerCli: 'podman', images: ['node:20-alpine', 'city-db:1.0', 'city-reserve:2.0'],
    files: { '/home/learner/reserve/Containerfile': CFILE, '/home/learner/reserve/server.js': SERVER },
    ...setup,
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  return {
    run: (line) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    state: () => state,
  };
}

describe('道具の有る無し', () => {
  it('podman の機械には docker が無く、docker の機械には podman が無い', () => {
    expect(open().run('docker ps')).toMatchObject({ err: 'docker: command not found\n', code: 127 });
    const docker = initialShell('linux-basic', { images: ['nginx:1.27'] });
    const o = execute(docker, 'podman ps', createDefaultRegistry(), createClock());
    expect(o.exitCode).toBe(127);
  });
});

describe('podman build（Buildah の形）', () => {
  it('Containerfile を読み、STEP n/m と COMMIT と localhost/ の名前を出す。同じ段は --> Using cache で使い回す', () => {
    const t = open();
    const first = t.run('podman build -t reserve:1.0 reserve');
    expect(first.out).toMatch(/^STEP 1\/4: FROM docker\.io\/library\/node:20-alpine\nSTEP 2\/4: WORKDIR \/app\n--> [0-9a-f]{12}\nSTEP 3\/4: COPY server\.js \.\n/);
    expect(first.out).toContain('COMMIT reserve:1.0\n');
    expect(first.out).toContain('Successfully tagged localhost/reserve:1.0\n');
    const again = t.run('podman build -t reserve:1.1 reserve');
    expect(again.out).toMatch(/STEP 2\/4: WORKDIR \/app\n--> Using cache [0-9a-f]{64}\n/);
    expect(t.run('podman images').out).toMatch(/localhost\/reserve\s+1\.1\s+[0-9a-f]{12}\s+2 seconds ago\s+135 MB/);
    expect(containerHolds(t.state().containers, 'cached:reserve:1.1=WORKDIR')).toBe(true);
  });

  it('設計図が無い・写す物が無い時は、本物の文で止まる', () => {
    const t = open({ files: { '/home/learner/empty/x.txt': '', '/home/learner/bad/Containerfile': 'FROM docker.io/library/node:20-alpine\nCOPY app.js .\n' } });
    expect(t.run('podman build -t x empty').err).toBe('Error: no Containerfile or Dockerfile specified or found in context directory, /home/learner/empty: no such file or directory\n');
    expect(t.run('podman build -t x bad').err).toContain('Error: building at STEP "COPY app.js .": checking on sources under "/home/learner/bad": copier: stat: "/app.js": no such file or directory');
  });
});

describe('中の変更と作り直し', () => {
  it('exec の sed -i は書き込みの層に書き、動かし直すと直した物で動く。diff は C で示す。作り直すとイメージの中身に戻る', () => {
    const t = open();
    t.run('podman build -t reserve:1.0 reserve');
    t.run('podman run -d --name web -p 8080:3000 reserve:1.0');
    t.run("podman exec web sed -i 's/17:00/19:00/' /app/server.js");
    t.run('podman restart web');
    expect(t.run('curl -s http://localhost:8080/').out).toContain('19:00');
    expect(t.run('podman diff web').out).toBe('C /app\nC /app/server.js\n');
    expect(containerHolds(t.state().containers, 'changed:web body:web~19:00')).toBe(true);
    t.run('podman rm -f web');
    t.run('podman run -d --name web -p 8080:3000 reserve:1.0');
    expect(t.run('curl -s http://localhost:8080/').out).toContain('17:00');
    expect(t.run('podman diff web').out).toBe('');
    expect(containerHolds(t.state().containers, '!changed:web made:web>=2')).toBe(true);
  });
});

describe('ps・images・pull・誤り', () => {
  it('名前は置き場の住所まで書き、表の欄は中身 + 2 字（12 字より狭くしない）', () => {
    const t = open();
    t.run('podman run -d --name db city-db:1.0');
    expect(t.run('podman ps').out).toMatch(/^CONTAINER ID {2}IMAGE {26}COMMAND {5}CREATED {8}STATUS {8}PORTS {7}NAMES\n[0-9a-f]{12} {2}docker\.io\/library\/city-db:1\.0 {2}postgres {4}2 seconds ago {2}Up 2 seconds {14}db\n$/);
  });

  it('短い別名は解き方を言ってから取る', () => {
    const out = open().run('podman pull nginx:1.27').out;
    expect(out).toMatch(/^Resolved "nginx" as an alias \(\/etc\/containers\/registries\.conf\.d\/shortnames\.conf\)\nTrying to pull docker\.io\/library\/nginx:1\.27\.\.\.\nGetting image source signatures\n/);
    expect(out).toContain('Writing manifest to image destination\n');
  });

  it('同じ名前・使用中の手元のポート・無いコンテナ・動いているコンテナの rm は、本物の podman の文で断る', () => {
    const t = open();
    t.run('podman run -d --name db -p 5432:5432 city-db:1.0');
    expect(t.run('podman run -d --name db city-db:1.0').err).toMatch(/^Error: creating container storage: the container name "db" is already in use by [0-9a-f]{64}\. You have to remove that container to be able to reuse that name: that name is already in use\n$/);
    expect(t.run('podman run -d --name db2 -p 5432:5432 city-db:1.0').err).toBe('Error: rootlessport listen tcp 0.0.0.0:5432: bind: address already in use\n');
    expect(t.run('podman logs nope')).toMatchObject({ err: 'Error: no container with name or ID "nope" found: no such container\n', code: 125 });
    expect(t.run('podman rm db').err).toMatch(/as it is running - running or paused containers cannot be removed without force: container state improper\n$/);
  });

  it('port は公開した対応を、inspect -f は podman の欄で答える', () => {
    const t = open();
    t.run('podman run -d --name db -p 5432:5432 city-db:1.0');
    expect(t.run('podman port db').out).toBe('5432/tcp -> 0.0.0.0:5432\n');
    expect(t.run("podman inspect db --format '{{.ImageName}} {{.State.Status}}'").out).toBe('docker.io/library/city-db:1.0 running\n');
    expect(containerHolds(t.state().containers, 'published:db published:db=5432 !published:db=80')).toBe(true);
  });
});

describe('網とボリューム', () => {
  it('既定の網は podman で、名前は引けない。作った網の中では名前で届く', () => {
    const t = open();
    expect(t.run('podman network ls').out).toMatch(/^NETWORK ID {4}NAME {8}DRIVER\n[0-9a-f]{12} {2}podman {6}bridge\n$/);
    expect(t.run('podman network create reserve-net').out).toBe('reserve-net\n');
    t.run('podman run -d --name db --network reserve-net city-db:1.0');
    t.run('podman run -d --name web --network reserve-net -e DATABASE_URL=postgres://postgres@db:5432/reserve city-reserve:2.0');
    expect(containerHolds(t.state().containers, 'reach:web>db running:web')).toBe(true);
    expect(t.run('podman network rm reserve-net').err).toBe('Error: "reserve-net" has associated containers with it. Use -f to forcibly delete containers and pods: network is being used\n');
  });

  it('ボリュームは利用者の家の下に置く', () => {
    const t = open();
    expect(t.run('podman volume create db-data').out).toBe('db-data\n');
    expect(t.run('podman volume inspect db-data').out).toContain('"Mountpoint": "/home/learner/.local/share/containers/storage/volumes/db-data/_data"');
    expect(t.run('podman volume ls').out).toBe('DRIVER      VOLUME NAME\nlocal       db-data\n');
  });
});

describe('機械から見たプロセス', () => {
  it('podman のコンテナは conmon の子で、中の root は自分の利用者で見える', () => {
    const t = open();
    t.run('podman run -d --name db city-db:1.0');
    const ps = t.run('ps aux').out;
    expect(ps).toMatch(/learner .*\/usr\/bin\/conmon --api-version 1 -c [0-9a-f]{64}/);
    expect(ps).toMatch(/100998 .*postgres/);
  });
});

describe('置き場のタグ（search --list-tags・pull・rmi）', () => {
  function shop(): ReturnType<typeof open> {
    const t = open({ registries: [{ server: 'registry.city.example', user: 'learner' }] });
    t.run('podman login registry.city.example');
    t.run('cd reserve');
    t.run('podman build -t registry.city.example/shop/web:1.2 .');
    t.run('podman push registry.city.example/shop/web:1.2');
    t.run("sed -i 's/17:00/19:00/' server.js");
    t.run('podman build -t registry.city.example/shop/web:1.3-rc1 .');
    t.run('podman tag registry.city.example/shop/web:1.3-rc1 registry.city.example/shop/web:latest');
    t.run('podman push registry.city.example/shop/web:1.3-rc1');
    t.run('podman push registry.city.example/shop/web:latest');
    return t;
  }

  it('--list-tags は置き場のタグを文字の順に並べる。ログインしていなければ断られ、タグ付きの名前は受け付けない', () => {
    const t = shop();
    expect(t.run('podman search --list-tags registry.city.example/shop/web').out).toBe(
      'NAME                            TAG\nregistry.city.example/shop/web  1.2\nregistry.city.example/shop/web  1.3-rc1\nregistry.city.example/shop/web  latest\n',
    );
    expect(t.run('podman search --list-tags registry.city.example/shop/web:1.2').err).toBe('Error: reference "registry.city.example/shop/web:1.2" must be only a name and not include a tag\n');
    t.run('podman logout registry.city.example');
    expect(t.run('podman search --list-tags registry.city.example/shop/web').err).toBe('Error: getting repository tags: fetching tags list: authentication required\n');
  });

  it('rmi は名前を並べて外せる。同じ中身に名前が残る間は Untagged だけで、最後の名前で Deleted', () => {
    const t = shop();
    const out = t.run('podman rmi registry.city.example/shop/web:latest registry.city.example/shop/web:1.3-rc1').out;
    expect(out).toMatch(/^Untagged: registry\.city\.example\/shop\/web:latest\nUntagged: registry\.city\.example\/shop\/web:1\.3-rc1\nDeleted: [0-9a-f]{64}\n$/);
  });

  it('置き場から取った物は住所まで書いた名前で出し、同じ中身が手元にあれば層を取り直さない。無いタグ・無い名前は本物の文で断る', () => {
    const t = shop();
    t.run('podman rmi registry.city.example/shop/web:1.2 registry.city.example/shop/web:1.3-rc1 registry.city.example/shop/web:latest');
    expect(t.run('podman pull registry.city.example/shop/web').out).toContain('Copying blob');
    expect(t.run('podman pull registry.city.example/shop/web:1.3-rc1').out).toContain('skipped: already exists');
    expect(t.run('podman images').out).toMatch(/registry\.city\.example\/shop\/web\s+latest\s+([0-9a-f]{12})\s+2 weeks ago[^\n]*\nregistry\.city\.example\/shop\/web\s+1\.3-rc1\s+\1\s/);
    expect(t.run('podman pull registry.city.example/shop/web:v1.2').err).toContain('reading manifest v1.2 in registry.city.example/shop/web: manifest unknown');
    expect(t.run('podman pull registry.city.example/shop/wbe:1.2').err).toContain('reading manifest 1.2 in registry.city.example/shop/wbe: name unknown: repository name not known to registry');
  });
});

describe('DB のデータを書く場所（SHOW data_directory・ls・logs）', () => {
  it('SHOW data_directory は DB の書く場所を答え、ボリュームを付けた空の場所は ls で何も出さない。付け直して作り直すと記録に Skipping が出る', () => {
    const t = open();
    t.run('podman run -d --name db -v db-data:/data city-db:1.0');
    expect(t.run("podman exec db psql -U postgres -d reserve -c 'SHOW data_directory'").out).toBe('      data_directory      \n--------------------------\n /var/lib/postgresql/data\n(1 row)\n\n');
    expect(t.run("podman exec db psql -U postgres -d reserve -c 'SHOW nope'").err).toBe('ERROR:  unrecognized configuration parameter "nope"\n');
    expect(t.run('podman exec db ls /data')).toMatchObject({ out: '', err: '', code: 0 });
    expect(t.run('podman exec db ls /nope').code).not.toBe(0);
    t.run('podman rm -f db');
    t.run('podman run -d --name db -v db-data:/var/lib/postgresql/data city-db:1.0');
    expect(containerHolds(t.state().containers, '!log:db~Skipping')).toBe(true);
    t.run('podman rm -f db');
    t.run('podman run -d --name db -v db-data:/var/lib/postgresql/data city-db:1.0');
    expect(t.run('podman logs db').out).toContain('Skipping initialization');
    expect(containerHolds(t.state().containers, 'log:db~Skipping')).toBe(true);
  });
});

describe('役割ごとに分けたサービス（画面 → API → DB）', () => {
  const COMPOSE = (api: string, db: string): string => `services:\n  web:\n    image: city-reserve-ui:1.0\n    ports:\n      - "8080:80"\n    environment:\n      API_URL: ${api}\n    depends_on:\n      - api\n  api:\n    image: city-reserve-api:1.0\n    environment:\n      DATABASE_URL: ${db}\n    depends_on:\n      - db\n  db:\n    image: city-db:1.0\n`;
  const IMAGES = ['city-reserve-all:1.0', 'city-reserve-ui:1.0', 'city-reserve-api:1.0', 'city-db:1.0'];

  it('1 つに詰めたイメージは 80 番で予約の数を答える', () => {
    const t = open({ images: IMAGES });
    t.run('podman run -d --name web -p 8080:80 city-reserve-all:1.0');
    expect(t.run('curl -s http://localhost:8080/').out).toContain('予約 3 件');
  });

  it('localhost で指すと、API は止まり、画面は頼まれた時に 502 と理由を答える', () => {
    const t = open({ images: IMAGES, cwd: '/home/learner/reserve', files: { '/home/learner/reserve/compose.yaml': COMPOSE('http://localhost:3000', 'postgres://postgres@localhost:5432/reserve') } });
    t.run('podman compose up -d');
    expect(t.run('podman compose logs api').out).toContain('Error: connect ECONNREFUSED 127.0.0.1:5432');
    const page = t.run('curl -si http://localhost:8080/').out;
    expect(page).toMatch(/^HTTP\/1\.1 502 /);
    expect(page).toContain('ECONNREFUSED 127.0.0.1:3000');
    expect(containerHolds(t.state().containers, 'running:reserve-web-1 exited:reserve-api-1 !body:reserve-web-1~件')).toBe(true);
  });

  it('名前で指すと、画面は API に、API は DB に届き、画面は API の答えの値で予約の数を出す。API を後から直しても、画面は次の頼みで届く', () => {
    const t = open({ images: IMAGES, cwd: '/home/learner/reserve', files: { '/home/learner/reserve/compose.yaml': COMPOSE('http://api:3000', 'postgres://postgres@localhost:5432/reserve') } });
    t.run('podman compose up -d');
    expect(t.run('curl -s http://localhost:8080/').out).toContain('502 Bad Gateway');
    t.run(`sed -i 's/@localhost:/@db:/' compose.yaml`);
    t.run('podman compose up -d');
    expect(t.run('curl -s http://localhost:8080/').out).toContain('<html><body><h1>市の予約</h1><p>予約 3 件</p></body></html>');
    expect(t.run('podman compose logs api').out).toContain('api: connected to the database at db:5432');
    expect(containerHolds(t.state().containers, 'body:reserve-web-1~件 reach:reserve-web-1>api reach:reserve-api-1>db')).toBe(true);
  });
});

describe('網の一覧の順', () => {
  it('podman での名前の順に並べる（既定の網 podman も名前で並ぶ）', () => {
    const t = open();
    t.run('podman network create front-net');
    t.run('podman network create back-net');
    expect(t.run('podman network ls').out).toMatch(/^NETWORK ID {4}NAME {8}DRIVER\n[0-9a-f]{12} {2}back-net {4}bridge\n[0-9a-f]{12} {2}front-net {3}bridge\n[0-9a-f]{12} {2}podman {6}bridge\n$/);
  });
});

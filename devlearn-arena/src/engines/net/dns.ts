/**
 * DNS の再帰解決とキャッシュ。
 *
 * 「誰に聞くか」を段ごとに辿る。ルート → TLD → 権威。
 * 答えを作り置きせず、ゾーンのレコードから毎回組み立てる。
 * キャッシュは TTL で消える。古い答えが残る事故を再現できる。
 */
export type RecordType = 'A' | 'AAAA' | 'CNAME' | 'NS' | 'MX' | 'TXT';

export interface ResourceRecord {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
}

export interface Zone {
  /** 'example.com.' のように末尾のドットまで持つ */
  origin: string;
  /** そのゾーンを預かるサーバの名前 */
  server: string;
  records: ResourceRecord[];
}

export interface DnsWorld {
  /** ルートから権威まで、全てのゾーン */
  zones: Zone[];
  /** リゾルバのキャッシュ。鍵は `name|type` */
  cache: Map<string, { record: ResourceRecord; expiresAt: number }>;
  /** 経過 tick。TTL の判定に使う */
  now: number;
}

export interface QueryStep {
  /** 問い合わせ先のサーバ */
  server: string;
  question: string;
  /** 返ってきた内容 */
  answer: string;
  /** 委任なら次に聞くべきサーバ */
  referral: string | null;
}

export interface QueryResult {
  steps: QueryStep[];
  /** 最終的な答え。引けなければ null */
  record: ResourceRecord | null;
  /** キャッシュから返したか */
  fromCache: boolean;
  error: string | null;
  world: DnsWorld;
}

function normalize(name: string): string {
  return name.endsWith('.') ? name : `${name}.`;
}

/** その名前を預かっている、いちばん深いゾーン */
function zoneFor(world: DnsWorld, name: string): Zone | null {
  const target = normalize(name);
  let best: Zone | null = null;
  for (const zone of world.zones) {
    if (!target.endsWith(zone.origin)) continue;
    if (best === null || zone.origin.length > best.origin.length) best = zone;
  }
  return best;
}

function cacheKey(name: string, type: RecordType): string {
  return `${normalize(name)}|${type}`;
}

export function createWorld(zones: Zone[]): DnsWorld {
  return { zones, cache: new Map(), now: 0 };
}

export function advanceDns(world: DnsWorld, ticks: number): DnsWorld {
  return { ...world, now: world.now + ticks };
}

/** キャッシュに入っていて、まだ生きているもの */
export function cached(world: DnsWorld, name: string, type: RecordType): ResourceRecord | null {
  const hit = world.cache.get(cacheKey(name, type));
  if (hit === undefined) return null;
  if (hit.expiresAt <= world.now) return null;
  return hit.record;
}

/**
 * 再帰解決。ルートから順に委任を辿る。
 * 途中の NS も、最後の答えも、実際にゾーンのレコードから引く。
 */
export function resolve(world: DnsWorld, name: string, type: RecordType = 'A'): QueryResult {
  const target = normalize(name);
  const hit = cached(world, target, type);
  if (hit !== null) {
    return {
      steps: [{ server: 'cache', question: `${target} ${type}`, answer: hit.value, referral: null }],
      record: hit,
      fromCache: true,
      error: null,
      world,
    };
  }

  const steps: QueryStep[] = [];
  // ルートから1ラベルずつ深くしていく（. → com. → example.com.）
  const labels = target.split('.').filter((l) => l !== '');
  const suffixes = ['.', ...labels.map((_, i) => `${labels.slice(labels.length - 1 - i).join('.')}.`)];

  const root = world.zones.find((z) => z.origin === '.');
  if (root === undefined) {
    return { steps, record: null, fromCache: false, error: 'ルートサーバが見つかりません', world };
  }
  let current: Zone = root;

  for (const suffix of suffixes.slice(1)) {
    const zone: Zone = current;
    const delegation: ResourceRecord | undefined = zone.records.find(
      (r) => r.type === 'NS' && normalize(r.name) === suffix,
    );
    const answer = zone.records.find(
      (r) => normalize(r.name) === target && (r.type === type || r.type === 'CNAME'),
    );

    if (answer !== undefined) {
      steps.push({ server: zone.server, question: `${target} ${type}`, answer: answer.value, referral: null });
      if (answer.type === 'CNAME' && type !== 'CNAME') {
        // 別名なら、その先をもう一度引く
        const followed = resolve(world, answer.value, type);
        return { ...followed, steps: [...steps, ...followed.steps], fromCache: false };
      }
      const cache = new Map(world.cache);
      cache.set(cacheKey(target, type), { record: answer, expiresAt: world.now + answer.ttl });
      return { steps, record: answer, fromCache: false, error: null, world: { ...world, cache } };
    }

    if (delegation === undefined) {
      steps.push({
        server: zone.server,
        question: `${target} ${type}`,
        answer: 'NXDOMAIN',
        referral: null,
      });
      return {
        steps,
        record: null,
        fromCache: false,
        error: `NXDOMAIN: ${target} は存在しません`,
        world,
      };
    }

    steps.push({
      server: zone.server,
      question: `${target} ${type}`,
      answer: `委任: ${suffix} は ${delegation.value}`,
      referral: delegation.value,
    });

    const next: Zone | undefined = world.zones.find((z) => z.server === delegation.value);
    if (next === undefined) {
      return {
        steps,
        record: null,
        fromCache: false,
        error: `${delegation.value} に問い合わせできません（サーバ応答なし）`,
        world,
      };
    }
    current = next;
  }

  const zone = zoneFor(world, target);
  const answer = zone?.records.find((r) => normalize(r.name) === target && r.type === type);
  if (answer === undefined) {
    steps.push({ server: current.server, question: `${target} ${type}`, answer: 'NXDOMAIN', referral: null });
    return { steps, record: null, fromCache: false, error: `NXDOMAIN: ${target} は存在しません`, world };
  }
  steps.push({ server: current.server, question: `${target} ${type}`, answer: answer.value, referral: null });
  const cache = new Map(world.cache);
  cache.set(cacheKey(target, type), { record: answer, expiresAt: world.now + answer.ttl });
  return { steps, record: answer, fromCache: false, error: null, world: { ...world, cache } };
}

/** ゾーンのレコードを差し替える（切り替え作業の再現） */
export function updateRecord(world: DnsWorld, origin: string, record: ResourceRecord): DnsWorld {
  return {
    ...world,
    zones: world.zones.map((zone) =>
      zone.origin === origin
        ? {
            ...zone,
            records: [
              ...zone.records.filter(
                (r) => !(normalize(r.name) === normalize(record.name) && r.type === record.type),
              ),
              record,
            ],
          }
        : zone,
    ),
  };
}

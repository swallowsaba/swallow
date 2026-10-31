import { appAnswer, engineOf, filesInside, findContainer, findNetwork, networksOf, normalizeRef, resolveName, serverOf, type ContainerHost, sizeInMb } from './container';
import { readTables, TABLES_FILE } from './pg';

/**
 * 実戦の達成条件 `{ kind: 'container', expr }`（docs/content-spec.md 2.4）を、コンテナの模型の状態で判定する。純粋な関数。
 *
 * expr は空白で区切った条件を並べる（全てを満たせば達成）。先頭の `!` で否定:
 *   image:名前:タグ（手元にある。タグを省けば最新のタグ）/ running:名前・exited:名前（コンテナの状態）/ exists:名前（コンテナがある）/
 *   volume:名前（名前付きボリュームがある）/ mount:コンテナ=つなぐ物:中の場所 / rows:コンテナ/表=数（DB の表の行の数）/
 *   made:名前>=数・made:名前=数（その名前でコンテナを作った回数）/ network:名前（網がある）/ on:コンテナ=網（網に入っている）/
 *   reach:A>B（A から B に名前で届く。どちらも動いていて、同じ自作の網にいる）/ from:コンテナ=名前:タグ（そのイメージから作った）/
 *   pushed:住所/名前:タグ（自分たちの置き場にある）/ login:住所（ログインしている）/ body:コンテナ~文字列（動いているコンテナが答える中身にある）/
 *   log:コンテナ~文字列（コンテナの記録にある）/ changed:コンテナ（中で書いた物が書き込みの層にある）/ published:コンテナ[=手元のポート]（公開している）/
 *   cached:名前:タグ=語（そのイメージを作った時、その語を含む命令の段を使い回した）。
 *   @名前 で、それより後ろの条件を、その頼む先（docker context）の Engine で判定する（@default で手元に戻る）
 */

function termHolds(host: ContainerHost, term: string): boolean {
  const colon = term.indexOf(':');
  const kind = colon < 0 ? term : term.slice(0, colon);
  const arg = colon < 0 ? '' : term.slice(colon + 1);
  if (arg === '') throw new Error(`コンテナの条件「${term}」は知らない形`);
  switch (kind) {
    case 'image': {
      const ref = normalizeRef(arg);
      return host.images.some((i) => i.ref === ref);
    }
    case 'running':
      return findContainer(host, arg)?.state === 'running';
    case 'exited':
      return findContainer(host, arg)?.state === 'exited';
    case 'exists':
      return findContainer(host, arg) !== undefined;
    case 'volume':
      return host.volumes?.some((v) => v.name === arg) === true;
    case 'mount': {
      // mount:コンテナ=つなぐ物:中の場所（中の場所を省けば、どこにつないでいてもよい）
      const m = /^([^=]+)=([^:]+)(?::(.+))?$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const trim = (p: string): string => p.replace(/(.)\/+$/, '$1');
      return findContainer(host, m[1] ?? '')?.volumes.some((v) => v.host === m[2] && (m[3] === undefined || trim(v.container) === trim(m[3]))) === true;
    }
    case 'rows': {
      // rows:コンテナ/表=数（DB のコンテナのデータを書く場所にある表の行の数）
      const m = /^([^/]+)\/(\w+)=(\d+)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const c = findContainer(host, m[1] ?? '');
      const pg = host.images.find((i) => i.ref === c?.image)?.pg;
      if (!c || !pg) return false;
      return readTables(filesInside(host, c)[`${pg.dataDir}/${TABLES_FILE}`])[m[2] ?? '']?.rows.length === Number(m[3]);
    }
    case 'network':
      return findNetwork(host, arg)?.name === arg;
    case 'from':
      // from:コンテナ=名前:タグ（そのイメージから作ったコンテナ）
      return findContainer(host, arg.split('=')[0] ?? '')?.image === normalizeRef(arg.slice(arg.indexOf('=') + 1));
    case 'pushed': {
      // pushed:住所/名前:タグ（自分たちの置き場に置いてある）
      const ref = normalizeRef(arg);
      return host.registries?.find((r) => r.server === serverOf(ref))?.images.some((i) => i.ref === ref) === true;
    }
    case 'login':
      return host.logins?.[arg] !== undefined;
    case 'on': {
      // on:コンテナ=網（そのコンテナが網に入っている）
      const [ref = '', net = ''] = arg.split('=');
      const c = findContainer(host, ref);
      return c !== undefined && networksOf(c).includes(net);
    }
    case 'reach': {
      // reach:A>B（A から B に、名前で届く。どちらも動いていて、同じ自作の網にいる）
      const [from = '', to = ''] = arg.split('>');
      const a = findContainer(host, from);
      return a?.state === 'running' && resolveName(host, a, to) !== null;
    }
    case 'body': {
      // body:コンテナ~文字列（動いているコンテナが答える中身に、その文字列がある）
      const at = arg.indexOf('~');
      if (at < 1) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const c = findContainer(host, arg.slice(0, at));
      if (c?.state !== 'running') return false;
      const image = host.images.find((i) => i.ref === c.image);
      const served = image?.serves?.root !== undefined ? image.files?.[`${image.serves.root}/index.html`] : undefined;
      const body = c.app ? appAnswer(host, c).body : (served ?? image?.serves?.body ?? '');
      return body.includes(arg.slice(at + 1));
    }
    case 'log': {
      // log:コンテナ~文字列（コンテナの記録（podman logs・docker logs）に、その文字列がある）
      const at = arg.indexOf('~');
      if (at < 1) throw new Error(`コンテナの条件「${term}」は知らない形`);
      return findContainer(host, arg.slice(0, at))?.log.some((l) => l.includes(arg.slice(at + 1))) === true;
    }
    case 'changed':
      // changed:コンテナ（中で書いた物が書き込みの層にある。podman diff・docker diff に出る）
      return Object.keys(findContainer(host, arg)?.files ?? {}).length > 0;
    case 'published': {
      // published:コンテナ（手元のポートに公開している）・published:コンテナ=手元のポート
      const [ref = '', port] = arg.split('=');
      const c = findContainer(host, ref);
      return c !== undefined && c.ports.some((p) => port === undefined || p.host === Number(port));
    }
    case 'cached': {
      // cached:名前:タグ=語（そのイメージを作った時、その語を含む命令の段を、前に作った物から使い回した）
      const at = arg.lastIndexOf('=');
      if (at < 1) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const ref = normalizeRef(arg.slice(0, at));
      const step = host.images.find((i) => i.ref === ref)?.built?.find((s) => s.step.includes(arg.slice(at + 1)));
      return step?.cached === true;
    }
    case 'vulns':
    case 'size': {
      // vulns:名前:タグ<=件数・size:名前:タグ<=MB（点検の件数・イメージの大きさ）
      const m = /^(.+?)(<=|>=)(\d+(?:\.\d+)?)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const image = host.images.find((i) => i.ref === normalizeRef(m[1] ?? ''));
      if (!image) return false;
      const value = kind === 'size' ? sizeInMb(image.size) : image.vulns ?? 0;
      return m[2] === '<=' ? value <= Number(m[3]) : value >= Number(m[3]);
    }
    case 'user': {
      // user:コンテナ=利用者（動かしている利用者。--user かイメージの USER。無ければ root）
      const [name = '', want = ''] = arg.split('=');
      const c = findContainer(host, name);
      return c !== undefined && (c.user ?? host.images.find((i) => i.ref === c.image)?.user ?? 'root') === want;
    }
    case 'restart': {
      // restart:コンテナ=方針
      const [name = '', want = ''] = arg.split('=');
      return findContainer(host, name)?.restart === want;
    }
    case 'restarts': {
      // restarts:コンテナ>=回数（自動で動かし直した回数）
      const m = /^([^>]+)>=(\d+)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      return (findContainer(host, m[1] ?? '')?.restarts ?? 0) >= Number(m[2]);
    }
    case 'limit':
      // limit:コンテナ（メモリの上限を付けた）
      return findContainer(host, arg)?.memoryLimit !== undefined;
    case 'logopt': {
      // logopt:コンテナ=項目（ログの上限などの項目を書いた）
      const [name = '', want = ''] = arg.split('=');
      return findContainer(host, name)?.logOpts?.[want] !== undefined;
    }
    case 'made': {
      // made:名前>=数（その名前でコンテナを作った回数。作り直したことを確かめる）
      const m = /^([^>=]+)(>=|=)(\d+)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const n = host.made?.[m[1] ?? ''] ?? 0;
      return m[2] === '>=' ? n >= Number(m[3]) : n === Number(m[3]);
    }
    default:
      throw new Error(`コンテナの条件「${term}」は知らない形`);
  }
}

export function containerHolds(host: ContainerHost | null, expr: string): boolean {
  const terms = expr.trim().split(/\s+/).filter(Boolean);
  // 知らない形は、機械に Docker が無くても内容の誤りとして投げる
  const results = terms.map((t) => (t.startsWith('!') ? { neg: true, term: t.slice(1) } : { neg: false, term: t }));
  if (!host) {
    for (const r of results) if (!r.term.startsWith('@')) termHolds({ images: [], containers: [], seq: 0 }, r.term);
    return false;
  }
  let at: ContainerHost = host;
  return results.every((r) => {
    if (r.term.startsWith('@')) {
      const engine = engineOf(host, r.term.slice(1));
      if (!engine) throw new Error(`コンテナの条件「${r.term}」: 頼む先が無い`);
      at = engine;
      return true;
    }
    return termHolds(at, r.term) !== r.neg;
  });
}

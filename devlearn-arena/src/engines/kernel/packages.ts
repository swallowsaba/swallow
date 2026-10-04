import { exists, readFile, type VfsState } from './vfs';

/**
 * パッケージ管理（apt）の模型。純粋な関数。docs/lessons/linux.md の linux.i.03 の実戦が使う。
 *
 * - 保管庫（遠くの配布元）の中身は、この模型が持つ一覧（REMOTE）。apt update で手元の一覧（LISTS_FILE）に写す
 * - apt install は手元の一覧を見る。update していなければ、パッケージが見つからない（本物と同じ）
 * - 入っているパッケージは STATUS_FILE（dpkg の記録と同じ形）に書く。無ければ、初めから入っている物（BASE）だけ
 * - 入れると、依存するパッケージも一緒に入り、実行ファイル（bin）が置かれる
 */

export const STATUS_FILE = '/var/lib/dpkg/status';
export const LISTS_FILE = '/var/lib/apt/lists/archive.ubuntu.com_ubuntu_dists_noble_main_binary-amd64_Packages';

export interface PackageInfo {
  name: string;
  version: string;
  depends: string[];
  /** 大きさ（kB） */
  size: number;
  /** 入れると置かれる実行ファイルと、その中身 */
  bin?: { path: string; content: string };
  description: string;
}

const pkg = (name: string, version: string, size: number, description: string, depends: string[] = [], bin?: PackageInfo['bin']): PackageInfo => ({
  name, version, size, description, depends, ...(bin ? { bin } : {}),
});

const versionScript = (text: string): string => `#!/bin/sh\necho "${text}"\n`;

/** 配布元の保管庫にある物（今の版） */
export const REMOTE: readonly PackageInfo[] = [
  pkg('nginx', '1.24.0-2ubuntu7', 520, 'small, powerful, scalable web/proxy server', ['nginx-common'], { path: '/usr/sbin/nginx', content: versionScript('nginx version: nginx/1.24.0 (Ubuntu)') }),
  pkg('nginx-common', '1.24.0-2ubuntu7', 43, 'small, powerful, scalable web/proxy server - common files'),
  pkg('curl', '8.5.0-2ubuntu10.6', 227, 'command line tool for transferring data with URL syntax', ['libcurl4']),
  pkg('libcurl4', '8.5.0-2ubuntu10.6', 341, 'easy-to-use client-side URL transfer library'),
  pkg('htop', '3.3.0-4build1', 171, 'interactive processes viewer', [], { path: '/usr/bin/htop', content: versionScript('htop 3.3.0') }),
  pkg('tree', '2.1.1-2ubuntu3', 47, 'displays an indented directory tree, in color', [], { path: '/usr/bin/tree', content: versionScript('tree v2.1.1') }),
  pkg('openssl', '3.0.13-0ubuntu3.4', 1003, 'Secure Sockets Layer toolkit - cryptographic utility', ['libssl3']),
  pkg('libssl3', '3.0.13-0ubuntu3.4', 1940, 'Secure Sockets Layer toolkit - shared libraries'),
];

/** 初めから入っている物（古い版。update すると、新しい版があると分かる） */
export const BASE: Readonly<Record<string, string>> = { openssl: '3.0.13-0ubuntu3.1', libssl3: '3.0.13-0ubuntu3.1' };

function parseRecords(text: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const block of text.split(/\n\s*\n/)) {
    const rec: Record<string, string> = {};
    for (const line of block.split('\n')) {
      const m = /^([A-Za-z-]+): (.*)$/.exec(line);
      if (m) rec[m[1] ?? ''] = m[2] ?? '';
    }
    if (rec['Package']) out.set(rec['Package'], rec);
  }
  return out;
}

/** 入っているパッケージ（名前 → 版） */
export function installed(vfs: VfsState): Map<string, string> {
  if (!exists(vfs, STATUS_FILE)) return new Map(Object.entries(BASE));
  return new Map([...parseRecords(readFile(vfs, STATUS_FILE))].map(([name, r]) => [name, r['Version'] ?? '']));
}

export function statusText(list: ReadonlyMap<string, string>): string {
  return [...list].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `Package: ${name}\nStatus: install ok installed\nVersion: ${version}\n`).join('\n');
}

/** 手元の一覧（apt update で写した物）。update していなければ空 */
export function localIndex(vfs: VfsState): Map<string, PackageInfo> {
  if (!exists(vfs, LISTS_FILE)) return new Map();
  const remote = new Map(REMOTE.map((p) => [p.name, p]));
  const out = new Map<string, PackageInfo>();
  for (const [name, r] of parseRecords(readFile(vfs, LISTS_FILE))) {
    const known = remote.get(name);
    if (known) out.set(name, { ...known, version: r['Version'] ?? known.version });
  }
  return out;
}

export function listsText(): string {
  return REMOTE.map((p) => `Package: ${p.name}\nVersion: ${p.version}\n${p.depends.length > 0 ? `Depends: ${p.depends.join(', ')}\n` : ''}Description: ${p.description}\n`).join('\n');
}

/** 入れる物の順（依存が先）。見つからない名前があれば、その名前を返す */
export function resolveInstall(index: ReadonlyMap<string, PackageInfo>, names: readonly string[]): { order: PackageInfo[] } | { missing: string } {
  const order: PackageInfo[] = [];
  const seen = new Set<string>();
  const visit = (name: string): string | null => {
    if (seen.has(name)) return null;
    seen.add(name);
    const p = index.get(name);
    if (!p) return name;
    for (const d of p.depends) {
      const miss = visit(d);
      if (miss !== null) return miss;
    }
    order.push(p);
    return null;
  };
  for (const n of names) {
    const miss = visit(n);
    if (miss !== null) return { missing: miss };
  }
  return { order };
}

/** 入っている物のうち、手元の一覧に新しい版がある物 */
export function upgradable(vfs: VfsState): PackageInfo[] {
  const index = localIndex(vfs);
  return [...installed(vfs)].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, version]) => {
    const p = index.get(name);
    return p && p.version !== version ? [p] : [];
  });
}

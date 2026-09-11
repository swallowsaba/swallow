import { dump } from 'js-yaml';
import { toManifest } from '@/engines/k8s/toManifest';
import type { Resource } from '@/engines/k8s/types';

/**
 * `-o yaml|json|jsonpath=...|name` の出力。
 *
 * 表示用の文字列を作り置きせず、資源そのものを直列化する。
 * 表で見えている値と、yaml で見える値が必ず一致する。
 */
export type OutputFormat =
  | { kind: 'table'; wide: boolean }
  | { kind: 'yaml' }
  | { kind: 'json' }
  | { kind: 'name' }
  | { kind: 'jsonpath'; path: string };

export function parseOutput(raw: string): OutputFormat {
  if (raw === '' ) return { kind: 'table', wide: false };
  if (raw === 'wide') return { kind: 'table', wide: true };
  if (raw === 'yaml') return { kind: 'yaml' };
  if (raw === 'json') return { kind: 'json' };
  if (raw === 'name') return { kind: 'name' };
  if (raw.startsWith('jsonpath=')) return { kind: 'jsonpath', path: raw.slice('jsonpath='.length) };
  return { kind: 'table', wide: false };
}

/** 本物の `-o yaml` と同じ入れ子にする。保存してそのまま apply -f に渡せる */
function withApiVersion(resource: Resource): Record<string, unknown> {
  return toManifest(resource);
}

/** `.items[0].metadata.name` のような素朴なパスを辿る */
export function evaluateJsonPath(root: unknown, path: string): string[] {
  const cleaned = path.replace(/^\{/, '').replace(/\}$/, '');
  let current: unknown[] = [root];
  for (const raw of cleaned.split('.')) {
    if (raw === '') continue;
    const match = /^([^[\]]*)(?:\[([^\]]*)\])?$/.exec(raw);
    const field = match?.[1] ?? raw;
    const index = match?.[2];

    if (field !== '') {
      current = current.flatMap((value) => {
        if (typeof value !== 'object' || value === null) return [];
        const hit = (value as Record<string, unknown>)[field];
        return hit === undefined ? [] : [hit];
      });
    }
    if (index !== undefined) {
      current = current.flatMap((value): unknown[] => {
        if (!Array.isArray(value)) return [];
        const list = value as unknown[];
        if (index === '*') return list;
        const hit = list[Number(index)];
        return hit === undefined ? [] : [hit];
      });
    }
  }
  return current.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)));
}

export function renderResources(resources: readonly Resource[], format: OutputFormat): string {
  if (format.kind === 'name') {
    return `${resources.map((r) => `${r.kind.toLowerCase()}/${r.metadata.name}`).join('\n')}\n`;
  }
  if (format.kind === 'yaml') {
    if (resources.length === 1) {
      const only = resources[0];
      return only === undefined ? '' : dump(withApiVersion(only), { noRefs: true, sortKeys: false });
    }
    return dump(
      { apiVersion: 'v1', kind: 'List', items: resources.map(withApiVersion) },
      { noRefs: true, sortKeys: false },
    );
  }
  if (format.kind === 'json') {
    const value =
      resources.length === 1 && resources[0] !== undefined
        ? withApiVersion(resources[0])
        : { apiVersion: 'v1', kind: 'List', items: resources.map(withApiVersion) };
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (format.kind === 'jsonpath') {
    const root =
      resources.length === 1 && resources[0] !== undefined
        ? withApiVersion(resources[0])
        : { items: resources.map(withApiVersion) };
    return `${evaluateJsonPath(root, format.path).join(' ')}\n`;
  }
  return '';
}

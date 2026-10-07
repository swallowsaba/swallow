import { load, loadAll, YAMLException } from 'js-yaml';
import { BUILDERS } from './manifestBuilders';
import { asRecord, asString, asStringMap } from './manifestValues';
import type { Resource } from './types';

/**
 * マニフェストの読み取り。
 * YAML を実際に構文解析し、素のオブジェクトを型のある資源に組み立てる。
 * 未知のキーは黙って捨てず、未対応の kind としてエラーにする。
 */
export interface ParseError {
  error: string;
}

export function isParseError(value: Resource | ParseError): value is ParseError {
  return 'error' in value;
}

/** kind の別名。Role と ClusterRole のように、扱いが同じものをまとめる */
const ALIASES: Record<string, string> = {
  ClusterRole: 'Role',
  ClusterRoleBinding: 'RoleBinding',
};

export function buildResource(doc: Record<string, unknown>): Resource | ParseError {
  const rawKind = asString(doc['kind']);
  if (rawKind === '') return { error: 'error: kind が指定されていません' };
  const kind = ALIASES[rawKind] ?? rawKind;
  const metadata = asRecord(doc['metadata']);
  const name = asString(metadata['name']);
  if (name === '') return { error: 'error: metadata.name が指定されていません' };

  const builder = BUILDERS[kind];
  if (builder === undefined) return { error: `error: 未対応の kind です: ${rawKind}` };

  const namespace = asString(metadata['namespace'], 'default');
  const labels = asStringMap(metadata['labels']);
  const built = builder(name, namespace, labels, asRecord(doc['spec']), doc);
  // ClusterRole / ClusterRoleBinding は元の kind を保つ
  if (rawKind !== kind && (built.kind === 'Role' || built.kind === 'RoleBinding')) {
    return { ...built, kind: rawKind } as Resource;
  }
  return built;
}

/** YAML の誤りを、本物の kubectl の言い方（yaml: line 行: 理由）にする */
function yamlError(error: unknown): ParseError {
  if (error instanceof YAMLException && error.mark !== undefined) {
    return { error: `error: error converting YAML to JSON: yaml: line ${String(error.mark.line + 1)}: ${error.reason}` };
  }
  return { error: `error: error converting YAML to JSON: ${String(error)}` };
}

/** YAML の1文書を資源にする */
export function parseManifest(text: string): Resource | ParseError {
  let doc: unknown;
  try {
    doc = load(text);
  } catch (error) {
    return yamlError(error);
  }
  return buildResource(asRecord(doc));
}

/** `---` で区切られた複数文書をまとめて読む */
export function parseManifests(text: string): (Resource | ParseError)[] {
  let docs: unknown[];
  try {
    docs = loadAll(text);
  } catch (error) {
    return [yamlError(error)];
  }
  return docs
    .filter((d) => d !== null && d !== undefined)
    .map((d) => buildResource(asRecord(d)));
}

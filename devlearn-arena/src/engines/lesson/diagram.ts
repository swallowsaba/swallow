import type { DeviceKind, Topology } from '@/engines/net/types';
import type { LessonDefinition } from './types';

/**
 * ネットワークの構成図の読み方。
 *
 * ネットワークの任務は、機器とケーブルが最初から与えられて始まる（ケーブルを挿す作業は教えない）。
 * そのぶん「右の図のどこを見ればよいか」を、課題に入る前に言葉で説明しておく。
 * 図と同じ状態から文章を作るので、図と説明が食い違わない。
 */
export interface DiagramReading {
  /** 図の記号の意味。どの任務でも同じ */
  legend: readonly string[];
  /** この任務の構成を、1行1事実で書いたもの */
  lines: readonly string[];
}

const KIND_ICON: Record<DeviceKind, string> = { host: '💻', router: '🔀', switch: '🔗' };
const KIND_WORD: Record<DeviceKind, string> = {
  host: 'パソコンやサーバ',
  router: 'ルータ。別々のネットワークの間で荷物を受け渡す機械',
  switch: 'スイッチ。同じネットワークの中で、ケーブルを束ねてつなぐ機械',
};

export const DIAGRAM_LEGEND: readonly string[] = [
  `箱が機器。${KIND_ICON.host} は${KIND_WORD.host}、${KIND_ICON.router} は${KIND_WORD.router}、${KIND_ICON.switch} は${KIND_WORD.switch}。`,
  '箱の中の 10.0.0.10/24 のような数字は IP アドレス（ネットワーク上の住所）。/24 は「前から 24 ビットぶんが同じ相手は、同じネットワークにいる」という意味。',
  '茶色の線はつながっているケーブル。赤い破線は切れているケーブル。',
  '赤い枠の箱が、いまあなたが操作している機器。コマンドはこの機器の上で動く。',
];

function deviceOf(end: string): { device: string; port: string } {
  const [device = '', port = ''] = end.split(':');
  return { device, port };
}

export function readTopology(net: Topology, self: string): DiagramReading {
  const lines: string[] = [];
  for (const device of net.devices.values()) {
    const addresses = device.interfaces
      .filter((i) => i.ip !== '')
      .map((i) => `${i.name} = ${i.ip}/${String(i.prefix)}`);
    const you = device.name === self ? '（あなたはここ）' : '';
    const where = addresses.length === 0 ? 'IP アドレスは持たない' : addresses.join('、');
    lines.push(`${KIND_ICON[device.kind]} ${device.name}${you}: ${where}`);
    const gateway = device.routes.find((r) => r.destination === '0.0.0.0/0' && r.via !== null);
    if (gateway?.via != null) {
      lines.push(`  ↳ ${device.name} は、行き先を知らない荷物をすべて ${gateway.via} に任せる（デフォルトゲートウェイ）。`);
    }
  }
  for (const link of net.links) {
    const a = deviceOf(link.a);
    const b = deviceOf(link.b);
    const state = link.up ? 'ケーブルでつながっている' : 'ケーブルが切れている';
    lines.push(`${a.device} の ${a.port} と ${b.device} の ${b.port} が${state}。`);
  }
  return { legend: DIAGRAM_LEGEND, lines };
}

/** 任務の最初の状態に構成図があれば、その読み方を返す */
export function diagramOf(lesson: LessonDefinition): DiagramReading | null {
  const net = lesson.initial.net;
  if (net === undefined) return null;
  const self = lesson.initial.vars?.['NET_SELF'] ?? 'pc1';
  return readTopology(net, self);
}

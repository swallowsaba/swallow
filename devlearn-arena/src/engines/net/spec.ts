import { z } from 'zod';
import { macFor } from './build';
import { DEFAULT_MTU } from './factory';
import { contains, parseCidr } from './subnet';
import type { Device, Interface, Link, Route, Topology } from './types';

/**
 * 実戦の setup に書く網（端末の実戦で ping・traceroute・dig・curl が使う。docs/content-spec.md 2.4 の net）。
 *
 * 機器ごとにアドレス（口ごとに 1 つ。eth0 から順）と、出口（gateway）・経路を書き、線は機器の名前の組で書く。
 * 線の両端の口は、同じ網のアドレスを持つ口から選ぶ（どの口かを書かなくてよい）。MAC は名前から決まる（同じ setup からは同じ網）
 */

const cidr = z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'アドレスは 10.0.0.5/24 の形');
const ip = z.string().regex(/^\d+\.\d+\.\d+\.\d+$/, 'アドレスは 10.0.0.1 の形');
const name = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const networkSetupSchema = z.object({
  /** 端末が動く機械（setup の hostname の代わりにプロンプトにも出る） */
  self: name,
  devices: z.array(z.object({
    name,
    kind: z.enum(['host', 'router']).default('host'),
    /** 口ごとのアドレス（eth0・eth1 … の順） */
    addrs: z.array(cidr).min(1),
    /** 知らない宛先の出口（デフォルトゲートウェイ） */
    gateway: ip.optional(),
    /** 足した経路（宛先の網 → 次に渡す機器のアドレス） */
    routes: z.array(z.object({ to: cidr, via: ip }).strict()).optional(),
    /** 待ち受けるポート */
    listen: z.array(z.number().int().min(1).max(65535)).optional(),
    /** ファイアウォールで落とすポート（返事をせず、送った側は待ち続ける） */
    blocked: z.array(z.number().int().min(1).max(65535)).optional(),
    /** 経路を調べる問い（traceroute）に答えない機器（通る荷物は普通に通す） */
    silent: z.boolean().optional(),
    /** Web のページ（curl で取りに来た時に返す中身） */
    body: z.string().optional(),
  }).strict()).min(1),
  /** 線（機器の名前の組。3 つ目に down と書くと、切れた線） */
  links: z.array(z.union([z.tuple([name, name]), z.tuple([name, name, z.literal('down')])])),
  /** 名前 → アドレス（名前解決の答え） */
  dns: z.record(z.string(), ip).optional(),
}).strict();

export type NetworkSetup = z.input<typeof networkSetupSchema>;

function ifaceOf(device: string, index: number, addr: string): Interface {
  const c = parseCidr(addr);
  const ifname = `eth${String(index)}`;
  return { name: ifname, ip: c.address, prefix: c.prefix, mac: macFor(device, ifname), up: true, vlan: null, trunkVlans: [], mtu: DEFAULT_MTU };
}

const networkOf = (i: Interface): string => `${parseCidr(`${i.ip}/${String(i.prefix)}`).network}/${String(i.prefix)}`;

/** 経路の次の機器のアドレスと、同じ網にある口 */
function devFor(d: Device, via: string, what: string): string {
  const out = d.interfaces.find((i) => contains(networkOf(i), via));
  if (!out) throw new Error(`${d.name} の${what} ${via} と同じ網の口が無い`);
  return out.name;
}

/** setup の網から、模擬の網を作る。形や中身の誤り（無い機器・同じ網の口が無い線）は投げる */
export function buildNetwork(raw: NetworkSetup): Topology {
  const spec = networkSetupSchema.parse(raw);
  const devices = new Map<string, Device>();
  for (const d of spec.devices) {
    if (devices.has(d.name)) throw new Error(`機器 ${d.name} が重なる`);
    const interfaces = d.addrs.map((a, i) => ifaceOf(d.name, i, a));
    const device: Device = {
      name: d.name, kind: d.kind, interfaces, routes: [], listening: d.listen ?? [], blockedPorts: d.blocked ?? [],
      arp: {}, macTable: {}, nat: null,
      ...(d.silent ? { silent: true } : {}),
      ...(d.body !== undefined ? { body: d.body } : {}),
    };
    const routes: Route[] = (d.routes ?? []).map((r) => ({ destination: r.to, via: r.via, dev: devFor(device, r.via, '経路の次の機器') }));
    if (d.gateway !== undefined) routes.push({ destination: '0.0.0.0/0', via: d.gateway, dev: devFor(device, d.gateway, '出口') });
    devices.set(d.name, { ...device, routes });
  }
  if (!devices.has(spec.self)) throw new Error(`端末の機械 ${spec.self} が devices に無い`);
  const used = new Set<string>();
  const links: Link[] = spec.links.map(([a, b, state]) => {
    const da = devices.get(a);
    const db = devices.get(b);
    if (!da || !db) throw new Error(`線 ${a}-${b}: 機器 ${!da ? a : b} が無い`);
    for (const ia of da.interfaces) {
      const ib = db.interfaces.find((i) => networkOf(i) === networkOf(ia));
      if (!ib || used.has(`${a}:${ia.name}`) || used.has(`${b}:${ib.name}`)) continue;
      used.add(`${a}:${ia.name}`);
      used.add(`${b}:${ib.name}`);
      return { a: `${a}:${ia.name}`, b: `${b}:${ib.name}`, up: state !== 'down', mtu: DEFAULT_MTU };
    }
    throw new Error(`線 ${a}-${b}: 同じ網のアドレスを持つ、空いた口が両方に無い`);
  });
  return { devices, links, dns: new Map(Object.entries(spec.dns ?? {})) };
}

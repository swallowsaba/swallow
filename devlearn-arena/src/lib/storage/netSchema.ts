import { z } from 'zod';

/** ネットワーク構成のスキーマ。`snapshotTopology` が返す形と 1 対 1 で対応させる。 */

const deviceSchema = z.object({
  name: z.string(),
  kind: z.enum(['host', 'router', 'switch']),
  interfaces: z.array(
    z.object({
      name: z.string(),
      ip: z.string(),
      prefix: z.number().int(),
      mac: z.string(),
      up: z.boolean(),
    }),
  ),
  routes: z.array(
    z.object({ destination: z.string(), via: z.string().nullable(), dev: z.string() }),
  ),
  listening: z.array(z.number().int()),
  blockedPorts: z.array(z.number().int()),
});

export const topologySnapshotSchema = z.object({
  devices: z.array(z.tuple([z.string(), deviceSchema])),
  links: z.array(z.object({ a: z.string(), b: z.string(), up: z.boolean() })),
  dns: z.array(z.tuple([z.string(), z.string()])),
});

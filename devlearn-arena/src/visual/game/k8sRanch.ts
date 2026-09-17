import type { ClusterState, Pod } from '@/engines/k8s/types';
import type { Box, Point } from '../sceneKit';
import { COMPONENTS, type Component } from '../clusterModel';

/**
 * クラスタを「コンテナ港」として並べる。
 * 上に港湾管理棟（コントロールプレーン）と4人の係、その右に置き場所の決まっていないコンテナ（Pod）の待機ヤード。
 * 下にノードごとの埠頭を並べ、コンテナは自分の置かれたノードの埠頭に置かれる。
 * 右端には Service の窓口を立て、Endpoints に載っているコンテナにだけ配線する。
 */

export const BOOTH_W = 140;
export const BOOTH_H = 100;
const BOOTH_GAP = 14;
const MARGIN = 40;
export const CELL_W = 64;
export const CELL_H = 74;
const PER_ROW = 5;
export const FIELD_HEAD = 58;
export const FIELD_W = MARGIN / 2 + PER_ROW * CELL_W + 4;
const FIELD_GAP = 48;
const PEN_PER_ROW = 3;

export interface RanchBooth {
  component: Component;
  box: Box;
}

export interface RanchField {
  node: string;
  box: Box;
}

export interface RanchService {
  name: string;
  box: Box;
}

export interface RanchBanner {
  name: string;
  x: number;
  y: number;
}

export interface Ranch {
  hero: Point;
  castle: Box;
  booths: RanchBooth[];
  pen: Box;
  banners: RanchBanner[];
  fields: RanchField[];
  services: RanchService[];
  /** Pod の名前 → コンテナを置く枠の左上 */
  pods: Map<string, Point>;
  width: number;
  height: number;
}

const byName = <T extends { metadata: { name: string } }>(items: Iterable<T>): T[] =>
  [...items].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));

/** 待ち場にいる Pod。置き場所が決まっていないか、決まったノードがもう無いもの */
export function waitingPods(cluster: ClusterState): Pod[] {
  return byName(cluster.pods.values()).filter(
    (p) => p.status.nodeName === null || !cluster.nodes.has(p.status.nodeName),
  );
}

export function layoutRanch(cluster: ClusterState): Ranch {
  const hero = { x: MARGIN, y: MARGIN + 70 };
  const castle: Box = {
    x: MARGIN + 70,
    y: MARGIN,
    w: COMPONENTS.length * BOOTH_W + (COMPONENTS.length - 1) * BOOTH_GAP + 40,
    h: BOOTH_H + 64,
  };
  const booths = COMPONENTS.map((component, i) => ({
    component,
    box: { x: castle.x + 20 + i * (BOOTH_W + BOOTH_GAP), y: castle.y + 44, w: BOOTH_W, h: BOOTH_H },
  }));

  const pods = new Map<string, Point>();
  const waiting = waitingPods(cluster);
  const penRows = Math.max(1, Math.ceil(waiting.length / PEN_PER_ROW));
  const pen: Box = {
    x: castle.x + castle.w + 40,
    y: castle.y + 20,
    w: PEN_PER_ROW * CELL_W + 20,
    h: Math.max(castle.h - 20, penRows * CELL_H + 34),
  };
  waiting.forEach((pod, i) => {
    pods.set(pod.metadata.name, {
      x: pen.x + 10 + (i % PEN_PER_ROW) * CELL_W,
      y: pen.y + 30 + Math.floor(i / PEN_PER_ROW) * CELL_H,
    });
  });

  const bannerY = Math.max(castle.y + castle.h, pen.y + pen.h) + 30;
  const banners: RanchBanner[] = byName(cluster.deployments.values()).map((d, i) => ({
    name: d.metadata.name,
    x: MARGIN + (i % 3) * 250,
    y: bannerY + Math.floor(i / 3) * 44,
  }));
  const bannerRows = Math.ceil(banners.length / 3);

  const fieldTop = bannerY + (bannerRows > 0 ? bannerRows * 44 + 20 : 0) + 10;
  const nodes = byName(cluster.nodes.values());
  const perRow = nodes.length > 4 ? 3 : 2;
  const fields: RanchField[] = [];
  let rowTop = fieldTop;
  for (let start = 0; start < nodes.length; start += perRow) {
    const row = nodes.slice(start, start + perRow);
    const heights = row.map((node) => {
      const count = [...cluster.pods.values()].filter((p) => p.status.nodeName === node.metadata.name).length;
      return FIELD_HEAD + Math.max(1, Math.ceil(count / PER_ROW)) * CELL_H + 10;
    });
    const tallest = Math.max(...heights);
    row.forEach((node, i) => {
      const box = { x: MARGIN + 20 + i * (FIELD_W + FIELD_GAP), y: rowTop, w: FIELD_W, h: tallest };
      fields.push({ node: node.metadata.name, box });
      byName([...cluster.pods.values()].filter((p) => p.status.nodeName === node.metadata.name)).forEach((pod, n) => {
        pods.set(pod.metadata.name, {
          x: box.x + 12 + (n % PER_ROW) * CELL_W,
          y: box.y + FIELD_HEAD + Math.floor(n / PER_ROW) * CELL_H,
        });
      });
    });
    rowTop += tallest + FIELD_GAP;
  }

  const fieldsRight = Math.max(MARGIN, ...fields.map((f) => f.box.x + f.box.w));
  const services = byName(cluster.services.values()).map((svc, i) => ({
    name: svc.metadata.name,
    box: { x: fieldsRight + 90, y: fieldTop + i * 120, w: 110, h: 84 },
  }));

  const width = Math.max(pen.x + pen.w, fieldsRight, ...services.map((s) => s.box.x + s.box.w + 60)) + MARGIN;
  const height = Math.max(rowTop, fieldTop + 120, ...services.map((s) => s.box.y + s.box.h + 30)) + 10;
  return { hero, castle, booths, pen, banners, fields, services, pods, width, height };
}

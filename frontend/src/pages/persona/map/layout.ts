import type { GraphNodeKind, KnowledgeGraph } from '../../../types/api';

/** Layout space: x in [-aspect, aspect], y in [-1, 1], 309 at the origin. */
export type Point = { x: number; y: number };

// Rings by kind (as a share of the half height); the simulation only nudges nodes off them.
const RING: Record<GraphNodeKind, number> = { center: 0, doc: 0.32, project: 0.52, topic: 0.84, note: 0.72 };
const KIND_OFFSET: Record<GraphNodeKind, number> = { center: 0, doc: 0.9, project: -1.15, topic: -0.4, note: 0.25 };

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Seeded so the same graph always lands in the same place (and screenshots stay stable). */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function restLength(a: GraphNodeKind, b: GraphNodeKind): number {
  if (a === 'center' || b === 'center') return RING[a === 'center' ? b : a];
  if (a === 'note' || b === 'note') return 0.26;
  return 0.36;
}

/**
 * Force layout on top of kind rings: 309 in the middle, projects around it, topics
 * outside, notes near what they link to. `aspect` (width / height) spreads the rings
 * into ellipses so wide canvases are used edge to edge.
 */
export function computeLayout(graph: KnowledgeGraph, aspect: number): Map<string, Point> {
  const { nodes } = graph;
  const count = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const random = mulberry32(hashString(nodes.map((node) => node.id).join('|')));
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const neighbors: number[][] = nodes.map(() => []);
  const edges: [number, number][] = [];
  for (const [a, b] of graph.edges) {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined || i === j) continue;
    edges.push([i, j]);
    neighbors[i].push(j);
    neighbors[j].push(i);
  }

  const place = (i: number, angle: number, radius: number) => {
    xs[i] = Math.cos(angle) * radius * aspect;
    ys[i] = Math.sin(angle) * radius;
  };
  const byKind = new Map<GraphNodeKind, number[]>();
  nodes.forEach((node, i) => byKind.set(node.kind, [...(byKind.get(node.kind) ?? []), i]));
  for (const kind of ['doc', 'project', 'topic'] as GraphNodeKind[]) {
    const members = byKind.get(kind) ?? [];
    members.forEach((i, k) => place(i, KIND_OFFSET[kind] + (k / members.length) * Math.PI * 2 + (random() - 0.5) * 0.25, RING[kind]));
  }
  // Notes start beside something they link to.
  for (const i of byKind.get('note') ?? []) {
    const anchor = neighbors[i].find((j) => nodes[j].kind !== 'note' && nodes[j].kind !== 'center');
    if (anchor !== undefined) {
      xs[i] = xs[anchor] + (random() - 0.5) * 0.3 * aspect;
      ys[i] = ys[anchor] + (random() - 0.5) * 0.3;
    } else {
      place(i, random() * Math.PI * 2, RING.note + (random() - 0.5) * 0.2);
    }
  }

  const vx = new Float64Array(count);
  const vy = new Float64Array(count);
  const iterations = count < 60 ? 360 : count < 200 ? 220 : 120;
  const repulse = 0.0016 * (40 / Math.max(count, 40));
  for (let step = 0; step < iterations; step += 1) {
    const heat = 1 - step / iterations;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = (xs[i] - xs[j]) / aspect;
        const dy = ys[i] - ys[j];
        const d2 = dx * dx + dy * dy + 0.0004;
        const force = Math.min(repulse / d2, 0.05);
        const d = Math.sqrt(d2);
        vx[i] += (dx / d) * force * aspect;
        vy[i] += (dy / d) * force;
        vx[j] -= (dx / d) * force * aspect;
        vy[j] -= (dy / d) * force;
      }
    }
    for (const [i, j] of edges) {
      const dx = (xs[j] - xs[i]) / aspect;
      const dy = ys[j] - ys[i];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const force = (d - restLength(nodes[i].kind, nodes[j].kind)) * 0.04;
      vx[i] += (dx / d) * force * aspect;
      vy[i] += (dy / d) * force;
      vx[j] -= (dx / d) * force * aspect;
      vy[j] -= (dy / d) * force;
    }
    for (let i = 0; i < count; i += 1) {
      const kind = nodes[i].kind;
      if (kind === 'center') {
        xs[i] = 0;
        ys[i] = 0;
        continue;
      }
      // Pull back toward the kind's ring so the picture keeps its shape.
      const r = Math.sqrt((xs[i] / aspect) ** 2 + ys[i] ** 2) || 0.001;
      const pull = (RING[kind] - r) * (kind === 'note' ? 0.01 : 0.03);
      vx[i] += (xs[i] / r) * pull;
      vy[i] += (ys[i] / r / aspect) * pull * aspect;
      xs[i] = Math.max(-aspect * 0.96, Math.min(aspect * 0.96, xs[i] + vx[i] * heat));
      ys[i] = Math.max(-0.94, Math.min(0.94, ys[i] + vy[i] * heat));
      vx[i] *= 0.6;
      vy[i] *= 0.6;
    }
  }
  return new Map(nodes.map((node, i) => [node.id, { x: xs[i], y: ys[i] }]));
}

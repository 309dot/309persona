import { useEffect, useRef } from 'react';

import type { GraphNode, GraphNodeKind, KnowledgeGraph } from '../../../types/api';
import { computeLayout, type Point } from './layout';
import { KIND_LABELS, type MapSignals } from './nodes';

type Variant = 'hero' | 'full';

type Live = {
  signals: MapSignals;
  selectedId: string | null;
  onSelect?: (node: GraphNode) => void;
};

const RADIUS: Record<Variant, Record<GraphNodeKind, number>> = {
  hero: { center: 15, project: 5, doc: 4, topic: 3.2, note: 2.4 },
  full: { center: 20, project: 6.5, doc: 5, topic: 4, note: 3.2 },
};
// The hero keeps room at the bottom for its caption and button.
const PADDING: Record<Variant, { x: number; top: number; bottom: number }> = {
  hero: { x: 40, top: 22, bottom: 44 },
  full: { x: 72, top: 56, bottom: 56 },
};
// Faint orbits behind the projects and the topics.
const ORBITS = [0.52, 0.84];
// The map assembles from the middle outward on first sight.
const INTRO_DELAY: Record<GraphNodeKind, number> = { center: 0, doc: 140, project: 160, topic: 420, note: 560 };
const INTRO_MS = 760;
const LAYER: GraphNodeKind[] = ['note', 'topic', 'doc', 'project', 'center'];
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function phaseOf(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  return (hash / 1000) * Math.PI * 2;
}

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function rgba(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Draws and animates the knowledge map on a canvas. React only hands over the graph
 * once and the signals as they change; the drawing loop lives outside React.
 */
function createEngine(canvas: HTMLCanvasElement, graph: KnowledgeGraph, variant: Variant, read: () => Live) {
  const ctx = canvas.getContext('2d');
  const nodes = graph.nodes;
  const count = nodes.length;
  const indexOf = new Map(nodes.map((node, i) => [node.id, i]));
  const centerIndex = nodes.findIndex((node) => node.kind === 'center');
  const edges = graph.edges
    .map(([a, b]) => [indexOf.get(a), indexOf.get(b)] as const)
    .filter((edge): edge is readonly [number, number] => edge[0] !== undefined && edge[1] !== undefined);
  const neighbors = nodes.map(() => new Set<number>());
  for (const [a, b] of edges) {
    neighbors[a].add(b);
    neighbors[b].add(a);
  }
  const phases = nodes.map((node) => phaseOf(node.id));
  const rankInKind = new Map<GraphNodeKind, number>();
  const ranks = nodes.map((node) => {
    const rank = rankInKind.get(node.kind) ?? 0;
    rankInKind.set(node.kind, rank + 1);
    return rank;
  });
  const color = {
    ink: cssColor('--color-ink', '#0f1324'),
    accent: cssColor('--color-accent', '#0b98ff'),
    accentSoft: cssColor('--color-accent-soft', '#7cc8ff'),
    slate: '#64748b',
    mute: '#94a3b8',
  };
  const radius = RADIUS[variant];
  const padding = PADDING[variant];
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let motion = !reducedQuery.matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let aspect = 0;
  let layout: Map<string, Point> | null = null;
  let frame = 0;
  let running = false;
  let visible = true;
  let lastDraw = 0;
  let hover: number | null = null;
  let citedAt = -1e9;
  const born = performance.now();
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  // Resting positions (no intro, no drift): label placement is decided on these so labels don't flicker.
  const bx = new Float64Array(count);
  const by = new Float64Array(count);
  const shown = new Float64Array(count);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Layouts are cached per quarter step of the aspect ratio, so small resizes don't reshuffle.
    const area = (width - padding.x * 2) / Math.max(1, height - padding.top - padding.bottom);
    const bucket = Math.round(Math.min(4, Math.max(0.6, area)) * 4) / 4;
    if (bucket !== aspect || !layout) {
      aspect = bucket;
      layout = computeLayout(graph, aspect);
    }
    requestDraw();
  }

  function frameOf() {
    const inner = height - padding.top - padding.bottom;
    const unit = Math.max(10, Math.min((width / 2 - padding.x) / aspect, inner / 2));
    return { unit, cx: width / 2, cy: padding.top + inner / 2 };
  }

  function positions(now: number) {
    const { unit, cx, cy } = frameOf();
    const elapsed = now - born;
    const drift = variant === 'hero' ? 2.2 : 3;
    nodes.forEach((node, i) => {
      const point = layout?.get(node.id) ?? { x: 0, y: 0 };
      let x = cx + point.x * unit;
      let y = cy + point.y * unit;
      bx[i] = x;
      by[i] = y;
      let appear = 1;
      if (motion) {
        const delay = INTRO_DELAY[node.kind] + ranks[i] * 18;
        appear = easeOutCubic(Math.min(1, Math.max(0, (elapsed - delay) / INTRO_MS)));
        x = cx + (x - cx) * appear;
        y = cy + (y - cy) * appear;
        if (node.kind !== 'center') {
          x += Math.sin(now * 0.00055 + phases[i]) * drift;
          y += Math.cos(now * 0.00047 + phases[i] * 1.7) * drift;
        }
      }
      px[i] = x;
      py[i] = y;
      shown[i] = appear;
    });
    return { cx, cy, unit, elapsed };
  }

  function circle(x: number, y: number, r: number) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function draw(now: number) {
    if (!ctx || !layout || !width) return;
    lastDraw = now;
    const { signals, selectedId } = read();
    const related = new Set(signals.related.map((id) => indexOf.get(id)).filter((i): i is number => i !== undefined));
    const cited = new Set(signals.cited.map((id) => indexOf.get(id)).filter((i): i is number => i !== undefined));
    const visited = new Set(signals.visited.map((id) => indexOf.get(id)).filter((i): i is number => i !== undefined));
    const focusId = hover ?? indexOf.get(signals.focus ?? '') ?? indexOf.get(selectedId ?? '') ?? null;
    const focus = focusId === null ? null : new Set([focusId, ...neighbors[focusId]]);
    const busy = signals.phase !== 'idle';
    const sinceCited = now - citedAt;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { cx, cy, unit, elapsed } = positions(now);
    const center = centerIndex >= 0 ? centerIndex : 0;
    const grow = motion ? easeOutCubic(Math.min(1, elapsed / 900)) : 1;

    // Orbits and a halo around 309 that breathes while an answer is on its way.
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color.ink, 0.07 * grow);
    for (const orbit of ORBITS) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbit * aspect * unit * grow, orbit * unit * grow, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    const breath = busy && motion ? 0.5 + 0.5 * Math.sin(now * 0.004) : 0;
    const haloRadius = (variant === 'hero' ? 38 : 56) * (1 + 0.18 * breath) * grow;
    if (haloRadius > 1) {
      const halo = ctx.createRadialGradient(px[center], py[center], 0, px[center], py[center], haloRadius);
      halo.addColorStop(0, rgba(color.accent, busy ? 0.24 : 0.12));
      halo.addColorStop(1, rgba(color.accent, 0));
      ctx.fillStyle = halo;
      circle(px[center], py[center], haloRadius);
      ctx.fill();
    }

    // Links.
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const appear = Math.min(shown[a], shown[b]);
      let stroke = rgba(color.ink, 0.085 * appear);
      if (focus && focus.has(a) && focus.has(b)) stroke = rgba(color.accent, 0.5 * appear);
      else if (cited.has(a) || cited.has(b)) stroke = rgba(color.accent, (cited.has(a) && cited.has(b) ? 0.45 : 0.28) * appear);
      else if (busy && (related.has(a) || related.has(b))) stroke = rgba(color.accent, 0.3 * appear);
      else if (focus) stroke = rgba(color.ink, 0.04 * appear);
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(px[a], py[a]);
      ctx.lineTo(px[b], py[b]);
      ctx.stroke();
    }

    // While the answer is on its way, 309 reaches out to the records the question touches
    // (dashes run outward), then pulls them in while writing (dashes run inward).
    if (busy && related.size) {
      const outward = signals.phase === 'searching';
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.lineDashOffset = (outward ? -1 : 1) * now * 0.03;
      ctx.lineWidth = 1.4;
      for (const i of related) {
        ctx.strokeStyle = rgba(color.accent, 0.55);
        ctx.beginPath();
        ctx.moveTo(px[center], py[center]);
        ctx.lineTo(px[i], py[i]);
        ctx.stroke();
      }
      ctx.restore();
      if (motion) {
        for (const i of related) {
          for (let k = 0; k < 2; k += 1) {
            const travel = ((now * 0.0007 + phases[i] + k * 0.5) % 1 + 1) % 1;
            const s = outward ? travel : 1 - travel;
            ctx.fillStyle = rgba(color.accent, 0.9 * Math.sin(Math.PI * s));
            circle(px[center] + (px[i] - px[center]) * s, py[center] + (py[i] - py[center]) * s, 2.2);
            ctx.fill();
          }
        }
      }
    }
    // When the sources arrive they flash back to 309 once.
    if (cited.size && sinceCited < 1600) {
      const fade = 1 - sinceCited / 1600;
      ctx.lineWidth = 2;
      for (const i of cited) {
        ctx.strokeStyle = rgba(color.accent, 0.6 * fade);
        ctx.beginPath();
        ctx.moveTo(px[center], py[center]);
        ctx.lineTo(px[i], py[i]);
        ctx.stroke();
      }
    }

    // Records.
    const order = [...nodes.keys()].sort((a, b) => {
      const hot = (i: number) => (cited.has(i) || related.has(i) || i === focusId ? 1 : 0);
      return hot(a) - hot(b) || LAYER.indexOf(nodes[a].kind) - LAYER.indexOf(nodes[b].kind);
    });
    for (const i of order) {
      const node = nodes[i];
      const appear = shown[i];
      if (appear <= 0) continue;
      let r = radius[node.kind] * (0.4 + 0.6 * appear);
      let fill = node.kind === 'center' || node.kind === 'project' ? color.ink : node.kind === 'doc' ? color.slate : color.mute;
      let alpha = node.kind === 'project' ? 0.85 : node.kind === 'note' ? 0.75 : 1;
      let glow = 0;
      if (node.kind !== 'center') {
        if (cited.has(i)) {
          fill = color.accent;
          alpha = 1;
          r *= 1.4;
          glow = 12;
        } else if (busy && related.has(i)) {
          fill = color.accent;
          alpha = 1;
          r *= motion ? 1.3 + 0.18 * Math.sin(now * 0.007 + phases[i]) : 1.3;
          glow = 14;
        } else if (visited.has(i)) {
          fill = color.accent;
          alpha = 0.55;
        }
      }
      if (focus && !focus.has(i) && node.kind !== 'center') alpha *= cited.has(i) || visited.has(i) ? 0.7 : 0.35;
      ctx.save();
      ctx.globalAlpha = alpha * appear;
      if (glow) {
        ctx.shadowColor = rgba(color.accent, 0.6);
        ctx.shadowBlur = glow;
      }
      ctx.fillStyle = fill;
      circle(px[i], py[i], r);
      ctx.fill();
      ctx.restore();

      if (i === focusId || (selectedId && node.id === selectedId)) {
        ctx.strokeStyle = rgba(color.accent, 0.9);
        ctx.lineWidth = 1.5;
        circle(px[i], py[i], r + 4);
        ctx.stroke();
      }
      if (cited.has(i) && motion && sinceCited < 5200) {
        for (let k = 0; k < 3; k += 1) {
          const ripple = (sinceCited - k * 520) / 1500;
          if (ripple <= 0 || ripple >= 1) continue;
          ctx.strokeStyle = rgba(color.accent, 0.5 * (1 - ripple));
          ctx.lineWidth = 1.5;
          circle(px[i], py[i], r + ripple * 22);
          ctx.stroke();
        }
      }
      if (node.kind === 'center') {
        ctx.save();
        ctx.globalAlpha = appear;
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${variant === 'hero' ? 11 : 13}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('309', px[i], py[i] + 0.5);
        ctx.restore();
      }
    }

    drawLabels({ related, cited, visited, focusId, focus, busy, elapsed });

    if (hover !== null) {
      const node = nodes[hover];
      const detail = [KIND_LABELS[node.kind], node.meta].filter(Boolean).join(' · ');
      if (node.kind !== 'center') {
        ctx.font = `500 10.5px ${FONT}`;
        ctx.fillStyle = color.slate;
        ctx.textAlign = px[hover] > width / 2 ? 'left' : 'right';
        ctx.textBaseline = 'top';
        const dx = px[hover] > width / 2 ? radius[node.kind] + 8 : -radius[node.kind] - 8;
        ctx.fillText(detail, px[hover] + dx, py[hover] + 9);
      }
    }
  }

  function drawLabels(state: {
    related: Set<number>;
    cited: Set<number>;
    visited: Set<number>;
    focusId: number | null;
    focus: Set<number> | null;
    busy: boolean;
    elapsed: number;
  }) {
    if (!ctx) return;
    const { related, cited, visited, focusId, focus, busy, elapsed } = state;
    const narrow = width < 480;
    const priority = (i: number) => {
      const node = nodes[i];
      if (node.kind === 'center') return -1; // its name is inside the circle
      if (i === focusId) return 0;
      if (cited.has(i)) return 1;
      if (busy && related.has(i)) return 2;
      if (focus?.has(i)) return 3;
      if (node.kind === 'project') return 4;
      if (node.kind === 'doc') return narrow && variant === 'hero' ? -1 : 6;
      if (node.kind === 'topic') return narrow && variant === 'hero' ? -1 : 5;
      if (visited.has(i)) return 7;
      return variant === 'full' ? 8 : -1;
    };
    const candidates = [...nodes.keys()].filter((i) => priority(i) >= 0).sort((a, b) => priority(a) - priority(b));
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    for (const i of candidates) {
      const node = nodes[i];
      const appear = Math.min(1, Math.max(0, (elapsed - INTRO_DELAY[node.kind] - ranks[i] * 18 - INTRO_MS * 0.6) / 400));
      const fadeIn = motion ? appear : 1;
      if (fadeIn <= 0) continue;
      const strong = priority(i) <= 3;
      const max = variant === 'hero' ? (narrow ? 11 : 16) : 24;
      const text = node.label.length > max ? `${node.label.slice(0, max - 1)}…` : node.label;
      const size = strong ? 12 : node.kind === 'project' ? 11.5 : 11;
      ctx.font = `${strong || node.kind === 'project' ? 600 : 500} ${size}px ${FONT}`;
      const w = ctx.measureText(text).width;
      const r = radius[node.kind] * (cited.has(i) ? 1.4 : 1);
      // Labels point away from 309, then try below, above and the other side when that
      // doesn't fit. Placement is decided on resting positions so labels don't flicker.
      const side = bx[i] < width / 2 - 12 ? -1 : bx[i] > width / 2 + 12 ? 1 : 0;
      const spots: [number, number][] = [];
      const left: [number, number] = [bx[i] - r - 6 - w, by[i] - size / 2 - 1];
      const right: [number, number] = [bx[i] + r + 6, by[i] - size / 2 - 1];
      const below: [number, number] = [bx[i] - w / 2, by[i] + r + 4];
      const above: [number, number] = [bx[i] - w / 2, by[i] - r - 5 - size];
      if (side === -1) spots.push(left, below, above, right);
      else if (side === 1) spots.push(right, below, above, left);
      else spots.push(below, above, right, left);
      const boxOf = ([sx, sy]: [number, number]) => ({ x: sx - 3, y: sy - 2, w: w + 6, h: size + 5 });
      const inside = (b: { x: number; y: number; w: number; h: number }) =>
        b.x >= 2 && b.y >= 2 && b.x + b.w <= width - 2 && b.y + b.h <= height - 2;
      const free = (b: { x: number; y: number; w: number; h: number }) =>
        !taken.some((t) => b.x < t.x + t.w && b.x + b.w > t.x && b.y < t.y + t.h && b.y + b.h > t.y);
      let spot = spots.find((candidate) => inside(boxOf(candidate)) && free(boxOf(candidate)));
      if (!spot) {
        if (!strong) continue;
        // Highlighted labels always show, pushed back inside the canvas.
        const [sx, sy] = spots.find((candidate) => inside(boxOf(candidate))) ?? spots[0];
        spot = [Math.min(Math.max(sx, 4), width - w - 4), Math.min(Math.max(sy, 4), height - size - 6)];
      }
      const box = boxOf(spot);
      const x = spot[0] + (px[i] - bx[i]);
      const y = spot[1] + (py[i] - by[i]);
      taken.push(box);
      ctx.save();
      ctx.globalAlpha = fadeIn * (focus && !focus.has(i) ? 0.35 : 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle =
        cited.has(i) || (busy && related.has(i)) || i === focusId
          ? color.accent
          : node.kind === 'project'
            ? rgba(color.ink, 0.82)
            : visited.has(i)
              ? rgba(color.ink, 0.7)
              : color.slate;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }

  function loop(now: number) {
    const { signals } = read();
    const idle = signals.phase === 'idle' && now - citedAt > 5200 && now - born > 2600 && hover === null;
    // Idle drift doesn't need every frame.
    if (!idle || now - lastDraw > 40) draw(now);
    if (motion && visible) {
      frame = requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  function requestDraw() {
    if (running) return;
    running = true;
    frame = requestAnimationFrame(loop);
  }

  function nodeAt(event: PointerEvent | MouseEvent): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: number | null = null;
    let bestDistance = Infinity;
    nodes.forEach((node, i) => {
      const distance = Math.hypot(px[i] - x, py[i] - y);
      if (distance < Math.max(14, radius[node.kind] + 8) && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  const onMove = (event: PointerEvent) => {
    const found = nodeAt(event);
    if (found !== hover) {
      hover = found;
      canvas.style.cursor = found === null ? 'default' : 'pointer';
      requestDraw();
    }
  };
  const onLeave = () => {
    hover = null;
    canvas.style.cursor = 'default';
    requestDraw();
  };
  const onClick = (event: MouseEvent) => {
    const found = nodeAt(event);
    if (found !== null) read().onSelect?.(nodes[found]);
  };
  const onMotionChange = () => {
    motion = !reducedQuery.matches;
    requestDraw();
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  reducedQuery.addEventListener('change', onMotionChange);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) requestDraw();
  });
  visibility.observe(canvas);
  // Canvas text doesn't pull in the web font's subsets by itself.
  const labels = nodes.map((node) => node.label).join('') + '309';
  void Promise.all([
    document.fonts.load(`600 12px ${FONT}`, labels),
    document.fonts.load(`500 11px ${FONT}`, labels),
  ])
    .catch(() => undefined)
    .then(() => requestDraw());
  resize();

  return {
    update(previous: MapSignals, next: MapSignals) {
      const now = performance.now();
      if (next.cited.join('|') !== previous.cited.join('|') && next.cited.length) citedAt = now;
      requestDraw();
    },
    destroy() {
      cancelAnimationFrame(frame);
      running = false;
      resizeObserver.disconnect();
      visibility.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      reducedQuery.removeEventListener('change', onMotionChange);
    },
  };
}

type Engine = ReturnType<typeof createEngine>;

export default function KnowledgeMapCanvas({
  graph,
  variant,
  signals,
  selectedId = null,
  onSelect,
  className,
}: {
  graph: KnowledgeGraph;
  variant: Variant;
  signals: MapSignals;
  selectedId?: string | null;
  onSelect?: (node: GraphNode) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Live>({ signals, selectedId, onSelect });
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const previous = liveRef.current.signals;
    liveRef.current = { signals, selectedId, onSelect };
    engineRef.current?.update(previous, signals);
  }, [signals, selectedId, onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine(canvas, graph, variant, () => liveRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [graph, variant]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className ?? ''}`} aria-hidden="true" />;
}

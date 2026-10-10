import { lazy, Suspense } from 'react';

import type { GraphNode, KnowledgeGraph } from '../../../types/api';
import type { MapSignals } from './nodes';

// The drawing code is its own chunk, fetched after the first screen is up.
const KnowledgeMapCanvas = lazy(() => import('./KnowledgeMapCanvas'));

function summary(graph: KnowledgeGraph) {
  const count = (kind: GraphNode['kind']) => graph.nodes.filter((node) => node.kind === kind).length;
  return [
    ['프로젝트', count('project')],
    ['주제', count('topic')],
    ['노트', count('note')],
  ]
    .filter(([, value]) => Number(value) > 0)
    .map(([label, value]) => `${label} ${value}`)
    .join(' · ');
}

/** The map on the landing: assembles on arrival, lights up while answers are written. */
export function MapHero({
  graph,
  signals,
  onOpen,
}: {
  graph: KnowledgeGraph | null;
  signals: MapSignals;
  onOpen: (node?: GraphNode) => void;
}) {
  return (
    <section
      aria-label="309의 기록 지도"
      className="animate-rise relative h-[188px] overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f7f9fe_62%,#eef3fb_100%)] sm:h-[224px]"
      style={{ animationDelay: '200ms' }}
    >
      {graph ? (
        <Suspense fallback={null}>
          <KnowledgeMapCanvas graph={graph} variant="hero" signals={signals} onSelect={onOpen} />
        </Suspense>
      ) : null}
      <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] font-medium text-slate-500">
        309의 기록 지도{graph ? ` · ${summary(graph)}` : ''}
      </p>
      <button
        type="button"
        onClick={() => onOpen()}
        className="absolute bottom-2.5 right-3 rounded-full border border-line bg-white/90 px-3 py-1 text-[12px] font-semibold text-graphite shadow-xs backdrop-blur-sm transition hover:-translate-y-0.5"
      >
        지도 크게 보기
      </button>
    </section>
  );
}

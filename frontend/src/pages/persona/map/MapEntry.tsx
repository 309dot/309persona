import type { GraphNode, KnowledgeGraph } from '../../../types/api';
import { MapIcon } from '../Presence';

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

/**
 * The way into the knowledge map from the top of the page. One line next to the logo, so the
 * greeting and the first question stay on the first screen; the map itself opens full screen.
 */
export function MapEntry({
  graph,
  active,
  onOpen,
}: {
  graph: KnowledgeGraph;
  /** An answer is on its way: the icon lights up like the input's map button. */
  active: boolean;
  onOpen: () => void;
}) {
  const counts = summary(graph);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`309의 기록 지도 보기 (${counts})`}
      className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-graphite shadow-xs transition hover:-translate-y-0.5 hover:border-graphite/30"
    >
      <span className={active ? 'text-accent' : 'text-graphite/70'}>
        <MapIcon active={active} />
      </span>
      309의 기록 지도
      <span className="hidden font-medium text-slate-500 sm:inline">{counts}</span>
    </button>
  );
}

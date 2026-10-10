import type { GraphNode } from '../../types/api';
import { pageCard, pagesLabel, parsePages } from './portfolio/chapters';

/**
 * Projects an answer drew on, as cards that open the portfolio on their pages.
 * Everything on a card comes from the knowledge pack, never from the model.
 */
export function ProjectCards({
  projects,
  onOpen,
}: {
  projects: GraphNode[];
  onOpen: (node: GraphNode, range: [number, number]) => void;
}) {
  const cards = projects
    .map((node) => ({ node, range: parsePages(node.pages) }))
    .filter((card): card is { node: GraphNode; range: [number, number] } => card.range !== null)
    .slice(0, 2);
  if (!cards.length) return null;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="답변에 나온 프로젝트">
      {cards.map(({ node, range }, index) => (
        <button
          key={node.id}
          type="button"
          aria-label={`${node.label} · 포트폴리오 ${pagesLabel(range)} 보기`}
          onClick={() => onOpen(node, range)}
          className="animate-rise group overflow-hidden rounded-2xl border border-mist-line bg-white text-left shadow-[0_8px_24px_rgba(15,19,36,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,19,36,0.12)]"
          style={{ animationDelay: `${160 + index * 90}ms` }}
        >
          <span className="relative block aspect-video overflow-hidden bg-mist">
            <img
              src={pageCard(range[0])}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-white">
              포트폴리오 {pagesLabel(range)} 보기
            </span>
          </span>
          <span className="block px-3 py-2.5">
            <span className="block text-[13px] font-bold text-ink">{node.label}</span>
            {node.meta ? <span className="block text-[11px] text-slate-500">{node.meta}</span> : null}
            {node.summary ? (
              <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-slate-600">{node.summary}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

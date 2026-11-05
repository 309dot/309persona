import type { GraphNode } from '../../types/api';
import { pageCard, pagesLabel, parsePages } from './portfolio/chapters';
import { caseFor, useWebCases, type WebCase } from './webCases';

/**
 * Projects an answer drew on, as cards that open the portfolio on their pages, plus a link to the project's case on
 * the portfolio site when it has one (a project without pages becomes a card that opens just the case).
 * Everything on a card comes from the knowledge pack and the site, never from the model.
 */
export function ProjectCards({
  projects,
  onOpen,
  onOpenCase,
}: {
  projects: GraphNode[];
  onOpen: (node: GraphNode, range: [number, number]) => void;
  onOpenCase?: (node: GraphNode, webCase: WebCase) => void;
}) {
  const cases = useWebCases();
  const cards = projects
    .map((node) => ({ node, range: parsePages(node.pages), web: caseFor(node.label, cases) }))
    .filter((card) => card.range !== null || card.web !== undefined)
    .slice(0, 2);
  if (!cards.length) return null;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="답변에 나온 프로젝트">
      {cards.map(({ node, range, web }, index) => {
        const face = (
          <>
            <span className="relative block aspect-video overflow-hidden bg-mist">
              <img
                src={range ? pageCard(range[0]) : web?.coverSmall}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                {range ? `포트폴리오 ${pagesLabel(range)} 보기` : '웹 케이스 보기 ↗'}
              </span>
            </span>
            <span className="block px-3 py-2.5">
              <span className="block text-[13px] font-bold text-ink">{node.label}</span>
              {node.meta ? <span className="block text-[11px] text-slate-500">{node.meta}</span> : null}
              {node.summary ? (
                <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-slate-600">{node.summary}</span>
              ) : null}
            </span>
          </>
        );
        return (
          <div
            key={node.id}
            className="animate-rise group overflow-hidden rounded-2xl border border-mist-line bg-white shadow-[0_8px_24px_rgba(15,19,36,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,19,36,0.12)]"
            style={{ animationDelay: `${160 + index * 90}ms` }}
          >
            {range ? (
              <button
                type="button"
                aria-label={`${node.label} · 포트폴리오 ${pagesLabel(range)} 보기`}
                onClick={() => onOpen(node, range)}
                className="block w-full text-left"
              >
                {face}
              </button>
            ) : web ? (
              <a
                href={web.url}
                target="_blank"
                rel="noopener"
                aria-label={`${node.label} · 웹 케이스 보기 (새 창)`}
                onClick={() => onOpenCase?.(node, web)}
                className="block"
              >
                {face}
              </a>
            ) : null}
            {range && web ? (
              <a
                href={web.url}
                target="_blank"
                rel="noopener"
                onClick={() => onOpenCase?.(node, web)}
                className="flex items-center justify-between border-t border-mist-line px-3 py-2 text-[12px] font-semibold text-ink transition hover:bg-mist"
              >
                웹 케이스 보기
                <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

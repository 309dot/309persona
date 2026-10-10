import { useEffect, useRef, useState } from 'react';

import type { GraphNode, KnowledgeGraph } from '../../../types/api';
import KnowledgeMapCanvas from './KnowledgeMapCanvas';
import { KIND_LABELS, questionFor, type MapSignals } from './nodes';

const GROUPS: { kind: GraphNode['kind']; title: string }[] = [
  { kind: 'project', title: '프로젝트' },
  { kind: 'note', title: '노트' },
  { kind: 'topic', title: '주제' },
  { kind: 'doc', title: '문서' },
];

function stateOf(node: GraphNode, signals: MapSignals) {
  if (signals.cited.includes(node.id)) return 'cited';
  if (signals.phase !== 'idle' && signals.related.includes(node.id)) return 'related';
  if (signals.visited.includes(node.id)) return 'visited';
  return '';
}

const STATE_LABELS: Record<string, string> = {
  cited: '방금 답변의 근거',
  related: '지금 살펴보는 기록',
  visited: '이미 이야기한 기록',
};

/** The whole map: pick a record and ask about it. Lazy-loaded with the canvas. */
export default function MapOverlay({
  graph,
  signals,
  initialId,
  remaining,
  disabled,
  onAsk,
  onClose,
}: {
  graph: KnowledgeGraph;
  signals: MapSignals;
  initialId?: string | null;
  remaining: number;
  disabled: boolean;
  onAsk: (question: string, node: GraphNode) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialId ?? signals.cited[0] ?? (signals.phase !== 'idle' ? signals.related[0] : undefined) ?? null,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const state = selected ? stateOf(selected, signals) : '';
  const question = selected ? questionFor(selected) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-title"
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-white"
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="map-title" className="text-[18px] font-bold text-ink">
            309의 기록 지도
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            점을 누르면 그 주제로 바로 물어볼 수 있어요. 파랗게 빛나는 점이 답변의 근거예요.
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-200"
        >
          닫기
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f7f9fe_65%,#eef3fb_100%)]">
        <KnowledgeMapCanvas
          graph={graph}
          variant="full"
          signals={signals}
          selectedId={selectedId}
          onSelect={(node) => setSelectedId(node.id)}
        />
        <ul className="pointer-events-none absolute left-4 top-3 hidden space-y-1 text-[11px] text-slate-500 sm:block" aria-hidden="true">
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink" /> 프로젝트
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400" /> 주제·노트
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> 답변의 근거
          </li>
        </ul>
      </div>

      <footer className="border-t border-line px-5 pb-5 pt-4">
        <div className="mx-auto w-full max-w-3xl">
          {selected ? (
            <div className="flex flex-wrap items-center justify-between gap-3" data-selected={selected.id}>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-500">
                  {[KIND_LABELS[selected.kind], selected.meta, STATE_LABELS[state]].filter(Boolean).join(' · ')}
                </p>
                <p className="truncate text-[16px] font-bold text-ink">{selected.label}</p>
                <p className="truncate text-[13px] text-slate-500">“{question}”</p>
              </div>
              <button
                type="button"
                disabled={disabled || remaining <= 0}
                onClick={() => onAsk(question, selected)}
                className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-black disabled:bg-slate-300"
              >
                {remaining > 0 ? `이 질문으로 물어보기 · 남은 질문 ${remaining}` : '질문을 모두 사용했어요'}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-slate-500">지도에서 점을 누르거나 아래 목록에서 골라 보세요.</p>
          )}
          <nav aria-label="기록 목록" className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
            {GROUPS.flatMap(({ kind, title }) => {
              const members = graph.nodes.filter((node) => node.kind === kind);
              if (!members.length) return [];
              return [
                <span key={`title-${kind}`} className="shrink-0 self-center text-[11px] font-semibold text-slate-400">
                  {title}
                </span>,
                ...members.map((node) => {
                  const nodeState = stateOf(node, signals);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      aria-pressed={node.id === selectedId}
                      data-state={nodeState || undefined}
                      onClick={() => setSelectedId(node.id)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                        node.id === selectedId
                          ? 'border-ink bg-ink text-white'
                          : nodeState === 'cited' || nodeState === 'related'
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : nodeState === 'visited'
                              ? 'border-mist-line bg-mist text-ink'
                              : 'border-mist-line bg-white text-[#445067] hover:bg-mist'
                      }`}
                    >
                      {node.label}
                    </button>
                  );
                }),
              ];
            })}
          </nav>
        </div>
      </footer>
    </div>
  );
}

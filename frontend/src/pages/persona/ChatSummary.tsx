import { useEffect, useRef } from 'react';

import type { ChatSource } from '../../types/api';
import { AnimatedFormattedAnswer } from './PersonaResponseAndModals';
import { pagesLabel } from './portfolio/chapters';

export interface SummaryThread {
  id: string;
  question: string;
  answer: string;
  sources?: ChatSource[];
}

/**
 * Today's conversation on one sheet the visitor can save as PDF (the browser's print)
 * and pass on to their team. It holds the answers as given, nothing new is written.
 */
export default function ChatSummary({
  threads,
  visitorLine,
  pagesFor,
  onPrint,
  onClose,
}: {
  threads: SummaryThread[];
  /** "김리크루터 · 309 Lab · 채용 검토 중"; empty when the visitor said nothing about themselves. */
  visitorLine: string;
  pagesFor: (source: ChatSource) => [number, number] | null;
  onPrint: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date());

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

  const sourcesLine = (sources: ChatSource[]) =>
    sources
      .map((source) => {
        const pages = pagesFor(source);
        return pages ? `${source.label} (포트폴리오 ${pagesLabel(pages)})` : source.label;
      })
      .join(' · ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-title"
      className="summary-sheet animate-fade-in fixed inset-0 z-50 overflow-y-auto bg-ink/60 px-4 py-8"
      onClick={onClose}
    >
      <article
        className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-[0_35px_85px_rgba(15,19,36,0.35)] sm:p-10"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <p className="text-[12px] font-semibold text-slate-500">309 AI 커피챗 · {date}</p>
          <h2 id="summary-title" className="mt-1 text-2xl font-bold text-ink">
            오늘 나눈 이야기
          </h2>
          {visitorLine ? <p className="mt-1 text-[13px] text-slate-500">{visitorLine}</p> : null}
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onPrint();
                window.print();
              }}
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              PDF로 저장 · 인쇄
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-mist"
            >
              닫기
            </button>
          </div>
          <p className="no-print mt-2 text-[11px] text-slate-400">인쇄 창에서 "PDF로 저장"을 고르면 파일로 받을 수 있어요.</p>
        </header>

        <ol className="mt-8 space-y-7">
          {threads.map((thread, index) => (
            <li key={thread.id} className="break-inside-avoid">
              <p className="text-[14px] font-bold text-accent">
                Q{index + 1}. {thread.question}
              </p>
              <div className="mt-2">
                <AnimatedFormattedAnswer text={thread.answer} />
              </div>
              {thread.sources?.length ? (
                <p className="mt-2 text-[12px] text-slate-500">근거: {sourcesLine(thread.sources)}</p>
              ) : null}
            </li>
          ))}
        </ol>

        <footer className="mt-10 border-t border-line pt-5 text-[12px] leading-5 text-slate-500">
          <p className="font-semibold text-ink">더 이야기 나누고 싶다면</p>
          <p>hello@309designlab.com · www.309designlab.com/persona</p>
          <p>포트폴리오와 이력서 PDF도 같은 페이지에서 받을 수 있어요.</p>
          <p className="mt-3">이 요약의 답변은 309의 이력서·포트폴리오를 바탕으로 AI가 작성했어요.</p>
        </footer>
      </article>
    </div>
  );
}

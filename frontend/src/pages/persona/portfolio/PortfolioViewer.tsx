import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  CHAPTERS,
  PAGE_SIZE,
  PORTFOLIO_PAGES,
  PORTFOLIO_PDF_URL,
  chapterOf,
  pageImage,
  pageThumb,
  pagesLabel,
} from './chapters';

const SWIPE_PX = 40;

/**
 * The portfolio, page by page, without downloading the 9.6MB PDF. Opens on the pages
 * an answer or a card points to (`range`), and still lets the visitor browse the rest.
 */
export default function PortfolioViewer({
  start,
  range,
  title,
  onClose,
}: {
  start: number;
  range?: [number, number] | null;
  title?: string;
  /** Called with how many different pages were looked at. */
  onClose: (pagesSeen: number) => void;
}) {
  const [page, setPage] = useState(start);
  const [direction, setDirection] = useState<'next' | 'prev' | 'none'>('none');
  const [seen, setSeen] = useState(() => new Set([start]));
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const pointerX = useRef<number | null>(null);
  const chapter = chapterOf(page);

  const go = (next: number) => {
    const target = Math.min(PORTFOLIO_PAGES, Math.max(1, next));
    if (target === page) return;
    setDirection(target > page ? 'next' : 'prev');
    setPage(target);
    setSeen((current) => (current.has(target) ? current : new Set([...current, target])));
  };

  const close = () => onClose(seen.size);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(seen.size);
      else if (event.key === 'ArrowRight') go(page + 1);
      else if (event.key === 'ArrowLeft') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    // Neighbours load in the background so turning a page is instant.
    for (const neighbour of [page - 1, page + 1]) {
      if (neighbour >= 1 && neighbour <= PORTFOLIO_PAGES) new Image().src = pageImage(neighbour);
    }
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-page="${page}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [page]);

  const onPointerDown = (event: ReactPointerEvent) => {
    pointerX.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    if (pointerX.current === null) return;
    const dx = event.clientX - pointerX.current;
    pointerX.current = null;
    if (Math.abs(dx) > SWIPE_PX) go(page + (dx < 0 ? 1 : -1));
  };

  const inRange = (n: number) => Boolean(range && n >= range[0] && n <= range[1]);
  // The answer's pages name the viewer while the visitor is on them; elsewhere the chapter does.
  const topicRange = title && range && inRange(page) ? range : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="포트폴리오 보기"
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-[#0b0e19]/95 text-white backdrop-blur-sm"
    >
      <header className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-white/55">
            {topicRange ? `포트폴리오 · ${chapter.title}` : '포트폴리오'}
          </p>
          <p className="truncate text-[15px] font-semibold">
            {topicRange ? `${title} · ${pagesLabel(topicRange)}` : chapter.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={PORTFOLIO_PDF_URL}
            download
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> PDF 받기
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="닫기"
            className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center px-3 [container-type:size] sm:px-16"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <button
          type="button"
          aria-label="이전 쪽"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="absolute left-2 z-10 hidden rounded-full bg-white/10 p-2.5 transition hover:bg-white/20 disabled:opacity-30 sm:block"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <img
          key={page}
          src={pageImage(page)}
          alt={`포트폴리오 ${page}쪽`}
          width={PAGE_SIZE.width}
          height={PAGE_SIZE.height}
          draggable={false}
          data-page={page}
          // As large as the area allows by width or height, sized before the image arrives.
          style={{
            aspectRatio: `${PAGE_SIZE.width} / ${PAGE_SIZE.height}`,
            width: `min(100cqw, calc(100cqh * ${PAGE_SIZE.width} / ${PAGE_SIZE.height}))`,
          }}
          className={`page-in-${direction} h-auto rounded-lg bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]`}
        />
        <button
          type="button"
          aria-label="다음 쪽"
          disabled={page >= PORTFOLIO_PAGES}
          onClick={() => go(page + 1)}
          className="absolute right-2 z-10 hidden rounded-full bg-white/10 p-2.5 transition hover:bg-white/20 disabled:opacity-30 sm:block"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <footer className="px-5 pb-5 pt-3">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex items-center justify-between text-[12px] text-white/65">
            <span aria-live="polite">
              {page} / {PORTFOLIO_PAGES}
            </span>
            <span className="sm:hidden">좌우로 밀어서 넘기기</span>
          </div>
          <nav aria-label="장 목록" className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {CHAPTERS.map((item) => (
              <button
                key={item.title}
                type="button"
                aria-current={item === chapter ? 'true' : undefined}
                onClick={() => go(item.from)}
                className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                  item === chapter ? 'bg-white text-ink' : 'bg-white/10 text-white/75 hover:bg-white/20'
                }`}
              >
                {item.title}
              </button>
            ))}
          </nav>
          <div ref={stripRef} aria-label="쪽 목록" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: PORTFOLIO_PAGES }, (_, index) => index + 1).map((n) => (
              <button
                key={n}
                type="button"
                data-page={n}
                aria-label={`${n}쪽`}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => go(n)}
                className={`relative shrink-0 overflow-hidden rounded-md transition ${
                  n === page ? 'ring-2 ring-accent' : inRange(n) ? 'ring-1 ring-accent/60' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <img src={pageThumb(n)} alt="" loading="lazy" className="h-[45px] w-[80px] object-cover" />
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1 text-[9px]">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

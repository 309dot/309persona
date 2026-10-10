/**
 * The portfolio PDF as page images (frontend/public/portfolio: p = viewer, m = cards, t = strip; made by
 * frontend/scripts/render_portfolio_pages.py) and its chapters, read off the PDF's own headings.
 */
export const PORTFOLIO_PDF_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
export const RESUME_PDF_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/Product-resume.pdf';

export const PORTFOLIO_PAGES = 27;
/** Every page is a 16:9 slide; the viewer reserves this box before the image arrives. */
export const PAGE_SIZE = { width: 2000, height: 1125 };

export interface Chapter {
  title: string;
  from: number;
  to: number;
}

export const CHAPTERS: Chapter[] = [
  { title: '소개', from: 1, to: 2 },
  { title: '일하는 방식', from: 3, to: 5 },
  { title: '디자인 시스템 · 페이히어', from: 6, to: 11 },
  { title: '주문관리 · 페이히어', from: 12, to: 16 },
  { title: '페이히어 2.0 리뉴얼', from: 17, to: 19 },
  { title: '팀윙크 알다', from: 20, to: 22 },
  { title: 'AI 오디오북 · 신시아', from: 23, to: 26 },
  { title: '마무리', from: 27, to: 27 },
];

const pad = (page: number) => String(page).padStart(2, '0');
export const pageImage = (page: number) => `/portfolio/p${pad(page)}.webp`;
export const pageCard = (page: number) => `/portfolio/m${pad(page)}.webp`;
export const pageThumb = (page: number) => `/portfolio/t${pad(page)}.webp`;

export function chapterOf(page: number): Chapter {
  return CHAPTERS.find((chapter) => page >= chapter.from && page <= chapter.to) ?? CHAPTERS[0];
}

/** "7-11", "7–11쪽" or "7" → [7, 11]; null when there are no usable page numbers. */
export function parsePages(value?: string | null): [number, number] | null {
  const numbers = (value ?? '').match(/\d+/g)?.map(Number).filter((n) => n >= 1 && n <= PORTFOLIO_PAGES) ?? [];
  if (!numbers.length) return null;
  return [Math.min(...numbers), Math.max(...numbers)];
}

export function pagesLabel([from, to]: [number, number]): string {
  return from === to ? `${from}쪽` : `${from}~${to}쪽`;
}

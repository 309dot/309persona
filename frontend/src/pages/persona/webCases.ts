import { useEffect, useState } from 'react';

/**
 * Case studies on the portfolio site that serves this app (www.309designlab.com, `GET /api/works`, open CORS).
 * A project or note is matched to a case by the case's name or one of its aliases, so the knowledge pack needs
 * no new field. Fetched once per tab; when the site can't be reached, cards and the map go without case links.
 */
const WORKS_URL = 'https://www.309designlab.com/api/works';

export interface WebCase {
  slug: string;
  name: string;
  /** Case page, absolute. */
  url: string;
  /** 960×600 WebP cover, absolute. */
  coverSmall: string;
  aliases: string[];
}

let loaded: WebCase[] | null = null;
let request: Promise<WebCase[]> | null = null;

export function loadWebCases(): Promise<WebCase[]> {
  request ??= fetch(WORKS_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((data: { works?: WebCase[] } | null) => (loaded = Array.isArray(data?.works) ? data.works : []))
    .catch((error) => {
      console.warn('[Persona] 웹 케이스 목록을 불러오지 못했어요', error);
      return (loaded = []);
    });
  return request;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The case whose name or alias is this label (ignoring spaces, quotes and punctuation). */
export function caseFor(label: string, cases: WebCase[]): WebCase | undefined {
  const key = normalize(label);
  if (!key) return undefined;
  return cases.find((item) => [item.name, ...item.aliases].some((name) => normalize(name) === key));
}

/** The site's cases; empty until they arrive and when the site can't be reached. */
export function useWebCases(): WebCase[] {
  const [cases, setCases] = useState<WebCase[]>(() => loaded ?? []);
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void loadWebCases().then((list) => {
      if (!cancelled) setCases(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return cases;
}

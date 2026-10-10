import { randomId } from './id';

const VISIT_KEY = 'persona-visit-id';
let fallbackVisitId: string | null = null;

/**
 * Per-tab visit id for funnel events. Exists from the first render, so events
 * can be recorded before a chat session is created.
 */
export function getVisitId(): string {
  try {
    const existing = sessionStorage.getItem(VISIT_KEY);
    if (existing) return existing;
    const created = randomId();
    sessionStorage.setItem(VISIT_KEY, created);
    return created;
  } catch {
    fallbackVisitId ??= randomId();
    return fallbackVisitId;
  }
}

/**
 * The conversation of this tab, kept in sessionStorage so a reload doesn't reset
 * the question count or lose the answers (plan B9). Closing the tab clears it.
 */
const KEY = 'persona-chat';
const VERSION = 1;

export interface SavedChat<Thread> {
  sessionId: string;
  threads: Thread[];
  usedCount: number;
  questionLimit: number;
  visitorName: string;
  visitorAffiliation: string;
  confirmedProfile: { name: string; affiliation: string };
  visitorPurpose?: string | null;
}

export function loadSavedChat<Thread>(): SavedChat<Thread> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== VERSION || typeof data.sessionId !== 'string' || !Array.isArray(data.threads)) return null;
    return data as SavedChat<Thread>;
  } catch {
    return null;
  }
}

export function saveChat<Thread>(chat: SavedChat<Thread>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...chat }));
  } catch {
    // Storage blocked or full: the chat still works, it just won't survive a reload.
  }
}

import type {
  ChatOutcome,
  ChatRequestPayload,
  ChatStart,
  ChatResponseBody,
  ConversationRecord,
  DashboardStats,
  FeedbackRating,
  KnowledgeGraph,
  KnowledgeStatus,
  SessionDetail,
  SessionInfo,
  VisitorPayload,
  VisitorResponse,
} from '../types/api';

const DEFAULT_LOCAL_API = 'http://localhost:8000/api';

function resolveBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const isBrowser = typeof window !== 'undefined';
  if (isBrowser) {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local');

    if (!isLocalhost) {
      console.warn(
        '[API] VITE_API_BASE_URL is not set. Falling back to same-origin /api. Configure this environment variable for production to avoid CORS issues.',
      );
      return `${window.location.origin.replace(/\/$/, '')}/api`;
    }
  }

  return DEFAULT_LOCAL_API;
}

const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const merged = new Headers(headers);
  if (!merged.has('Content-Type')) {
    merged.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: merged });

  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, detail || 'API 요청에 실패했습니다.');
  }

  return response.json() as Promise<T>;
}

export async function createVisitor(payload: VisitorPayload): Promise<SessionInfo> {
  const body = {
    visitor_name: payload.visitorName,
    visitor_affiliation: payload.visitorAffiliation ?? '',
    visit_ref: payload.visitRef ?? '',
    referrer: payload.referrer ?? '',
    ...(payload.visitorPurpose ? { visitor_purpose: payload.visitorPurpose } : {}),
  };

  const data = await request<VisitorResponse>('/visitors', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    sessionId: data.session_id,
    visitorName: data.visitor_name,
    visitorAffiliation: data.visitor_affiliation,
    visitRef: data.visit_ref,
  };
}

export async function updateVisitor(
  sessionId: string,
  payload: { visitorName: string; visitorAffiliation: string },
): Promise<void> {
  await request<VisitorResponse>(`/visitors/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      visitor_name: payload.visitorName,
      visitor_affiliation: payload.visitorAffiliation,
    }),
  });
}

function chatBody(payload: ChatRequestPayload) {
  return JSON.stringify({
    session_id: payload.sessionId,
    question: payload.question,
    history: payload.history ?? [],
  });
}

/** Whole answer in one response (fallback when streaming isn't available). */
export async function sendQuestion(payload: ChatRequestPayload): Promise<ChatResponseBody> {
  return request<ChatResponseBody>('/chat', { method: 'POST', body: chatBody(payload) });
}

/** The backend predates /chat/stream; use sendQuestion instead. */
export class StreamUnsupportedError extends Error {}

const FINAL_EVENTS = new Set(['done', 'blocked', 'error']);

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue; // comments are keep-alive pings
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  return { event, data: JSON.parse(data.join('\n')) };
}

/**
 * Ask over Server-Sent Events. Calls onStart once the backend accepted the question,
 * onDelta with answer text as it arrives, onAnswerEnd once only metadata (sources,
 * follow-ups) is left, and resolves with the final done | blocked | error event.
 */
export async function streamQuestion(
  payload: ChatRequestPayload,
  handlers: { onDelta: (text: string) => void; onAnswerEnd?: () => void; onStart?: (data: ChatStart) => void },
  signal?: AbortSignal,
): Promise<ChatOutcome> {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: chatBody(payload),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    // FastAPI's generic 404 means the route itself is missing (older backend).
    if (response.status === 404 && detail.includes('"Not Found"')) throw new StreamUnsupportedError();
    throw new ApiError(response.status, detail || 'API 요청에 실패했습니다.');
  }
  if (!response.body) throw new StreamUnsupportedError();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const parsed = parseSseBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
      if (!parsed) continue;
      if (parsed.event === 'start') {
        handlers.onStart?.(parsed.data as ChatStart);
      } else if (parsed.event === 'delta') {
        handlers.onDelta((parsed.data as { text: string }).text);
      } else if (parsed.event === 'answer_end') {
        handlers.onAnswerEnd?.();
      } else if (FINAL_EVENTS.has(parsed.event)) {
        await reader.cancel().catch(() => undefined);
        return { type: parsed.event, data: parsed.data } as ChatOutcome;
      }
    }
  }
  throw new Error('응답이 중간에 끊겼어요.');
}

/** The knowledge map's graph; null when the backend predates /knowledge/graph. */
export async function getKnowledgeGraph(): Promise<KnowledgeGraph | null> {
  try {
    return await request<KnowledgeGraph>('/knowledge/graph');
  } catch (error) {
    console.warn('[API] 기록 지도를 불러오지 못했어요', error);
    return null;
  }
}

export async function sendFeedback(payload: {
  sessionId: string;
  conversationId: string;
  rating: FeedbackRating;
}): Promise<void> {
  await request<{ ok: boolean }>('/chat/feedback', {
    method: 'POST',
    body: JSON.stringify({
      session_id: payload.sessionId,
      conversation_id: payload.conversationId,
      rating: payload.rating,
    }),
  });
}

export async function getDashboardStats(idToken: string): Promise<DashboardStats> {
  return request<DashboardStats>('/dashboard/stats', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getConversationLogs(
  idToken: string,
  limit = 50,
): Promise<ConversationRecord[]> {
  return request<ConversationRecord[]>(`/dashboard/logs?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getSessionDetail(idToken: string, sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/dashboard/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getKnowledgeStatus(idToken: string): Promise<KnowledgeStatus> {
  return request<KnowledgeStatus>('/dashboard/knowledge', { headers: { Authorization: `Bearer ${idToken}` } });
}

/** Fetch the private notes again (after a sync) without redeploying the backend. */
export async function reloadKnowledge(idToken: string): Promise<KnowledgeStatus> {
  return request<KnowledgeStatus>('/dashboard/knowledge/reload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

let funnelEndpointAvailable = true;

export async function trackFunnelEvent(payload: {
  sessionId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  if (!funnelEndpointAvailable) return;
  try {
    await request<{ ok: boolean }>(`/events/funnel`, {
      method: 'POST',
      body: JSON.stringify({
        session_id: payload.sessionId,
        event: payload.event,
        properties: payload.properties ?? {},
      }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      funnelEndpointAvailable = false;
      return;
    }
    throw error;
  }
}


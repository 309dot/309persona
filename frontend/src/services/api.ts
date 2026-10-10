import type {
  ChatRequestPayload,
  ChatResponseBody,
  ConversationRecord,
  DashboardStats,
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

export async function sendQuestion(payload: ChatRequestPayload): Promise<ChatResponseBody> {
  const body = {
    session_id: payload.sessionId,
    question: payload.question,
  };

  return request<ChatResponseBody>('/chat', {
    method: 'POST',
    body: JSON.stringify(body),
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


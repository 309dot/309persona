import type {
  ChatRequestPayload,
  ChatResponseBody,
  ConversationRecord,
  DashboardStats,
  SessionInfo,
  VisitorPayload,
  VisitorResponse,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'API 요청에 실패했습니다.');
  }

  return response.json() as Promise<T>;
}

export async function createVisitor(payload: VisitorPayload): Promise<SessionInfo> {
  const body = {
    visitor_name: payload.visitorName,
    visitor_affiliation: payload.visitorAffiliation ?? '',
    visit_ref: payload.visitRef ?? '',
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


export interface VisitorPayload {
  visitorName: string;
  visitorAffiliation?: string;
  visitRef?: string;
  referrer?: string;
}

export interface VisitorResponse {
  session_id: string;
  visitor_name: string;
  visitor_affiliation?: string;
  visit_ref?: string;
  referrer?: string;
}

export interface SessionInfo {
  sessionId: string;
  visitorName: string;
  visitorAffiliation?: string;
  visitRef?: string;
}

export interface HistoryTurn {
  question: string;
  answer: string;
}

export interface ChatRequestPayload {
  sessionId: string;
  question: string;
  history?: HistoryTurn[];
}

export interface ChatSource {
  id: string;
  label: string;
}

export interface ChatResponseBody {
  session_id: string;
  answer: string;
  blocked: boolean;
  reason?: string;
  category?: string;
  citations?: string[];
  sources?: ChatSource[];
  follow_ups?: string[];
  conversation_id?: string | null;
  remaining?: number;
  limit?: number;
}

export interface ChatQuota {
  remaining?: number;
  limit?: number;
}

/** Final event of /api/chat/stream. */
export type ChatOutcome =
  | { type: 'done'; data: ChatResponseBody }
  | { type: 'blocked'; data: ChatResponseBody }
  | { type: 'error'; data: ChatQuota & { code: string; message: string; retryable: boolean } };

export type FeedbackRating = 'up' | 'down';

export interface StatPoint {
  label: string;
  value: number;
}

export interface FunnelStepStat {
  key: string;
  label: string;
  value: number;
  conversion_from_prev?: number | null;
}

export interface DashboardKpis {
  total_sessions: number;
  visits: number;
  avg_questions_per_session: number;
  blocked_rate: number;
  readiness_rate: number;
  failure_rate: number;
  latency_p50_ms?: number | null;
  first_token_p50_ms?: number | null;
  feedback_up: number;
  feedback_down: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface DashboardStats {
  ref_stats: StatPoint[];
  referrer_stats: StatPoint[];
  question_categories: StatPoint[];
  daily_visits: StatPoint[];
  latest_visitors: VisitorRecord[];
  recent_questions: ConversationRecord[];
  funnel_steps: FunnelStepStat[];
  kpis: DashboardKpis;
}

export interface VisitorRecord {
  id: string;
  visitor_name?: string;
  visitor_affiliation?: string;
  visit_ref?: string;
  referrer?: string;
  session_id?: string;
  created_at?: string;
}

export interface ConversationRecord {
  id: string;
  session_id: string;
  question: string;
  answer?: string;
  category?: string;
  is_blocked?: boolean;
  timestamp?: string;
  pipeline?: string | null;
  model?: string | null;
  latency_ms?: number | null;
  first_token_ms?: number | null;
  error?: string | null;
  feedback?: FeedbackRating | null;
  sources?: string[];
}

export interface SessionDetail {
  session_id: string;
  visitor?: VisitorRecord | null;
  conversations: ConversationRecord[];
}


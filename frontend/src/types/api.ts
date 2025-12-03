export interface VisitorPayload {
  visitorName: string;
  visitorAffiliation?: string;
  visitRef?: string;
}

export interface VisitorResponse {
  session_id: string;
  visitor_name: string;
  visitor_affiliation?: string;
  visit_ref?: string;
}

export interface SessionInfo {
  sessionId: string;
  visitorName: string;
  visitorAffiliation?: string;
  visitRef?: string;
}

export interface ChatRequestPayload {
  sessionId: string;
  question: string;
}

export interface ChatResponseBody {
  session_id: string;
  answer: string;
  blocked: boolean;
  reason?: string;
  category?: string;
}

export interface ChatMessage {
  id: string;
  role: 'visitor' | 'agent' | 'system';
  text: string;
  timestamp: string;
  category?: string | null;
  blocked?: boolean;
}

export interface StatPoint {
  label: string;
  value: number;
}

export interface DashboardStats {
  ref_stats: StatPoint[];
  question_categories: StatPoint[];
  daily_visits: StatPoint[];
  latest_visitors: VisitorRecord[];
  recent_questions: ConversationRecord[];
}

export interface VisitorRecord {
  id: string;
  visitor_name?: string;
  visitor_affiliation?: string;
  visit_ref?: string;
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
}


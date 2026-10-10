import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import agentAvatar from '@assets/images/agent-avatar.png';
import iconEdit from '@assets/icons/name-edit.svg';
import iconArrowRight from '@assets/icons/icon-arrow-right.svg';
import iconMailSolid from '@assets/icons/icon-mail.svg';
import iconPortfolio from '@assets/icons/icon-portfolio.svg';
import iconResume from '@assets/icons/icon-resume.svg';
import iconSend from '@assets/icons/send-arrow.svg';
import logoFull from '@assets/icons/logo.svg';

import {
  ApiError,
  createVisitor,
  sendFeedback,
  sendQuestion,
  streamQuestion,
  StreamUnsupportedError,
  trackFunnelEvent as trackFunnelEventApi,
  updateVisitor,
} from '../services/api';
import { formatVisitorName } from '../lib/formatName';
import { randomId } from '../lib/id';
import { loadSavedChat, saveChat } from '../lib/savedChat';
import { getVisitId } from '../lib/visit';
import { inferVisitorProfile } from '../lib/visitorProfile';
import { AnswerFeedback, AnswerSources, FailedAnswer, FollowUpChips } from './persona/AnswerExtras';
import { AnimatedFormattedAnswer, CompletionModal, VisitorInfoModal } from './persona/PersonaResponseAndModals';
import { PrivacyNotice } from './persona/PrivacyNotice';
import type { ChatOutcome, ChatSource, FeedbackRating, HistoryTurn, SessionInfo } from '../types/api';

const INTRO_MESSAGE =
  '안녕하세요, 309 성백곤입니다. Flow-Maker Product Designer로 어떤 문제를 어떻게 풀어왔는지 차근차근 공유드릴게요. 커피챗 목적(채용/협업/프로젝트)과 회사명을 알려주시면 맥락에 맞춰 바로 답변드리겠습니다. 😊';
const INPUT_PLACEHOLDER = '예: 309가 프로젝트 우선순위를 정하는 기준은?';
const QUICK_QUESTIONS = [
  '최근 2년 안에 가장 임팩트 컸던 프로젝트 2개만 핵심으로 설명해줘',
  '디자인 시스템 구축에서 실제로 성과를 낸 방식과 수치를 알려줘',
  '협업 갈등이 생겼을 때 309가 조율한 실제 사례를 말해줘',
  '우선순위가 충돌할 때 어떤 기준으로 결정했는지 예시로 설명해줘',
  '채용 관점에서 리스크와 강점을 균형 있게 평가해줘',
];
// Shown until the first answer arrives; after that the backend's limit/remaining win.
const DEFAULT_QUESTION_LIMIT = 5;
const DEFAULT_VISITOR_NAME = '채용 담당자';
const QUESTION_MAX_LENGTH = 500;
const PORTFOLIO_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const RESUME_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/Product-resume.pdf';
const OUT_OF_SCOPE_MESSAGE = '이 서비스는 309의 경력 관련 질문만 응답합니다. 프로덕트/UX/경력 맥락으로 다시 질문해 주세요.';
const QUESTION_FIRST_EXPERIMENT = String(import.meta.env.VITE_EXPERIMENT_QUESTION_FIRST ?? 'true') === 'true';
const EXPERIMENT_VARIANT = QUESTION_FIRST_EXPERIMENT ? 'on' : 'off';
// Previous answers sent back so follow-up questions ("그 프로젝트는?") make sense.
const HISTORY_TURNS = 3;

type ThreadStatus = 'pending' | 'streaming' | 'done' | 'blocked' | 'error';
type QuestionSource = 'manual' | 'quick' | 'follow_up' | 'retry';

type PersonaThread = {
  id: string;
  question: string;
  questionAt: string;
  status: ThreadStatus;
  answer: string;
  answerAt?: string;
  inferredCaption?: string;
  /** Questions left after this one, as reported by the backend. */
  remaining?: number;
  sources?: ChatSource[];
  followUps?: string[];
  conversationId?: string | null;
  feedback?: FeedbackRating;
};

function sourceHref(source: ChatSource): string | undefined {
  if (source.id === 'RESUME') return RESUME_URL;
  if (/^P\d+$/.test(source.id)) return PORTFOLIO_URL;
  return undefined;
}


function BrandBadge() {
  return (
    <div className="flex items-center">
      <img src={logoFull} alt="309 logo" className="h-11 w-auto" />
    </div>
  );
}

function RemainingCounter({ used, total }: { used: number; total: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(used, total);
  const progress = total > 0 ? clamped / total : 1;
  const dashoffset = circumference * (1 - progress);

  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-graphite/60">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E3E7EE"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0B98FF"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span>
        {clamped}/{total}
      </span>
    </div>
  );
}

function ProposalCard({ onClick }: { onClick?: () => void }) {
  const handleProposalClick = () => {
    onClick?.();
    window.location.href = 'mailto:hello@309designlab.com?subject=309%20Interview%20Agent%20Inquiry';
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-3 rounded-full border border-transparent bg-white px-4 py-2 text-[15px] font-semibold text-graphite shadow-[0_12px_30px_rgba(15,19,36,0.16)] transition hover:-translate-y-0.5"
      onClick={handleProposalClick}
    >
      <img src={iconMailSolid} alt="proposal" className="h-4 w-4" />
      309에게 제안하기
      <img src={iconArrowRight} alt="arrow" className="h-3.5 w-3.5" />
    </button>
  );
}

function formatTimeLabel(timestamp?: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp ? new Date(timestamp) : new Date());
  } catch {
    return '';
  }
}

function withHonorific(name?: string | null) {
  return formatVisitorName(name, DEFAULT_VISITOR_NAME);
}

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
  usedCount,
  questionLimit,
  onEditVisitor,
  onInputFocus,
  showIdentityEdit,
  maxReached,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: (source?: 'manual' | 'quick') => void;
  loading: boolean;
  usedCount: number;
  questionLimit: number;
  onEditVisitor: () => void;
  onInputFocus: () => void;
  showIdentityEdit: boolean;
  maxReached: boolean;
}) {
  const disabled = !question.trim() || loading || maxReached;

  return (
    <div className="animate-slide-up w-full rounded-[36px] border border-line bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,19,36,0.14)]">
      <div className="flex flex-col gap-4">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={maxReached ? `질문 ${questionLimit}회가 완료되었습니다` : INPUT_PLACEHOLDER}
          disabled={maxReached}
          maxLength={QUESTION_MAX_LENGTH}
          className="w-full border border-transparent bg-transparent px-1 text-[1rem] font-semibold leading-tight text-graphite placeholder:text-placeholder focus:outline-hidden disabled:cursor-not-allowed disabled:text-slate-400"
          onFocus={onInputFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit('manual');
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-4">
          <RemainingCounter used={usedCount} total={questionLimit} />
          {showIdentityEdit ? (
            <button
              type="button"
              onClick={onEditVisitor}
              className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold text-graphite/60 transition hover:text-graphite"
            >
              <span>{withHonorific(name)}</span>
              <img src={iconEdit} alt="정보 수정" className="h-[10.5px] w-[10.5px]" />
            </button>
          ) : (
            <span className="ml-auto text-[12px] font-semibold text-graphite/40">질문 먼저 시작해도 됩니다</span>
          )}
          <button
            type="button"
            onClick={() => onSubmit('manual')}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white transition hover:bg-black disabled:bg-slate-400"
            aria-label="전송"
          >
            <img src={iconSend} alt="질문 보내기" className="h-[10.5px] w-[10.5px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersonaChatV2Page() {
  // A reload in the same tab picks the conversation up where it was.
  const [saved] = useState(() => loadSavedChat<PersonaThread>());
  const [visitorName, setVisitorName] = useState(saved?.visitorName ?? DEFAULT_VISITOR_NAME);
  const [visitorAffiliation, setVisitorAffiliation] = useState(saved?.visitorAffiliation ?? '');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [usedCount, setUsedCount] = useState(saved?.usedCount ?? 0);
  const [questionLimit, setQuestionLimit] = useState(saved?.questionLimit ?? DEFAULT_QUESTION_LIMIT);
  const [ctaVisible, setCtaVisible] = useState(Boolean(saved?.threads.length));
  const [threads, setThreads] = useState<PersonaThread[]>(saved?.threads ?? []);
  const [quickQuestionConsumed, setQuickQuestionConsumed] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const [showVisitorInfoModal, setShowVisitorInfoModal] = useState(false);
  const [showProfileNudge, setShowProfileNudge] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // The input dock is fixed over the bottom of the page; keep the latest message above it.
  const [dockHeight, setDockHeight] = useState(0);
  // The landing (logo and headline) stays in view until the first question.
  const conversationStartedRef = useRef(Boolean(saved?.threads.length));
  const landingTrackedRef = useRef(false);
  const inputFocusTrackedRef = useRef(false);
  // The chat session is created on the first question, not on page load.
  const sessionPromiseRef = useRef<Promise<SessionInfo> | null>(
    saved ? Promise.resolve({ sessionId: saved.sessionId, visitorName: saved.visitorName }) : null,
  );
  const sessionIdRef = useRef<string | null>(saved?.sessionId ?? null);
  // Only profile values the visitor entered themselves are sent to the backend;
  // names guessed from question text stay on screen.
  const confirmedProfileRef = useRef(saved?.confirmedProfile ?? { name: '', affiliation: '' });
  // Falls back to the JSON endpoint once if the backend has no /chat/stream yet.
  const streamSupportedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // Streamed text is applied once per animation frame instead of once per chunk.
  const pendingDeltaRef = useRef<{ threadId: string; text: string } | null>(null);
  const frameRef = useRef<number | null>(null);

  const introTimestamp = useMemo(() => formatTimeLabel(), []);
  const displayName = visitorName || DEFAULT_VISITOR_NAME;
  const showIdentityEdit = !QUESTION_FIRST_EXPERIMENT || usedCount > 0;

  const trackFunnelEvent = useCallback(async (eventName: string, extra: Record<string, unknown> = {}) => {
    try {
      await trackFunnelEventApi({
        sessionId: getVisitId(),
        event: eventName,
        properties: {
          experiment: 'question_first',
          variant: EXPERIMENT_VARIANT,
          visitRef: 'persona-v2',
          path: window.location.pathname,
          ...(sessionIdRef.current ? { chatSessionId: sessionIdRef.current } : {}),
          ...extra,
        },
      });
    } catch (error) {
      console.error('[Persona] 퍼널 이벤트 기록 실패', error);
    }
  }, []);

  const ensureSession = useCallback((forceNew = false): Promise<SessionInfo> => {
    if (forceNew) sessionPromiseRef.current = null;
    if (!sessionPromiseRef.current) {
      const profile = confirmedProfileRef.current;
      sessionPromiseRef.current = createVisitor({
        visitorName: profile.name || DEFAULT_VISITOR_NAME,
        visitorAffiliation: profile.affiliation,
        visitRef: 'persona-v2',
        referrer: document.referrer || '',
      }).then(
        (info) => {
          sessionIdRef.current = info.sessionId;
          return info;
        },
        (error) => {
          sessionPromiseRef.current = null;
          throw error;
        },
      );
    }
    return sessionPromiseRef.current;
  }, []);

  const runQuestion = useCallback(
    async (
      text: string,
      history: HistoryTurn[],
      handlers: { onDelta: (delta: string) => void; onAnswerEnd: () => void },
      signal: AbortSignal,
    ): Promise<ChatOutcome> => {
      const attempt = async (sessionId: string): Promise<ChatOutcome> => {
        if (streamSupportedRef.current) {
          try {
            return await streamQuestion({ sessionId, question: text, history }, handlers, signal);
          } catch (error) {
            if (!(error instanceof StreamUnsupportedError)) throw error;
            streamSupportedRef.current = false;
          }
        }
        const response = await sendQuestion({ sessionId, question: text, history });
        return { type: response.blocked ? 'blocked' : 'done', data: response };
      };

      const active = await ensureSession();
      try {
        return await attempt(active.sessionId);
      } catch (error) {
        // The backend lost the session (e.g. restarted without Firestore): start a new one once.
        if (error instanceof ApiError && error.status === 404) {
          const fresh = await ensureSession(true);
          return attempt(fresh.sessionId);
        }
        throw error;
      }
    },
    [ensureSession],
  );

  const updateThread = useCallback((threadId: string, changes: Partial<PersonaThread>) => {
    setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, ...changes } : thread)));
  }, []);

  const flushDelta = useCallback(() => {
    frameRef.current = null;
    const pending = pendingDeltaRef.current;
    if (!pending) return;
    pendingDeltaRef.current = null;
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === pending.threadId
          ? { ...thread, status: 'streaming', answer: thread.answer + pending.text }
          : thread,
      ),
    );
  }, []);

  const appendDelta = useCallback(
    (threadId: string, text: string) => {
      const pending = pendingDeltaRef.current;
      pendingDeltaRef.current =
        pending && pending.threadId === threadId ? { threadId, text: pending.text + text } : { threadId, text };
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushDelta);
    },
    [flushDelta],
  );

  const dropPendingDelta = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingDeltaRef.current = null;
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      dropPendingDelta();
    },
    [dropPendingDelta],
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = contentRef.current;
      if (!container) return;
      const anchor = bottomRef.current;
      const scrollOnce = (mode: ScrollBehavior) => {
        if (anchor) {
          anchor.scrollIntoView({ behavior: mode, block: 'end' });
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: mode });
        }
      };
      scrollOnce('auto'); // 먼저 즉시 맞추기
      requestAnimationFrame(() => scrollOnce(behavior)); // 레이아웃 반영 후
      setTimeout(() => scrollOnce(behavior), 32); // 비동기 렌더 후 보강
    },
    [],
  );

  useEffect(() => {
    if (conversationStartedRef.current) scrollToBottom();
  }, [threads, scrollToBottom]);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => scrollToBottom('auto'), 250);
    return () => clearInterval(timer);
  }, [loading, scrollToBottom]);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight));
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (conversationStartedRef.current) scrollToBottom();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    const finished = threads.filter((thread) => thread.status === 'done' || thread.status === 'blocked');
    if (!sessionId || !finished.length) return;
    saveChat({
      sessionId,
      threads: finished,
      usedCount,
      questionLimit,
      visitorName,
      visitorAffiliation,
      confirmedProfile: confirmedProfileRef.current,
    });
  }, [threads, usedCount, questionLimit, visitorName, visitorAffiliation]);

  useEffect(() => {
    if (landingTrackedRef.current) return;
    landingTrackedRef.current = true;
    // The chat dock renders with the page, so the chat view starts with the landing.
    void trackFunnelEvent('landing_view');
    void trackFunnelEvent('chat_view');
  }, [trackFunnelEvent]);

  const answerThread = async (threadId: string, text: string, source: QuestionSource) => {
    const firstAnswer = !threads.some((thread) => thread.status === 'done' || thread.status === 'blocked');
    const history = threads
      .filter((thread) => thread.status === 'done' && thread.id !== threadId)
      .slice(-HISTORY_TURNS)
      .map((thread) => ({ question: thread.question, answer: thread.answer }));

    setUsedCount((count) => Math.min(questionLimit, count + 1));
    setLoading(true);
    scrollToBottom();
    const controller = new AbortController();
    abortRef.current = controller;
    // Set once the answer text is complete; sources and follow-ups may still be on the way.
    let answerEnded = false;

    try {
      const outcome = await runQuestion(
        text,
        history,
        {
          onDelta: (delta) => appendDelta(threadId, delta),
          onAnswerEnd: () => {
            answerEnded = true;
            flushDelta();
            updateThread(threadId, { status: 'done', answerAt: new Date().toISOString() });
            // Let the visitor ask the next question without waiting for the metadata.
            if (abortRef.current === controller) setLoading(false);
          },
        },
        controller.signal,
      );
      dropPendingDelta();
      const { remaining, limit } = outcome.data;
      if (typeof limit === 'number' && typeof remaining === 'number') {
        setQuestionLimit(limit);
        setUsedCount(Math.max(0, limit - remaining));
      }

      if (outcome.type === 'error') {
        updateThread(threadId, { status: 'error', answer: '' });
        return;
      }
      const data = outcome.data;
      updateThread(threadId, {
        status: outcome.type,
        answer:
          outcome.type === 'blocked'
            ? data.reason || data.answer || OUT_OF_SCOPE_MESSAGE
            : data.answer || OUT_OF_SCOPE_MESSAGE,
        answerAt: new Date().toISOString(),
        remaining,
        sources: data.sources ?? [],
        followUps: data.follow_ups ?? [],
        conversationId: data.conversation_id ?? null,
      });
      setCtaVisible(true);
      if (firstAnswer) {
        void trackFunnelEvent('first_answer_rendered', { source });
        if (QUESTION_FIRST_EXPERIMENT) {
          setShowProfileNudge(true);
        }
      }
      if (remaining === 0) {
        void trackFunnelEvent('five_questions_reached', { usedCount: limit });
        setShowCompletionModal(true);
      }
    } catch (error) {
      dropPendingDelta();
      if (controller.signal.aborted) return;
      console.error('[Persona] 답변 실패', error);
      if (answerEnded) return; // the answer arrived in full; only its metadata is missing
      // The backend gives the question back when an answer fails.
      setUsedCount((count) => Math.max(0, count - 1));
      updateThread(threadId, { status: 'error', answer: '' });
    } finally {
      // A newer question may already be running; only the active request owns `loading`.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (source: QuestionSource = 'manual', questionOverride?: string) => {
    const trimmed = (questionOverride ?? question).trim();
    if (!trimmed || loading) return;
    if (usedCount >= questionLimit) {
      setShowCompletionModal(true);
      return;
    }

    const inferred = inferVisitorProfile(trimmed);
    // A name or affiliation the visitor typed into the profile form always wins over a guess.
    const confirmed = confirmedProfileRef.current;
    const nextName = confirmed.name ? visitorName : (inferred.name ?? visitorName);
    const nextAffiliation = confirmed.affiliation ? visitorAffiliation : (inferred.affiliation ?? visitorAffiliation);
    const inferredCaption = inferred.role || inferred.purpose
      ? `질문에서 유추한 맥락: ${inferred.role ? `역할 ${inferred.role}` : ''}${inferred.role && inferred.purpose ? ' · ' : ''}${inferred.purpose ? `목적 ${inferred.purpose}` : ''}`
      : undefined;
    if (nextName !== visitorName || nextAffiliation !== visitorAffiliation) {
      setVisitorName(nextName);
      setVisitorAffiliation(nextAffiliation);
    }

    conversationStartedRef.current = true;
    const threadId = randomId();
    const questionAt = new Date().toISOString();
    setThreads((prev) => [
      ...prev,
      { id: threadId, question: trimmed, questionAt, inferredCaption, status: 'pending', answer: '' },
    ]);
    setQuestion('');
    void trackFunnelEvent('question_submitted', { source, usedCount: Math.min(questionLimit, usedCount + 1) });
    if (usedCount === 0) {
      void trackFunnelEvent('first_submit', { source });
    }
    await answerThread(threadId, trimmed, source);
  };

  const handleRetry = (thread: PersonaThread) => {
    if (loading) return;
    if (usedCount >= questionLimit) {
      setShowCompletionModal(true);
      return;
    }
    updateThread(thread.id, { status: 'pending', answer: '' });
    void trackFunnelEvent('answer_retried');
    void answerThread(thread.id, thread.question, 'retry');
  };

  const handleFollowUp = (value: string) => {
    void trackFunnelEvent('follow_up_clicked', { value });
    void handleSubmit('follow_up', value);
  };

  const handleFeedback = (thread: PersonaThread, rating: FeedbackRating) => {
    const sessionId = sessionIdRef.current;
    if (!thread.conversationId || thread.feedback || !sessionId) return;
    updateThread(thread.id, { feedback: rating });
    void trackFunnelEvent('answer_feedback', { rating });
    void sendFeedback({ sessionId, conversationId: thread.conversationId, rating }).catch((error) =>
      console.error('[Persona] 피드백 저장 실패', error),
    );
  };

  const closePrivacyNotice = useCallback(() => setShowPrivacyNotice(false), []);

  const handleInputFocus = () => {
    if (inputFocusTrackedRef.current) return;
    inputFocusTrackedRef.current = true;
    void trackFunnelEvent('chat_input_started');
  };

  const handleQuickQuestion = (value: string) => {
    if (usedCount >= questionLimit) {
      setShowCompletionModal(true);
      return;
    }
    setQuickQuestionConsumed(true);
    setQuestion(value);
    void trackFunnelEvent('quick_question_clicked', { value });
    void handleSubmit('quick', value);
  };

  const handleVisitorSave = (nameValue: string, affiliationValue: string) => {
    const normalizedName = nameValue || DEFAULT_VISITOR_NAME;
    setVisitorName(normalizedName);
    setVisitorAffiliation(affiliationValue);
    setShowVisitorInfoModal(false);
    setShowProfileNudge(false);
    confirmedProfileRef.current = { name: nameValue, affiliation: affiliationValue };
    // Before the first question there is no session yet; the profile is sent when it is created.
    const pendingSession = sessionPromiseRef.current;
    if (pendingSession) {
      void pendingSession
        .then((info) =>
          updateVisitor(info.sessionId, { visitorName: normalizedName, visitorAffiliation: affiliationValue }),
        )
        .catch((error) => console.error('[Persona] 방문자 정보 저장 실패', error));
    }
    void trackFunnelEvent('profile_submitted', {
      has_name: Boolean(nameValue?.trim()),
      has_affiliation: Boolean(affiliationValue?.trim()),
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <style>{`@keyframes dotPulseMove {0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}`}</style>
      <main
        ref={contentRef}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto px-4 pb-72 pt-10"
        style={dockHeight ? { paddingBottom: dockHeight + 32 } : undefined}
      >
        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <BrandBadge />
            <div className="h-10 w-10" />
          </div>
          <div className="space-y-4">
            <p className="text-[32px] font-bold leading-snug text-ink sm:text-[38px]">
              안녕하세요. 🙋 만나서 반갑습니다.
              <br />
              이 서비스는 저의 페르소나가 담긴 🤖 *AI Agent 기반 커피챗 서비스입니다.
            </p>
            <p className="text-sm font-medium text-[#767676]">
              *저의 경력과 일하는 방식을 AI가 자연스럽게 재현해 면접 전에 후보자 이해도를 높이고, 채용담당자가 보다 효율적이고 정확한 평가를
              할 수 있도록 돕는 사전 인터뷰 에이전트입니다.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs">
              <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
            </div>
            <div className="flex w-full max-w-[540px] flex-col gap-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-900">309</span>
                <span>{introTimestamp}</span>
              </div>
              <div className="text-[15px] leading-6 text-slate-900">
                <span className="inline-block">{INTRO_MESSAGE}</span>
              </div>
            </div>
          </div>

          {threads.length ? (
            <div className="flex flex-col gap-6">
              {threads.map((thread, index) => {
                const isLatest = index === threads.length - 1;
                const showFollowUps =
                  isLatest && thread.status === 'done' && !loading && usedCount < questionLimit;
                return (
                  <div key={thread.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[420px] rounded-[22px] bg-accent px-5 py-3 text-[14px] leading-6 text-white shadow-[0_12px_28px_rgba(11,152,255,0.22)]">
                        {thread.question}
                      </div>
                    </div>
                    {typeof thread.remaining === 'number' ? (
                      <p className="text-right text-[11px] font-medium text-ink opacity-60">
                        남은 질문 {thread.remaining}/{questionLimit}
                      </p>
                    ) : null}
                    {thread.status === 'error' ? (
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs">
                          <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
                        </div>
                        <FailedAnswer disabled={loading} onRetry={() => handleRetry(thread)} />
                      </div>
                    ) : thread.answer ? (
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs">
                          <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex w-full max-w-[540px] flex-col gap-1">
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-900">309</span>
                            <span>{formatTimeLabel(thread.answerAt || thread.questionAt)}</span>
                          </div>
                          {thread.inferredCaption ? (
                            <p className="text-[11px] text-slate-500">{thread.inferredCaption}</p>
                          ) : null}
                          <AnimatedFormattedAnswer text={thread.answer} />
                          {thread.status === 'done' ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <AnswerSources sources={thread.sources ?? []} hrefFor={sourceHref} />
                              {thread.conversationId ? (
                                <AnswerFeedback
                                  value={thread.feedback}
                                  onRate={(rating) => handleFeedback(thread, rating)}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {showFollowUps ? (
                      <FollowUpChips items={thread.followUps ?? []} disabled={loading} onPick={handleFollowUp} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {showProfileNudge && !loading ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="w-full max-w-[540px] rounded-2xl border border-mist-line bg-mist px-4 py-3 text-[13px] leading-5 text-[#334155]">
                <p>혹시 실례가 안 된다면 이름/소속을 알려주실 수 있을까요? 맥락에 맞춰 더 정확히 답변드릴 수 있어요 😊</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVisitorInfoModal(true)}
                    className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    입력하기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProfileNudge(false)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    다음에 할게요
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {threads.some((thread) => thread.status === 'pending') ? (
            <div className="mt-2 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[13px] font-medium text-slate-500 backdrop-blur-sm">
                <span>답변을 정리하고 있어요</span>
                <span className="flex gap-1">
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '0ms' }} />
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '120ms' }} />
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} className="h-1 w-full" style={{ scrollMarginBottom: dockHeight + 16 }} />
        </section>

      </main>

      <div ref={dockRef} className="fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-white via-white/95 to-white/60 pb-6 pt-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
          {ctaVisible ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ProposalCard onClick={() => void trackFunnelEvent('proposal_email_sent')} />
              <div className="flex items-center gap-4 text-[13px] font-semibold text-ink">
                <a
                  href={PORTFOLIO_URL}
                  className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-ink opacity-80 transition hover:opacity-100"
                  download
                >
                  <img src={iconPortfolio} alt="portfolio" className="h-4 w-4" />
                  포트폴리오
                </a>
                <a
                  href={RESUME_URL}
                  className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-ink opacity-80 transition hover:opacity-100"
                  download
                >
                  <img src={iconResume} alt="resume" className="h-4 w-4" />
                  이력서
                </a>
              </div>
            </div>
          ) : null}
          <div className="space-y-3">
            {!quickQuestionConsumed ? (
              <div className="flex flex-wrap gap-2 px-1">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuickQuestion(q)}
                    className="rounded-full border border-mist-line bg-mist px-3 py-1 text-[12px] font-semibold text-[#445067] transition hover:bg-mist-hover"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
            <InputPanel
              name={displayName}
              question={question}
              onQuestionChange={setQuestion}
              onSubmit={handleSubmit}
              loading={loading}
              usedCount={usedCount}
              questionLimit={questionLimit}
              onEditVisitor={() => setShowVisitorInfoModal(true)}
              onInputFocus={handleInputFocus}
              showIdentityEdit={showIdentityEdit}
              maxReached={usedCount >= questionLimit}
            />
            <p className="px-2 text-center text-[11px] text-slate-400">
              질문과 입력하신 정보는 답변과 서비스 개선에만 써요.{' '}
              <button type="button" onClick={() => setShowPrivacyNotice(true)} className="underline hover:text-slate-600">
                개인정보 안내
              </button>
            </p>
          </div>
        </div>
      </div>
      <PrivacyNotice open={showPrivacyNotice} onClose={closePrivacyNotice} />
      <VisitorInfoModal
        key={`visitor-${showVisitorInfoModal ? 'open' : 'closed'}-${visitorName}-${visitorAffiliation}`}
        open={showVisitorInfoModal}
        name={visitorName}
        affiliation={visitorAffiliation}
        onClose={() => setShowVisitorInfoModal(false)}
        onSave={handleVisitorSave}
      />
      <CompletionModal
        key={`completion-${showCompletionModal ? 'open' : 'closed'}-${visitorName}-${visitorAffiliation}`}
        open={showCompletionModal}
        questionLimit={questionLimit}
        name={visitorName}
        affiliation={visitorAffiliation}
        onClose={() => setShowCompletionModal(false)}
        onSave={handleVisitorSave}
      />
    </div>
  );
}

export default PersonaChatV2Page;


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import agentAvatar from '@assets/images/agent-avatar.png';
import iconEdit from '@assets/icons/name-edit.svg';
import iconArrowRight from '@assets/icons/icon-arrow-right.svg';
import iconMailSolid from '@assets/icons/icon-mail.svg';
import iconClose from '@assets/icons/icon-close.svg';
import heroCardImage from '@assets/icons/card.svg';
import iconPortfolio from '@assets/icons/icon-portfolio.svg';
import iconResume from '@assets/icons/icon-resume.svg';
import iconSend from '@assets/icons/send-arrow.svg';
import logoFull from '@assets/icons/logo.svg';

import { createVisitor, sendQuestion, trackFunnelEvent as trackFunnelEventApi } from '../services/api';
import { firestore } from '../lib/firebase';
import { formatVisitorName } from '../lib/formatName';
import type { SessionInfo } from '../types/api';

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
const TOTAL_QUESTIONS = 5;
const PORTFOLIO_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const RESUME_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/Product-resume.pdf';
const OUT_OF_SCOPE_MESSAGE = '이 서비스는 309의 경력 관련 질문만 응답합니다. 프로덕트/UX/경력 맥락으로 다시 질문해 주세요.';
const CONTEXT_HINT =
  '\n\n(맥락: 이 질문은 309 성백곤의 프로덕트/UX/협업/경력과 관련된 내용입니다. 해당 범위에서 답변해 주세요.)';
const CONTEXT_KEYWORDS = ['프로덕트', 'UX', '경력', '프로젝트', '협업', '리더십', '디자인', '경험', '채용', '작업 방식'];
const QUESTION_FIRST_EXPERIMENT = String(import.meta.env.VITE_EXPERIMENT_QUESTION_FIRST ?? 'true') === 'true';
const ENABLE_CLIENT_FIRESTORE_LOGGING =
  String(import.meta.env.VITE_ENABLE_CLIENT_FIRESTORE_LOGGING ?? 'false') === 'true';

type PersonaThread = {
  id: string;
  question: string;
  questionAt: string;
  answer?: string;
  answerAt?: string;
  blocked?: boolean;
  inferredCaption?: string;
};


function TypingText({
  text,
  speed = 55,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const latestCompleteRef = useRef(onComplete);

  useEffect(() => {
    latestCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setVisible('');
    completedRef.current = false;
    let index = 0;

    const clearExisting = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const step = () => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index < text.length) {
        timeoutRef.current = setTimeout(step, speed);
      } else if (!completedRef.current) {
        completedRef.current = true;
        latestCompleteRef.current?.();
      }
    };

    if (text.length === 0) {
      latestCompleteRef.current?.();
      return clearExisting;
    }

    timeoutRef.current = setTimeout(step, speed);

    return clearExisting;
  }, [text, speed]);

  return (
    <span className="inline-block">
      {visible}
      {visible.length < text.length ? <span className="ml-[1px] inline-block animate-pulse">|</span> : null}
    </span>
  );
}

function BrandBadge() {
  return (
    <div className="flex items-center">
      <img src={logoFull} alt="309 logo" className="h-11 w-auto" />
    </div>
  );
}

function RemainingCounter({ used }: { used: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(used, TOTAL_QUESTIONS);
  const progress = clamped / TOTAL_QUESTIONS;
  const dashoffset = circumference * (1 - progress);

  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#14151A99]">
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
        {clamped}/{TOTAL_QUESTIONS}
      </span>
    </div>
  );
}

function enrichQuestionContext(questionText: string) {
  const hasKeyword = CONTEXT_KEYWORDS.some((keyword) => questionText.includes(keyword));
  if (hasKeyword) return questionText;
  return `${questionText}${CONTEXT_HINT}`;
}

function ProposalCard({ onClick }: { onClick?: () => void }) {
  const handleProposalClick = () => {
    onClick?.();
    window.location.href = 'mailto:hello@309designlab.com?subject=309%20Interview%20Agent%20Inquiry';
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-3 rounded-full border border-transparent bg-white px-4 py-2 text-[15px] font-semibold text-[#14151A] shadow-[0_12px_30px_rgba(15,19,36,0.16)] transition hover:-translate-y-0.5"
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
  return formatVisitorName(name, '채용 담당자');
}

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
  usedCount,
  onEditVisitor,
  onInputFocus,
  showIdentityEdit,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: (source?: 'manual' | 'quick') => void;
  loading: boolean;
  usedCount: number;
  onEditVisitor: () => void;
  onInputFocus: () => void;
  showIdentityEdit: boolean;
}) {
  const disabled = !question.trim() || loading;

  return (
    <div className="animate-slide-up w-full rounded-[36px] border border-[#ECEEF1] bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,19,36,0.14)]">
      <div className="flex flex-col gap-4">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={INPUT_PLACEHOLDER}
          className="w-full border border-transparent bg-transparent px-1 text-[1rem] font-semibold leading-tight text-[#14151A] placeholder:text-[#C4C7CF] focus:outline-none"
          onFocus={onInputFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit('manual');
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-4">
          <RemainingCounter used={usedCount} />
          {showIdentityEdit ? (
            <button
              type="button"
              onClick={onEditVisitor}
              className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold text-[#14151A99] transition hover:text-[#14151A]"
            >
              <span>{withHonorific(name)}</span>
              <img src={iconEdit} alt="정보 수정" className="h-[10.5px] w-[10.5px]" />
            </button>
          ) : (
            <span className="ml-auto text-[12px] font-semibold text-[#14151A66]">질문 먼저 시작해도 됩니다</span>
          )}
          <button
            type="button"
            onClick={() => onSubmit('manual')}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F1324] text-white transition hover:bg-black disabled:bg-slate-400"
            aria-label="전송"
          >
            <img src={iconSend} alt="질문 보내기" className="h-[10.5px] w-[10.5px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-[#0F1324] prose-p:text-[#0F1324] prose-li:text-[#0F1324] prose-strong:text-[#0F1324] prose-a:text-[#0B98FF]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function AnimatedFormattedAnswer({ text }: { text: string }) {
  const [visible, setVisible] = useState('');

  useEffect(() => {
    setVisible('');
    let idx = 0;
    const timer = setInterval(() => {
      idx += 6;
      if (idx >= text.length) {
        setVisible(text);
        clearInterval(timer);
        return;
      }
      setVisible(text.slice(0, idx));
    }, 10);
    return () => clearInterval(timer);
  }, [text]);

  return <MarkdownAnswer text={visible} />;
}

function ConsentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1324]/60 px-4">
      <div className="max-w-xl rounded-3xl bg-white p-6 shadow-[0_35px_85px_rgba(15,19,36,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Privacy Notice</p>
            <h3 className="text-2xl font-bold text-[#0F1324]">개인정보 이용 동의</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-200"
          >
            닫기
          </button>
        </div>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-800">수집 항목:</span> 방문자 이름/이니셜, 소속,
            초대 경로, 질문·대화 내용, 접속 시각
          </li>
          <li>
            <span className="font-semibold text-slate-800">이용 목적:</span> 309 페르소나 기반 답변 제공,
            대화 품질 개선, 문의 이력 모니터링, 악용 방지
          </li>
          <li>
            <span className="font-semibold text-slate-800">보관 기간:</span> 대화 종료 후 최대 12개월,
            혹은 삭제 요청 시 즉시 파기
          </li>
          <li>
            <span className="font-semibold text-slate-800">제3자 제공:</span> 없음. 보관 중인 데이터는
            Firebase / Firestore EU 리전에 암호화되어 저장됩니다.
          </li>
          <li>
            <span className="font-semibold text-slate-800">문의/철회:</span> privacy@309designlab.com 으로
            요청 시 열람·수정·삭제가 가능합니다.
          </li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          * 서비스 이용 시 상기 항목에 동의한 것으로 간주되며, 동의 철회 시 일부 기능이 제한될 수
          있습니다.
        </p>
      </div>
    </div>
  );
}

function HeroInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1324]/70 px-4">
      <div className="relative w-full max-w-sm">
        <img src={heroCardImage} alt="309 persona hero info" className="w-full rounded-[32px] shadow-[0_45px_95px_rgba(15,19,36,0.35)]" />
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-4 -right-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#14151A] text-white hover:bg-black"
          aria-label="모달 닫기"
        >
          <img src={iconClose} alt="닫기" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function VisitorInfoModal({
  open,
  name,
  affiliation,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  affiliation: string;
  onClose: () => void;
  onSave: (name: string, affiliation: string) => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localAffiliation, setLocalAffiliation] = useState(affiliation);

  useEffect(() => {
    if (open) {
      setLocalName(name);
      setLocalAffiliation(affiliation);
    }
  }, [open, name, affiliation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1324]/60 px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(localName.trim(), localAffiliation.trim());
        }}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(15,19,36,0.25)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">309 coffee chat</p>
            <h3 className="text-2xl font-bold text-[#0F1324]">잠깐, 자기소개 좀 부탁드릴게요 ☕</h3>
            <p className="mt-1 text-sm text-slate-500">이름과 소속을 알려주시면 질문 맥락에 맞춰 더 정확하게 답변드릴 수 있어요. (선택)</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-semibold text-slate-700" htmlFor="visitor-name">
            이름 또는 이니셜
          </label>
          <input
            id="visitor-name"
            name="visitorName"
            value={localName}
            onChange={(event) => setLocalName(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="예) 최백호"
          />
          <label className="block text-sm font-semibold text-slate-700" htmlFor="visitor-affiliation">
            회사 / 팀
          </label>
          <input
            id="visitor-affiliation"
            name="visitorAffiliation"
            value={localAffiliation}
            onChange={(event) => setLocalAffiliation(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="예) 울진상사 전략팀"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
          >
            다음에 할게요
          </button>
          <button
            type="submit"
            className="rounded-full bg-[#0F1324] px-5 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}

export function PersonaChatV2Page() {
  const [visitorName, setVisitorName] = useState('채용 담당자');
  const [visitorAffiliation, setVisitorAffiliation] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroDone, setHeroDone] = useState(false);
  const [showLoadingBubble, setShowLoadingBubble] = useState(false);
  const [usedCount, setUsedCount] = useState(0);
  const [dockVisible, setDockVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [threads, setThreads] = useState<PersonaThread[]>([]);
  const [quickQuestionConsumed, setQuickQuestionConsumed] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showHeroInfoModal, setShowHeroInfoModal] = useState(false);
  const [showVisitorInfoModal, setShowVisitorInfoModal] = useState(false);
  const [showProfileNudge, setShowProfileNudge] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const landingTrackedRef = useRef(false);
  const chatViewTrackedRef = useRef(false);
  const inputFocusTrackedRef = useRef(false);

  const introTimestamp = useMemo(() => formatTimeLabel(), []);
  const displayName = visitorName || '채용 담당자';
  const showIdentityEdit = !QUESTION_FIRST_EXPERIMENT || usedCount > 0;

  const logQuestionToFirestore = useCallback(
    async (questionText: string) => {
      if (!ENABLE_CLIENT_FIRESTORE_LOGGING || !firestore || !session) return;
      try {
        await addDoc(collection(firestore, 'personaQuestions'), {
          sessionId: session.sessionId,
          question: questionText,
          visitorName,
          visitorAffiliation,
          visitRef: session.visitRef ?? '',
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('[Persona] 질문 기록 실패', error);
      }
    },
    [session, visitorName, visitorAffiliation],
  );

  const trackFunnelEvent = useCallback(
    async (eventName: string, extra: Record<string, unknown> = {}) => {
      if (!session?.sessionId) return;
      try {
        await trackFunnelEventApi({
          sessionId: session.sessionId,
          event: eventName,
          properties: {
            visitorName,
            visitorAffiliation,
            visitRef: session.visitRef ?? '',
            path: window.location.pathname,
            ...extra,
          },
        });
      } catch (error) {
        console.error('[Persona] 퍼널 이벤트 기록 실패', error);
      }
    },
    [session, visitorName, visitorAffiliation],
  );

  const persistVisitorProfile = useCallback(
    async (nameValue: string, affiliationValue: string, sessionOverride?: SessionInfo | null) => {
      const activeSession = sessionOverride ?? session;
      if (!ENABLE_CLIENT_FIRESTORE_LOGGING || !firestore || !activeSession) return;
      try {
        await setDoc(
          doc(firestore, 'personaVisitors', activeSession.sessionId),
          {
            visitorName: nameValue,
            visitorAffiliation: affiliationValue,
            visitRef: activeSession.visitRef ?? '',
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.error('[Persona] 방문자 정보 저장 실패', error);
      }
    },
    [session],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await createVisitor({
          visitorName: '채용 담당자',
          visitorAffiliation: 'Persona Preview',
          visitRef: 'persona-v2',
          referrer: document.referrer || '',
        });
        if (!cancelled) {
          setSession(info);
          setVisitorName(info.visitorName || '채용 담당자');
          setVisitorAffiliation(info.visitorAffiliation || '');
          if (ENABLE_CLIENT_FIRESTORE_LOGGING && firestore && (info.visitorName || info.visitorAffiliation)) {
            try {
              await setDoc(
                doc(firestore, 'personaVisitors', info.sessionId),
                {
                  visitorName: info.visitorName || '채용 담당자',
                  visitorAffiliation: info.visitorAffiliation || '',
                  visitRef: info.visitRef ?? '',
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
            } catch (error) {
              console.error('[Persona] 초기 방문자 정보 저장 실패', error);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[Persona] 세션 생성 실패', error);
          alert('프리뷰 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_CLIENT_FIRESTORE_LOGGING || !session || !firestore) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(firestore, 'personaVisitors', session.sessionId));
        if (!snapshot.exists() || cancelled) return;
        const data = snapshot.data() as { visitorName?: string; visitorAffiliation?: string };
        if (typeof data.visitorName === 'string') {
          setVisitorName(data.visitorName || '채용 담당자');
        }
        if (typeof data.visitorAffiliation === 'string') {
          setVisitorAffiliation(data.visitorAffiliation || '');
        }
      } catch (error) {
        console.error('[Persona] 방문자 정보 불러오기 실패', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, firestore]);

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
    scrollToBottom();
  }, [threads, showLoadingBubble, scrollToBottom]);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => scrollToBottom('auto'), 250);
    return () => clearInterval(timer);
  }, [loading, scrollToBottom]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      scrollToBottom();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    setHeroDone(true);
  }, []);

  useEffect(() => {
    if (landingTrackedRef.current) return;
    landingTrackedRef.current = true;
    void trackFunnelEvent('landing_view', {
      experiment: 'question_first',
      variant: QUESTION_FIRST_EXPERIMENT ? 'on' : 'off',
    });
  }, [trackFunnelEvent]);

  useEffect(() => {
    if (!dockVisible || chatViewTrackedRef.current) return;
    chatViewTrackedRef.current = true;
    void trackFunnelEvent('chat_view');
  }, [dockVisible, trackFunnelEvent]);

  const inferVisitorProfile = (text: string) => {
    const normalized = text.trim();
    const firstSentence = normalized.split(/[\n?!]/)[0] ?? '';
    const firstClause = firstSentence.split(/[.?!]/)[0]?.trim() ?? '';
    const firstCommaClause = normalized.split(',')[0]?.trim() ?? '';

    const cleanValue = (value: string | undefined | null) => {
      const cleaned = value?.trim();
      if (!cleaned) return null;
      if (cleaned.length < 2 || cleaned.length > 60) return null;
      return cleaned;
    };

    const nameMarkers: RegExp[] = [
      /(저는|나는|제가)\s+([^,.\n]+?)(입니다|예요|에요|이고|이고요)?/i,
      /(제\s*이름은)\s+([^,.\n]+?)(입니다|예요|에요)?/i,
    ];
    const affiliationMarkers: RegExp[] = [
      /(소속|회사|팀|브랜드)\s*(은|는|이)?\s*([^,.\n]+?)(입니다|예요|에요|이고|이고요)?/i,
    ];
    const greetingNameMarkers: RegExp[] = [
      /(반가워|안녕하세요|안녕|hello|hi)?\s*([^,.\n]+?)(입니다|이에요|예요|야|이야)/i,
    ];

    let nameCandidate: string | null = null;
    let affiliationCandidate: string | null = null;

    for (const regex of nameMarkers) {
      const match = firstSentence.match(regex);
      if (match && match[2]) {
        nameCandidate = cleanValue(match[2]);
        break;
      }
    }

    for (const regex of affiliationMarkers) {
      const match = firstSentence.match(regex);
      if (match && match[3]) {
        affiliationCandidate = cleanValue(match[3]);
        break;
      }
    }

    if (!nameCandidate) {
      for (const regex of greetingNameMarkers) {
        const match = firstSentence.match(regex);
        if (match && match[2]) {
          nameCandidate = cleanValue(match[2]);
          break;
        }
      }
    }

    if (!nameCandidate && firstCommaClause.length > 0 && firstCommaClause.length <= 30) {
      const hasSpace = firstCommaClause.includes(' ');
      const looksIntro = hasSpace && !/[?]/.test(firstCommaClause);
      if (looksIntro) {
        nameCandidate = cleanValue(firstCommaClause);
      }
    }

    if (!nameCandidate && firstClause.length > 0 && firstClause.length <= 30) {
      const hasPronoun = /(저는|나는|제가|제\s*이름)/.test(firstClause);
      if (hasPronoun) {
        nameCandidate = cleanValue(firstClause);
      }
    }

    const roleHints = ['pm', '프로덕트 매니저', 'product manager', '디자이너', 'designer', '개발자', 'engineer', '리크루터', 'hr', '채용 담당'];
    const purposeHints = ['채용', '면접', '협업', '프로젝트', '파트너십', '외주', '검토'];
    const role = roleHints.find((k) => normalized.toLowerCase().includes(k));
    const purpose = purposeHints.find((k) => normalized.toLowerCase().includes(k));

    return {
      name: nameCandidate,
      affiliation: affiliationCandidate,
      role,
      purpose,
    };
  };

  const handleSubmit = async (source: 'manual' | 'quick' = 'manual', questionOverride?: string) => {
    const trimmed = (questionOverride ?? question).trim();
    if (!trimmed) return;
    if (!session) {
      alert('프리뷰 세션을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const inferred = inferVisitorProfile(trimmed);
    const nextName = inferred.name ?? visitorName;
    const nextAffiliation = inferred.affiliation ?? visitorAffiliation;
    const inferredCaption = inferred.role || inferred.purpose
      ? `질문에서 유추한 맥락: ${inferred.role ? `역할 ${inferred.role}` : ''}${inferred.role && inferred.purpose ? ' · ' : ''}${inferred.purpose ? `목적 ${inferred.purpose}` : ''}`
      : undefined;
    if (nextName !== visitorName || nextAffiliation !== visitorAffiliation) {
      setVisitorName(nextName);
      setVisitorAffiliation(nextAffiliation);
      void persistVisitorProfile(nextName, nextAffiliation);
    }

    const threadId = uuid();
    const questionAt = new Date().toISOString();
    const nextUsedCount = Math.min(TOTAL_QUESTIONS, usedCount + 1);
    setThreads((prev) => [...prev, { id: threadId, question: trimmed, questionAt, inferredCaption }]);
    setUsedCount(nextUsedCount);
    setQuestion('');
    setShowLoadingBubble(true);
    setLoading(true);
    scrollToBottom();
    void logQuestionToFirestore(trimmed);
    void trackFunnelEvent('question_submitted', { source, usedCount: nextUsedCount });
    if (usedCount === 0) {
      void trackFunnelEvent('first_submit', { source });
    }
    if (nextUsedCount === TOTAL_QUESTIONS) {
      void trackFunnelEvent('five_questions_reached', { usedCount: nextUsedCount });
    }

    try {
      const response = await sendQuestion({
        sessionId: session.sessionId,
        question: enrichQuestionContext(trimmed),
      });
      const normalizedAnswer =
        response.blocked && (response.reason || !response.answer)
          ? response.reason ?? OUT_OF_SCOPE_MESSAGE
          : response.answer || OUT_OF_SCOPE_MESSAGE;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                answer: normalizedAnswer,
                answerAt: new Date().toISOString(),
                blocked: response.blocked,
              }
            : thread,
        ),
      );
      setCtaVisible(true);
      if (usedCount === 0) {
        void trackFunnelEvent('first_answer_rendered', { source });
        if (QUESTION_FIRST_EXPERIMENT) {
          setShowProfileNudge(true);
        }
      }
    } catch (error) {
      console.error('[Persona] 답변 실패', error);
      const fallback = error instanceof Error ? error.message : '응답을 가져오지 못했습니다.';
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                answer: fallback,
                answerAt: new Date().toISOString(),
                blocked: true,
              }
            : thread,
        ),
      );
    } finally {
      setLoading(false);
      setShowLoadingBubble(false);
    }
  };

  const handleInputFocus = () => {
    if (inputFocusTrackedRef.current) return;
    inputFocusTrackedRef.current = true;
    void trackFunnelEvent('chat_input_started');
  };

  const handleQuickQuestion = (value: string) => {
    setQuickQuestionConsumed(true);
    setQuestion(value);
    void trackFunnelEvent('quick_question_clicked', { value });
    void handleSubmit('quick', value);
  };

  const handleVisitorSave = (nameValue: string, affiliationValue: string) => {
    const normalizedName = nameValue || '채용 담당자';
    setVisitorName(normalizedName);
    setVisitorAffiliation(affiliationValue);
    setShowVisitorInfoModal(false);
    setShowProfileNudge(false);
    void persistVisitorProfile(normalizedName, affiliationValue);
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
      >
        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <BrandBadge />
            <div className="h-10 w-10" />
          </div>
          <div className="space-y-4">
            <p className="text-[32px] font-bold leading-snug text-[#0F1324] sm:text-[38px]">
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
          {heroDone && (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex w-full max-w-[540px] flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-900">309</span>
                  <span>{introTimestamp}</span>
                </div>
                <div className="text-[15px] leading-6 text-slate-900">
                  <TypingText
                    text={INTRO_MESSAGE}
                    speed={6}
                    onComplete={() => setDockVisible(true)}
                  />
                </div>
              </div>
            </div>
          )}

          {threads.length ? (
            <div className="flex flex-col gap-6">
              {threads.map((thread, index) => {
                const remaining = Math.max(0, TOTAL_QUESTIONS - (index + 1));
                return (
                  <div key={thread.id} className="space-y-3">
                  <div className="flex justify-end">
                      <div className="max-w-[420px] rounded-[22px] bg-[#0B98FF] px-5 py-3 text-[14px] leading-6 text-white shadow-[0_12px_28px_rgba(11,152,255,0.22)]">
                      {thread.question}
                    </div>
                  </div>
                    <p className="text-right text-[11px] font-medium text-[#0F1324] opacity-60">
                      남은 질문 {remaining}/{TOTAL_QUESTIONS}
                    </p>
                  {thread.answer ? (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
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
                      </div>
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {showProfileNudge && !loading ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="w-full max-w-[540px] rounded-2xl border border-[#E7EBF3] bg-[#F8FAFE] px-4 py-3 text-[13px] leading-5 text-[#334155]">
                <p>혹시 실례가 안 된다면 이름/소속을 알려주실 수 있을까요? 맥락에 맞춰 더 정확히 답변드릴 수 있어요 😊</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVisitorInfoModal(true)}
                    className="rounded-full bg-[#0F1324] px-3 py-1.5 text-xs font-semibold text-white"
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

          {showLoadingBubble && loading ? (
            <div className="mt-2 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[13px] font-medium text-slate-500 backdrop-blur">
                <span>답변을 정리하고 있어요</span>
                <span className="flex gap-1">
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '0ms' }} />
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '120ms' }} />
                  <span className="inline-block h-[4px] w-[4px] rounded-full bg-slate-500" style={{ animation: 'dotPulseMove 680ms ease-in-out infinite', animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} className="h-1 w-full" />
        </section>

      </main>

      {dockVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/95 to-white/60 pb-6 pt-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
            {ctaVisible ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <ProposalCard onClick={() => void trackFunnelEvent('proposal_email_sent')} />
                <div className="flex items-center gap-4 text-[13px] font-semibold text-[#0F1324]">
                  <a
                    href={PORTFOLIO_URL}
                    className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[#0F1324] opacity-80 transition hover:opacity-100"
                    download
                  >
                    <img src={iconPortfolio} alt="portfolio" className="h-4 w-4" />
                    포트폴리오
                  </a>
                  <a
                    href={RESUME_URL}
                    className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[#0F1324] opacity-80 transition hover:opacity-100"
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
                      className="rounded-full border border-[#E7EBF3] bg-[#F8FAFE] px-3 py-1 text-[12px] font-semibold text-[#445067] transition hover:bg-[#EEF3FC]"
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
                onEditVisitor={() => setShowVisitorInfoModal(true)}
                onInputFocus={handleInputFocus}
                showIdentityEdit={showIdentityEdit}
              />

            </div>
          </div>
        </div>
      ) : null}
      <HeroInfoModal open={showHeroInfoModal} onClose={() => setShowHeroInfoModal(false)} />
      <ConsentModal open={showConsentModal} onClose={() => setShowConsentModal(false)} />
      <VisitorInfoModal
        open={showVisitorInfoModal}
        name={visitorName}
        affiliation={visitorAffiliation}
        onClose={() => setShowVisitorInfoModal(false)}
        onSave={handleVisitorSave}
      />
    </div>
  );
}

export default PersonaChatV2Page;


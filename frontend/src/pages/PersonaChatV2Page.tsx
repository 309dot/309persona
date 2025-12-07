import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

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

import { createVisitor, sendQuestion } from '../services/api';
import { firestore } from '../lib/firebase';
import type { SessionInfo } from '../types/api';

const INTRO_MESSAGE =
  '안녕하세요, 309 성백곤입니다. Flow-Maker Product Designer로 어떤 문제를 어떻게 풀어왔는지 차근차근 공유드릴게요. 커피챗 목적(채용/협업/프로젝트)과 회사명을 알려주시면 맥락에 맞춰 바로 답변드리겠습니다. 😊';
const INPUT_PLACEHOLDER = '무엇이든 물어보세요';
const TOTAL_QUESTIONS = 5;
const PORTFOLIO_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const RESUME_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%94%84%EB%A1%9C%EB%8D%95%ED%8A%B8%20%EB%94%94%EC%9E%90%EC%9D%B4%EB%84%A4_%EC%9D%B4%EB%A0%A5%EC%84%9C_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const OUT_OF_SCOPE_MESSAGE = '이 서비스는 309의 경력 관련 질문만 응답합니다. 프로덕트/UX/경력 맥락으로 다시 질문해 주세요.';
const CONTEXT_HINT =
  '\n\n(맥락: 이 질문은 309 성백곤의 프로덕트/UX/협업/경력과 관련된 내용입니다. 해당 범위에서 답변해 주세요.)';
const CONTEXT_KEYWORDS = ['프로덕트', 'UX', '경력', '프로젝트', '협업', '리더십', '디자인', '경험', '채용', '작업 방식'];

type PersonaThread = {
  id: string;
  question: string;
  questionAt: string;
  answer?: string;
  answerAt?: string;
  blocked?: boolean;
};

type AnswerBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

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

function ProposalCard() {
  const handleProposalClick = () => {
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
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '채용 담당자님';
  }
  return trimmed.endsWith('님') ? trimmed : `${trimmed}님`;
}

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
  usedCount,
  onEditVisitor,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  usedCount: number;
  onEditVisitor: () => void;
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-4">
          <RemainingCounter used={usedCount} />
          <button
            type="button"
            onClick={onEditVisitor}
            className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold text-[#14151A99] transition hover:text-[#14151A]"
          >
            <span>{withHonorific(name)}</span>
            <img src={iconEdit} alt="정보 수정" className="h-[10.5px] w-[10.5px]" />
          </button>
          <button
            type="button"
            onClick={onSubmit}
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

function parseAnswerBlocks(text: string): AnswerBlock[] {
  const lines = text.split('\n');
  const blocks: AnswerBlock[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ type: 'list', items: listBuffer });
      listBuffer = [];
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line.startsWith('### ')) {
      flushList();
      blocks.push({ type: 'heading', text: line.replace(/^###\s*/, '') });
      return;
    }
    if (line.startsWith('- ')) {
      listBuffer.push(line.replace(/^-+\s*/, ''));
      return;
    }
    flushList();
    blocks.push({ type: 'paragraph', text: line });
  });

  flushList();
  if (!blocks.length) {
    return [{ type: 'paragraph', text }];
  }
  return blocks;
}

function renderInlineNodes(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={`strong-${index}`} className="font-semibold text-[#0F1324]">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function FormattedAnswer({ text }: { text: string }) {
  const blocks = useMemo(() => parseAnswerBlocks(text), [text]);
  return (
    <div className="space-y-3 text-[14px] leading-6 text-[#0F1324]">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p key={`heading-${index}`} className="text-[15px] font-bold text-[#0F1324]">
              {renderInlineNodes(block.text)}
            </p>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`} className="list-disc pl-5 text-[14px] leading-6 text-[#0F1324]">
              {block.items.map((item, itemIndex) => (
                <li key={`list-item-${index}-${itemIndex}`}>{renderInlineNodes(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`paragraph-${index}`} className="text-[14px] leading-6 text-[#0F1324]">
            {renderInlineNodes(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function PersonaLegalNotice({ onOpen }: { onOpen: () => void }) {
  return (
    <p className="mt-4 text-center text-[11px] font-medium text-[#0F1324] opacity-60">
      채팅을 시작하게 되는 경우{' '}
      <button
        type="button"
        onClick={onOpen}
        className="underline decoration-dotted underline-offset-4 hover:opacity-100"
      >
        개인정보 이용 동의 약관
      </button>
      에 동의로 간주됩니다.
    </p>
  );
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
            <p className="text-sm font-semibold text-slate-500">Visitor Info</p>
            <h3 className="text-2xl font-bold text-[#0F1324]">회사/이름 업데이트</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-200"
          >
            닫기
          </button>
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
            취소
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
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showHeroInfoModal, setShowHeroInfoModal] = useState(false);
  const [showVisitorInfoModal, setShowVisitorInfoModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const introTimestamp = useMemo(() => formatTimeLabel(), []);
  const displayName = visitorName || '채용 담당자';

  const logQuestionToFirestore = useCallback(
    async (questionText: string) => {
      if (!firestore || !session) return;
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

  const persistVisitorProfile = useCallback(
    async (nameValue: string, affiliationValue: string, sessionOverride?: SessionInfo | null) => {
      const activeSession = sessionOverride ?? session;
      if (!firestore || !activeSession) return;
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
          visitorName: '채용 담당자 프리뷰',
          visitorAffiliation: 'Persona Preview',
          visitRef: 'persona-v2',
        });
        if (!cancelled) {
          setSession(info);
          setVisitorName(info.visitorName || '채용 담당자');
          setVisitorAffiliation(info.visitorAffiliation || '');
          if (firestore && (info.visitorName || info.visitorAffiliation)) {
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
    if (!session || !firestore) return;
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
      if (!contentRef.current) return;
      contentRef.current.scrollTo({
        top: contentRef.current.scrollHeight,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    scrollToBottom();
  }, [threads, showLoadingBubble, scrollToBottom]);

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

  const handleSubmit = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!session) {
      alert('프리뷰 세션을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const threadId = uuid();
    const questionAt = new Date().toISOString();
    setThreads((prev) => [...prev, { id: threadId, question: trimmed, questionAt }]);
    setUsedCount((prev) => Math.min(TOTAL_QUESTIONS, prev + 1));
    setQuestion('');
    setShowLoadingBubble(true);
    setLoading(true);
    void logQuestionToFirestore(trimmed);

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

  const handleVisitorSave = (nameValue: string, affiliationValue: string) => {
    const normalizedName = nameValue || '채용 담당자';
    setVisitorName(normalizedName);
    setVisitorAffiliation(affiliationValue);
    setShowVisitorInfoModal(false);
    void persistVisitorProfile(normalizedName, affiliationValue);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
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
                    speed={48}
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
                          <FormattedAnswer text={thread.answer} />
                      </div>
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {showLoadingBubble && loading ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
                <span>답변을 정리하고 있어요</span>
                <span className="flex gap-1">
                  <span className="inline-block h-[2px] w-[2px] rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-[2px] w-[2px] rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="inline-block h-[2px] w-[2px] rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          ) : null}
        </section>

      </main>

      {dockVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/95 to-white/60 pb-6 pt-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
            {ctaVisible ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <ProposalCard />
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
            <div>
              <InputPanel
                name={displayName}
                question={question}
                onQuestionChange={setQuestion}
                onSubmit={handleSubmit}
                loading={loading}
                usedCount={usedCount}
                onEditVisitor={() => setShowVisitorInfoModal(true)}
              />
              <PersonaLegalNotice onOpen={() => setShowConsentModal(true)} />
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


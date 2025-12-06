import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import agentAvatar from '@assets/images/agent-avatar.png';
import iconArrow from '@assets/icons/proposal-arrow.svg';
import iconEdit from '@assets/icons/name-edit.svg';
import iconEnvelope from '@assets/icons/proposal-mail.svg';
import iconPortfolio from '@assets/icons/portfolio-card.svg';
import iconResume from '@assets/icons/resume-file.svg';
import iconSend from '@assets/icons/send-arrow.svg';
import logoFull from '@assets/icons/logo.svg';

import { createVisitor, sendQuestion } from '../services/api';
import type { SessionInfo } from '../types/api';

const INTRO_MESSAGE =
  '안녕하세요, 309 성백곤입니다. Flow-Maker Product Designer로 어떤 문제를 어떻게 풀어왔는지 차근차근 공유드릴게요. 커피챗 목적(채용/협업/프로젝트)과 회사명을 알려주시면 맥락에 맞춰 바로 답변드리겠습니다. 😊';
const INPUT_PLACEHOLDER = '무엇이든 물어보세요';
const TOTAL_QUESTIONS = 5;
const PORTFOLIO_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const RESUME_URL =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%94%84%EB%A1%9C%EB%8D%95%ED%8A%B8%20%EB%94%94%EC%9E%90%EC%9D%B4%EB%84%A4_%EC%9D%B4%EB%A0%A5%EC%84%9C_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';

type PersonaThread = {
  id: string;
  question: string;
  questionAt: string;
  answer?: string;
  answerAt?: string;
  blocked?: boolean;
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
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return undefined;
    hasRunRef.current = true;
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className="inline-block">
      {visible}
      {visible.length < text.length ? <span className="ml-[1px] inline-block animate-pulse">|</span> : null}
    </span>
  );
}

function BrandBadge() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoFull} alt="309 logo" className="h-10 w-auto" />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex w-full items-center justify-center gap-3 py-2 text-[12px] font-medium text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      Chat Started
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function RemainingCounter({ used }: { used: number }) {
  return (
    <span className="text-[12px] font-semibold text-[#14151A99]">
      {used}/{TOTAL_QUESTIONS}
    </span>
  );
}

function ProposalCard() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-3 rounded-full border border-[#DADDE2] bg-white px-5 py-3 text-[15px] font-semibold text-[#14151A] transition hover:border-slate-400"
    >
      <img src={iconEnvelope} alt="proposal" className="h-4 w-4 opacity-80" />
      309에게 제안하기
      <img src={iconArrow} alt="arrow" className="h-3.5 w-3.5 opacity-80" />
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
    <div className="animate-slide-up w-full rounded-[36px] border border-[#ECEEF1] bg-white px-6 py-5 shadow-[0_20px_45px_rgba(15,19,36,0.16)]">
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
          <div className="mr-auto">
            <RemainingCounter used={usedCount} />
          </div>
          <button
            type="button"
            onClick={onEditVisitor}
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#14151A99] transition hover:text-[#14151A]"
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
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,19,36,0.4)]"
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
  const [apiError, setApiError] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showVisitorInfoModal, setShowVisitorInfoModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const introTimestamp = useMemo(() => formatTimeLabel(), []);
  const displayName = visitorName || '채용 담당자';

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
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[Persona] 세션 생성 실패', error);
          setApiError('프리뷰 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({
        top: contentRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [threads, showLoadingBubble]);

  const handleSubmit = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!session) {
      setApiError('프리뷰 세션을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const threadId = uuid();
    const questionAt = new Date().toISOString();
    setApiError(null);
    setThreads((prev) => [...prev, { id: threadId, question: trimmed, questionAt }]);
    setUsedCount((prev) => Math.min(TOTAL_QUESTIONS, prev + 1));
    setQuestion('');
    setShowLoadingBubble(true);
    setLoading(true);

    try {
      const response = await sendQuestion({
        sessionId: session.sessionId,
        question: trimmed,
      });
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                answer: response.answer,
                answerAt: new Date().toISOString(),
                blocked: response.blocked,
              }
            : thread,
        ),
      );
      if (response.blocked) {
        setApiError(response.reason ?? '허용되지 않은 질문입니다.');
      }
      setCtaVisible(true);
    } catch (error) {
      console.error('[Persona] 답변 실패', error);
      setApiError(error instanceof Error ? error.message : '응답을 가져오지 못했습니다.');
    } finally {
      setLoading(false);
      setShowLoadingBubble(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <main
        ref={contentRef}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto px-4 pb-72 pt-10"
      >
        <section className="flex flex-col gap-3">
          <BrandBadge />
          <div className="space-y-1 text-[28px] font-bold leading-tight sm:text-[30px]">
            <p>
              <TypingText
                text="안녕하세요. 🙋 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 🤖 AI Agent 기반 커피챗 서비스(베타)입니다."
                speed={50}
                onComplete={() => setHeroDone(true)}
              />
            </p>
          </div>
        </section>

        <Divider />

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
              {threads.map((thread) => (
                <div key={thread.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[420px] rounded-[22px] bg-[#14151A] px-5 py-3 text-[14px] leading-6 text-white shadow-[0_15px_30px_rgba(15,19,36,0.3)]">
                      {thread.question}
                    </div>
                  </div>
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
                        <div className="text-[14px] leading-6 text-slate-900">
                          {thread.answer}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {showLoadingBubble && loading ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                <img src={agentAvatar} alt="309 avatar" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 rounded-[16px] bg-slate-100 px-4 py-3 text-[15px] text-slate-600 shadow-inner">
                <span>대답을 생각하는 중입니다</span>
                <span className="flex gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '240ms' }} />
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
              {apiError ? <p className="mt-3 text-center text-sm text-rose-500">{apiError}</p> : null}
              <PersonaLegalNotice onOpen={() => setShowConsentModal(true)} />
            </div>
          </div>
        </div>
      ) : null}
      <ConsentModal open={showConsentModal} onClose={() => setShowConsentModal(false)} />
      <VisitorInfoModal
        open={showVisitorInfoModal}
        name={visitorName}
        affiliation={visitorAffiliation}
        onClose={() => setShowVisitorInfoModal(false)}
        onSave={(nameValue, affiliationValue) => {
          setVisitorName(nameValue || '채용 담당자');
          setVisitorAffiliation(affiliationValue);
          setShowVisitorInfoModal(false);
        }}
      />
    </div>
  );
}

export default PersonaChatV2Page;


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

const INTRO_MESSAGE =
  '안녕하세요, 309 성백곤입니다. Flow-Maker Product Designer로 어떤 문제를 풀어왔는지 먼저 들려드릴게요. 커피챗 목적(채용/협업/프로젝트)과 회사명을 알려주시면 맥락에 맞춰 바로 답변드리겠습니다. 😊';
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
};

function TypingText({
  text,
  speed = 110,
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
  const progress = useMemo(() => Math.min(1, Math.max(0, used / TOTAL_QUESTIONS)), [used]);

  const circumference = 2 * Math.PI * 7;
  const dashOffset = circumference - circumference * progress;

  return (
    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#14151A99]">
      <svg className="h-4 w-4" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" stroke="#E1E3E6" strokeWidth="2" fill="none" />
        <circle
          cx="8"
          cy="8"
          r="7"
          stroke="#0B98FF"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span>
        {used}/{TOTAL_QUESTIONS}
      </span>
    </div>
  );
}

function ProposalCard() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/95 px-5 py-3 text-[13px] font-semibold text-slate-900 shadow-[0_6px_20px_rgba(15,19,36,0.08)] transition hover:border-slate-300"
    >
      <img src={iconEnvelope} alt="proposal" className="h-4 w-4 opacity-90" />
      309에게 제안하기
      <img src={iconArrow} alt="arrow" className="h-3.5 w-3.5 opacity-90" />
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

function InputPanel({
  name,
  question,
  onQuestionChange,
  onSubmit,
  loading,
  usedCount,
}: {
  name: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  usedCount: number;
}) {
  const disabled = !question.trim() || loading;

  return (
    <div className="w-full rounded-[24px] border border-[#E0E2E6] bg-white/95 px-6 py-4 shadow-[0_18px_45px_rgba(15,19,36,0.15)]">
      <div className="flex flex-col gap-3 text-sm text-slate-900">
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={INPUT_PLACEHOLDER}
          className="w-full border border-transparent bg-transparent px-1 py-2 text-[16px] font-semibold leading-tight placeholder:text-slate-400 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <RemainingCounter used={usedCount} />
          <div className="flex items-center gap-3 text-[12px] text-slate-600">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#14151A99]">
              <span>{name || '삼성전자, 채용 담당자님'}</span>
              <img src={iconEdit} alt="" className="h-3.5 w-3.5" />
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-400"
              aria-label="전송"
            >
              <img src={iconSend} alt="질문 보내기" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionGuide() {
  return (
    <div className="mt-3 rounded-[24px] border border-slate-100 bg-white/90 px-5 py-4 text-[12px] text-[#14151A99] shadow-[0_20px_45px_rgba(15,19,36,0.12)]">
      <p className="text-sm font-semibold text-[#14151A]">309 Flow-Maker 커피챗 가이드</p>
      <p className="mt-1">∙ 실제 프로젝트/협업 사례를 기반으로 최대 5개의 질문까지 답변합니다.</p>
      <p className="mt-1">∙ 커피챗 목적과 회사명을 공유하면 맞춤 레퍼런스와 스토리를 바로 정리해 드릴게요.</p>
    </div>
  );
}

function buildAnswerCopy(name: string, question: string) {
  const primaryName = (name?.split(',')[0] ?? name ?? '리크루터').trim();
  return `${primaryName}님, “${question}” 질문 기준으로 309가 설계했던 문제 정의와 실행 흐름을 바로 연결해 드릴 수 있어요. 구체적인 목표나 팀 상황을 조금 더 알려주시면 관련 사례와 데이터를 정리해 드릴게요.`;
}

export function PersonaChatV2Page() {
  const [visitorName] = useState('삼성전자, 채용 담당자님');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroDone, setHeroDone] = useState(false);
  const [showLoadingBubble, setShowLoadingBubble] = useState(false);
  const [usedCount, setUsedCount] = useState(0);
  const [dockVisible, setDockVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [threads, setThreads] = useState<PersonaThread[]>([]);

  const introTimestamp = useMemo(() => formatTimeLabel(), []);
  const displayName = visitorName || '삼성전자, 채용 담당자님';

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const threadId = uuid();
    const questionAt = new Date().toISOString();

    setThreads((prev) => [...prev, { id: threadId, question: trimmed, questionAt }]);
    setUsedCount((prev) => Math.min(TOTAL_QUESTIONS, prev + 1));
    setQuestion('');
    setShowLoadingBubble(true);
    setLoading(true);
    setTimeout(() => {
      const answerCopy = buildAnswerCopy(displayName, trimmed);
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId ? { ...thread, answer: answerCopy, answerAt: new Date().toISOString() } : thread,
        ),
      );
      setLoading(false);
      setShowLoadingBubble(false);
      setCtaVisible(true);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-40">
        <section className="flex flex-col gap-3">
          <BrandBadge />
          <div className="space-y-1 text-[28px] font-bold leading-tight sm:text-[30px]">
            <p>
              <TypingText
                text="안녕하세요. 🙋 만나서 반갑습니다. 이 서비스는 저의 페르소나가 담긴 🤖 AI Agent 기반 커피챗 서비스(베타)입니다."
                speed={100}
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
                    speed={95}
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

        <section className="h-20" />
      </main>

      {dockVisible ? (
        <div className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
          <div className="flex w-full max-w-3xl flex-col gap-1">
            {ctaVisible ? (
              <div className="rounded-[32px] border border-white/60 bg-white/95 px-6 py-4 shadow-[0_30px_70px_rgba(15,19,36,0.18)]">
                <div className="flex items-center justify-between gap-3">
                  <ProposalCard />
                  <div className="flex items-center gap-3 text-[12px] text-slate-600">
                    <a
                      href={PORTFOLIO_URL}
                      className="inline-flex items-center gap-2 rounded-full border border-[#E1E3E6] bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 shadow-[0_12px_25px_rgba(15,19,36,0.12)] transition hover:border-slate-300"
                      download
                    >
                      <img src={iconPortfolio} alt="portfolio" className="h-3.5 w-3.5" />
                      포트폴리오
                    </a>
                    <a
                      href={RESUME_URL}
                      className="inline-flex items-center gap-2 rounded-full border border-[#E1E3E6] bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 shadow-[0_12px_25px_rgba(15,19,36,0.12)] transition hover:border-slate-300"
                      download
                    >
                      <img src={iconResume} alt="resume" className="h-4 w-4" />
                      이력서
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
            <div className={ctaVisible ? 'mt-3' : ''}>
              <InputPanel
                name={visitorName}
                question={question}
                onQuestionChange={setQuestion}
                onSubmit={handleSubmit}
                loading={loading}
                usedCount={usedCount}
              />
              <SessionGuide />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PersonaChatV2Page;

